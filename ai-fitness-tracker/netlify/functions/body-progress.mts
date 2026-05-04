import type { Context } from "@netlify/functions";
import {
  handleCors, getEnv, jsonResponse, errorResponse,
  checkRateLimit, rateLimitResponse, sanitizeString,
} from "./shared/utils.ts";

/**
 * POST /.netlify/functions/body-progress
 * Body: {
 *   current_photo: string (base64),
 *   previous_photo?: string (base64),
 *   current_date: string,
 *   previous_date?: string,
 *   current_weight_kg?: number,
 *   previous_weight_kg?: number,
 *   profile_summary?: string,
 *   device_id: string
 * }
 *
 * Uses Claude Vision to analyze body progress photos.
 * If a previous photo is provided, compares the two.
 * Returns qualitative analysis of body composition changes.
 */

export default async (req: Request, _context: Context) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const origin = req.headers.get('origin');

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405, origin);
  }

  const apiKey = getEnv("ANTHROPIC_API_KEY");
  if (!apiKey) return errorResponse("API key not configured", 500, origin);

  try {
    const body = await req.json();
    const deviceId = sanitizeString(body.device_id || '', 50);
    const currentPhoto = body.current_photo;
    const previousPhoto = body.previous_photo;
    const currentDate = body.current_date || 'today';
    const previousDate = body.previous_date;
    const currentWeight = body.current_weight_kg;
    const previousWeight = body.previous_weight_kg;
    const profileSummary = sanitizeString(body.profile_summary || '', 2000);

    if (!currentPhoto) {
      return errorResponse("current_photo (base64) is required", 400, origin);
    }

    // Rate limit: 5 analyses per hour
    const rl = checkRateLimit(deviceId, 'body-progress', { windowMs: 3600_000, maxRequests: 5 });
    if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs!, origin);

    const isComparison = !!previousPhoto;

    const systemPrompt = `You are APEX, an AI fitness coach analyzing body progress photos for the BeJacked app. Be honest, specific, and encouraging.

${profileSummary ? `USER CONTEXT:\n${profileSummary}\n` : ''}
RULES:
- Focus on visible, objective observations — not subjective judgments
- Never shame or use negative language about body appearance
- Mention specific areas: shoulders, arms, chest, midsection, back, legs
- Note posture changes if visible
- You CANNOT determine body fat percentage from photos — don't try
- If comparing two photos, note specific changes you can see
- Keep the tone of a supportive coach who celebrates progress
- Be honest if no visible changes are apparent — that's OK, it takes time
- Mention that consistency matters more than any single photo
${currentWeight ? `- Current weight: ${currentWeight}kg` : ''}
${previousWeight ? `- Previous weight: ${previousWeight}kg` : ''}`;

    const content: any[] = [];

    if (isComparison) {
      content.push(
        { type: "text", text: `Compare these two progress photos. First photo is from ${previousDate || 'earlier'}, second is from ${currentDate}.${previousWeight && currentWeight ? ` Weight went from ${previousWeight}kg to ${currentWeight}kg.` : ''} What changes do you see?` },
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: previousPhoto } },
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: currentPhoto } },
      );
    } else {
      content.push(
        { type: "text", text: `Analyze this progress photo from ${currentDate}.${currentWeight ? ` Current weight: ${currentWeight}kg.` : ''} Give a baseline assessment of visible body composition. This will be used for future comparisons.` },
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: currentPhoto } },
      );
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return errorResponse(`Claude API error: ${errText}`, 502, origin);
    }

    const data = await response.json();
    const analysis = data.content?.[0]?.text || "Unable to analyze the photo.";

    return jsonResponse({
      analysis,
      type: isComparison ? 'comparison' : 'baseline',
      current_date: currentDate,
      previous_date: previousDate || null,
    }, 200, origin);
  } catch (err: any) {
    return errorResponse(err.message, 500, origin);
  }
};
