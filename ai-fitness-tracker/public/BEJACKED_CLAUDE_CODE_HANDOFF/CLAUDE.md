# BeJacked — AI Fitness Tracker

## Branch
- Working branch: `claude/ai-fitness-macro-tracker-6tILr`
- Base directory: `ai-fitness-tracker`

## Deployment
- Auto-deploys from the branch above on Netlify
- Build command: `npm run build`
- Publish directory: `ai-fitness-tracker/dist`

## Stack
- React 19 + TypeScript
- Vite 8
- Tailwind CSS v4 (using `@theme` directive in `src/index.css`)
- Netlify Functions (`.mts` files in `netlify/functions/`)
- Supabase (auth + database)
- Claude API (Anthropic) — food analysis, coach chat, meal advisor, onboarding
- Lucide React for icons

## Brand Identity

**Name:** BeJacked (display: `BEJACKED` | conversational: `BeJacked`)
**Domain:** bejacked.ai (primary) | bejacked.io (secondary)
**Tagline:** "The Grid Never Sleeps."
**AI Coach Persona:** APEX (Adaptive Personal EXpert)

### Visual Theme: 80s Retro-Futurism / Miami Vice
The app uses a neon-on-dark aesthetic inspired by 1985 Miami Vice, Tron, and synthwave. This is NOT ironic nostalgia — it's a genuine aesthetic philosophy. The visual system has six composable layers: Grid, Scanlines, Neon Glow, Chromatic Aberration, VHS Grain, and HUD Lines. Never use all at max intensity simultaneously.

### Brand Reference
The full brand brief is at: `BEJACKED_BRAND_ONBOARDING_BRIEF_V2.md` (in outputs folder)
It contains: color rationale, typography rules, motion specs, onboarding architecture, APEX persona, achievement system, and competitive positioning.

## Design Tokens (already in src/index.css)

### Colors
```
--color-neon-teal: #00E5CC      Primary accent — buttons, links, active states, progress
--color-neon-pink: #FF2D78      Secondary — destructive, warnings, intensity
--color-neon-orange: #FF6B1A    Tertiary — achievements, streaks, milestones
--color-electric-purple: #8B2FC9 Highlight — AI/APEX elements, premium features
--color-deep-navy: #050D1A      Primary background
--color-midnight: #0A1628       Card/surface background
--color-grid-blue: #0D2040      Grid lines, dividers
--color-chrome: #E8F4F8         Primary text (15.2:1 contrast on deep-navy)
--color-warm-white: #FFF3E0     Secondary text
--color-muted-teal: #1A4A45    Disabled/inactive states
```

### Typography
```
--font-display: 'Michroma'      Hero text, app name, big headlines (uppercase)
--font-ui: 'Chakra Petch'       Buttons, nav, card titles, section headers (uppercase)
--font-body: 'IBM Plex Mono'    Body copy, chat messages, descriptions
--font-data: 'Orbitron'         Numbers only — stats, timers, counters, reps
```

### Visual Utilities (defined in index.css)
- `.glow-teal` / `.glow-pink` — Neon box-shadow on interactive elements
- `.glow-text` — Text shadow glow effect
- `.scanlines` — CRT scanline overlay (use on hero sections, modals)
- `.grid-bg` — Perspective grid background pattern
- `.hud-corners` — Fighter-jet targeting brackets on stat cards
- `.glass` — Glassmorphism card with subtle teal border
- `.gradient-text` — Teal-to-pink gradient text
- `.btn-neon` — Button press scale(0.96) effect
- `.fade-up` — Content entrance animation
- `.glow-breathe` — Pulsing glow on CTAs
- `.neon-pulse` — Opacity pulse for loading states
- `.type-cursor` — Blinking terminal cursor

## App Structure

### Pages (src/pages/)
| File | Route | Description |
|------|-------|-------------|
| Login.tsx | (screen state) | Google OAuth + email/password login |
| Onboarding.tsx | (screen state) | AI conversational onboarding (5 phases: arrival → conversation → auth → reveal → commit) |
| Dashboard.tsx | / | Main dashboard — macros, water, activity, habits, check-ins |
| SnapFood.tsx | /snap | Camera food logging with AI analysis |
| Chat.tsx | /chat | APEX coach chat interface |
| FoodLog.tsx | /log | Daily food entry history |
| Trends.tsx | /trends | Weight, calorie, macro trend charts |
| CheckIn.tsx | /checkin | Morning/midday/evening health check-ins |
| Habits.tsx | /habits | Habit tracker with streaks |
| EatOut.tsx | /eat-out | Restaurant finder with macro-aware suggestions |
| Profile.tsx | /profile | Settings, units, notifications, account |
| Upgrade.tsx | /upgrade | Stripe subscription page |

