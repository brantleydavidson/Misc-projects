import type { Context } from "@netlify/functions";
import {
  handleCors, getEnv, jsonResponse, errorResponse,
  checkUsage, checkRateLimit, rateLimitResponse,
  sanitizeString, TIER_LIMITS,
  type UsageAction,
} from "./shared/utils.ts";

/**
 * POST /.netlify/functions/check-usage
 * Body: { device_id: string, action: UsageAction }
 * Returns: { allowed, used, limit, tier, limits_overview }
 *
 * Call this BEFORE making an AI request to check if the user has quota left.
 */
export default async (req: Request, _context: Context) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const origin = req.headers.get('origin');

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405, origin);
  }

  const supabaseUrl = getEnv("SUPABASE_URL");
  const supabaseKey = getEnv("SUPABASE_SERVICE_KEY") || getEnv("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseKey) {
    return errorResponse("Service unavailable", 503, origin);
  }

  try {
    const body = await req.json();
    const deviceId = sanitizeString(body.device_id || '', 50);
    const action = sanitizeString(body.action || '', 30) as UsageAction;

    if (!deviceId) return errorResponse("device_id required", 400, origin);

    const validActions: UsageAction[] = ['food_snap', 'coach_message', 'meal_plan', 'nutrition_lookup'];
    if (!validActions.includes(action)) {
      return errorResponse("Invalid action", 400, origin);
    }

    // Rate limit: 60 checks per minute
    const rl = checkRateLimit(deviceId, 'check-usage', { windowMs: 60_000, maxRequests: 60 });
    if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs!, origin);

    const usage = await checkUsage(deviceId, action, supabaseUrl, supabaseKey);

    return jsonResponse({
      ...usage,
      limits_overview: TIER_LIMITS[usage.tier],
    }, 200, origin);
  } catch (err: any) {
    return errorResponse(err.message, 500, origin);
  }
};
