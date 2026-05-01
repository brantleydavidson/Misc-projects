import type { Context } from "@netlify/functions";
import { handleCors, getEnv, jsonResponse, errorResponse } from "./shared/utils.ts";

// Pulls 30d of Terra history, writes per-day rows, asks Claude for a baseline,
// persists baseline + initial user_model on the profile.
//
// POST /api/health-baseline  { device_id }
// →    { baseline, user_model, days_with_data }

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

async function terra(path: string) {
  const res = await fetch(`https://api.tryterra.co/v2${path}`, {
    headers: {
      "dev-id": getEnv("TERRA_DEV_ID")!,
      "x-api-key": getEnv("TERRA_API_KEY")!,
    },
  });
  if (!res.ok) throw new Error(`Terra ${res.status}: ${await res.text()}`);
  return res.json();
}

interface DailyRow {
  profile_id: string;
  date: string;
  sleep_minutes: number | null;
  sleep_efficiency: number | null;
  hrv: number | null;
  resting_hr: number | null;
  steps: number | null;
  active_calories: number | null;
  workouts: unknown;
  body_comp: unknown;
  raw: unknown;
  source: string | null;
}

function normalizeDay(
  profileId: string,
  date: string,
  daily: any,
  sleep: any,
  body: any,
  source: string | null,
): DailyRow {
  // Sleep totals
  let sleepMin: number | null = null;
  let sleepEff: number | null = null;
  if (sleep?.sleep_durations_data?.asleep) {
    const a = sleep.sleep_durations_data.asleep;
    const seconds =
      (a.duration_light_sleep_state_seconds || 0) +
      (a.duration_deep_sleep_state_seconds || 0) +
      (a.duration_REM_sleep_state_seconds || 0);
    sleepMin = Math.round(seconds / 60);
  }
  if (sleep?.sleep_durations_data?.sleep_efficiency != null) {
    sleepEff = sleep.sleep_durations_data.sleep_efficiency;
  }

  return {
    profile_id: profileId,
    date,
    sleep_minutes: sleepMin,
    sleep_efficiency: sleepEff,
    hrv:
      daily?.heart_rate_data?.summary?.hrv_rmssd ??
      sleep?.heart_rate_data?.hrv?.rmssd ??
      null,
    resting_hr: daily?.heart_rate_data?.summary?.resting_hr_bpm ?? null,
    steps: daily?.distance_data?.steps ?? null,
    active_calories: daily?.calories_data?.net_activity_calories ?? null,
    workouts: null, // workouts pulled separately, kept simple for v1
    body_comp:
      body && (body.weight_kg != null || body.body_fat_percentage != null)
        ? { weight_kg: body.weight_kg, body_fat_pct: body.body_fat_percentage }
        : null,
    raw: { daily: !!daily, sleep: !!sleep, body: !!body },
    source,
  };
}

function summarizeForClaude(rows: DailyRow[]): string {
  // Compact one-line-per-day text — keeps token count down
  return rows
    .map((r) => {
      const parts: string[] = [r.date];
      if (r.sleep_minutes != null) parts.push(`sleep=${r.sleep_minutes}m`);
      if (r.hrv != null) parts.push(`hrv=${Math.round(r.hrv)}`);
      if (r.resting_hr != null) parts.push(`rhr=${r.resting_hr}`);
      if (r.steps != null) parts.push(`steps=${r.steps}`);
      if (r.active_calories != null) parts.push(`active_kcal=${r.active_calories}`);
      if (r.body_comp && (r.body_comp as any).weight_kg)
        parts.push(`weight=${(r.body_comp as any).weight_kg}kg`);
      return parts.join(" ");
    })
    .join("\n");
}

