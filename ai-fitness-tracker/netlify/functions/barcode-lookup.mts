import type { Context } from "@netlify/functions";
import {
  handleCors, getEnv, jsonResponse, errorResponse,
  checkRateLimit, rateLimitResponse, sanitizeString,
} from "./shared/utils.ts";

/**
 * POST /.netlify/functions/barcode-lookup
 * Body: { barcode: string }
 * Returns: { found, product_name, brand, nutrition, image_url }
 *
 * Uses Open Food Facts API (free, community-maintained, no API key needed).
 * Falls back to USDA FoodData Central if not found.
 */

interface NutritionFacts {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium_mg: number;
  serving_size: string;
}

export default async (req: Request, _context: Context) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const origin = req.headers.get('origin');

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405, origin);
  }

  try {
    const body = await req.json();
    const barcode = sanitizeString(body.barcode || '', 30).replace(/\D/g, '');
    const deviceId = sanitizeString(body.device_id || '', 50);

    if (!barcode || barcode.length < 6) {
      return errorResponse("Valid barcode required (6+ digits)", 400, origin);
    }

    // Rate limit: 30 lookups per minute
    if (deviceId) {
      const rl = checkRateLimit(deviceId, 'barcode', { windowMs: 60_000, maxRequests: 30 });
      if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs!, origin);
    }

    // 1. Try Open Food Facts
    const offResult = await lookupOpenFoodFacts(barcode);
    if (offResult) {
      return jsonResponse({
        found: true,
        source: 'open_food_facts',
        ...offResult,
      }, 200, origin);
    }

    // 2. Try USDA FoodData Central with barcode (GTIN/UPC search)
    const usdaResult = await lookupUSDAByBarcode(barcode);
    if (usdaResult) {
      return jsonResponse({
        found: true,
        source: 'usda',
        ...usdaResult,
      }, 200, origin);
    }

    return jsonResponse({ found: false, barcode, message: "Product not found. Try a different barcode or enter manually." }, 200, origin);
  } catch (err: any) {
    return errorResponse(err.message, 500, origin);
  }
};

async function lookupOpenFoodFacts(barcode: string): Promise<{
  product_name: string; brand: string; nutrition: NutritionFacts; image_url?: string;
} | null> {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=product_name,brands,nutriments,serving_size,image_front_small_url`,
      { headers: { 'User-Agent': 'BeJacked/1.0 (fitness-tracker)' } }
    );

    if (!res.ok) return null;
    const data = await res.json();

    if (data.status !== 1 || !data.product) return null;

    const p = data.product;
    const n = p.nutriments || {};

    // Need at least calories or protein to be useful
    const calories = n['energy-kcal_serving'] || n['energy-kcal_100g'] || 0;
    if (!calories && !n.proteins_serving && !n.proteins_100g) return null;

    const isPerServing = !!n['energy-kcal_serving'];

    return {
      product_name: p.product_name || 'Unknown Product',
      brand: p.brands || '',
      image_url: p.image_front_small_url,
      nutrition: {
        calories: Math.round(isPerServing ? (n['energy-kcal_serving'] || 0) : (n['energy-kcal_100g'] || 0)),
        protein: Math.round((isPerServing ? n.proteins_serving : n.proteins_100g) || 0),
        carbs: Math.round((isPerServing ? n.carbohydrates_serving : n.carbohydrates_100g) || 0),
        fat: Math.round((isPerServing ? n.fat_serving : n.fat_100g) || 0),
        fiber: Math.round((isPerServing ? n.fiber_serving : n.fiber_100g) || 0),
        sugar: Math.round((isPerServing ? n.sugars_serving : n.sugars_100g) || 0),
        sodium_mg: Math.round(((isPerServing ? n.sodium_serving : n.sodium_100g) || 0) * 1000),
        serving_size: p.serving_size || (isPerServing ? 'per serving' : 'per 100g'),
      },
    };
  } catch {
    return null;
  }
}

async function lookupUSDAByBarcode(barcode: string): Promise<{
  product_name: string; brand: string; nutrition: NutritionFacts;
} | null> {
  try {
    const apiKey = getEnv("USDA_API_KEY") || 'DEMO_KEY';
    const res = await fetch(
      `https://api.nal.usda.gov/fdc/v1/foods/search?query=${barcode}&dataType=Branded&pageSize=1&api_key=${apiKey}`
    );

    if (!res.ok) return null;
    const data = await res.json();

    if (!data.foods || data.foods.length === 0) return null;

    const food = data.foods[0];
    const nutrients = food.foodNutrients || [];

    function getNutrient(name: string): number {
      const n = nutrients.find((n: any) =>
        n.nutrientName?.toLowerCase().includes(name.toLowerCase())
      );
      return Math.round(n?.value || 0);
    }

    return {
      product_name: food.description || 'Unknown Product',
      brand: food.brandOwner || food.brandName || '',
      nutrition: {
        calories: getNutrient('energy'),
        protein: getNutrient('protein'),
        carbs: getNutrient('carbohydrate'),
        fat: getNutrient('total lipid') || getNutrient('fat'),
        fiber: getNutrient('fiber'),
        sugar: getNutrient('sugar'),
        sodium_mg: getNutrient('sodium'),
        serving_size: food.servingSize ? `${food.servingSize}${food.servingSizeUnit || 'g'}` : 'per serving',
      },
    };
  } catch {
    return null;
  }
}
