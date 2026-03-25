-- Plant ID Travel App - Supabase Migration
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- Profiles: device-based anonymous users
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  device_id text unique not null,
  home_city text,
  home_zip text,
  space_type text,
  created_at timestamptz default now()
);

-- Plant identifications from photo AI
create table if not exists identifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  plant_name text,
  scientific_name text,
  confidence numeric,
  image_url text,
  climate_assessment jsonb,
  ai_response text,
  created_at timestamptz default now()
);

-- Saved plants wishlist
create table if not exists wishlist (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  plant_name text,
  scientific_name text,
  rating text,
  climate_assessment jsonb,
  notes text,
  created_at timestamptz default now()
);

-- Chat conversation history
create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  role text,
  content text,
  image_url text,
  plant_context text,
  created_at timestamptz default now()
);

-- Enable Row Level Security
alter table profiles enable row level security;
alter table identifications enable row level security;
alter table wishlist enable row level security;
alter table chat_messages enable row level security;

-- Permissive policies for anon role (device-id filtering is at app level)
create policy "Allow all on profiles" on profiles for all to anon using (true) with check (true);
create policy "Allow all on identifications" on identifications for all to anon using (true) with check (true);
create policy "Allow all on wishlist" on wishlist for all to anon using (true) with check (true);
create policy "Allow all on chat_messages" on chat_messages for all to anon using (true) with check (true);
