import type { Context } from "@netlify/functions";
import {
  handleCors, getEnv, jsonResponse, errorResponse,
  checkRateLimit, rateLimitResponse,
  sanitizeString,
} from "./shared/utils.ts";

export default async (req: Request, _context: Context) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const origin = req.headers.get('origin');

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405, origin);
  }

  const apiKey = getEnv("GOOGLE_PLACES_API_KEY");
  if (!apiKey) {
    return errorResponse("Google Places API key not configured", 500, origin);
  }

  try {
    const { lat, lng, query, deviceId } = await req.json();

    // Rate limit: 20 searches per minute
    const rl = checkRateLimit(deviceId || 'unknown', 'nearby-restaurants', { windowMs: 60_000, maxRequests: 20 });
    if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs!, origin);

    if (!lat || !lng) {
      return errorResponse("Location (lat, lng) required", 400, origin);
    }

    // Use Google Places Text Search if query provided, otherwise Nearby Search
    let url: string;
    if (query) {
      const q = sanitizeString(query);
      url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(q + ' restaurant')}&location=${lat},${lng}&radius=3000&type=restaurant&key=${apiKey}`;
    } else {
      url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=1500&type=restaurant&opennow=true&rankby=prominence&key=${apiKey}`;
    }

    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      return errorResponse(`Places API error: ${data.status}`, 502, origin);
    }

    // Slim down the response to what the frontend needs
    const restaurants = (data.results || []).slice(0, 15).map((place: any) => ({
      place_id: place.place_id,
      name: place.name,
      address: place.vicinity || place.formatted_address,
      rating: place.rating,
      price_level: place.price_level,
      open_now: place.opening_hours?.open_now ?? null,
      types: place.types?.filter((t: string) => !['point_of_interest', 'establishment', 'food'].includes(t)).slice(0, 3),
      lat: place.geometry?.location?.lat,
      lng: place.geometry?.location?.lng,
    }));

    return jsonResponse({ restaurants }, origin);
  } catch (err: any) {
    return errorResponse(err.message || "Failed to search restaurants", 500, origin);
  }
};
