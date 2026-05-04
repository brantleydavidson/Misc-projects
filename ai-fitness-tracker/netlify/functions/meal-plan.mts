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

  try {
    const { profile } = await req.json();

    const systemPrompt = `You are BeJacked's meal plan generator. Create a fun, exciting 7-day meal plan personalized to this user.

USER PROFILE:
- Calorie target: ${profile.calorie_target} cal/day
- Protein: ${profile.protein_target}g, Carbs: ${profile.carb_target}g, Fat: ${profile.fat_target}g
- Favorite meals: ${(profile.favorite_meals || []).join(", ") || "not specified"}
- Hated foods: ${(profile.hated_foods || []).join(", ") || "none"}
- Cooking style: ${profile.cooking_style || "any"}
- Food adventurousness: ${profile.food_adventurousness || 5}/10
- Snack preference: ${profile.snack_preference || "both"}

RULES:
- Every day MUST hit calorie and macro targets (within 5% tolerance)
- No boring chicken and broccoli unless they asked for it
- Give every day a fun theme (e.g. "Mediterranean Monday", "Tex-Mex Tuesday")
- Include at least 2 meals/week that feel like treats but are macro-friendly
- Flag meals that are good for batch cooking
- Each day: breakfast, lunch, dinner, 1-2 snacks, optional dessert
- Use their favorite foods as inspiration
- Never include their hated foods

Respond with valid JSON:
{
  "days": [
    {
      "day": "Monday",
      "theme": "Mediterranean Monday",
      "meals": [
        {
          "type": "breakfast|lunch|dinner|snack|dessert",
          "name": "Meal name",
          "description": "Brief description with ingredients",
          "calories": 450,
          "protein": 35,
          "carbs": 40,
          "fat": 15,
          "batch_cook": false,
          "secret_healthy": false
        }
      ],
      "total_calories": 2000,
      "total_protein": 180,
      "total_carbs": 200,
      "total_fat": 65
    }
  ],
  "summary": "Brief encouraging summary of the plan and tips for success"
}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: "user", content: "Generate my personalized 7-day meal plan." }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return new Response(JSON.stringify({ error: `Claude API error: ${errText}` }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return new Response(JSON.stringify({ error: "Failed to parse meal plan" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const plan = JSON.parse(jsonMatch[0]);

    return new Response(JSON.stringify({ plan: plan.days || plan, summary: plan.summary || "" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
