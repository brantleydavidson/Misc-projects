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
    const { image, meal_type, notes } = await req.json();

    if (!image) {
      return new Response(JSON.stringify({ error: "No image provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You are JackedAI's food analysis engine. You are an expert nutritionist who can identify food from photos and estimate macronutrients with high accuracy.

When analyzing a food photo:
1. Identify every visible food item
2. Estimate portion sizes based on visual cues (plate size, utensils, hands for scale)
3. Calculate calories and macros for each item
4. Sum totals

Respond ONLY with valid JSON in this exact format:
{
  "food_name": "Brief name of the meal/dish",
  "description": "Short description of what you see",
  "calories": <total calories as number>,
  "protein": <total protein in grams>,
  "carbs": <total carbs in grams>,
  "fat": <total fat in grams>,
  "fiber": <total fiber in grams>,
  "confidence": <0.0 to 1.0 confidence score>,
  "items": [
    {"name": "item 1", "calories": X, "protein": X, "carbs": X, "fat": X},
    {"name": "item 2", "calories": X, "protein": X, "carbs": X, "fat": X}
  ],
  "ai_analysis": "Brief friendly analysis - mention if this is a good macro balance, any suggestions to make it more macro-friendly, etc. Keep it encouraging and specific."
}

Be accurate but when uncertain, slightly overestimate rather than underestimate calories. Users trying to lose fat benefit from conservative estimates.`;

    const userContent: any[] = [
      {
        type: "image",
        source: {
          type: "base64",
          media_type: "image/jpeg",
          data: image,
        },
      },
      {
        type: "text",
        text: `Analyze this ${meal_type || "meal"} photo and estimate macros.${notes ? ` Additional context: ${notes}` : ""}`,
      },
    ];

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
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

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return new Response(JSON.stringify({ error: "Failed to parse AI response" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const result = JSON.parse(jsonMatch[0]);

    return new Response(JSON.stringify(result), {
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
