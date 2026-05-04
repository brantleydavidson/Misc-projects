import type { Context } from "@netlify/functions";
import { getEnv, jsonResponse, errorResponse } from "./shared/utils.ts";

// Scheduled nightly. For every active profile:
//  1. Pull last 7d of biometric (ja_health_daily) + food (ja_food_entries) + check-ins
//  2. Ask Claude (Sonnet 4.5) to update user_model and emit observations
//  3. Persist updated user_model + insert observations
//
// Cron set in netlify.toml: schedule = "0 5 * * *" (5am UTC ≈ midnight CT)

const SUPABASE_URL = () => getEnv("SUPABASE_URL")!;
const SUPABASE_KEY = () => getEnv("SUPABASE_SERVICE_KEY") || getEnv("SUPABASE_ANON_KEY")!;

async function sb(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL()}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_KEY(),
      Authorization: `Bearer ${SUPABASE_KEY()}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

const COACH_TOOL = {
  name: "save_review",
  description: "Persist the daily coaching review.",
  input_schema: {
    type: "object",
    properties: {
      user_model_patch: {
        type: "object",
        description:
          "Partial user_model to merge in. Include updated coaching_state.{current_focus,what_is_working,what_is_not} and any other fields that changed.",
      },
      observations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            kind: {
              type: "string",
              enum: ["pattern", "anomaly", "suggestion", "milestone"],
            },
            content: { type: "string" },
            importance: { type: "integer", minimum: 1, maximum: 5 },
            payload: { type: ["object", "null"] },
          },
          required: ["kind", "content", "importance"],
        },
      },
    },
    required: ["user_model_patch", "observations"],
  },
};

function deepMerge(target: any, source: any): any {
  if (!source || typeof source !== "object") return target;
  const result: any = Array.isArray(target) ? [...target] : { ...target };
  for (const key of Object.keys(source)) {
    const sv = source[key];
    if (sv && typeof sv === "object" && !Array.isArray(sv) && result[key] && typeof result[key] === "object" && !Array.isArray(result[key])) {
      result[key] = deepMerge(result[key], sv);
    } else {
      result[key] = sv;
    }
  }
  return result;
}

async function reviewProfile(profile: any): Promise<{ updated: boolean; observations: number }> {
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const startStr = weekAgo.toISOString().split("T")[0];

  // Pull last 7d of data in parallel
  const [healthRows, foodRows, activityRows] = await Promise.all([
    sb(
      `ja_health_daily?profile_id=eq.${profile.id}&date=gte.${startStr}&order=date.desc&limit=7`,
    ).catch(() => []),
    sb(
      `ja_food_entries?profile_id=eq.${profile.id}&select=calories,protein,carbs,fat,created_at&created_at=gte.${startStr}T00:00:00&order=created_at.desc&limit=200`,
    ).catch(() => []),
    sb(
      `ja_activity_logs?profile_id=eq.${profile.id}&select=*&created_at=gte.${startStr}T00:00:00&order=created_at.desc&limit=50`,
    ).catch(() => []),
  ]);

  // Build a compact summary
  const foodByDay: Record<string, { c: number; p: number }> = {};
  for (const f of foodRows) {
    const d = (f.created_at || "").split("T")[0];
    if (!d) continue;
    if (!foodByDay[d]) foodByDay[d] = { c: 0, p: 0 };
    foodByDay[d].c += f.calories || 0;
    foodByDay[d].p += f.protein || 0;
  }

  const healthLines = healthRows.map((r: any) => {
    const parts = [r.date];
    if (r.sleep_minutes) parts.push(`sleep=${r.sleep_minutes}m`);
    if (r.hrv) parts.push(`hrv=${Math.round(r.hrv)}`);
    if (r.resting_hr) parts.push(`rhr=${r.resting_hr}`);
    if (r.steps) parts.push(`steps=${r.steps}`);
    if (r.active_calories) parts.push(`active=${r.active_calories}`);
    return parts.join(" ");
  });

  const foodLines = Object.entries(foodByDay)
    .sort()
    .map(([d, v]) => `${d} kcal=${Math.round(v.c)} protein=${Math.round(v.p)}g`);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": getEnv("ANTHROPIC_API_KEY")!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      tools: [COACH_TOOL],
      tool_choice: { type: "tool", name: "save_review" },
      messages: [
        {
          role: "user",
          content: `You are reviewing one user's last 7 days. Update their user_model and emit observations.

USER MODEL:
${JSON.stringify(profile.user_model || {}, null, 2)}

LAST 7 DAYS OF HEALTH:
${healthLines.join("\n") || "(no biometric data)"}

LAST 7 DAYS OF FOOD LOG:
${foodLines.join("\n") || "(no food logged)"}

CHECK-INS THIS WEEK: ${activityRows.length}

Call save_review with:
- user_model_patch: changes to coaching_state (current_focus, what_is_working, what_is_not). Only include fields that changed.
- observations: 0-3 entries. Importance 5 = needs immediate attention; 3-4 = surface in next notification window; 1-2 = log only.

Rules:
- Only emit observations grounded in the actual data above.
- Never invent metrics. If data is sparse, return an empty observations array.
- Keep observations concise — one sentence each, second person ("you").`,
        },
      ],
    }),
  });
  if (!res.ok) {
    console.error(`[daily-coach] Claude failed for ${profile.id}: ${await res.text()}`);
    return { updated: false, observations: 0 };
  }
  const data = await res.json();
  const toolUse = data.content?.find((c: any) => c.type === "tool_use");
  if (!toolUse) return { updated: false, observations: 0 };

  const { user_model_patch, observations } = toolUse.input;

  const newModel = deepMerge(profile.user_model || {}, user_model_patch || {});
  newModel.updated_at = new Date().toISOString();

  await sb(`ja_profiles?id=eq.${profile.id}`, {
    method: "PATCH",
    body: JSON.stringify({ user_model: newModel }),
  });

  if (Array.isArray(observations) && observations.length > 0) {
    const rows = observations.map((o: any) => ({
      profile_id: profile.id,
      kind: o.kind,
      content: o.content,
      importance: o.importance,
      payload: o.payload || null,
    }));
    await sb("ja_ai_observations", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(rows),
    });
  }

  return { updated: true, observations: observations?.length || 0 };
}

export default async (_req: Request, _context: Context) => {
  if (!getEnv("ANTHROPIC_API_KEY") || !getEnv("SUPABASE_URL"))
    return errorResponse("Service not configured", 503);

  try {
    // Active profiles: onboarding_complete + has user_model (i.e. data-first onboarded OR
    // legacy users that have been backfilled). Limit batch size to keep within fn timeout.
    const profiles = await sb(
      `ja_profiles?select=id,user_model&onboarding_complete=eq.true&user_model=not.is.null&limit=200`,
    );
    let processed = 0;
    let observations = 0;
    let failed = 0;
    for (const profile of profiles) {
      try {
        const result = await reviewProfile(profile);
        if (result.updated) processed++;
        observations += result.observations;
      } catch (err) {
        console.error(`[daily-coach] profile ${profile.id} failed`, err);
        failed++;
      }
    }
    return jsonResponse({ processed, observations, failed, total: profiles.length }, 200);
  } catch (err: any) {
    console.error("[daily-coach]", err);
    return errorResponse(err.message || "Daily coach failed", 500);
  }
};
