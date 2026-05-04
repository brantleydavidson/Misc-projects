# BeJacked — Component Redesign Spec

This maps every existing component to specific brand changes. Use alongside `CLAUDE.md` and the full brand brief.

---

## Global Changes (apply everywhere)

1. **"JACKEDAI" → "BEJACKED"** — all text, all files
2. **Font consistency** — ensure every component follows the typography rules:
   - Headlines/titles: `font-display` (Michroma) + uppercase
   - Labels/buttons/nav: `font-ui` (Chakra Petch) + uppercase + tracking-wider
   - Body/descriptions/chat: `font-body` (IBM Plex Mono)
   - Numbers/stats/timers: `font-data` (Orbitron)
3. **Glow mapping** — interactive elements should glow their semantic color:
   - Teal: primary actions (confirm, progress, start)
   - Pink: destructive/urgent (delete, warnings, high intensity)
   - Orange: achievements, streaks, milestones
   - Purple: AI/APEX-specific elements

---

## src/pages/Login.tsx

| Element | Current | Change To |
|---------|---------|-----------|
| Brand text | `JACKEDAI` | `BEJACKED` |
| Subtitle | "Welcome back" | "Welcome back" (keep) |
| New user CTA | "Start New Protocol" | "BE JACKED" (primary CTA style, not outline) |
| Logo icon | Dumbbell in gradient square | Keep but consider abstract "BJ" mark later |

**Add:** Subtle VHS grain overlay behind the login form (4% opacity).

---

## src/pages/Onboarding.tsx

This is the most brand-critical component. The current 5-phase architecture (arrival → conversation → auth → reveal → commit) already matches the brand brief. Changes:

| Element | Current | Change To |
|---------|---------|-----------|
| Arrival CTA | Check if "JACK IN" | "BE JACKED" |
| Arrival brand text | Any "JACKEDAI" | "BEJACKED" |
| Arrival tagline | Check current | "The Grid Never Sleeps." |
| Phase labels | Check current | Keep or align to brief names |

**Arrival animation:** Already has the correct 6-step sequence (line → grid → logo → name → tagline → button). Verify timing matches brief: 500ms, 1000ms, 1600ms, 2200ms, 3000ms, 3600ms.

**Conversation turns:** Already AI-driven via `sendOnboarding()`. Verify the APEX personality comes through in the system prompt used by `netlify/functions/onboarding.mts`.

**Reveal phase:** Should show processing lines referencing user's actual inputs. Verify it does this (the brief specifies: "> Parsing goal: [their words]..." style terminal output).

---

## src/pages/Dashboard.tsx

| Element | Current | Change To |
|---------|---------|-----------|
| Greeting | Check current | `font-display` uppercase: "[NAME]. DAY [X]. LET'S MOVE." |
| Calorie ring | ProgressRing component | Keep — add `glow-teal` or `glow-breathe` to the ring when near target |
| Macro bars | MacroBar component | Keep — these are already well-styled |
| Check-in cards | Existing | Add `.hud-corners` to the check-in period cards |
| Water tracker | Existing | Numbers should use `font-data` (Orbitron) |
| Activity section | Existing | Step count, calories burned numbers → `font-data` |

**Add:** Today's workout card at top (if workout plan exists) with `glow-teal` border pulse.

---

## src/pages/Chat.tsx

| Element | Current | Change To |
|---------|---------|-----------|
| AI avatar | Check current | Abstract geometric mark in Electric Purple (`#8B2FC9`) |
| Message font | Check current | `font-body` (IBM Plex Mono) for all messages |
| AI "thinking" | Check current | Purple dot pulse animation (3 dots, staggered) |
| Input | Check current | Teal focus glow, `font-body` |

**Key:** The APEX system prompt in `netlify/functions/chat.mts` should match the persona spec in `CLAUDE.md`. Direct, warm, data-informed, ends with one clear action. No filler praise, no emojis.

---

## src/pages/SnapFood.tsx

| Element | Current | Change To |
|---------|---------|-----------|
| Camera button | Check current | Teal gradient with `glow-teal` |
| Analysis result | Check current | Card with `.glass` + `.hud-corners` for the nutrition breakdown |
| Calorie number | Check current | `font-data` (Orbitron), large |
| Confidence % | Check current | `font-data`, color-coded (green >80%, orange 50-80%, pink <50%) |

