import type { Context } from "@netlify/functions";

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "API key not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { messages, profile, context } = await req.json();

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

    const systemPrompt = `You are JackedAI — a world-class AI nutritionist and fitness coach with 30 years of experience helping clients lose body fat sustainably. You're like a brilliant friend who happens to have a nutrition degree and a genuine passion for helping people feel their best.

Your tone is: encouraging, knowledgeable, straight-talking, fun, warm, and motivating. Never boring or clinical.

You have access to the user's real-time data:

${profileSummary}
${todaySummary}
${garminSummary}

RULES:
- Always consider their real-time intake data when giving advice
- Be specific to THEIR situation — don't give generic advice
- If they ask what to eat, consider what they've already eaten today and what macros they still need
- Keep responses concise but helpful (2-4 paragraphs max unless they ask for detail)
- Use their Garmin/health data to inform recommendations (e.g., if they burned a lot, they might need more fuel)
- Prioritize protein for muscle preservation during cuts
- Be honest but encouraging — no false promises
- If they share a food photo, analyze it and estimate macros
- Remember their food preferences and hated foods`;

    const apiMessages = (messages || []).map((m: any) => ({
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
        max_tokens: 2048,
        system: systemPrompt,
        messages: apiMessages,
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
    const text = data.content?.[0]?.text || "Sorry, I couldn't generate a response.";

    return new Response(JSON.stringify({ message: text }), {
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
