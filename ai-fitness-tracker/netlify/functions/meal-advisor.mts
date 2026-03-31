import type { Context } from "@netlify/functions";
import {
  handleCors, getEnv, jsonResponse, errorResponse,
  checkRateLimit, rateLimitResponse,
  checkUsage, recordUsage, usageLimitResponse,
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
    const { restaurant, profile, todaySummary, messages, deviceId } = await req.json();

    const did = deviceId || profile?.device_id || 'unknown';

    // Rate limit: 15 requests per minute
    const rl = checkRateLimit(did, 'meal-advisor', { windowMs: 60_000, maxRequests: 15 });
    if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs!, origin);

    // Usage tier check
    if (supabaseUrl && supabaseKey) {
      const usage = await checkUsage(did, 'meal_advisor', supabaseUrl, supabaseKey);
      if (!usage.allowed) {
        return usageLimitResponse(usage.used, usage.limit, usage.tier, origin);
      }
      await recordUsage(did, 'meal_advisor', supabaseUrl, supabaseKey);
    }

    const remaining = {
      calories: (profile?.calorie_target || 2000) - (todaySummary?.calories || 0),
      protein: (profile?.protein_target || 150) - (todaySummary?.protein || 0),
      carbs: (profile?.carb_target || 200) - (todaySummary?.carbs || 0),
      fat: (profile?.fat_target || 65) - (todaySummary?.fat || 0),
    };

    const systemPrompt = `You are APEX — the AI nutrition coach inside JackedAI. The user is at a restaurant and needs help choosing what to order to hit their macro goals.

TODAY'S DATE: ${new Date().toISOString().split('T')[0]}

RESTAURANT: ${restaurant?.name || 'Unknown'}
${restaurant?.address ? `ADDRESS: ${restaurant.address}` : ''}
${restaurant?.types?.length ? `TYPE: ${restaurant.types.join(', ')}` : ''}

USER PROFILE:
- Age: ${profile?.age || "?"}, Sex: ${profile?.biological_sex || "?"}
- Weight: ${profile?.current_weight_kg || "?"}kg, Goal: ${profile?.goal_weight_kg || "?"}kg
- Goal: ${profile?.goal_description || "body recomp"}
- Cooking style: ${profile?.cooking_style || "?"}
- Favorite meals: ${(profile?.favorite_meals || []).join(", ") || "none listed"}
- Hated foods: ${(profile?.hated_foods || []).join(", ") || "none"}
- Dietary restrictions: ${(profile?.dietary_restrictions || []).join(", ") || "none"}

DAILY TARGETS:
- Calories: ${profile?.calorie_target || 2000} cal
- Protein: ${profile?.protein_target || 150}g
- Carbs: ${profile?.carb_target || 200}g
- Fat: ${profile?.fat_target || 65}g

REMAINING FOR TODAY:
- Calories: ${remaining.calories} cal left
- Protein: ${remaining.protein}g left
- Carbs: ${remaining.carbs}g left
- Fat: ${remaining.fat}g left

ALREADY EATEN TODAY:
- Calories: ${todaySummary?.calories || 0} cal
- Protein: ${todaySummary?.protein || 0}g
- Meals logged: ${todaySummary?.entries?.length || 0}

YOUR JOB:
1. If this is a chain restaurant, use your knowledge of their REAL menu items and published nutrition data.
2. If it's a local/independent restaurant, suggest common dishes for that cuisine type and estimate macros.
3. Recommend 2-3 specific menu items or combos that best fit the remaining macros.
4. For each recommendation, explain WHY it works for their goals.
5. Include specific modifications (no bun, sub salad for fries, dressing on side, etc.) that improve the macro fit.
6. If the user asks about a specific item, give honest macro estimates and suggest tweaks.

FORMAT: For each meal recommendation, include a \`\`\`food_log JSON block so the user can log it with one tap:
\`\`\`food_log
{"food_name":"Item Name","description":"Detailed description with mods","calories":500,"protein":40,"carbs":30,"fat":20,"fiber":5,"meal_type":"lunch"}
\`\`\`

STYLE:
- Be specific — real menu items with real(ish) numbers, not "try to get something with protein"
- Prioritize protein-forward options that fit remaining macros
- Note calorie bombs and hidden macro killers (sauces, dressings, sides)
- Keep it concise but actionable — they're at the restaurant ready to order
- If they have very few macros left, help them pick the lightest option and be real about tradeoffs`;

    const chatMessages = (messages || []).map((m: any) => ({
      role: m.role,
      content: m.content,
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
        max_tokens: 1500,
        system: systemPrompt,
        messages: chatMessages.length > 0 ? chatMessages : [
          { role: "user", content: `I'm at ${restaurant?.name || 'a restaurant'}. What should I order to hit my macros?` }
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return errorResponse(`Claude API error: ${errText}`, 502, origin);
    }

    const result = await response.json();
    const message = result.content?.[0]?.text || "Sorry, I couldn't generate recommendations right now.";

    return jsonResponse({ message }, origin);
  } catch (err: any) {
    return errorResponse(err.message || "Failed to get meal recommendations", 500, origin);
  }
};
