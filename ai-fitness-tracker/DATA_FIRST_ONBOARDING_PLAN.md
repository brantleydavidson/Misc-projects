# Data-First Onboarding — Build Plan

## North Star
The AI knows the user before it asks anything. Onboarding is a conversation between the user and an agent that has already read their last 30–90 days of biometric data. The conversation only fills gaps. After onboarding, the same `user_model` powers a daily coaching loop that drives food logging, recommendations, and notifications.

---

## 1. User Flow

```
Landing → Google Sign-In → Connect Tracker → Analyzing → Conversation (agentic) → Reveal → App
                              │ (skip)              ↑
                              └─→ "Tell me yourself" path ──┘
```

| Phase | What user sees | What happens server-side |
|---|---|---|
| **arrival** | Logo, "Begin" | — |
| **connect** | "Connect your tracker — Garmin, Whoop, Apple Health, Oura, Fitbit." Big button → Terra widget. Skip link. | `/api/terra-init` returns Terra widget URL with `reference_id = profile_id` |
| **analyzing** | Animated "Reading your data… 30d sleep, HRV, workouts…" (~5–10s) | `/api/health-baseline` pulls Terra history, calls Claude, returns `health_baseline` |
| **conversation** | Chat. AI opens with a data-grounded observation. Asks only unknown things. Free-form, no fixed turn count. | `/api/onboarding-agent` runs Claude with tools (`mark_known`, `clarify`, `finish`) |
| **reveal** | Personalized plan with numbers grounded in real data | Macros calc uses measured TDEE, not formula |
| **commit** | Confirm + save profile | Profile written, baseline + user_model persisted |

Skip path: if user skips tracker, conversation phase falls back to today's scripted 9-turn flow. No data, no agent.

---

## 2. Data Model (Supabase)

### Migrate `ja_profiles` — add columns
```sql
alter table ja_profiles add column if not exists terra_user_id text;
alter table ja_profiles add column if not exists health_baseline jsonb;
alter table ja_profiles add column if not exists user_model jsonb;
alter table ja_profiles add column if not exists data_consent jsonb;
alter table ja_profiles add column if not exists onboarding_mode text;  -- 'data-first' | 'scripted'
```

### New table — `ja_health_daily`
```sql
create table ja_health_daily (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references ja_profiles(id) on delete cascade,
  date date not null,
  sleep_minutes integer,
  sleep_efficiency numeric,
  hrv numeric,
  resting_hr integer,
  steps integer,
  active_calories integer,
  workouts jsonb,         -- array of {type, duration, intensity, calories}
  body_comp jsonb,        -- {weight_kg, body_fat_pct, ...} when available
  raw jsonb,              -- full Terra payload for forensics
  source text,            -- 'garmin'|'whoop'|'apple_health'|...
  created_at timestamptz default now(),
  unique(profile_id, date)
);
create index on ja_health_daily(profile_id, date desc);
```

### New table — `ja_ai_observations`
```sql
create table ja_ai_observations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references ja_profiles(id) on delete cascade,
  created_at timestamptz default now(),
  kind text,              -- 'pattern'|'anomaly'|'suggestion'|'milestone'
  content text,           -- human-readable
  payload jsonb,          -- structured (e.g. {metric: 'hrv', delta: -12, window: '7d'})
  importance integer,     -- 1-5, drives notification eligibility
  surfaced_at timestamptz,
  acted_on boolean default false
);
create index on ja_ai_observations(profile_id, created_at desc);
```

### Schema for `user_model` (jsonb)
The single source of truth the AI updates over time:
```json
{
  "version": 1,
  "updated_at": "2026-05-01T18:00:00Z",
  "identity": {
    "name": "Brantley",
    "age": 35,
    "sex": "male",
    "weight_kg": 86,
    "height_cm": 183
  },
  "goal": {
    "primary": "lose_fat",
    "target_kg": 80,
    "target_date": "2026-08-01",
    "rate_kg_per_week": 0.5
  },
  "fitness_state": {
    "training_pattern": "4x strength + 2x zone-2",
    "experience": "intermediate",
    "limitations": []
  },
  "metabolic": {
    "measured_tdee": 2840,
    "tdee_method": "terra_30d",
    "rmr_estimate": 1850,
    "target_calories": 2340,
    "macros": {"protein_g": 200, "carbs_g": 240, "fat_g": 70}
  },
  "lifestyle": {
    "sleep_avg_minutes": 415,
    "stress_signals": ["hrv_drops_mondays"],
    "schedule": "early_riser"
  },
  "preferences": {
    "diet": "omnivore",
    "dislikes": ["mushrooms"],
    "cuisines": ["mediterranean", "tex-mex"],
    "budget": "moderate",
    "cooking_skill": "comfortable"
  },
  "notification_windows": {
    "morning": "07:00",
    "lunch": "12:30",
    "evening": "20:00"
  },
  "coaching_state": {
    "current_focus": "protein_consistency",
    "what_is_working": [],
    "what_is_not": [],
    "next_check_in": "2026-05-08"
  },
  "gaps": []   // fields the AI still needs to ask about
}
```

