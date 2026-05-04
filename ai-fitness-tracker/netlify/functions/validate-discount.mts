import type { Context } from "@netlify/functions";
import {
  handleCors, corsHeaders, getEnv, jsonResponse, errorResponse,
  checkRateLimit, rateLimitResponse, sanitizeString,
} from "./shared/utils.ts";

/**
 * POST /.netlify/functions/validate-discount
 * Body: { code: string, device_id: string }
 * Returns: { valid, discount_pct, tier, duration_days, message }
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
    const code = sanitizeString(body.code || '', 50).toUpperCase();
    const deviceId = sanitizeString(body.device_id || '', 50);

    if (!code) return errorResponse("Discount code required", 400, origin);
    if (!deviceId) return errorResponse("Device ID required", 400, origin);

    // Rate limit: 10 attempts per minute per device
    const rl = checkRateLimit(deviceId, 'validate-discount', { windowMs: 60_000, maxRequests: 10 });
    if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs!, origin);

    // Look up code in ja_discount_codes
    const res = await fetch(
      `${supabaseUrl}/rest/v1/ja_discount_codes?select=*&code=eq.${encodeURIComponent(code)}&limit=1`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    );
    const codes = await res.json();

    if (!Array.isArray(codes) || codes.length === 0) {
      return jsonResponse({ valid: false, message: "Invalid discount code" }, 200, origin);
    }

    const discount = codes[0];

    // Check if expired
    if (discount.expires_at && new Date(discount.expires_at) < new Date()) {
      return jsonResponse({ valid: false, message: "This code has expired" }, 200, origin);
    }

    // Check max uses
    if (discount.max_uses && discount.times_used >= discount.max_uses) {
      return jsonResponse({ valid: false, message: "This code has reached its usage limit" }, 200, origin);
    }

    // Check if this device already used this code
    const usageRes = await fetch(
      `${supabaseUrl}/rest/v1/ja_discount_redemptions?select=id&discount_code_id=eq.${discount.id}&device_id=eq.${deviceId}&limit=1`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    );
    const usages = await usageRes.json();
    if (Array.isArray(usages) && usages.length > 0) {
      return jsonResponse({ valid: false, message: "You've already used this code" }, 200, origin);
    }

    // Valid! Record the redemption
    await fetch(`${supabaseUrl}/rest/v1/ja_discount_redemptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        discount_code_id: discount.id,
        device_id: deviceId,
      }),
    });

    // Increment times_used
    await fetch(`${supabaseUrl}/rest/v1/ja_discount_codes?id=eq.${discount.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ times_used: discount.times_used + 1 }),
    });

    // If the code grants a tier upgrade, create/update subscription
    if (discount.grants_tier) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + (discount.duration_days || 30));

      await fetch(`${supabaseUrl}/rest/v1/ja_subscriptions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify({
          device_id: deviceId,
          tier: discount.grants_tier,
          status: 'active',
          source: 'discount_code',
          discount_code: code,
          expires_at: expiresAt.toISOString(),
        }),
      });
    }

    return jsonResponse({
      valid: true,
      discount_pct: discount.discount_pct || 0,
      grants_tier: discount.grants_tier || null,
      duration_days: discount.duration_days || null,
      message: discount.message || `Code applied! ${discount.grants_tier ? `Enjoy ${discount.grants_tier} access.` : `${discount.discount_pct}% off!`}`,
    }, 200, origin);
  } catch (err: any) {
    return errorResponse(err.message, 500, origin);
  }
};