const BASELINE_TOOL = {
  name: "save_baseline",
  description:
    "Persist a structured baseline analysis of the user's recent biometric data.",
  input_schema: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description:
          "One sentence, plain language, the kind of thing a coach says after reading the file.",
      },
      window_days: { type: "integer" },
      metrics: {
        type: "object",
        properties: {
          avg_sleep_minutes: { type: ["number", "null"] },
          avg_hrv: { type: ["number", "null"] },
          avg_resting_hr: { type: ["number", "null"] },
          avg_steps: { type: ["number", "null"] },
          avg_active_calories: { type: ["number", "null"] },
          weight_trend_kg_per_week: { type: ["number", "null"] },
        },
        required: [],
      },
      patterns: {
        type: "array",
        items: { type: "string" },
        description:
          "Notable patterns supported by ≥2 weeks of data and a clear signal. Plain language.",
      },
      estimated_tdee: {
        type: ["integer", "null"],
        description:
          "Estimated TDEE in kcal/day from active calories + RMR. Null if <14 days of activity data.",
      },
      data_quality: {
        type: "object",
        properties: {
          days_with_sleep: { type: "integer" },
          days_with_workouts: { type: "integer" },
          days_with_hrv: { type: "integer" },
        },
      },
      open_questions: {
        type: "array",
        items: { type: "string" },
        description:
          "Things the AI cannot infer from biometric data — goals, prefs, constraints.",
      },
    },
    required: [
      "summary",
      "window_days",
      "metrics",
      "patterns",
      "data_quality",
      "open_questions",
    ],
  },
};

