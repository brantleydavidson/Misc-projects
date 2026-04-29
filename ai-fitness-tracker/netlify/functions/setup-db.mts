import type { Context } from "@netlify/functions";

// Run once to create all JackedAI tables in Supabase
// POST /.netlify/functions/setup-db  → tries to execute SQL
// GET  /.netlify/functions/setup-db  → returns the raw SQL to run manually

const SQL = `
-- ============================================================
-- BeJacked Database Schema
-- Run this in Supabase SQL Editor (https://supabase.com/dashboard)
-- ============================================================

-- Profiles
CREATE TABLE IF NOT EXISTS ja_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text UNIQUE NOT NULL,
  age integer,
  biological_sex text,
  height_cm numeric,
  current_weight_kg numeric,
  goal_weight_kg numeric,
  goal_description text,
  weight_loss_pace text,
  job_type text,
  exercise_frequency integer,
  exercise_types text[],
  sleep_hours numeric,
  stress_level text,
  alcohol_per_week text,
  favorite_meals text[],
  hated_foods text[],
  dietary_restrictions text[],
  cooking_style text,
  food_adventurousness integer,
  current_snacks text[],
  snack_reason text,
  snack_preference text,
  late_night_snacking boolean,
  bmr numeric,
  tdee numeric,
  calorie_target integer,
  protein_target integer,
  carb_target integer,
  fat_target integer,
  water_target_liters numeric,
  email text,
  phone text,
  sms_opted_in boolean DEFAULT false,
  body_fat_pct numeric,
  supplements text[],
  peptides text[],
  supplement_notes text,
  has_wearable boolean,
  wearable_type text,
  health_conditions text[],
  injuries text[],
  wildcard_notes text,
  unit_weight text DEFAULT 'lbs',
  unit_height text DEFAULT 'in',
  unit_distance text DEFAULT 'mi',
  unit_water text DEFAULT 'oz',
  unit_temperature text DEFAULT 'F',
  date_format text DEFAULT 'MM/DD/YYYY',
  time_format text DEFAULT '12h',
  meal_window_start text DEFAULT '08:00',
  meal_window_end text DEFAULT '20:00',
  weekly_weigh_in_day integer DEFAULT 1,
  display_theme text DEFAULT 'dark',
  ow_user_id text,
  onboarding_complete boolean DEFAULT false,
  notifications_enabled boolean DEFAULT false,
  notify_morning text DEFAULT '07:00',
  notify_midday text DEFAULT '13:00',
  notify_evening text DEFAULT '21:00',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Food entries
CREATE TABLE IF NOT EXISTS ja_food_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES ja_profiles(id) ON DELETE CASCADE,
  food_name text,
  description text,
  calories integer,
  protein numeric,
  carbs numeric,
  fat numeric,
  fiber numeric,
  meal_type text,
  ai_analysis text,
  confidence numeric,
  created_at timestamptz DEFAULT now()
);

-- Activity logs (one row per profile per day)
CREATE TABLE IF NOT EXISTS ja_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES ja_profiles(id) ON DELETE CASCADE,
  log_date date NOT NULL,
  activity_data jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now(),
  UNIQUE(profile_id, log_date)
);

-- Water logs
CREATE TABLE IF NOT EXISTS ja_water_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES ja_profiles(id) ON DELETE CASCADE,
  log_date date NOT NULL,
  water_ml integer DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(profile_id, log_date)
);

-- Chat messages
CREATE TABLE IF NOT EXISTS ja_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES ja_profiles(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  image_url text,
  created_at timestamptz DEFAULT now()
);

-- Food memory (self-improving macro estimation)
CREATE TABLE IF NOT EXISTS ja_food_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES ja_profiles(id) ON DELETE CASCADE UNIQUE,
  corrections jsonb DEFAULT '[]',
  learned_foods jsonb DEFAULT '[]',
  updated_at timestamptz DEFAULT now()
);

-- Usage tracking (for tier-based rate limiting)
CREATE TABLE IF NOT EXISTS ja_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL,
  action text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Subscriptions (free/pro/unlimited tiers)
CREATE TABLE IF NOT EXISTS ja_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL,
  tier text NOT NULL DEFAULT 'free',
  status text NOT NULL DEFAULT 'active',
  source text,
  discount_code text,
  stripe_customer_id text,
  stripe_subscription_id text,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(device_id)
);

-- Discount codes
CREATE TABLE IF NOT EXISTS ja_discount_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  discount_pct integer DEFAULT 0,
  grants_tier text,
  duration_days integer DEFAULT 30,
  max_uses integer,
  times_used integer DEFAULT 0,
  message text,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Discount code redemptions
CREATE TABLE IF NOT EXISTS ja_discount_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discount_code_id uuid REFERENCES ja_discount_codes(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(discount_code_id, device_id)
);

-- Coach memories (APEX long-term memory per user)
CREATE TABLE IF NOT EXISTS ja_coach_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES ja_profiles(id) ON DELETE CASCADE,
  category text NOT NULL,
  content text NOT NULL,
  source text DEFAULT 'extracted',
  confidence numeric DEFAULT 0.8,
  superseded_by uuid REFERENCES ja_coach_memories(id) ON DELETE SET NULL,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Trend cache (avoid recomputing on every chat message)
CREATE TABLE IF NOT EXISTS ja_trend_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES ja_profiles(id) ON DELETE CASCADE UNIQUE,
  summary_7d jsonb,
  summary_14d jsonb,
  summary_30d jsonb,
  computed_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ja_memories_profile_active ON ja_coach_memories(profile_id, active);
CREATE INDEX IF NOT EXISTS idx_ja_memories_category ON ja_coach_memories(profile_id, category, active);
CREATE INDEX IF NOT EXISTS idx_ja_food_profile_date ON ja_food_entries(profile_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ja_activity_profile_date ON ja_activity_logs(profile_id, log_date);
CREATE INDEX IF NOT EXISTS idx_ja_water_profile_date ON ja_water_logs(profile_id, log_date);
CREATE INDEX IF NOT EXISTS idx_ja_chat_profile ON ja_chat_messages(profile_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ja_usage_device_action ON ja_usage(device_id, action, created_at);
CREATE INDEX IF NOT EXISTS idx_ja_subs_device ON ja_subscriptions(device_id, status);
CREATE INDEX IF NOT EXISTS idx_ja_discount_code ON ja_discount_codes(code);
CREATE INDEX IF NOT EXISTS idx_ja_profiles_email ON ja_profiles(email);

-- Enable RLS
ALTER TABLE ja_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE ja_food_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE ja_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ja_water_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ja_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ja_food_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE ja_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE ja_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ja_discount_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ja_discount_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ja_coach_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE ja_trend_cache ENABLE ROW LEVEL SECURITY;

-- Permissive policies (device-id based, no auth)
DO $$ BEGIN
  CREATE POLICY "ja_profiles_all" ON ja_profiles FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "ja_food_entries_all" ON ja_food_entries FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "ja_activity_logs_all" ON ja_activity_logs FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "ja_water_logs_all" ON ja_water_logs FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "ja_chat_messages_all" ON ja_chat_messages FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "ja_food_memory_all" ON ja_food_memory FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "ja_usage_all" ON ja_usage FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "ja_subscriptions_all" ON ja_subscriptions FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "ja_discount_codes_read" ON ja_discount_codes FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "ja_discount_redemptions_all" ON ja_discount_redemptions FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "ja_coach_memories_all" ON ja_coach_memories FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "ja_trend_cache_all" ON ja_trend_cache FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Seed a launch discount code
INSERT INTO ja_discount_codes (code, grants_tier, duration_days, max_uses, message)
VALUES ('LAUNCH2024', 'pro', 90, 500, 'Welcome to BeJacked Pro — 90 days free!')
ON CONFLICT (code) DO NOTHING;
`;

