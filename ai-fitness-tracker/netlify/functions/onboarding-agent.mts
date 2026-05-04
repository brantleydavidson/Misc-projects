import type { Context } from "@netlify/functions";
import { handleCors, getEnv, jsonResponse, errorResponse } from "./shared/utils.ts";

// POST /api/onboarding-agent
// Body: { device_id, conversation: [{role, content}] }
// → { message, done, user_model, gaps }
//
// Single-turn agentic onboarding. Claude has access to:
//   - the user's health_baseline (from /api/health-baseline)
//   - the running user_model on the profile
// And tools:
//   - mark_known(path, value) — write into user_model
//   - flag_gap(field, reason) — add to gaps list
//   - finish(summary)         — agent decides we have enough
// Server applies tool effects to ja_profiles.user_model, then returns.

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

// Apply mark_known to a nested user_model (path like "goal.primary")
function setPath(obj: any, path: string, value: unknown) {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (cur[key] == null || typeof cur[key] !== "object") cur[key] = {};
    cur = cur[key];
  }
  cur[parts[parts.length - 1]] = value;
}

const TOOLS = [
  {
    name: "mark_known",
    description:
      "Update a field in the user's profile model. Path uses dot notation (e.g. 'goal.primary', 'preferences.diet'). Call once per user response with the most important fact captured.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Dot path into user_model" },
        value: { description: "Value to set (string, number, array, or object)" },
      },
      required: ["path", "value"],
    },
  },
  {
    name: "flag_gap",
    description:
      "Add a new field to the gaps list — something the user hinted at that isn't in the schema yet, but should be tracked.",
    input_schema: {
      type: "object",
      properties: {
        field: { type: "string" },
        reason: { type: "string" },
      },
      required: ["field"],
    },
  },
  {
    name: "finish",
    description:
      "Call when you have enough to set macros, training schedule, and notification windows. The conversation will end after this.",
    input_schema: {
      type: "object",
      properties: { summary: { type: "string" } },
      required: ["summary"],
    },
  },
];

