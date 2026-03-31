import type { Context } from "@netlify/functions";
import {
  handleCors, getEnv, jsonResponse, errorResponse,
  checkRateLimit, rateLimitResponse,
  checkUsage, recordUsage, usageLimitResponse,
  sanitizeString,
} from "./shared/utils.ts";

export default async (req: Request, _context: Context) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const origin = req.headers.get('origin');

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405, origin);
  }

  const apiKey = getEnv("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return errorResponse("API key not configured", 500, origin);
  }

  const supabaseUrl = getEnv("SUPABASE_URL");
  const supabaseKey = getEnv("SUPABASE_SERVICE_KEY") || getEnv("SUPABASE_ANON_KEY");

  try {
    const { messages, profile, context } = await req.json();
    const deviceId = profile?.device_id || req.headers.get('x-device-id') || 'unknown';

    // Rate limit: 20 coach messages per minute
    const rl = checkRateLimit(deviceId, 'chat', { windowMs: 60_000, maxRequests: 20 });
    if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs!, origin);

    // Usage tier check
    if (supabaseUrl && supabaseKey) {
      const usage = await checkUsage(deviceId, 'coach_message', supabaseUrl, supabaseKey);
      if (!usage.allowed) {
        return usageLimitResponse(usage.used, usage.limit, usage.tier, origin);
      }
    }

    const profileSummary = profile ? `
USER PROFILE:
- Age: ${profile.age || "unknown"}, Sex: ${profile.biological_sex || "unknown"}
- Height: ${profile.height_cm || "unknown"}cm, Weight: ${profile.current_weight_kg || "unknown"}kg
- Goal Weight: ${profile.goal_weight_kg || "unknown"}kg
- Activity: ${profile.exercise_frequency || 0}x/week, Job: ${profile.job_type || "unknown"}
- Sleep: ${profile.sleep_hours || "unknown"}hrs, Stress: ${profile.stress_level || "unknown"}
- Calorie Target: ${profile.calorie_target || "unknown"} cal
- Protein: ${profile.protein_target || "unknown"}g, Carbs: ${profile.carb_target || "unknown"}g, Fat: ${profile.fat_target || "unknown"}g
- Cooking style: ${profile.cooking_style || "unknown"}
- Favorite meals: ${(profile.favorite_meals || []).join(", ") || "unknown"}
- Hated foods: ${(profile.hated_foods || []).join(", ") || "none"}
- Snack preference: ${profile.snack_preference || "unknown"}
` : "";

    const todaySummary = context?.todaySummary ? `
TODAY'S INTAKE SO FAR:
- Calories: ${context.todaySummary.calories}/${profile?.calorie_target || "?"}
- Protein: ${context.todaySummary.protein}g/${profile?.protein_target || "?"}g
- Carbs: ${context.todaySummary.carbs}g/${profile?.carb_target || "?"}g
- Fat: ${context.todaySummary.fat}g/${profile?.fat_target || "?"}g
- Water: ${context.todaySummary.water_ml}ml
- Meals logged: ${context.todaySummary.entries?.length || 0}
` : "";

    const garminSummary = context?.garminData ? `
GARMIN/HEALTH DATA:
- Steps: ${context.garminData.steps || "no data"}
- Calories Burned: ${context.garminData.calories_burned || "no data"}
- Resting HR: ${context.garminData.heart_rate_resting || "no data"}
- Sleep: ${context.garminData.sleep_hours || "no data"}hrs
- Body Battery: ${context.garminData.body_battery || "no data"}
` : "";

    const supplementInfo = profile?.supplements?.length
      ? `\n- Supplements: ${profile.supplements.join(', ')}`
      : '';
    const peptideInfo = profile?.peptides?.length
      ? `\n- Peptides: ${profile.peptides.join(', ')}`
      : '';
    const healthNotes = profile?.wildcard_notes
      ? `\n- Notes: ${profile.wildcard_notes}`
      : '';

    const systemPrompt = `You are APEX — Adaptive Personal EXpert — an AI fitness coach and nutritionist inside JackedAI. Your voice blends 80s ambition with modern sports science. You're direct, warm, data-informed, and speak like the coolest trainer who also has a nutrition PhD.

You have access to the user's real-time data:

${profileSummary}${supplementInfo}${peptideInfo}${healthNotes}
${todaySummary}
${garminSummary}

RULES:
- Always consider their real-time intake data when giving advice
- Be specific to THEIR situation — reference their actual numbers, not generic advice
- If they ask what to eat, consider what they've already eaten today and what macros they still need
- Keep responses concise but helpful (2-4 paragraphs max unless they ask for detail)
- Use their Garmin/health data to inform recommendations (e.g., if they burned a lot, they might need more fuel)
- Prioritize protein for muscle preservation during cuts
- Be honest but encouraging — no false promises
- If they share a food photo, analyze it and estimate macros
- Remember their food preferences and hated foods
- If they use supplements or peptides, factor those into advice (timing, dosing, synergies)
- Reference their specific goals and data — never give generic wellness speak
- End responses with a clear next action when appropriate

FOOD LOGGING VIA CONVERSATION:
When the user describes food they ate (today or a past day), you should:
1. Ask clarifying questions — portion size, sides, drinks, sauces, cooking method
2. If they mention a specific restaurant (Chick-fil-A, Chipotle, Applebee's, etc.), use your knowledge of that restaurant's actual menu items and published nutrition facts. Be specific — don't guess when you know the real numbers.
3. Once you have enough detail, provide your best macro estimate and include a \`\`\`food_log JSON block so the frontend can log it directly.
4. If the user says "log it" or confirms the estimate, include the food_log block.
5. If they say it was yesterday or a specific day, include the "date" field (YYYY-MM-DD format).

The food_log block format:
\`\`\`food_log
{"food_name":"Chick-fil-A Grilled Nuggets (12ct)","description":"12-count grilled nuggets with Polynesian sauce","calories":200,"protein":38,"carbs":1,"fat":4,"fiber":0,"meal_type":"lunch","date":"2026-03-30"}
\`\`\`

Rules for food logging:
- ALWAYS ask at least one clarifying question before providing the food_log block (portion? sides? sauce? drink?)
- Use real published nutrition data for chain restaurants when available
- For home-cooked meals, estimate based on common recipes and portion sizes
- If the user describes multiple items, you can include multiple food_log blocks
- "meal_type" should be one of: breakfast, lunch, dinner, snack
- "date" is optional — omit it to log to today, include YYYY-MM-DD for a specific day
- Include your reasoning for the estimates so the user can correct you
- If the user corrects you, update the numbers and include a new food_log block

Example conversation:
User: "I had Chipotle yesterday for lunch"
You: "Nice — what did you get? Bowl, burrito, tacos? And what protein/toppings?"
User: "Chicken bowl with white rice, black beans, fajita veggies, mild salsa, cheese, and guac"
You: "Here's what that looks like based on Chipotle's published nutrition: [breakdown]. Want me to log it?"

MACRO TARGET UPDATES:
When the user asks you to change their macro targets, calorie target, or any profile setting (e.g., "set my protein to 220g", "bump my calories to 2800", "my targets are too low", "I want more protein"), you MUST include a JSON block in your response wrapped in triple backticks with the label "profile_update". Only include the fields that should change.

Example — user says "set my protein to 220 and calories to 2600":
\`\`\`profile_update
{"calorie_target":2600,"protein_target":220}
\`\`\`

If the user says their targets are "too low" or "too high" without specifying exact numbers, suggest specific numbers based on their profile and sports science, explain your reasoning, then include the profile_update block with your recommended values.

Available fields you can update: calorie_target, protein_target, carb_target, fat_target, water_target_liters, weight_loss_pace, goal_weight_kg.

When you update one macro, recalculate the others to keep them balanced. For example, if increasing protein, you may need to reduce carbs to stay within the calorie target. Always explain what you changed and why.

You never:
- Use filler praise ("Great job!", "Awesome!")
- Shame the user for missed sessions or bad meals
- Give generic advice that ignores their profile
- Use corporate wellness speak

You always:
- Reference their specific goal and data
- Give concrete options, not vague guidance
- Match the user's energy level in your tone`;

    const apiMessages = (messages || []).map((m: any) => ({
      role: m.role,
      content: sanitizeString(m.content, 10000),
    }));

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        system: systemPrompt,
        messages: apiMessages,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return errorResponse(`Claude API error: ${errText}`, 502, origin);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || "Sorry, I couldn't generate a response.";

    // Record usage
    if (supabaseUrl && supabaseKey) {
      recordUsage(deviceId, 'coach_message', supabaseUrl, supabaseKey).catch(() => {});
    }

    return jsonResponse({ message: text }, 200, origin);
  } catch (err: any) {
    return errorResponse(err.message, 500, origin);
  }
};
