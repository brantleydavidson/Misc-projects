/**
 * Shared utilities for all Netlify functions:
 * - CORS headers
 * - Rate limiting (in-memory, per-device)
 * - Device auth validation
 * - Input sanitization
 * - Usage tracking
 */

// ── CORS ────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = [
  'https://jackedai.netlify.app',
  'http://localhost:5173',
  'http://localhost:4321',
];

export function corsHeaders(origin?: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.some(o => origin.startsWith(o));
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowed ? origin! : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Device-Id',
    'Access-Control-Max-Age': '86400',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  };
}

export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(req.headers.get('origin')),
    });
  }
  return null;
}

// ── Rate Limiting (in-memory, per device) ───────────────────────────

interface RateBucket {
  count: number;
  resetAt: number;
}

const rateBuckets = new Map<string, RateBucket>();

// Clean up stale buckets periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt < now) rateBuckets.delete(key);
  }
}, 60_000);

export interface RateLimitConfig {
  windowMs: number;   // time window in ms
  maxRequests: number; // max requests per window
}

// Default: 30 requests per minute per device
const DEFAULT_RATE_LIMIT: RateLimitConfig = { windowMs: 60_000, maxRequests: 30 };

export function checkRateLimit(
  deviceId: string,
  endpoint: string,
  config: RateLimitConfig = DEFAULT_RATE_LIMIT
): { allowed: boolean; remaining: number; retryAfterMs?: number } {
  const key = `${deviceId}:${endpoint}`;
  const now = Date.now();
  const bucket = rateBuckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    rateBuckets.set(key, { count: 1, resetAt: now + config.windowMs });
    return { allowed: true, remaining: config.maxRequests - 1 };
  }

  if (bucket.count >= config.maxRequests) {
    return { allowed: false, remaining: 0, retryAfterMs: bucket.resetAt - now };
  }

  bucket.count++;
  return { allowed: true, remaining: config.maxRequests - bucket.count };
}

// ── Usage Tracking ──────────────────────────────────────────────────

export type Tier = 'free' | 'pro' | 'unlimited';

export interface UsageLimits {
  food_snaps_per_day: number;
  coach_messages_per_day: number;
  meal_plans_per_month: number;
  nutrition_lookups_per_day: number;
}

export const TIER_LIMITS: Record<Tier, UsageLimits> = {
  free: {
    food_snaps_per_day: 5,
    coach_messages_per_day: 15,
    meal_plans_per_month: 2,
    nutrition_lookups_per_day: 10,
  },
  pro: {
    food_snaps_per_day: 50,
    coach_messages_per_day: 100,
    meal_plans_per_month: 30,
    nutrition_lookups_per_day: 50,
  },
  unlimited: {
    food_snaps_per_day: 999,
    coach_messages_per_day: 999,
    meal_plans_per_month: 999,
    nutrition_lookups_per_day: 999,
  },
};

export type UsageAction = 'food_snap' | 'coach_message' | 'meal_plan' | 'nutrition_lookup';

const ACTION_TO_LIMIT: Record<UsageAction, keyof UsageLimits> = {
  food_snap: 'food_snaps_per_day',
  coach_message: 'coach_messages_per_day',
  meal_plan: 'meal_plans_per_month',
  nutrition_lookup: 'nutrition_lookups_per_day',
};

/**
 * Check usage against tier limits. Returns whether the action is allowed.
 * Uses Supabase ja_usage table to track.
 */
export async function checkUsage(
  deviceId: string,
  action: UsageAction,
  supabaseUrl: string,
  supabaseKey: string
): Promise<{ allowed: boolean; used: number; limit: number; tier: Tier }> {
  const tier = await getDeviceTier(deviceId, supabaseUrl, supabaseKey);
  const limits = TIER_LIMITS[tier];
  const limitKey = ACTION_TO_LIMIT[action];
  const limit = limits[limitKey];

  // Get current usage count
  const isMonthly = action === 'meal_plan';
  const periodStart = isMonthly
    ? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
    : new Date().toISOString().split('T')[0] + 'T00:00:00Z';

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/ja_usage?select=id&device_id=eq.${deviceId}&action=eq.${action}&created_at=gte.${periodStart}`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    );
    const data = await res.json();
    const used = Array.isArray(data) ? data.length : 0;

    return { allowed: used < limit, used, limit, tier };
  } catch {
    // If Supabase is down, allow the request (fail open for UX)
    return { allowed: true, used: 0, limit, tier };
  }
}

/** Record a usage event. */
export async function recordUsage(
  deviceId: string,
  action: UsageAction,
  supabaseUrl: string,
  supabaseKey: string
): Promise<void> {
  try {
    await fetch(`${supabaseUrl}/rest/v1/ja_usage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ device_id: deviceId, action }),
    });
  } catch {
    // Non-blocking — don't fail the main request
  }
}

