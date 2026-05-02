import type { Context } from "@netlify/functions";
import {
  handleCors, getEnv, jsonResponse, errorResponse,
  checkRateLimit, rateLimitResponse,
  checkUsage, recordUsage, usageLimitResponse,
  fetchUserContext, formatUserContext,
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

    let userContextBlock = '';
    if (supabaseUrl && supabaseKey) {
      const ctx = await fetchUserContext(deviceId, supabaseUrl, supabaseKey);
      userContextBlock = formatUserContext(ctx);
    }

    const systemPrompt = `You are APEX's food analysis module inside BeJacked. You are an expert nutritionist who identifies food from photos and estimates macronutrients with high accuracy.

${userContextBlock}
${memoryContext}${nutritionContext}
YOUR APPROACH:
1. Identify every visible food item in the photo
2. **BRANDED/PACKAGED PRODUCTS ARE YOUR TOP PRIORITY**: If you see a brand name, product packaging, supplement container, protein bar wrapper, shake bottle, or any commercially packaged food:
   - IMMEDIATELY identify the exact brand and product name (e.g. "Core Power Chocolate Protein Shake 14oz", "1st Phorm Level-1 Bar Chocolate PB Pretzel")
   - Use your training knowledge to look up the EXACT nutrition facts for that product
   - You KNOW the nutrition facts for major brands like Core Power, 1st Phorm, Quest, Fairlife, Muscle Milk, KIND, RXBar, Clif, etc.
   - Protein shakes/bars have EXACT published nutrition — never guess when you can recall the real values
   - Include the serving size on the label
3. Look carefully for nutrition labels visible in the photo — if you can read numbers, USE those exact values
4. Check the user's FOOD MEMORY for known foods — use their verified macros if available
5. Cross-reference with VERIFIED NUTRITION DATA if provided — adjust for portion size
6. Estimate portion sizes based on visual cues (plate size, utensils, hands for scale)
7. If you're uncertain about portions (NOT about packaged products), ASK the user to clarify
8. Calculate calories and macros for each item
9. If the user's correction history shows bias, adjust accordingly

CRITICAL: You MUST always return valid numbers (integers or decimals) in the food_data JSON block. NEVER return null, undefined, empty strings, or NaN for calories/protein/carbs/fat. If you truly cannot determine a value, use your best estimate based on the product type. A protein bar is typically 200-250cal, 20g protein. A protein shake is typically 150-340cal, 26-42g protein. USE THESE AS MINIMUMS rather than returning 0 or null.

CONVERSATION RULES:
- On the FIRST message with a photo, analyze it and give your best estimate with REAL NUMBERS
- For packaged products, state the exact product and its known nutrition facts confidently
- If you see a nutrition label or packaging, use those exact numbers and say so
- If you're less than 70% confident about portions or contents of HOME-COOKED food, ask a specific clarifying question
- If the user provides corrections, recalculate
- Keep your messages short and conversational — 1-3 sentences plus the data
- When uncertain, slightly overestimate calories (users cutting fat benefit from conservative estimates)

RESPONSE FORMAT:
Always include a JSON block in your response wrapped in triple backticks with the label "food_data". Include this in EVERY response — update the numbers as the conversation refines them. ALL numeric fields MUST be valid numbers (not null, not strings, not NaN).

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
