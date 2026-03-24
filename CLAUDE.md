# Plant ID Travel App - Project Context

## Branch
- Working branch: `claude/plant-id-travel-app-i6Dle`
- Always develop and push to this branch

## Deployment
- **Netlify site**: adorable-tanuki-4da663.netlify.app
- Auto-deploys from the branch above
- Base directory: `plant-id-travel-app`
- Build command: `npm run build`
- Publish directory: `plant-id-travel-app/dist`

## Environment Variables (in Netlify)
- `ANTHROPIC_API_KEY` — Claude API key for plant ID + chat
- `SUPABASE_URL` — Supabase project URL (project ref: gulcgcgzbizorqixrxkl)
- `SUPABASE_ANON_KEY` — Supabase public/anon key

## MCP Access
- Supabase MCP is configured in `.mcp.json` at repo root
- Use it to create tables, run queries, manage the database directly
- **FIRST PRIORITY on new session**: Verify MCP tools are available, then create the database tables

## Current State (as of last session)
- App is a working MVP with React + Tailwind + Vite
- 12 hardcoded plants, 18 city climate profiles, multi-factor assessment engine
- All AI features are MOCKED (fake plant ID, pattern-matching chat)
- Deployed to Netlify and accessible at the URL above

## What Needs To Be Built (in order)

### 1. Create Supabase Tables (use MCP)
Tables needed: profiles, identifications, wishlist, chat_messages
```sql
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  device_id text unique not null,
  home_city text, home_zip text, space_type text,
  created_at timestamptz default now()
);
create table if not exists identifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  plant_name text, scientific_name text, confidence numeric,
  image_url text, climate_assessment jsonb, ai_response text,
  created_at timestamptz default now()
);
create table if not exists wishlist (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  plant_name text, scientific_name text, rating text,
  climate_assessment jsonb, notes text,
  created_at timestamptz default now()
);
create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  role text, content text, image_url text, plant_context text,
  created_at timestamptz default now()
);
```
Also enable RLS and create permissive policies for all tables.

### 2. Set Up Netlify Functions
- Create `netlify/functions/` directory
- `/api/identify` — accepts photo (base64), sends to Claude vision, returns plant ID + assessment
- `/api/chat` — accepts message + context, sends to Claude, returns conversational response
- `/api/recommend` — accepts climate profile, asks Claude for personalized plant recommendations
- All functions read ANTHROPIC_API_KEY from env

### 3. Create Supabase Client Helpers
- Frontend Supabase client using SUPABASE_URL + SUPABASE_ANON_KEY
- Device-ID based anonymous auth (fingerprint or generated UUID stored locally)
- CRUD helpers for profiles, wishlist, identifications, chat history

### 4. Rewire Frontend
- **TravelChat**: Real photo upload (camera/gallery), sends to /api/identify, real Claude chat via /api/chat
- **Discover**: AI-powered recommendations via /api/recommend instead of hardcoded 12 plants
- **Wishlist**: Sync to Supabase for cross-device persistence
- **HomeSetup**: Save profile to Supabase

### 5. Key Architecture Decisions
- Netlify Functions as API proxy (keeps API keys server-side)
- Supabase for persistence + cross-device sync
- Claude vision for plant identification (no separate plant ID API needed)
- Claude for all conversational AI (replaces pattern-matching engine)
- Keep the existing climate assessment engine (it's good local logic)
- Mobile-first design (user tests on iPad by pool)

## User's Vision
- Take real photos of plants and get AI identification
- Have real LLM conversations about what to do with plants based on their climate (Memphis, TN area)
- Get recommendations for their specific space
- Eventually see mockups/visualizations of what their plant situation could look like
- Cross-device: works on computer AND iPad