async function callClaude(profileMeta: any, dataLines: string): Promise<any> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": getEnv("ANTHROPIC_API_KEY")!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 2000,
      tools: [BASELINE_TOOL],
      tool_choice: { type: "tool", name: "save_baseline" },
      messages: [
        {
          role: "user",
          content: `You are analyzing biometric data to build a baseline profile for a fitness coaching app.

USER:
${JSON.stringify(profileMeta, null, 2)}

LAST ${dataLines.split("\n").length} DAYS:
${dataLines}

Call save_baseline with a structured analysis. Rules:
- estimated_tdee: avg active_kcal + Mifflin-St Jeor RMR. Null if <14 days of activity data.
- patterns: only include patterns supported by ≥2 weeks of data and a clear signal.
- summary: one sentence, plain language.
- open_questions: things you cannot infer (goals, food prefs, schedule).`,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const toolUse = json.content?.find((c: any) => c.type === "tool_use");
  if (!toolUse) throw new Error("Claude did not call save_baseline");
  return toolUse.input;
}

function seedUserModel(profile: any, baseline: any): any {
  return {
    version: 1,
    updated_at: new Date().toISOString(),
    identity: {
      age: profile.age ?? null,
      sex: profile.biological_sex ?? null,
      weight_kg: profile.current_weight_kg ?? null,
      height_cm: profile.height_cm ?? null,
    },
    goal: {
      primary: profile.goal_description ?? null,
      target_kg: profile.goal_weight_kg ?? null,
      rate_kg_per_week: null,
    },
    fitness_state: {
      training_pattern: null,
      experience: null,
      limitations: profile.injuries ?? [],
    },
    metabolic: {
      measured_tdee: baseline.estimated_tdee ?? null,
      tdee_method: baseline.estimated_tdee ? "terra_history" : null,
      rmr_estimate: null,
      target_calories: profile.calorie_target ?? null,
      macros: {
        protein_g: profile.protein_target ?? null,
        carbs_g: profile.carb_target ?? null,
        fat_g: profile.fat_target ?? null,
      },
    },
    lifestyle: {
      sleep_avg_minutes: baseline.metrics?.avg_sleep_minutes ?? null,
      stress_signals: baseline.patterns ?? [],
      schedule: null,
    },
    preferences: {
      diet: null,
      dislikes: profile.hated_foods ?? [],
      cuisines: profile.favorite_meals ?? [],
    },
    notification_windows: {
      morning: profile.notify_morning ?? "07:00",
      lunch: profile.notify_midday ?? "12:30",
      evening: profile.notify_evening ?? "20:00",
    },
    coaching_state: {
      current_focus: null,
      what_is_working: [],
      what_is_not: [],
    },
    gaps: baseline.open_questions ?? [],
  };
}

export default async (req: Request, _context: Context) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const origin = req.headers.get("origin");

  if (req.method !== "POST") return errorResponse("Method not allowed", 405, origin);
  if (!getEnv("ANTHROPIC_API_KEY")) return errorResponse("Claude not configured", 503, origin);
  if (!getEnv("TERRA_API_KEY") || !getEnv("TERRA_DEV_ID"))
    return errorResponse("Terra not configured", 503, origin);

  try {
    const { device_id } = await req.json();
    if (!device_id) return errorResponse("device_id required", 400, origin);

    // 1. Look up profile
    const profiles = await sb(
      `ja_profiles?device_id=eq.${encodeURIComponent(device_id)}&select=*&limit=1`,
    );
    if (!Array.isArray(profiles) || profiles.length === 0)
      return errorResponse("Profile not found", 404, origin);
    const profile = profiles[0];
    const profileId = profile.id;

    if (!profile.terra_user_id)
      return errorResponse(
        "No tracker connected. Connect via Terra widget first.",
        400,
        origin,
      );

    // 2. Pull 30d range from Terra (parallel)
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    const startStr = start.toISOString().split("T")[0];
    const endStr = end.toISOString().split("T")[0];

    const baseParams = `user_id=${encodeURIComponent(profile.terra_user_id)}&start_date=${startStr}&end_date=${endStr}&to_webhook=false`;

    const [dailyRes, sleepRes, bodyRes] = await Promise.allSettled([
      terra(`/daily?${baseParams}&with_samples=false`),
      terra(`/sleep?${baseParams}`),
      terra(`/body?${baseParams}`),
    ]);

    const dailyData = dailyRes.status === "fulfilled" ? dailyRes.value?.data ?? [] : [];
    const sleepData = sleepRes.status === "fulfilled" ? sleepRes.value?.data ?? [] : [];
    const bodyData = bodyRes.status === "fulfilled" ? bodyRes.value?.data ?? [] : [];

    // Index by date
    const byDate = new Map<string, { daily?: any; sleep?: any; body?: any; source?: string }>();
    const indexAdd = (kind: "daily" | "sleep" | "body", arr: any[]) => {
      for (const item of arr) {
        const d = (item.metadata?.start_time || item.metadata?.summary_date || "")
          .split("T")[0];
        if (!d) continue;
        const slot = byDate.get(d) || {};
        slot[kind] = item;
        slot.source = item.metadata?.source || slot.source;
        byDate.set(d, slot);
      }
    };
    indexAdd("daily", dailyData);
    indexAdd("sleep", sleepData);
    indexAdd("body", bodyData);

    // 3. Build rows + summary
    const rows: DailyRow[] = [];
    for (const [date, slot] of byDate.entries()) {
      rows.push(
        normalizeDay(
          profileId,
          date,
          slot.daily,
          slot.sleep,
          slot.body,
          slot.source ?? null,
        ),
      );
    }
    rows.sort((a, b) => a.date.localeCompare(b.date));

    // 4. Upsert into ja_health_daily
    if (rows.length > 0) {
      await sb("ja_health_daily?on_conflict=profile_id,date", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(rows),
      });
    }

    // 5. Ask Claude for the baseline
    const profileMeta = {
      age: profile.age,
      sex: profile.biological_sex,
      height_cm: profile.height_cm,
      weight_kg: profile.current_weight_kg,
      stated_goal: profile.goal_description,
    };
    const baseline = await callClaude(profileMeta, summarizeForClaude(rows));

    // 6. Persist baseline + seed user_model
    const userModel = seedUserModel(profile, baseline);
    await sb(
      `ja_profiles?id=eq.${profileId}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          health_baseline: baseline,
          user_model: userModel,
          onboarding_mode: "data-first",
        }),
      },
    );

    return jsonResponse(
      { baseline, user_model: userModel, days_with_data: rows.length },
      200,
      origin,
    );
  } catch (err: any) {
    console.error("[health-baseline]", err);
    return errorResponse(err.message || "Baseline failed", 500, origin);
  }
};
