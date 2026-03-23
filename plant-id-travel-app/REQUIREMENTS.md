# PlantScout — Travel Plant ID & Home Growing Guide

## The Idea

You're traveling — maybe hiking in the Smoky Mountains, strolling through a garden in Savannah, or on vacation in Costa Rica — and you see a gorgeous plant. You snap a photo. The app instantly tells you what it is **and** whether you can grow it back home in Memphis (or wherever you live), including exactly how: in a planter on your patio, in your garden bed, indoors by a window, etc.

---

## Competitive Landscape

### What Already Exists

| App | Plant ID | Location-Based Care | "Travel → Home" Workflow | Price |
|-----|----------|-------------------|------------------------|-------|
| **PictureThis** | Excellent (AI photo ID) | Basic care tips | No | Free / $30/yr |
| **Planta** | Good | Yes — uses 30+ parameters + local weather | No | Free / $36/yr |
| **PlantNet** | Good (community/science-backed) | No | No | Free |
| **Seek by iNaturalist** | Good (gamified) | No | No | Free |
| **Google Lens** | Good (general purpose) | No | No | Free |
| **Plant Parent** | Good | Some (local climate tips) | No | Free / $20/yr |
| **Plantum** | Good | Weather tracker for outdoor plants | No | Free / $20/yr |
| **Blossom** | Good | Planting calendar | No | Free / $30/yr |

### The Gap — Nobody Does This

**No existing app combines all three of these:**

1. **Identify** a plant from a travel photo
2. **Assess climate compatibility** — "Can this grow in USDA Zone 7b (Memphis)?"
3. **Give actionable placement advice** — "Grow it in a large planter on a covered patio" or "This is invasive in your area, try this native alternative instead"

Current apps are either great at ID *or* great at caring for plants you already own. None are built around the **discovery-while-traveling** use case.

### Market Opportunity

- Plant ID app market valued at ~$1.2B (2024), growing 12-14% CAGR
- Only 15% of amateur gardeners use tech for gardening (huge untapped audience)
- Urban gardening and "bring nature home" trends are accelerating
- No one owns the "travel plant discovery" niche

---

## Core User Flow

```
1. SET HOME → User enters home location (Memphis, TN)
   → App determines: USDA Zone 7b, humid subtropical,
     clay soil common, hot summers, mild winters

2. SNAP → User photographs a plant while traveling
   → AI identifies: "Japanese Maple (Acer palmatum)"

3. MATCH → App cross-references plant needs vs. home conditions
   → Result: "Great news! Japanese Maples thrive in Zone 7b."

4. ADVISE → App provides specific growing guidance:
   → "Plant in partial shade (east-facing is ideal)"
   → "Amend your clay soil with compost"
   → "Water deeply during Memphis summers"
   → "This variety is available at local nurseries — here are options"

5. SAVE → Plant goes into user's "Travel Wishlist"
   → Organized by trip / location discovered
```

---

## MVP Feature Requirements (v1.0)

### P0 — Must Have for Launch

#### 1. Home Profile Setup
- Enter home city/zip code
- Auto-detect USDA Hardiness Zone
- Optional: soil type, sun exposure of yard/patio, indoor vs. outdoor space available
- Support for "I only have a balcony" / "I have a big yard" / "Indoor only"

#### 2. Photo Plant Identification
- Camera integration — snap a photo or upload from gallery
- AI-powered plant identification (species, common name, variety)
- Confidence score shown to user
- Support for multiple photos of same plant (leaf, flower, bark)
- Offline identification queue (snap now, ID when you have signal)

#### 3. Climate Compatibility Assessment
- Compare plant's native conditions to user's home zone
- Clear compatibility rating: "Perfect Match" / "Will Work With Care" / "Not Recommended" / "Indoor Only"
- Explain *why* — "This plant needs Zone 9+, but Memphis is Zone 7b. It won't survive your winters outdoors."

#### 4. Growing Recommendations
- Where to place it: outdoor ground, raised bed, container/planter, indoor pot, greenhouse
- Soil, water, and sun requirements localized to home climate
- Seasonal timing: "Plant in April after last frost"
- If not growable outdoors: suggest similar native/adapted alternatives

#### 5. Travel Wishlist
- Save identified plants to a collection
- Tag by trip / location / date
- Photo + ID + compatibility summary in each entry
- Simple list view — nothing fancy

### P1 — Important but Can Wait

#### 6. Where to Buy
- Link to online nurseries that carry the identified plant
- "Available near you" — local nursery search
- Estimated cost range

