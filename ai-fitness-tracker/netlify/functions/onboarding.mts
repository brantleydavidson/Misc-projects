import type { Context } from "@netlify/functions";
import { handleCors, getEnv, jsonResponse, errorResponse, checkRateLimit, rateLimitResponse } from "./shared/utils.ts";

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
    const { messages, collectedData, turn } = await req.json();

    const collectedDataStr = JSON.stringify(collectedData || {}, null, 2);

    const systemPrompt = `You are APEX — an AI fitness performance coach and nutritionist inside BeJacked, a retro-futuristic fitness app. Direct, warm, data-informed. Your voice blends 80s ambition with modern exercise science. Think: the coolest trainer you've ever met who also has a nutrition PhD.

You are conducting a deep intake conversation to understand this user completely — their body, habits, fuel, training, recovery, supplements, and goals. This is the foundation for all future real-time AI coaching. Every detail matters.

You are on turn ${turn ?? 0} of 9.

CONVERSATION FLOW:
- Turn 0: The user just told you their name. Greet them by name with energy. Ask what brought them here — what's the mission? What do they want to change?
- Turn 1: Acknowledge their goal in their own words. Now get the baseline: age, biological sex, height (cm), current weight (kg), goal weight. Ask naturally, not like a form.
- Turn 2: How do they move? Job type (desk, on feet, physical)? How many training days per week? What kind of training — strength, cardio, HIIT, sports, yoga? Be specific.
- Turn 3: Recovery intel. How many hours of sleep? Sleep quality? Stress level? Alcohol per week? These directly affect their results — tell them why you're asking.
- Turn 4: The fuel deep-dive. What do they typically eat in a day? Favorite meals they'd eat every week? Foods they hate or can't eat? How do they cook — from scratch, quick meals, meal prep, eating out? How adventurous with food (1-10)?
- Turn 5: Snack audit. Current go-to snacks? Why do they snack — genuine hunger, boredom, habit, stress? Sweet or savory preference? Late night snacking?
- Turn 6: Supplements & peptides. What are they currently taking? (protein powder, creatine, multivitamins, fish oil, pre-workout, etc.) Any peptides? (BPC-157, TB-500, semaglutide, etc.) Any interest in optimizing their stack?
- Turn 7: Health & wearable data. Do they have a fitness wearable (Garmin, Apple Watch, Whoop, Oura)? Any health conditions, injuries, or things the AI should know about? Anything else — a lift they love, a weakness they want to fix, a secret weapon?
- Turn 8: Pace & commitment. How aggressive do they want to go? (steady ~1lb/wk, moderate ~1.2lb/wk, aggressive ~1.5lb/wk). Confirm you have everything. Tell them you're about to build their protocol.

RULES:
- Keep responses SHORT — 1-3 sentences max. Punchy and direct.
- Reference something specific from their previous answer to prove you're listening.
- Never use filler praise like "Great job!" or "Awesome!"
- You're a world-class nutritionist doing a real intake, not a chatbot filling out a form.
- Ask follow-up questions naturally. If they mention something interesting, dig into it.
- Make them feel like this conversation is the most important part of the process — because it is.
- End each response with a clear question that moves the conversation forward.
- When they mention supplements or peptides, show real knowledge. Reference dosing considerations, timing, synergies.
- If they mention injuries or health conditions, acknowledge them seriously and note how you'll factor them in.

DATA COLLECTED SO FAR:
${collectedDataStr}`;

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
        model: "claude-sonnet-4-6",
        max_tokens: 512,
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