### Schema for `health_baseline` (jsonb)
Snapshot from the analyzing phase — used to seed `user_model`:
```json
{
  "window_days": 30,
  "summary": "4 strength sessions/wk avg, sleep 6h55, HRV trending down 12% last 14d, weight stable",
  "metrics": { /* avgs/trends */ },
  "patterns": ["hrv_drops_mondays", "skipped_workouts_last_8d"],
  "estimated_tdee": 2840,
  "data_quality": {"days_with_sleep": 28, "days_with_workouts": 22},
  "open_questions": ["primary_goal", "diet_preferences", "schedule_constraints"]
}
```

---

## 3. API Surface

### New: `/api/terra-init`  (POST)
- Input: `{ profile_id, redirect_url }`
- Calls Terra `/auth/generateWidgetSession`
- Returns `{ widget_url, session_id }`

### New: `/api/health-baseline`  (POST)
- Input: `{ profile_id }`
- Pulls Terra `/v2/activity`, `/v2/sleep`, `/v2/body`, `/v2/daily` for last 90d (degrades to whatever's available)
- Upserts each day into `ja_health_daily`
- Calls Claude with the normalized data → returns `health_baseline` jsonb
- Writes baseline + initial `user_model` to `ja_profiles`
- Returns `{ baseline, user_model }`

### New: `/api/onboarding-agent`  (POST, streaming)
Replaces `/api/onboarding`. Agentic loop.
- Input: `{ profile_id, conversation: [...messages] }`
- Loads `health_baseline` + current `user_model`
- System prompt: "You are coaching X. Here is what you already know: <user_model>. Here are gaps: <gaps>. Ask the next most important question. Use tools."
- Tools:
  - `mark_known(field, value)` — updates `user_model`
  - `flag_gap(field, reason)` — adds to gaps if it surfaces something we forgot
  - `finish(summary)` — agent decides we have enough
- Output: streamed assistant message + any tool effects + `done` flag

### Update: `/api/terra-webhook` (already exists)
- Already writes raw payloads. Extend to also upsert `ja_health_daily` rows.

### New: `/api/daily-coach`  (scheduled, nightly)
- For each active profile:
  1. Read last 7d `ja_health_daily` + last 7d food log + check-ins
  2. Call Claude with `user_model` + recent data
  3. Update `user_model` (coaching_state, what_is_working, etc.)
  4. Emit any new `ja_ai_observations` (importance 1–5)
  5. For obs ≥ 3: schedule a notification at the next appropriate `notification_window`
- Cron: `[functions."daily-coach"] schedule = "0 5 * * *"` (5am UTC ≈ midnight CT)

### Update: existing food/chat endpoints
- `chat.mts`, `analyze-food.mts`, `meal-advisor.mts` start including `user_model` in their Claude system prompt → every interaction is grounded.

---

## 4. Frontend Changes

### `Onboarding.tsx`
- Add new phases to the union: `'arrival' | 'connect' | 'analyzing' | 'conversation' | 'reveal' | 'commit'`
- **Connect phase:** new screen. Two CTAs: "Connect Tracker" (opens Terra widget URL in new window or redirect) and "Skip — I'll tell you myself".
- **Analyzing phase:** poll `/api/health-baseline` (or block on it), show animated copy. On success, advance to `conversation`. On error, fall back to scripted mode with a banner.
- **Conversation phase (data-first mode):** swap fixed 9-turn flow for streaming agent. Render messages, send to `/api/onboarding-agent`. Stop when server says `done: true`.
- **Conversation phase (scripted fallback):** existing flow, untouched.

### `lib/db.ts`
- New helpers: `saveHealthBaseline`, `saveUserModel`, `fetchUserModel`, `fetchRecentHealth(days)`

### Terra return handling
Terra widget redirects back to `bejacked.ai/?terra_session=...&user_id=...`. Need:
- `App.tsx` reads the param, calls `/api/health-baseline`, advances onboarding to `analyzing`.
- Or: skip the redirect entirely if Terra supports popup mode.

### Existing pages get smarter
- `Dashboard.tsx`, `Chat.tsx`, `Trends.tsx` — display patterns/observations from `ja_ai_observations` and grounded numbers from `user_model`. (Phase 2 work — not blocking.)

---

## 5. Prompts

### Health baseline prompt (deterministic, structured output)
```
You are analyzing fitness/health data to build a baseline profile for a personal coaching app.

USER PROFILE: {age, sex, height_cm, weight_kg if known}
LAST {N} DAYS OF DATA: {compact JSON of daily metrics}

Produce a JSON object matching this schema: {schema}.

Rules:
- estimated_tdee: average daily active_calories + estimated RMR (Mifflin-St Jeor). If <14 days of activity data, return null.
- patterns: only include patterns supported by ≥2 weeks of data and a clear signal.
- open_questions: things you cannot infer from biometric data alone (goals, preferences, constraints).
- summary: one sentence, plain language, the kind of thing a coach would say after reading the file.
```

### Onboarding agent prompt
```
You are the onboarding coach for BeJacked. Your job is to fill in what you don't know about this user, then hand them off to the daily coaching system.

WHAT YOU ALREADY KNOW:
{user_model}

WHAT'S MISSING:
{gaps}

DATA HIGHLIGHTS:
{health_baseline.summary}
{health_baseline.patterns}

RULES:
- Open with a SHORT observation that proves you read their data. Then ask the most important missing thing.
- Never ask for something already in user_model.
- One question at a time. Conversational, not survey-like.
- When you have enough to set macros, schedule, and notification windows: call finish().
- Use mark_known(field, value) silently after each user response.
- If user volunteers something not in the schema, call flag_gap to add it.
```

### Daily coach prompt
```
You are reviewing a single user's last 7 days. Update their user_model and emit observations.

USER MODEL: {user_model}
LAST 7 DAYS:
- Health: {ja_health_daily}
- Food: {ja_food_entries}
- Check-ins: {ja_activity_logs, ja_water_logs}

Produce:
1. Updated user_model (with updated_at, coaching_state)
2. Array of observations (kind, content, importance 1-5)

Rules:
- Importance 5 = needs immediate user attention (injury risk, big deficit overshoot)
- Importance 3-4 = surface in next notification window
- Importance 1-2 = log only, no notification
```

---

## 6. Build Sequence

Order chosen so each step is shippable and de-risks the next.

### Step 1 — Schema (30 min)
- Migration: add columns + new tables + indexes
- Verify with `select` from each
- **Ship**: just migration, no code change

### Step 2 — Health baseline endpoint (half day)
- Implement `/api/health-baseline`
- Test with seeded fake Terra data first (no Terra connection required)
- Verify it writes baseline + user_model correctly
- **Ship**: callable but unused

### Step 3 — Terra-init + connect phase UI (half day)
- `/api/terra-init` returns widget URL
- New `connect` phase in Onboarding.tsx
- Wire return handler in App.tsx
- **Ship**: user can connect tracker, see "thanks" screen, fall through to current scripted onboarding

### Step 4 — Analyzing phase (1–2 hr)
- After Terra return, hit `/api/health-baseline`, show animation, advance to scripted convo
- **Ship**: data is being captured even though convo doesn't use it yet

### Step 5 — Onboarding agent (full day)
- New `/api/onboarding-agent` with tool-using Claude loop
- Replace conversation phase rendering
- Keep scripted fallback for skip path or errors
- **Ship**: full data-first onboarding live

### Step 6 — Wire user_model into existing endpoints (half day)
- `chat.mts`, `analyze-food.mts`, `meal-advisor.mts` load and include `user_model`
- **Ship**: every interaction is grounded

### Step 7 — Daily coach loop (full day)
- `/api/daily-coach` scheduled function
- Notification routing for importance ≥ 3
- **Ship**: the long-term value loop

### Step 8 — Surface observations in app (variable)
- Dashboard widget for "What I'm noticing"
- Chat shows recent observations as context
- **Ship**: user sees the AI thinking about them between sessions

---

## 7. Risk & Mitigation

| Risk | Mitigation |
|---|---|
| Terra connection fails or user skips | Scripted fallback already in place; `data-first` and `scripted` are siblings, not replacements |
| Claude returns malformed baseline JSON | Use response_format / tool_use for structured output; on parse fail, fall back to scripted |
| Health baseline takes >15s | Show progress; cap at 60d window if 90d slow; pre-fetch on Terra return so analyzing screen is ~instant by the time user arrives |
| user_model drifts / gets corrupted | Versioning on the schema; nightly snapshot to `ja_user_model_history` (later) |
| Cost: agentic onboarding could be 5–10 LLM calls per user | Use Sonnet 4.6 not Opus for this; cap turns at ~12; cache prompt prefix |
| Terra webhook lag means baseline is empty on day 1 | `/api/health-baseline` does a synchronous historical pull, doesn't wait for webhooks |

---

## 8. Out of Scope (for now)
- Wearable-driven workout logging (Terra → strength sets) — later
- Apple HealthKit native (we use Terra for that)
- Sharing data with a coach/trainer
- HIPAA/PHI considerations beyond standard Supabase RLS — we are not a medical product

---

## Decision Log
- **Single agent for onboarding, not branching scripts.** Simpler to maintain; Claude decides order.
- **`user_model` as the source of truth.** Everything else (food endpoints, daily coach, notifications) reads from it. Avoids scattering personalization logic.
- **Terra over native HealthKit/Garmin Connect direct.** One integration, all major sources.
- **Sonnet 4.6 for onboarding agent and daily coach.** Opus only if quality lacks; cost scales linearly with users.
