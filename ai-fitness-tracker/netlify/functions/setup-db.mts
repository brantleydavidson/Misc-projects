import type { Context } from "@netlify/functions";

// Run once to create all JackedAI tables in Supabase
// POST /.netlify/functions/setup-db

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(
      JSON.stringify({ error: "SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_ANON_KEY) required" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const sql = `
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
      body_fat_pct numeric,
      supplements text[],
      peptides text[],
      supplement_notes text,
      has_wearable boolean,
      wearable_type text,
      health_conditions text[],
      injuries text[],
      wildcard_notes text,
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

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_ja_food_profile_date ON ja_food_entries(profile_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_ja_activity_profile_date ON ja_activity_logs(profile_id, log_date);
    CREATE INDEX IF NOT EXISTS idx_ja_water_profile_date ON ja_water_logs(profile_id, log_date);
    CREATE INDEX IF NOT EXISTS idx_ja_chat_profile ON ja_chat_messages(profile_id, created_at);

    -- Enable RLS
    ALTER TABLE ja_profiles ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ja_food_entries ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ja_activity_logs ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ja_water_logs ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ja_chat_messages ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ja_food_memory ENABLE ROW LEVEL SECURITY;

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
  `;

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": supabaseServiceKey,
        "Authorization": `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({ query: sql }),
    });

    // If exec_sql doesn't exist, try the SQL endpoint directly
    if (!response.ok) {
      // Try via the management API
      const mgmtResponse = await fetch(`${supabaseUrl}/pg`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": supabaseServiceKey,
          "Authorization": `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({ query: sql }),
      });

      if (!mgmtResponse.ok) {
        return new Response(
          JSON.stringify({
            error: "Could not execute SQL automatically. Run the SQL manually in Supabase dashboard.",
            sql: sql,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: "All JackedAI tables created successfully" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message, sql }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