---

## src/pages/Trends.tsx

| Element | Current | Change To |
|---------|---------|-----------|
| Chart colors | Check current | Use brand colors: teal for primary metric, pink for secondary, orange for tertiary |
| Stat numbers | Check current | All numbers in `font-data` (Orbitron) |
| Period labels | Check current | `font-ui` (Chakra Petch) uppercase |

---

## src/pages/CheckIn.tsx

| Element | Current | Change To |
|---------|---------|-----------|
| Period cards | Check current | Add `.hud-corners` to each check-in card |
| Input fields | Check current | Teal focus glow, `font-body` for text inputs, `font-data` for number inputs |
| Submit button | Check current | `btn-neon glow-teal glow-breathe` |

---

## src/pages/Habits.tsx

| Element | Current | Change To |
|---------|---------|-----------|
| Streak numbers | Check current | `font-data` (Orbitron) |
| Habit toggle | Check current | Teal glow when complete |
| Category headers | Check current | `font-ui` uppercase |

---

## src/pages/EatOut.tsx

| Element | Current | Change To |
|---------|---------|-----------|
| Restaurant cards | Check current | `.glass` card style with subtle border |
| Distance/rating numbers | Check current | `font-data` |
| Search input | Check current | Teal focus glow |

---

## src/pages/Profile.tsx

| Element | Current | Change To |
|---------|---------|-----------|
| Section headers | Check current | `font-ui` uppercase with `tracking-wider` |
| Display name | Check current | `font-display` (Michroma) if prominent |
| Setting toggles | Check current | Teal active state |

---

## src/components/BottomNav.tsx

| Element | Current | Change To |
|---------|---------|-----------|
| Center button | Gradient from-neon-teal to-neon-pink | Keep — already correct |
| Active icon | `text-neon-teal` | Keep — already correct |
| Inactive icon | `text-slate-500` | Change to `text-chrome/30` for consistency |
| Labels | Current | Ensure `font-ui` and `uppercase` |

---

## src/components/MacroBar.tsx

Already well-styled. No changes needed unless font isn't `font-data` for the numbers.

---

## src/components/ProgressRing.tsx

Add `glow-teal` class to the SVG container when progress > 80%.

---

## src/index.css — Additions Needed

```css
/* ── Missing utilities from brand brief ─────────────────── */

/* Neon glow — orange (achievements) */
.glow-orange {
  box-shadow: 0 0 12px rgba(255,107,26,0.4), 0 0 40px rgba(255,107,26,0.15);
}

/* Neon glow — purple (AI/APEX) */
.glow-purple {
  box-shadow: 0 0 12px rgba(139,47,201,0.4), 0 0 40px rgba(139,47,201,0.15);
}

/* Miami Sunset gradient — hero backgrounds, achievement screens */
.gradient-sunset {
  background: linear-gradient(180deg, #8B2FC9 0%, #FF2D78 35%, #FF6B1A 70%, #050D1A 100%);
}

/* Vice Horizon gradient — section dividers, loading bars */
.gradient-vice {
  background: linear-gradient(90deg, #00E5CC, #8B2FC9, #FF2D78);
}

/* VHS grain overlay */
.vhs-grain {
  position: relative;
}
.vhs-grain::after {
  content: '';
  position: absolute;
  inset: 0;
  opacity: 0.05;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  pointer-events: none;
  z-index: 1;
}

/* Chromatic aberration text — for achievement moments */
.chromatic-text {
  position: relative;
  display: inline-block;
}

/* Perspective grid animation */
@keyframes grid-drift {
  from { background-position: 0 0; }
  to { background-position: 0 40px; }
}
.grid-drift {
  animation: grid-drift 20s linear infinite;
}

/* Odometer number flip */
@keyframes count-up {
  from { transform: translateY(100%); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
.count-up { animation: count-up 0.6s ease-out forwards; }

/* VHS glitch transition */
@keyframes vhs-glitch {
  0% { transform: translateX(0); filter: none; }
  20% { transform: translateX(-3px); filter: hue-rotate(90deg); }
  40% { transform: translateX(3px); filter: hue-rotate(-90deg); }
  60% { transform: translateX(-1px); filter: none; }
  100% { transform: translateX(0); filter: none; }
}
.vhs-glitch { animation: vhs-glitch 0.2s linear; }
```