function buildSystemPrompt(profile: any, baseline: any, userModel: any, gaps: string[]) {
  const email = profile?.email || null;
  const firstName = email ? email.split('@')[0].split('.')[0].replace(/[^a-zA-Z]/g, '') : null;
  const trackerConnected = !!profile?.terra_user_id;
  const dq = baseline?.data_quality || {};
  const hasUsableData =
    (dq.days_with_sleep ?? 0) + (dq.days_with_workouts ?? 0) + (dq.days_with_hrv ?? 0) > 0;

  let dataContext: string;
  if (!trackerConnected) {
    dataContext = "User skipped wearable connection. No biometric data — run a manual intake.";
  } else if (!hasUsableData) {
    dataContext = `User just connected their Garmin (or other wearable). Historical data is still syncing in the background — Terra delivers it via webhooks over the next 1-3 hours. You don't have any biometric metrics yet, but DO acknowledge that you're going to be using them once they arrive. Use this phase to get to know the user; the data will fill in.`;
  } else {
    dataContext = `Their last ${baseline.window_days} days of biometric data:\n${baseline.summary}\nPatterns: ${JSON.stringify(baseline.patterns ?? [])}\nEstimated TDEE: ${baseline.estimated_tdee ?? "unknown"}`;
  }

  return `You are APEX — the onboarding coach for BeJacked. Direct, warm, data-informed. Your voice blends 80s ambition with modern exercise science.

WHO YOU'RE TALKING TO:
${firstName ? `- First name (from their Google account): ${firstName} (use it naturally — don't ask their name again)` : "- We don't have their name yet — ask early."}
${email ? `- Email: ${email}` : ""}
${trackerConnected ? `- ✅ Wearable connected (provider stored in profile)` : "- ❌ No wearable connected"}

DATA CONTEXT:
${dataContext}

WHAT YOU ALREADY KNOW (user_model):
${JSON.stringify(userModel, null, 2)}

WHAT'S MISSING (gaps to close):
${gaps.length ? gaps.join(", ") : "primary goal, target weight, dietary preferences, dislikes, training schedule, sleep windows, notification preferences"}

RULES:
- OPEN your first reply with something that proves you know who they are. ${hasUsableData
    ? `Reference a SPECIFIC observation from their data (e.g. "Your HRV's down 12% the last 2 weeks — burnout, illness, or stress?").`
    : trackerConnected
      ? `Acknowledge that their Garmin just connected and that you'll be reading from it as data syncs in the background. Then ask their primary goal — that's the biggest unknown.`
      : `Greet them by name${firstName ? ` (${firstName})` : ""}. Ask what brought them here.`}
- **EVERY reply MUST contain a text response — never tool calls only.** The user is reading your text bubble. After tool calls, always say something out loud. The ONLY exception: when you call finish(), you may also include a short summary as text but it's optional.
- Never ask for their name if you already have it from their Google account.
- Never ask for something already in user_model. If a field is filled, don't re-ask.
- One question at a time. Conversational, not a survey.
- After EACH user response, call mark_known(path, value) to record what you learned. Be liberal — capture everything: identity.age, goal.primary, preferences.dislikes, fitness_state.training_pattern, etc.
- If the user volunteers something not in the schema, call flag_gap(field, reason).
- When you have enough to set macros + training schedule + notification windows: call finish(summary). Aim for 4-7 user turns.
- Keep replies 1-3 sentences. Punchy. Reference something specific from their previous answer.
- Never use filler praise. You are a coach, not a chatbot.`;
}

export default async (req: Request, _context: Context) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const origin = req.headers.get("origin");

  if (req.method !== "POST") return errorResponse("Method not allowed", 405, origin);
  if (!getEnv("ANTHROPIC_API_KEY")) return errorResponse("Claude not configured", 503, origin);

  try {
    const { device_id, conversation } = await req.json();
    if (!device_id) return errorResponse("device_id required", 400, origin);

    // Load profile + baseline + user_model
    const profiles = await sb(
      `ja_profiles?device_id=eq.${encodeURIComponent(device_id)}&select=id,email,terra_user_id,health_baseline,user_model&limit=1`,
    );
    if (!Array.isArray(profiles) || profiles.length === 0)
      return errorResponse("Profile not found", 404, origin);
    const profile = profiles[0];
    const profileId = profile.id;
    const userModel = profile.user_model || {
      version: 1,
      identity: {},
      goal: {},
      preferences: {},
      lifestyle: {},
      coaching_state: {},
      gaps: [],
    };
    const gaps: string[] = userModel.gaps || [];

    const apiMessages = (conversation || []).map((m: any) => ({
      role: m.role,
      content: m.content,
    }));

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": getEnv("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        system: [
          {
            type: "text",
            text: buildSystemPrompt(profile, profile.health_baseline, userModel, gaps),
            cache_control: { type: "ephemeral" },
          },
        ],
        tools: TOOLS,
        messages: apiMessages.length ? apiMessages : [
          { role: "user", content: "Begin the conversation." },
        ],
      }),
    });
    if (!res.ok) return errorResponse(`Claude ${res.status}: ${await res.text()}`, 502, origin);
    let data = await res.json();

    // Process content blocks
    let assistantText = "";
    let done = false;
    let finishSummary: string | null = null;
    const updatedModel = JSON.parse(JSON.stringify(userModel));
    const toolUseBlocks: any[] = [];

    const processContent = (content: any[]) => {
      for (const block of content || []) {
        if (block.type === "text") {
          assistantText += block.text;
        } else if (block.type === "tool_use") {
          toolUseBlocks.push(block);
          if (block.name === "mark_known") {
            try {
              setPath(updatedModel, block.input.path, block.input.value);
            } catch { /* ignore bad path */ }
          } else if (block.name === "flag_gap") {
            if (!updatedModel.gaps) updatedModel.gaps = [];
            if (!updatedModel.gaps.includes(block.input.field))
              updatedModel.gaps.push(block.input.field);
          } else if (block.name === "finish") {
            done = true;
            finishSummary = block.input.summary || null;
          }
        }
      }
    };
    processContent(data.content);

    // If Claude only called tools (no text), do a follow-up turn with tool
    // results so it produces an actual coaching reply. Skip when finish() was
    // called — no further reply needed.
    if (!assistantText.trim() && toolUseBlocks.length > 0 && !done) {
      const followupMessages = [
        ...apiMessages,
        { role: "assistant", content: data.content },
        {
          role: "user",
          content: toolUseBlocks.map(t => ({
            type: "tool_result",
            tool_use_id: t.id,
            content: "ok",
          })),
        },
      ];
      const res2 = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": getEnv("ANTHROPIC_API_KEY")!,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 1024,
          system: [
            {
              type: "text",
              text: buildSystemPrompt(profile, profile.health_baseline, updatedModel, updatedModel.gaps || []),
              cache_control: { type: "ephemeral" },
            },
          ],
          tools: TOOLS,
          messages: followupMessages,
        }),
      });
      if (res2.ok) {
        data = await res2.json();
        processContent(data.content);
      }
    }

    updatedModel.updated_at = new Date().toISOString();
    if (finishSummary) {
      updatedModel.coaching_state = updatedModel.coaching_state || {};
      updatedModel.coaching_state.onboarding_summary = finishSummary;
    }

    // Persist
    await sb(`ja_profiles?id=eq.${profileId}`, {
      method: "PATCH",
      body: JSON.stringify({ user_model: updatedModel }),
    });

    return jsonResponse(
      {
        message: assistantText.trim(),
        done,
        user_model: updatedModel,
        finish_summary: finishSummary,
      },
      200,
      origin,
    );
  } catch (err: any) {
    console.error("[onboarding-agent]", err);
    return errorResponse(err.message || "Agent error", 500, origin);
  }
};
