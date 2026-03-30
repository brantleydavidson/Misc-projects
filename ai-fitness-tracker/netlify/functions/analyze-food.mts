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
    const { image, meal_type, messages, food_memory, nutrition_data, device_id } = await req.json();
    const deviceId = device_id || req.headers.get('x-device-id') || 'unknown';

    // Rate limit: 10 food snaps per minute
    const rl = checkRateLimit(deviceId, 'analyze-food', { windowMs: 60_000, maxRequests: 10 });
    if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs!, origin);

    // Usage tier check
    if (supabaseUrl && supabaseKey) {
      const usage = await checkUsage(deviceId, 'food_snap', supabaseUrl, supabaseKey);
      if (!usage.allowed) {
        return usageLimitResponse(usage.used, usage.limit, usage.tier, origin);
      }
    }

    if (!image && (!messages || messages.length === 0)) {
      return errorResponse("No image or messages provided", 400, origin);
    }

    // Build memory context section
    let memoryContext = '';
    if (food_memory) {
      memoryContext = `\n\n--- USER'S FOOD MEMORY (self-improving system) ---\n${food_memory}\n--- END FOOD MEMORY ---\n`;
    }

    // Build nutrition research section
    let nutritionContext = '';
    if (nutrition_data && nutrition_data.length > 0) {
      nutritionContext = '\n\n--- VERIFIED NUTRITION DATA (from USDA / research) ---\n';
      for (const item of nutrition_data) {
        nutritionContext += `• ${item.name}: ${item.calories}cal | ${item.protein}g protein | ${item.carbs}g carbs | ${item.fat}g fat | per ${item.serving_size} [source: ${item.source}, confidence: ${item.confidence}]\n`;
      }
      nutritionContext += 'USE this data to ground your estimates. Adjust for actual portion sizes in the photo.\n--- END NUTRITION DATA ---\n';
    }

    const systemPrompt = `You are APEX's food analysis module inside JackedAI. You are an expert nutritionist who identifies food from photos and estimates macronutrients with high accuracy.
${memoryContext}${nutritionContext}
YOUR APPROACH:
1. Identify every visible food item in the photo
2. Look carefully for nutrition labels, restaurant menus, or packaging — if visible, USE those exact values
3. Check the user's FOOD MEMORY for known foods — if you recognize something they've eaten before, use their verified macros
4. Cross-reference with VERIFIED NUTRITION DATA if provided — adjust for portion size
5. Estimate portion sizes based on visual cues (plate size, utensils, hands for scale)
6. If you're uncertain about portions, ASK the user to clarify before giving final numbers
7. Calculate calories and macros for each item
8. If the user's correction history shows you tend to underestimate or overestimate, adjust accordingly

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
      return errorResponse(`Claude API error: ${errText}`, 502, origin);
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

    // Record usage
    if (supabaseUrl && supabaseKey) {
      recordUsage(deviceId, 'food_snap', supabaseUrl, supabaseKey).catch(() => {});
    }

    return jsonResponse({ message: displayMessage, food_data: foodData }, 200, origin);
  } catch (err: any) {
    return errorResponse(err.message, 500, origin);
  }
};