### Components (src/components/)
| File | Description |
|------|-------------|
| BottomNav.tsx | Fixed bottom navigation (Home, Eat Out, Snap, Coach, Profile) |
| MacroBar.tsx | Horizontal progress bar for calories/protein/carbs/fat |
| ProgressRing.tsx | Circular SVG progress ring (calorie ring on dashboard) |
| QuickAdd.tsx | Quick-add food entry modal |
| UsageBanner.tsx | Free-tier usage limit banner |

### Hooks (src/hooks/)
| File | Description |
|------|-------------|
| useAuth.ts | Supabase auth (Google OAuth, email/password, session) |
| useProfile.ts | User profile CRUD (localStorage + Supabase sync) |
| useUsage.ts | API usage tracking for free tier limits |

### Lib (src/lib/)
| File | Description |
|------|-------------|
| api.ts | API client for Netlify Functions |
| calculations.ts | BMR, TDEE, macro target calculations |
| db.ts | Supabase database operations |
| food-memory.ts | Local food recognition memory cache |
| notifications.ts | Push notification scheduling |
| storage.ts | localStorage wrapper for daily logs, food entries, etc. |
| supabase.ts | Supabase client initialization |
| units.ts | Unit conversion (lbs/kg, oz/ml, etc.) |

### Netlify Functions (netlify/functions/)
analyze-food.mts, barcode-lookup.mts, body-progress.mts, chat.mts, check-usage.mts,
create-checkout.mts, garmin-auth.mts, garmin-sync.mts, meal-advisor.mts, meal-plan.mts,
nearby-restaurants.mts, nutrition-lookup.mts, onboarding.mts, send-email.mts, send-sms.mts,
setup-db.mts, sms-reminders.mts, stripe-webhook.mts, validate-discount.mts, weekly-report.mts

## Redesign Rules

### What to Change
1. **All "JACKEDAI" text → "BEJACKED"** — Login page, onboarding, any hardcoded brand references
2. **Add missing visual motifs** — The brief specifies chromatic aberration, VHS grain, and gradient recipes that aren't in `index.css` yet. Add them.
3. **Onboarding CTA** — Change "JACK IN" to "BE JACKED" on the arrival screen
4. **Achievement system** — Not yet implemented. Build per the brief spec.
5. **APEX personality** — The chat.mts function should use the APEX system prompt from the brief (direct, warm, data-informed, 80s-inflected, ends with one clear action)

### What to Preserve
1. **All existing functionality** — Macro tracking, food logging, check-ins, trends, habits, Garmin sync, Stripe billing
2. **The existing color system** — Already correct in `index.css`. Don't change hex values.
3. **The existing font system** — Already correct. Don't change font choices.
4. **The existing visual utilities** — `.glow-teal`, `.scanlines`, `.grid-bg`, `.hud-corners`, `.glass` are all correct. Enhance, don't replace.
5. **Mobile-first responsive design** — All pages are mobile-first with `max-w-lg mx-auto` containers
6. **Auth flow** — Google OAuth + email/password via Supabase. Working correctly.

### What to Add (from brand brief)
1. **Enhanced index.css** — Add: `glow-orange`, `glow-purple`, gradient recipes (sunset, vice, teal-fade), VHS grain overlay, chromatic aberration effect, grid-perspective animation, additional keyframes
2. **Motif intensity guide** — Grid (100% splash, 30% onboarding, 10% dashboard), scanlines (3-5% cards), glow (context-dependent)
3. **Motion refinements** — Screen transitions should use VHS glitch smear (200ms). Achievement unlocks should use neon burst particles. Data updates should use odometer-style counting.
4. **APEX visual indicator** — Abstract geometric mark in Electric Purple for coach chat avatar
5. **Dashboard greeting** — Use Michroma font: "[NAME]. DAY [X]. LET'S MOVE." format

## AI Coach (APEX) System Prompt

Use this in chat.mts and onboarding.mts:

```
You are APEX, an AI fitness and nutrition coach inside BeJacked, a retro-futuristic fitness app.

PERSONALITY:
- Direct, warm, data-informed
- Voice blends 80s ambition with modern exercise science
- Confident but never arrogant, motivational but never generic

YOU ALWAYS:
- Reference the user's specific goal, data, and history
- Give concrete options (usually 2-3), never vague guidance
- End every response with a single clear next action
- Keep responses tight: 1-3 sentences for quick interactions

YOU NEVER:
- Use filler praise ("Great job!" "Amazing!")
- Shame the user for missed sessions
- Use corporate wellness speak ("holistic journey," "mindful movement")
- Use emojis

Current user context:
{inject userProfile JSON here}
```
