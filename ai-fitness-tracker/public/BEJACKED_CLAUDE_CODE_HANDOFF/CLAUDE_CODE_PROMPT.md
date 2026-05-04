# Claude Code Prompt — BeJacked Brand Redesign

Copy everything below the line and paste it as your first message in Claude Code (from the `ai-fitness-tracker` directory).

---

## Prompt:

I need you to rebrand and visually upgrade this fitness app. Read these files first before making any changes:

1. `CLAUDE.md` at the repo root — this is your project map with the full app structure, design tokens, brand rules, and what to change vs. preserve
2. `COMPONENT_SPEC.md` — page-by-page, component-by-component redesign spec
3. `BEJACKED_BRAND_ONBOARDING_BRIEF_V2.md` — the full brand brief with visual system, onboarding architecture, APEX persona, and competitive positioning

After reading all three, execute the redesign in this order:

### Phase 1: Brand Name Swap
- Find and replace ALL instances of "JACKEDAI", "JackedAI", "Jacked AI", "JACKED.AI" with "BEJACKED" or "BeJacked" (match the casing context — all-caps in display/UI contexts, mixed-case in body text)
- Update `src/pages/Login.tsx`: the h1 brand text, the "Start New Protocol" button text → "BE JACKED"
- Update `src/pages/Onboarding.tsx`: any arrival screen brand text, CTA button text
- Search all Netlify functions for any hardcoded brand name references and update them

### Phase 2: CSS Enhancements
Add the following to `src/index.css` (after the existing utilities):

- `.glow-orange` — box-shadow using `rgba(255,107,26,...)` matching the existing glow-teal pattern
- `.glow-purple` — box-shadow using `rgba(139,47,201,...)`
- `.gradient-sunset` — linear-gradient: Electric Purple → Neon Pink → Neon Orange → Deep Navy (vertical)
- `.gradient-vice` — linear-gradient: Neon Teal → Electric Purple → Neon Pink (horizontal)
- `.vhs-grain` — SVG noise texture overlay at 5% opacity with pointer-events: none
- `@keyframes grid-drift` — slow background-position animation for the grid
- `@keyframes count-up` — translateY entrance for number animations
- `@keyframes vhs-glitch` — horizontal jitter + hue-rotate for screen transitions

The exact CSS for all of these is in `COMPONENT_SPEC.md` under "src/index.css — Additions Needed".

### Phase 3: Typography Audit
Go through every page and component. Ensure:
- ALL headline/title text uses `font-display` (Michroma) with `uppercase`
- ALL button labels, nav items, section headers use `font-ui` (Chakra Petch) with `uppercase tracking-wider`
- ALL body copy, descriptions, chat messages use `font-body` (IBM Plex Mono)
- ALL numbers (calories, macros, steps, streaks, timers, weights) use `font-data` (Orbitron)

Key files to check: Dashboard.tsx, Chat.tsx, SnapFood.tsx, Trends.tsx, CheckIn.tsx, Habits.tsx, Profile.tsx, BottomNav.tsx, MacroBar.tsx, ProgressRing.tsx

### Phase 4: Glow Semantic Mapping
Verify interactive elements use the correct glow color:
- **Teal** (`glow-teal`): primary actions — start workout, confirm, submit, progress indicators
- **Pink** (`glow-pink`): destructive — delete, cancel, warnings, high intensity alerts
- **Orange** (`glow-orange`): achievements — streak counters, milestone badges, PR notifications
- **Purple** (`glow-purple`): AI/APEX — coach chat avatar, AI thinking indicator, plan generation

### Phase 5: Dashboard Upgrade
In `src/pages/Dashboard.tsx`:
- Change the greeting to use `font-display` (Michroma): format should be `[NAME]. DAY [X]. LET'S MOVE.` in uppercase
- Add `.hud-corners` class to check-in period cards
- Ensure all stat numbers (calories, water, steps, etc.) use `font-data` (Orbitron)
- Add `glow-breathe` animation to the primary CTA card (today's workout or snap food)

### Phase 6: APEX Coach Persona
In `netlify/functions/chat.mts` and `netlify/functions/onboarding.mts`:
- Update the system prompt to match the APEX persona from `CLAUDE.md`
- APEX should be: direct, warm, data-informed, 80s-inflected
- APEX always ends with one clear next action
- APEX never uses filler praise, emojis, or corporate wellness speak
- APEX references the user's specific data and goals

### Phase 7: BottomNav Fix
In `src/components/BottomNav.tsx`:
- Change inactive icon color from `text-slate-500` to `text-chrome/30` for brand consistency
- Ensure labels use `font-ui` with `uppercase`

### Rules:
- DO NOT change any hex color values — they're already correct
- DO NOT change font family choices — they're already correct
- DO NOT break any existing functionality (macro tracking, food logging, Garmin sync, Stripe billing, auth)
- DO NOT change the app's routing structure
- Preserve mobile-first responsive design (max-w-lg mx-auto containers)
- Test that the build compiles after each phase: `npm run build`

Run the build after completing all phases and fix any TypeScript or compilation errors.