export default async (req: Request, _context: Context) => {
  // GET → return raw SQL for manual execution in Supabase SQL Editor
  if (req.method === "GET") {
    return new Response(SQL, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabaseUrl = typeof Deno !== "undefined"
    ? Deno.env.get("SUPABASE_URL")
    : process.env.SUPABASE_URL;
  const supabaseServiceKey = typeof Deno !== "undefined"
    ? (Deno.env.get("SUPABASE_SERVICE_KEY") || Deno.env.get("SUPABASE_ANON_KEY"))
    : (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY);

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(
      JSON.stringify({ error: "SUPABASE_URL and SUPABASE_SERVICE_KEY required. Use GET to retrieve the SQL and run it manually." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // Split SQL into individual statements and execute them one by one
  // This avoids issues with multi-statement execution via REST API
  const statements = SQL
    .split(/;\s*\n/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  const results: { statement: string; success: boolean; error?: string }[] = [];
  let successCount = 0;
  let errorCount = 0;

  for (const stmt of statements) {
    const fullStmt = stmt.endsWith(';') ? stmt : stmt + ';';

    try {
      // Use Supabase's RPC endpoint to execute raw SQL
      // First try the pg-meta endpoint (available on newer Supabase)
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": supabaseServiceKey,
          "Authorization": `Bearer ${supabaseServiceKey}`,
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({ query: fullStmt }),
      });

      if (response.ok) {
        successCount++;
        results.push({ statement: fullStmt.slice(0, 80) + '...', success: true });
      } else {
        const errText = await response.text();
        errorCount++;
        results.push({ statement: fullStmt.slice(0, 80) + '...', success: false, error: errText });
      }
    } catch (err: any) {
      errorCount++;
      results.push({ statement: fullStmt.slice(0, 80) + '...', success: false, error: err.message });
    }
  }

  // If exec_sql RPC doesn't exist at all, return the SQL for manual execution
  if (errorCount > 0 && successCount === 0) {
    return new Response(
      JSON.stringify({
        error: "Could not execute SQL via API. The exec_sql RPC function may not exist.",
        instruction: "Copy the SQL below and paste it into the Supabase SQL Editor at https://supabase.com/dashboard",
        hint: "Or call GET /.netlify/functions/setup-db to download the SQL as plain text.",
        sql: SQL,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({
      success: errorCount === 0,
      message: `Executed ${successCount} statements, ${errorCount} errors.`,
      results,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};