#### 7. Native Alternatives Engine
- When a plant won't work in your zone, suggest visually similar plants that will
- "You loved that Bougainvillea in Mexico? Try Trumpet Vine — it gives a similar look in Memphis."

#### 8. Seasonal Planting Calendar
- Based on home location, show when to plant each wishlist item
- Push notifications: "It's time to plant your Japanese Maple!"

#### 9. Trip Mode
- "I'm in [location]" — app adjusts context for discovery
- Shows what zone/climate you're currently in vs. home
- "Plants you're seeing here that would also work at home" proactive suggestions

### P2 — Nice to Have / Future

#### 10. Community Features
- Share your travel plant discoveries
- "What's growing in Memphis?" — see what others in your zone are growing
- Photo feed by region

#### 11. AR Visualization
- Point camera at your yard/patio
- Overlay what the plant would look like there at maturity

#### 12. Garden Planner Integration
- Drag wishlist plants into a simple yard/container layout
- Sun mapping based on address

#### 13. Expert Chat / AI Garden Advisor
- Ask follow-up questions: "Will this survive in a pot on my west-facing porch?"
- AI-powered, with handoff to real experts for premium users

---

## Technical Approach — Keep It Simple

### Recommended: Mobile Web App (PWA)

**Why PWA over native for v1:**
- Ship fast — works on any phone, no App Store approval needed
- Camera access works via browser APIs
- Installable to home screen (feels like an app)
- Single codebase (React/Next.js or similar)
- Can go native later if traction warrants it

### Tech Stack (Lean)

| Layer | Recommendation | Why |
|-------|---------------|-----|
| **Frontend** | Next.js + React (PWA) | Fast to build, works on all phones |
| **Plant ID API** | PlantNet API (free, open) or Plant.id API | Don't build your own model — use an existing one |
| **Climate Data** | USDA Hardiness Zone API + OpenWeatherMap | Free/cheap, well-documented |
| **AI Recommendations** | Claude API | Generate personalized growing advice from plant data + home profile |
| **Database** | Supabase (Postgres + Auth + Storage) | Free tier is generous, handles auth + photo storage |
| **Hosting** | Vercel | Free tier, auto-deploys from GitHub |

### Key API Integrations

1. **Plant Identification**: [PlantNet API](https://my.plantnet.org/) (free, 500 requests/day) or [Plant.id](https://plant.id/) ($0.05/identification)
2. **USDA Zones**: Lookup by zip code (static dataset, no API needed)
3. **Growing Conditions**: Curate a database of common plants + conditions, augment with Claude API for long-tail plants
4. **Weather**: OpenWeatherMap free tier for local conditions

### Estimated Build Time (Solo Developer)

- **Weekend 1**: Home profile + camera + Plant ID API integration → Can identify plants
- **Weekend 2**: Climate matching logic + compatibility display → Shows if it'll grow at home
- **Weekend 3**: Growing recommendations (Claude API) + wishlist/save → Core loop complete
- **Weekend 4**: Polish, offline queue, deploy → Shareable MVP

---

## Data Model (Simplified)

```
User
  ├── home_location (city, state, zip)
  ├── hardiness_zone (e.g., "7b")
  ├── space_type (yard | balcony | indoor_only | mixed)
  └── soil_type (optional)

Plant Discovery
  ├── user_id
  ├── photo_url
  ├── identified_species
  ├── common_name
  ├── confidence_score
  ├── discovered_location (lat/lng + city)
  ├── discovered_date
  ├── trip_tag (optional)
  ├── compatibility_rating (perfect | possible | indoor_only | not_recommended)
  ├── growing_recommendations (JSON — placement, soil, water, timing)
  └── native_alternatives (array of suggested substitutes)
```

---

## Success Metrics for MVP

- User can go from "snap photo" to "here's how to grow it at home" in under 30 seconds
- Plant ID accuracy > 85% for common ornamental plants
- Compatibility assessment is correct for at least the top 200 garden plants
- Works reliably on mobile Safari and Chrome
- Loads in under 3 seconds on 4G

---

## Open Questions

1. **Monetization**: Freemium (X free IDs/month, pay for unlimited)? Or fully free with ads?
2. **Scope of plants**: Start with ornamental/garden plants only, or include trees, grasses, food crops?
3. **User-submitted corrections**: Allow community to fix wrong IDs?
4. **Nursery partnerships**: Revenue share for "buy this plant" referrals?

---

## Summary

The core insight is simple: **existing apps help you ID plants OR care for plants you own — but none help you bring your travel discoveries home.** PlantScout bridges that gap with a dead-simple flow: set your home, snap a photo, get a yes/no on growing it, and actionable advice on how. Built as a PWA, an MVP is achievable in a few weekends.