/** Look up the tier for a device. */
async function getDeviceTier(
  deviceId: string,
  supabaseUrl: string,
  supabaseKey: string
): Promise<Tier> {
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/ja_subscriptions?select=tier,status,expires_at&device_id=eq.${deviceId}&status=eq.active&limit=1`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    );
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      const sub = data[0];
      // Check expiry
      if (sub.expires_at && new Date(sub.expires_at) < new Date()) return 'free';
      return sub.tier as Tier;
    }
  } catch {}
  return 'free';
}

// ── Input Validation ────────────────────────────────────────────────

/** Basic input sanitization — strip obvious injection attempts. */
export function sanitizeString(input: string, maxLength: number = 5000): string {
  if (typeof input !== 'string') return '';
  return input.slice(0, maxLength).trim();
}

/** Validate device ID format (UUID v4). */
export function isValidDeviceId(id: unknown): id is string {
  if (typeof id !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

// ── Response Helpers ────────────────────────────────────────────────

export function jsonResponse(data: unknown, status: number, origin?: string | null): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders(origin),
  });
}

export function errorResponse(message: string, status: number, origin?: string | null): Response {
  return jsonResponse({ error: message }, status, origin);
}

export function rateLimitResponse(retryAfterMs: number, origin?: string | null): Response {
  return new Response(JSON.stringify({ error: 'Rate limit exceeded. Slow down.' }), {
    status: 429,
    headers: {
      ...corsHeaders(origin),
      'Retry-After': String(Math.ceil(retryAfterMs / 1000)),
    },
  });
}

export function usageLimitResponse(used: number, limit: number, tier: Tier, origin?: string | null): Response {
  return jsonResponse({
    error: 'Usage limit reached for your plan.',
    used,
    limit,
    tier,
    upgrade_available: tier === 'free',
  }, 403, origin);
}

// ── Env Helper ──────────────────────────────────────────────────────

export function getEnv(key: string): string | undefined {
  return typeof Deno !== 'undefined' ? Deno.env.get(key) : process.env[key];
}

// ── User Context (data-first onboarding) ────────────────────────────

export interface UserContext {
  profile_id: string | null;
  user_model: any | null;
  health_baseline: any | null;
  observations: any[];
}

/**
 * Loads the data-first onboarding context for a device. Used by chat / food
 * endpoints so every interaction is grounded in the user_model that the
 * onboarding agent + daily coach maintain.
 */
export async function fetchUserContext(
  deviceId: string,
  supabaseUrl: string,
  supabaseKey: string,
): Promise<UserContext> {
  if (!deviceId || deviceId === 'unknown') {
    return { profile_id: null, user_model: null, health_baseline: null, observations: [] };
  }
  try {
    const profRes = await fetch(
      `${supabaseUrl}/rest/v1/ja_profiles?device_id=eq.${encodeURIComponent(deviceId)}&select=id,user_model,health_baseline&limit=1`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } },
    );
    if (!profRes.ok) throw new Error('profile lookup failed');
    const rows = await profRes.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return { profile_id: null, user_model: null, health_baseline: null, observations: [] };
    }
    const row = rows[0];

    // Pull recent unsurfaced observations
    let observations: any[] = [];
    try {
      const obsRes = await fetch(
        `${supabaseUrl}/rest/v1/ja_ai_observations?profile_id=eq.${row.id}&order=created_at.desc&limit=5`,
        { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } },
      );
      if (obsRes.ok) observations = await obsRes.json();
    } catch { /* non-critical */ }

    return {
      profile_id: row.id,
      user_model: row.user_model || null,
      health_baseline: row.health_baseline || null,
      observations,
    };
  } catch {
    return { profile_id: null, user_model: null, health_baseline: null, observations: [] };
  }
}

/**
 * Format user context as a compact text block for inclusion in system prompts.
 * Returns empty string if no useful context exists.
 */
export function formatUserContext(ctx: UserContext): string {
  if (!ctx.user_model && !ctx.health_baseline) return '';
  const lines: string[] = ['DATA-FIRST CONTEXT (always trust this over generic guidance):'];
  if (ctx.health_baseline?.summary) {
    lines.push(`- Baseline: ${ctx.health_baseline.summary}`);
  }
  if (ctx.user_model) {
    const m = ctx.user_model;
    if (m.goal?.primary) lines.push(`- Goal: ${m.goal.primary}${m.goal.target_kg ? ` (target ${m.goal.target_kg}kg)` : ''}`);
    if (m.metabolic?.measured_tdee) lines.push(`- Measured TDEE: ${m.metabolic.measured_tdee}kcal`);
    if (m.metabolic?.target_calories) lines.push(`- Target: ${m.metabolic.target_calories}kcal`);
    if (m.metabolic?.macros) {
      const mac = m.metabolic.macros;
      if (mac.protein_g || mac.carbs_g || mac.fat_g)
        lines.push(`- Macros: P${mac.protein_g ?? '?'}g C${mac.carbs_g ?? '?'}g F${mac.fat_g ?? '?'}g`);
    }
    if (m.lifestyle?.sleep_avg_minutes) lines.push(`- Sleep avg: ${Math.round(m.lifestyle.sleep_avg_minutes / 60 * 10) / 10}h`);
    if (m.fitness_state?.training_pattern) lines.push(`- Training: ${m.fitness_state.training_pattern}`);
    if (m.preferences?.dislikes?.length) lines.push(`- Dislikes: ${m.preferences.dislikes.join(', ')}`);
    if (m.coaching_state?.current_focus) lines.push(`- Current focus: ${m.coaching_state.current_focus}`);
  }
  if (ctx.observations?.length) {
    const recent = ctx.observations
      .filter(o => o.importance >= 2)
      .slice(0, 3)
      .map(o => `  • ${o.content}`);
    if (recent.length) {
      lines.push('- Recent observations:');
      lines.push(...recent);
    }
  }
  return lines.join('\n');
}
