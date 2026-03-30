import type { Context } from "@netlify/functions";

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const apiKey = typeof Deno !== "undefined"
    ? Deno.env.get("ANTHROPIC_API_KEY")
    : process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "API key not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { image, meal_type, messages } = await req.json();

    if (!image && (!messages || messages.length === 0)) {
      return new Response(JSON.stringify({ error: "No image or messages provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You are APEX's food analysis module inside JackedAI. You are an expert nutritionist who identifies food from photos and estimates macronutrients with high accuracy.

YOUR APPROACH:
1. Identify every visible food item in the photo
2. Look carefully for nutrition labels, restaurant menus, or packaging — if visible, USE those exact values
3. Estimate portion sizes based on visual cues (plate size, utensils, hands for scale)
4. If you're uncertain about portions, ASK the user to clarify before giving final numbers
5. Calculate calories and macros for each item

CONVERSATION RULES:
- On the FIRST message with a photo, analyze it and give your best estimate
- If you see a nutrition label or packaging with macro info, use those exact numbers and say so
- If you're less than 70% confident about portions or contents, ask a specific clarifying question (e.g. "That looks like it could be a 6oz or 10oz steak — which is closer?" or "Is that regular or diet soda?")
- If the user provides corrections ("it was actually 2 cups of rice" or "that's a protein shake not milk"), recalculate
- Keep your messages short and conversational — 1-3 sentences plus the data
- When uncertain, slightly overestimate calories (users cutting fat benefit from conservative estimates)

RESPONSE FORMAT:
Always include a JSON block in your response wrapped in triple backticks with the label "food_data". Include this in EVERY response — update the numbers as the conversation refines them.

\`\`\`food_data
{
  "food_name": "Brief name of the meal/dish",
  "description": "Short description",
  "calories": <total calories>,
  "protein": <total protein g>,
  "carbs": <total carbs g>,
  "fat": <total fat g>,
  "fiber": <total fiber g>,
  "confidence": <0.0-1.0>,
  "items": [{"name": "item", "calories": X, "protein": X, "carbs": X, "fat": X}],
  "needs_clarification": <true if you have questions, false if ready to log>,
  "ai_analysis": "Brief note about the meal — macro balance, suggestions, encouragement. 1-2 sentences."
}
\`\`\`

After the JSON block, if needs_clarification is true, ask your question. If false, say something like "Looking good — ready to log this?"`;

    // Build the messages array for Claude
    const apiMessages: any[] = [];

    if (messages && messages.length > 0) {
      // Multi-turn conversation
      for (const msg of messages) {
        if (msg.role === 'user' && msg.image) {
          // First message with image
          apiMessages.push({
            role: 'user',
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: "image/jpeg", data: msg.image },
              },
              { type: "text", text: msg.content || `Analyze this ${meal_type || "meal"} photo.` },
            ],
          });
        } else {
          apiMessages.push({ role: msg.role, content: msg.content });
        }
      }
    } else {
      // Legacy single-shot mode (backward compat)
      apiMessages.push({
        role: 'user',
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/jpeg", data: image },
          },
          { type: "text", text: `Analyze this ${meal_type || "meal"} photo and estimate macros.` },
        ],
      });
    }

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
    const text = data.content?.[0]?.text || "";

    // Extract food_data JSON from response
    const jsonMatch = text.match(/```food_data\s*\n?([\s\S]*?)\n?```/);
    let foodData = null;
    if (jsonMatch) {
      try { foodData = JSON.parse(jsonMatch[1].trim()); } catch {}
    }

    // Fallback: try to find any JSON object (legacy compat)
    if (!foodData) {
      const fallbackMatch = text.match(/\{[\s\S]*"calories"[\s\S]*\}/);
      if (fallbackMatch) {
        try { foodData = JSON.parse(fallbackMatch[0]); } catch {}
      }
    }

    // Strip the food_data block from the display message
    const displayMessage = text.replace(/```food_data\s*\n?[\s\S]*?\n?```/g, '').trim();

    return new Response(JSON.stringify({
      message: displayMessage,
      food_data: foodData,
    }), {
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
