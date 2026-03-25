# PlantScout — AI Plant ID & Climate Advisor

**Live site:** https://adorable-tanuki-4da663.netlify.app
**Branch:** `claude/plant-id-travel-app-i6Dle`
**Stack:** React 19 + Tailwind CSS v4 + Vite 8 + Netlify Functions + Supabase

---

## What This App Does

PlantScout helps you discover plants while traveling and figure out if they'll thrive at your home. Snap a photo of a plant you love, get AI-powered identification, and instantly see a multi-factor climate compatibility assessment — not just USDA zone, but heat tolerance, humidity, rainfall, soil, and growing season.

**Target user:** Brantley, Memphis TN area, tests on iPad by the pool and on desktop.

---

## Current Architecture

### Pages & Routes

| Route | Page | Purpose |
|-------|------|---------|
| `/` | Home redirect | If home climate set → Discover, else → HomeSetup |
| `/setup` | **HomeSetup** | Onboarding: select city (18 built-in) or zip code, choose space type (yard/mixed/balcony/indoor) |
| `/discover` | **Discover** | Plant catalog with search, filter by compatibility rating, AI recommendations button |
| `/plant/:plantId` | **PlantDetail** | Full plant page: 6-factor compatibility card, placement advice, care notes, save/chat buttons |
| `/travel` | **TravelChat** | Camera + chat: snap photos for AI plant ID, conversational Q&A with Claude |
| `/wishlist` | **Wishlist** | Saved plants with compatibility badges, synced to Supabase |

### Navigation

Fixed bottom tab bar with 4 tabs: **Discover** (search icon), **Travel** (camera icon), **Wishlist** (heart icon), **Home** (settings icon). Only visible after home climate is set.

### Key Components

| Component | File | What It Renders |
|-----------|------|-----------------|
| `NavBar` | `src/components/NavBar.jsx` | Fixed bottom tab navigation, 4 tabs |
| `PlantCard` | `src/components/PlantCard.jsx` | Plant list item: icon + name + scientific name + description + compatibility badge |
| `CompatBadge` | `src/components/CompatBadge.jsx` | Color-coded pill: Perfect (green), With Care (amber), Indoor Only (blue), Not Recommended (red) |
| `FactorList` | `src/components/FactorList.jsx` | 6-row climate factor breakdown with pass/warn/fail icons |

---

## Recent Updates (Latest Session)

### What Changed: Mocked AI → Real AI + Persistence

**Before:** All AI features were faked. Plant identification returned a random plant. Chat used regex pattern matching. No cross-device sync.

**After:** Everything is real.

#### 1. Netlify Functions (Serverless API)

Three Claude-powered API endpoints proxying the Anthropic API server-side:

- **`/api/identify`** — Accepts a base64 photo, sends to Claude vision (Sonnet), returns structured plant identification with full growing requirements (hardiness zones, heat tolerance, water needs, etc.) matching the schema the climate engine expects.

- **`/api/chat`** — Conversational plant advisor. System prompt includes the identified plant's data and the user's full climate profile. Supports ongoing conversation history. Outputs markdown compatible with the existing chat renderer (bold, italic, blockquotes, factor icons with `+`/`~`/`x` prefixes).

- **`/api/recommend`** — Given a climate profile + space type, returns 6-8 AI-curated plant recommendations as structured JSON. Each recommendation includes full growing requirements so the local climate engine can assess them.

#### 2. Supabase Persistence (Cross-Device Sync)

Four tables with device-ID-based anonymous auth:

- **`profiles`** — device_id, home_city, home_zip, space_type
- **`identifications`** — plant_name, confidence, climate_assessment (jsonb)
- **`wishlist`** — plant_name, rating, climate_assessment (jsonb)
- **`chat_messages`** — role, content, plant_context

Dual persistence strategy: localStorage is the fast primary store, Supabase is the durable cross-device backup. App works offline, syncs when connected.

#### 3. Frontend Rewiring

- **TravelChat:** Photos are resized client-side (max 1024px via canvas), converted to base64, sent to Claude vision. Real LLM chat replaces pattern matching. Messages saved to Supabase.
- **Discover:** New "Get AI Recommendations for Your Climate" button. AI picks shown in a separate section above the hardcoded catalog. Recommendations cached in localStorage.
- **HomeSetup:** Profile persisted to Supabase on save.
- **Wishlist:** Add/remove synced to Supabase. On load, merges local + remote items.
- **PlantDetail:** Now supports AI-identified plants (not just hardcoded IDs). Passes full plant objects via React Router state.
- **PlantCard:** Updated to pass plant data via router state for AI-recommended plants. Visual sparkle icon for AI recommendations.

