import type { Context } from "@netlify/functions";

/**
 * Nutrition Research Agent
 *
 * Two-step lookup:
 * 1. USDA FoodData Central API (free, no key needed for basic search)
 * 2. If USDA data is incomplete, Claude researches from its training data
 *
 * This grounds food macro estimates in real data instead of AI guessing.
 */

interface USDAFood {
  fdcId: number;
  description: string;
  foodNutrients: { nutrientName: string; value: number; unitName: string }[];
  servingSize?: number;
  servingSizeUnit?: string;
  brandName?: string;
}

interface NutritionResult {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  serving_size: string;
  source: 'usda' | 'usda_branded' | 'ai_research';
  confidence: number;
  usda_fdc_id?: number;
  brand?: string;
}

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { query, foods } = await req.json();

    // Can look up a single query string or an array of food names
    const searchTerms: string[] = foods || (query ? [query] : []);
    if (searchTerms.length === 0) {
      return new Response(JSON.stringify({ error: "No food query provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const results: NutritionResult[] = [];

    for (const term of searchTerms.slice(0, 5)) { // Max 5 items per request
      // Step 1: Try USDA FoodData Central
      const usdaResult = await searchUSDA(term);
      if (usdaResult) {
        results.push(usdaResult);
        continue;
      }

      // Step 2: Fall back to Claude research
      const aiResult = await aiResearch(term);
      if (aiResult) {
        results.push(aiResult);
      }
    }

    return new Response(JSON.stringify({ results }), {
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

async function searchUSDA(query: string): Promise<NutritionResult | null> {
  try {
    // USDA FoodData Central API — free, no key required for basic search
    const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&pageSize=3&dataType=Foundation,SR%20Legacy,Branded`;

    const apiKey = typeof Deno !== "undefined"
      ? (Deno.env.get("USDA_API_KEY") || "DEMO_KEY")
      : (process.env.USDA_API_KEY || "DEMO_KEY");

    const res = await fetch(`${url}&api_key=${apiKey}`);
    if (!res.ok) return null;

    const data = await res.json();
    const foods: USDAFood[] = data.foods || [];
    if (foods.length === 0) return null;

    // Pick the best match (prefer Foundation/SR Legacy over Branded for generic foods)
    const best = foods[0];

    // Extract nutrients
    const getNutrient = (name: string): number => {
      const n = best.foodNutrients.find(fn =>
        fn.nutrientName.toLowerCase().includes(name.toLowerCase())
      );
      return n?.value || 0;
    };

    const calories = getNutrient('energy') || getNutrient('calories');
    const protein = getNutrient('protein');
    const carbs = getNutrient('carbohydrate');
    const fat = getNutrient('total lipid') || getNutrient('fat');
    const fiber = getNutrient('fiber');

    // USDA reports per 100g — if we have a serving size, note it
    const servingSize = best.servingSize
      ? `${best.servingSize}${best.servingSizeUnit || 'g'}`
      : '100g';

    return {
      name: best.description,
      calories: Math.round(calories),
      protein: Math.round(protein * 10) / 10,
      carbs: Math.round(carbs * 10) / 10,
      fat: Math.round(fat * 10) / 10,
      fiber: Math.round(fiber * 10) / 10,
      serving_size: servingSize,
      source: best.brandName ? 'usda_branded' : 'usda',
      confidence: 0.95,
      usda_fdc_id: best.fdcId,
      brand: best.brandName || undefined,
    };
  } catch {
    return null;
  }
}

async function aiResearch(query: string): Promise<NutritionResult | null> {
  const apiKey = typeof Deno !== "undefined"
    ? Deno.env.get("ANTHROPIC_API_KEY")
    : process.env.ANTHROPIC_API_KEY;

  if (!apiKey) return null;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 256,
        system: `You are a nutrition database. Given a food item, return accurate macronutrient data based on your knowledge of USDA nutrition databases, food science, and standard serving sizes. Respond ONLY with JSON, no other text.`,
        messages: [{
          role: "user",
          content: `Return nutrition data for: "${query}"

JSON format:
{"name":"food name","calories":N,"protein":N,"carbs":N,"fat":N,"fiber":N,"serving_size":"standard serving description","confidence":0.0-1.0}

Use standard serving sizes (1 cup, 1 medium, 1 slice, etc). Be accurate — this data trains a fitness app.`,
        }],
      }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      ...parsed,
      source: 'ai_research' as const,
      confidence: Math.min(parsed.confidence || 0.7, 0.8), // Cap AI research confidence
    };
  } catch {
    return null;
  }
}
