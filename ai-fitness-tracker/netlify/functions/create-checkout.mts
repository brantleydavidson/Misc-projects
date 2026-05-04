import type { Context } from "@netlify/functions";
import {
  handleCors, getEnv, jsonResponse, errorResponse,
  checkRateLimit, rateLimitResponse, sanitizeString,
} from "./shared/utils.ts";

/**
 * POST /.netlify/functions/create-checkout
 * Body: { plan: "pro" | "unlimited", device_id: string, discount_code?: string }
 * Returns: { url: string } — Stripe Checkout session URL
 *
 * Requires STRIPE_SECRET_KEY env var.
 * Create products + prices in Stripe Dashboard first:
 *   - Pro: $9.99/mo recurring
 *   - Unlimited: $19.99/mo recurring
 * Then set STRIPE_PRO_PRICE_ID and STRIPE_UNLIMITED_PRICE_ID env vars.
 */

const PRICE_IDS: Record<string, string | undefined> = {
  pro: undefined,       // Set via STRIPE_PRO_PRICE_ID env var
  unlimited: undefined, // Set via STRIPE_UNLIMITED_PRICE_ID env var
};

export default async (req: Request, _context: Context) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const origin = req.headers.get('origin');

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405, origin);
  }

  const stripeKey = getEnv("STRIPE_SECRET_KEY");
  if (!stripeKey) {
    return errorResponse(
      "Stripe not configured. Add STRIPE_SECRET_KEY, STRIPE_PRO_PRICE_ID, and STRIPE_UNLIMITED_PRICE_ID to your Netlify env vars.",
      503,
      origin
    );
  }

  const proPriceId = getEnv("STRIPE_PRO_PRICE_ID");
  const unlimitedPriceId = getEnv("STRIPE_UNLIMITED_PRICE_ID");

  try {
    const body = await req.json();
    const plan = sanitizeString(body.plan || '', 20);
    const deviceId = sanitizeString(body.device_id || '', 50);
    const discountCode = sanitizeString(body.discount_code || '', 50);

    if (!['pro', 'unlimited'].includes(plan)) {
      return errorResponse("Invalid plan. Choose 'pro' or 'unlimited'.", 400, origin);
    }

    if (!deviceId) {
      return errorResponse("device_id required", 400, origin);
    }

    // Rate limit: 5 checkout sessions per minute
    const rl = checkRateLimit(deviceId, 'checkout', { windowMs: 60_000, maxRequests: 5 });
    if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs!, origin);

    const priceId = plan === 'pro' ? proPriceId : unlimitedPriceId;
    if (!priceId) {
      return errorResponse(`Stripe price ID for ${plan} plan not configured. Set STRIPE_${plan.toUpperCase()}_PRICE_ID env var.`, 503, origin);
    }

    // Build Stripe Checkout session
    const successUrl = `https://jackedai.netlify.app/upgrade?success=true&plan=${plan}`;
    const cancelUrl = `https://jackedai.netlify.app/upgrade?canceled=true`;

    const params = new URLSearchParams();
    params.append('mode', 'subscription');
    params.append('payment_method_types[]', 'card');
    params.append('line_items[0][price]', priceId);
    params.append('line_items[0][quantity]', '1');
    params.append('success_url', successUrl);
    params.append('cancel_url', cancelUrl);
    params.append('client_reference_id', deviceId);
    params.append('metadata[device_id]', deviceId);
    params.append('metadata[plan]', plan);

    if (discountCode) {
      params.append('metadata[discount_code]', discountCode);
    }

    // Allow promotional codes in Checkout
    params.append('allow_promotion_codes', 'true');

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const err = await response.text();
      return errorResponse(`Stripe error: ${err}`, 502, origin);
    }

    const session = await response.json();

    return jsonResponse({ url: session.url, session_id: session.id }, 200, origin);
  } catch (err: any) {
    return errorResponse(err.message, 500, origin);
  }
};