#### 4. Image Handling

Client-side `resizeImage()` utility in `src/lib/api.js`: reads photo via FileReader, draws to canvas at max 1024px, exports as JPEG at 85% quality, returns base64. Keeps requests under Netlify's 6MB body limit.

---

## Design Brief for Design Agent

### Overall Design Language

- **Mobile-first:** Max viewport 430px, designed for iPhone/iPad use
- **Color palette:** Green (700 primary, 50-950 range), Slate (text/neutrals), Amber (warnings/gotchas), Blue (indoor-only), Red (not recommended)
- **Typography:** System font stack, small text sizes (text-xs to text-xl), relaxed line heights
- **Shape language:** Rounded corners (rounded-lg, rounded-xl, rounded-2xl), soft shadows, pill-shaped badges
- **Icons:** Lucide React, strokeWidth 1.5, sizes 14-28px

### Screens That Need Design Attention

#### HomeSetup (`/setup`)
- **Current state:** Functional but plain grid of city buttons + zip input + space type grid
- **Design opportunity:** This is the first impression. Could use illustrations, a map visualization, or animated climate preview. The climate preview card at the bottom (zone, heat zone, rainfall, humidity, soil, frost-free days) is informative but dense.

#### Discover (`/discover`)
- **Current state:** Search bar + filter pills + plant list. New AI recommendations section with sparkle icon.
- **Design opportunity:** The AI recommendations section needs visual distinction — it's the premium feature. Plant cards are functional but text-heavy with no imagery. Consider plant illustrations or photo placeholders. The "Zone Gotcha" callout (amber box) is educational and unique — deserves prominent but not intrusive treatment.

#### PlantDetail (`/plant/:id`)
- **Current state:** Green hero header → compatibility card → placement card → about card → action buttons
- **Design opportunity:** The 6-factor breakdown (FactorList) is the app's secret weapon. Each factor shows pass (green check) / warn (amber warning) / fail (red X) with detail text. This could be much more visual — gauges, progress bars, or a radar chart. The "Zone Gotcha" alert is a key differentiator.

#### TravelChat (`/travel`)
- **Current state:** Green header → chat bubbles (user=green, bot=slate) → fixed bottom input bar with camera + catalog + text input
- **Design opportunity:** This is the hero screen. Photo upload could feel more magical — camera viewfinder overlay, identification animation, confidence meter. Bot messages render custom markdown (bold, italic, blockquotes, factor icons). The plant identification result could be a rich card instead of just text.

#### Wishlist (`/wishlist`)
- **Current state:** Simple list of saved plants with compatibility badges and delete buttons
- **Design opportunity:** Could show a summary of compatibility distribution (how many perfect/possible/indoor). Empty state has placeholder text + "Explore Plants" button.

### Key UI Patterns to Preserve

1. **Compatibility badges** — `CompatBadge` component: "Perfect Match" (green), "With Care" (amber), "Indoor Only" (blue), "Not Recommended" (red). These must remain consistent everywhere.

2. **Factor icons in chat** — Bot messages use `+`, `~`, `x` prefixes that render as colored checkmarks/warnings/X's. The markdown renderer in TravelChat handles this. Any new design must keep this rendering working.

3. **Bottom tab bar** — 4 fixed tabs: Discover, Travel, Wishlist, Home. Must not overlap with chat input area on the Travel page.

4. **Dual input in Travel** — Camera button (green circle) + catalog picker (slate circle) + text input (rounded pill with send button). All three in a row.

### Technical Constraints

- **Tailwind v4** with `@theme` custom properties in `src/index.css`
- **No image assets** — plants are represented by Lucide icons. A design upgrade might add plant photography or illustrations.
- **430px max width** — hardcoded on `#root`, designed for mobile
- **`dangerouslySetInnerHTML`** — chat messages use regex-based markdown rendering. Design changes to chat bubbles must preserve this.
- **React Router** — page transitions are instant (SPA), no loading states between pages

### What Would Make the Biggest Visual Impact

1. **Plant imagery** — Even placeholder botanical illustrations would transform PlantCard and PlantDetail from text walls to visual experiences
2. **Identification animation** — When Claude is identifying a photo, show a scanning/analyzing animation instead of just "Thinking..."
3. **Climate compatibility visualization** — Replace the text-based factor list with a visual radar chart or gauge system
4. **Onboarding flow** — Make HomeSetup feel like a guided experience rather than a form
5. **AI recommendations section** — Make it feel premium/special vs. the static catalog
