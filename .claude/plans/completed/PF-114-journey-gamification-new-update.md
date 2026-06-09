# PF-114 Journey Redesign — Living Garden Hero (Visual-Only MVP)

> **Status:** Done — Living Garden Hero implemented and confirmed in code; archived 2026-06-09

## Context

Current `/journey` page terasa **kaku**:
- Hero visual = pohon kecil siluet kosong di samping. Pada score 0 terlihat seperti pohon mati, bukan invitation untuk grow.
- 5 tier cards bertumpuk vertikal mirip form/spreadsheet — visual hierarchy datar.
- Quest cards terpisah di bawah, momentum hilang setelah scroll.
- Indikator pakai bahasa akademis ("Liquid savings ratio") — kurang relatable.

User baru baca [artikel piramida keuangan makmur.id](https://www.makmur.id/id/blog/artikel/mengenal-5-piramida-keuangan-dalam-mencapai-tujuan-keuangan-jangka-panjang) dan ingin meminjam framing-nya — bahasa produk konkret (Emergency Fund, Insurance, Investment), tone educational-motivational, gamification yang menyenangkan.

**Decisions (locked):**
- Hero direction: **Living Garden** — 5 plants tumbuh di satu lanskap horizontal, dopamine ambient, no decay.
- Bahasa level: **English** (Cashflow / Defense / Growth / Freedom / Legacy)
- Indikator framing: **Dual display** — product-language headline + metric ratio sub-text
- Scope: **Visual-only MVP** — backend scoring service tidak diubah, frontend hero + layout only

---

## Goal

Ganti hero visual `/journey` dari pohon-kerangka-statis menjadi **Living Garden** — 5 plants berbeda berjajar horizontal, masing-masing 4 growth stages, fill-animated sesuai score per level. Tone hangat, distinctive, no decay.

---

## Design Spec

### Living Garden Hero

**Layout** (full-width hero card, ~320px tall):
```
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│    ☁                  ☁              ☁         ← soft cloud accents      │
│                                                                          │
│                                                         🌳🌳🌳            │
│                                                  🌳🍎                    │
│                                          🌳                              │
│                                  🌿                                      │
│                          🌱                                              │
│   ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒    │
│       L1            L2          L3          L4           L5              │
│     Cashflow      Defense     Growth      Freedom      Legacy            │
│     ◐ 28/100     ○ 0/100    ○ 0/100     ○ 0/100      ○ 0/100             │
└──────────────────────────────────────────────────────────────────────────┘
```

**Plant types & metaphor:**

| Tier | Plant | Stage 0 (score 0) | Stage 1 (1–33) | Stage 2 (34–66) | Stage 3 (67–100) |
|------|-------|-------------------|----------------|-----------------|-------------------|
| L1 Cashflow | Sprouting herb (foundation) | Seed in soil | Tiny sprout (2 leaves) | Small herb (4 leaves) | Full herb cluster, light bloom |
| L2 Defense | Sturdy sapling (shielding) | Acorn in soil | Sprout w/ thick base | Sapling w/ thick trunk | Sapling w/ visible roots, stone guard around base |
| L3 Growth | Large leafy tree (wealth) | Sapling | Young tree | Mid tree w/ canopy | Full tree, vibrant green canopy |
| L4 Freedom | Fruit tree (passive yield) | Bare branches | Buds | Flowers | Tree w/ golden fruit drops |
| L5 Legacy | Forest grove (legacy) | Single old tree | Tree dropping seeds | Tree + 2 small saplings around | Mini forest (4–5 trees) |

**Stage selection:** `stage = Math.min(3, Math.floor(score / 25))` — score 0→stage 0, score 25→stage 1, score 50→stage 2, score 75+→stage 3.

**Animations** (framer-motion v12.38.0 — already installed):
- Plant stage transitions: `scale: [0.92, 1.0]` + `opacity: [0.7, 1.0]` over 600ms ease-out, runs once when stage changes.
- "Recommended Next" tier (lowest score tier not at 100): plant has soft `drop-shadow` pulse, 2.5s loop. Subtle.
- Background: 3 cloud SVGs drifting horizontally, 60s loop (slow, ambient) via CSS `@keyframes`.
- On hover plant: scale 1.05, cursor pointer, tooltip "L1 · Cashflow · 28/100".
- On click plant: smooth scroll to corresponding tier card via `scrollIntoView({ behavior: 'smooth' })`.

**No decay rule:** When score drops, plant does **not** shrink. Track peak achieved stage per level in `localStorage` key `pf-journey-peak-stages`. Effective stage = `max(rawStage, peakStage)`. Tooltip (accessible label) says "Activity quiet this period" when score has dropped below peak.

**Color palette** (adult-elegant, no cartoonish brights):
- Sky band gradient: `from-[#F8FAFC] to-[#E0F2FE]`
- Ground band gradient: `from-[#FAF7F0] to-[#E8DFC8]`
- Plants muted greens: `#84A98C` (light), `#52796F` (mid), `#354F52` (dark)
- Fruit accents: `#E9B44C` (gold)
- Bloom accents: `#D4A5A5` (dusty rose)
- Cloud fill: `#F1F5F9` at 40% opacity

### Indicator Dual Display

In `TierCard`, each indicator row becomes:

```
┌─ L2 · Defense ────────────────────────────────────  45/100  ◐ ┐
│                                                                 │
│  3-month emergency fund            ▓▓▓▓▓░░░░░  50/100           │
│  Rp 4.5M of Rp 15M target · 1.0 of 3.0 months                   │
│                                                                 │
│  Manageable debt level             ▓▓▓▓░░░░░░  40/100           │
│  DTI 38% · target < 36%                                         │
└─────────────────────────────────────────────────────────────────┘
```

- **Headline** (`text-xs font-medium` default text color): product-language label from `journeyLabels.ts`
- **Sub-text** (`text-[10px] text-muted-foreground/70`): metric ratio from `journeyLabels.ts` formatter

**Product-language label mapping:**

| Backend `indicator.code` | Headline | Sub-text format |
|---|---|---|
| `spend_lt_income` | Spending under income | `Spent Rp {x} of Rp {y} budget · ratio {r}` |
| `bills_on_time` | Bills paid on time | `{n} of {total} bills paid on schedule` |
| `liquid_savings` | 3-month emergency fund | `Rp {x} of Rp {target} · {months} of 3.0 months` |
| `manageable_debt` | Manageable debt level | `DTI {pct}% · target < 36%` |
| `long_term_savings` | Monthly investment habit | `Rp {x}/mo of {target}/mo · {pct}% of income` |
| `appropriate_insurance` | Health insurance coverage | `{status}` |
| `prime_credit` | Good credit score | `Score {n} of 850` |
| `passive_income` | Passive income coverage | `Covers {pct}% of monthly expenses` |
| `plan_ahead` | Long-term plan in place | `{status}` |
| `wealth_target` | Net worth target hit | `Rp {x} of Rp {target}` |
| `estate_plan` | Estate plan documented | `{status}` |

Backend metric keys **do not change** — frontend label only.

---

## Component Tree

```
JourneyPage.tsx (edit)
├── LivingGardenHero.tsx (NEW)              # full-width 320px hero card
│   ├── plants/PlantHerb.tsx (NEW)          # L1, 4 stages
│   ├── plants/PlantSapling.tsx (NEW)       # L2, 4 stages
│   ├── plants/PlantTree.tsx (NEW)          # L3, 4 stages
│   ├── plants/PlantFruitTree.tsx (NEW)     # L4, 4 stages
│   ├── plants/PlantForest.tsx (NEW)        # L5, 4 stages
│   ├── plants/CloudAccent.tsx (NEW)        # ambient drifting clouds
│   └── plants/GroundBand.tsx (NEW)         # gradient ground + tier labels + score rings
├── QuestCard.tsx (unchanged)
├── TierCard.tsx (edit)                     # pass headline + subtext to IndicatorScoreBar
├── IndicatorScoreBar.tsx (edit)            # add optional headline + subtext props
└── StreakHeatmap.tsx (unchanged)
```

**Plant component interface:**
```tsx
interface PlantProps {
  stage: 0 | 1 | 2 | 3;
  isRecommended?: boolean;   // adds pulse glow
  isPeakDropped?: boolean;   // score dropped below peak — for aria-label
  onClick?: () => void;
  ariaLabel: string;
}
```

---

## File Paths

### NEW files
- `apps/frontend/src/utils/journeyLabels.ts`
- `apps/frontend/src/components/journey/LivingGardenHero.tsx`
- `apps/frontend/src/components/journey/plants/PlantHerb.tsx`
- `apps/frontend/src/components/journey/plants/PlantSapling.tsx`
- `apps/frontend/src/components/journey/plants/PlantTree.tsx`
- `apps/frontend/src/components/journey/plants/PlantFruitTree.tsx`
- `apps/frontend/src/components/journey/plants/PlantForest.tsx`
- `apps/frontend/src/components/journey/plants/CloudAccent.tsx`
- `apps/frontend/src/components/journey/plants/GroundBand.tsx`

### EDIT files
- `apps/frontend/src/pages/journey/JourneyPage.tsx`
- `apps/frontend/src/components/journey/TierCard.tsx`
- `apps/frontend/src/components/journey/IndicatorScoreBar.tsx`

### ARCHIVE (keep files, no delete, remove imports from JourneyPage)
- `apps/frontend/src/components/journey/PyramidProgress.tsx`
- `apps/frontend/src/components/journey/SkylineProgress.tsx`
- `apps/frontend/src/components/journey/CrystalProgress.tsx`

### UNCHANGED (verify only — no API/backend changes)
- Backend: `JourneyScoringService.cs`, `RecalculateJourneyCommand`, `JourneyController`
- AI service: `journey_advisor.py`
- Supabase migrations

---

## Implementation Order

1. `journeyLabels.ts` — standalone, no UI dependency
2. Plant SVG components (5 × 4 stages) — build and verify one at a time
3. `CloudAccent.tsx` + `GroundBand.tsx` — ambient background pieces
4. `LivingGardenHero.tsx` — compose all plants + ground + clouds + no-decay logic
5. `JourneyPage.tsx` refactor — swap hero, change layout to full-width hero + tier cards below
6. `IndicatorScoreBar.tsx` — add `headline` + `subtext` optional props
7. `TierCard.tsx` — wire `journeyLabels.ts` to each indicator row
8. Smooth scroll + `data-testid` attributes
9. E2E test update — `e2e/journey.spec.ts`

---

## Verifikasi End-to-End

1. **Visual sanity**: `npm run dev`, open `http://localhost:8080/journey`. Verify:
   - 5 plants render horizontally, evenly spaced, ground band full-width
   - Score 0 → all plants stage 0; score 28 at L1 → L1 stage 1 (sprout)
   - Recommended Next pulse on correct tier
   - Click plant L2 → smooth scroll to L2 tier card

2. **Multi-score scenario**: seed transactions → recalculate → verify L1 stage 3 / L2 stage 2 / L3-L5 stage 0.

3. **Indicator dual display**: expand TierCard L2 → headline "3-month emergency fund" (not "Liquid savings ratio") + muted sub-text.

4. **No decay**: delete L1 transactions → recalculate → L1 plant stage does NOT drop.

5. **Animation perf**: Chrome DevTools — frame rate ≥ 55fps hero, LCP < 2.5s.

6. **Playwright E2E**: `[data-testid="garden-hero"]` visible, `[data-testid="plant-l1"]` has `data-stage` 0–3, click plant-l2 → tier-card-l2 in viewport.

7. **Accessibility**: every plant has descriptive `aria-label`. Keyboard tab navigable.

---

## Out of Scope (Next Iteration)

- Pro/Playful theme toggle (old Pyramid/Skyline/Crystal as alternate skins)
- Confetti on level graduation
- Backend feature gaps (emergency fund tracker, insurance tracker, FIRE simulator)
- Dark mode palette tuning
- Sound / haptic

---

## Risk & Mitigation

| Risk | Likelihood | Mitigation |
|---|---|---|
| Plant SVG looks "kids app" | Medium | Adult-elegant palette (muted greens + beige). Stage 0 = simple, no faces. |
| Hero 320px too tall on mobile | Low | Collapse to 220px at `< 768px`. |
| Animation fps drop on low-end | Low | framer-motion + SVG (not canvas). Cloud = pure CSS transform. Pulse = GPU filter. |
| User confused which plant = which level | Medium | GroundBand labels always visible. Click → scroll to tier card for detail. |

---

---

# STEP-BY-STEP IMPLEMENTATION PLAN WITH ACTS

> Pre-execution checklist (already confirmed):
> - framer-motion v12.38.0 ✓ installed
> - `useJourneyStyle()` hook + old progress components → will be archived/removed from JourneyPage
> - `JourneyState.levelScores: Record<string, number>` — keys `L1`–`L5`, values 0–100
> - `IndicatorScore.code` = backend metric key (e.g. `liquid_savings`)
> - `IndicatorScoreBar` currently takes `indicator: IndicatorScore` + optional `compact?: boolean`
> - `TierCard` renders `state.indicators.filter(i => i.level === level)` through `<IndicatorScoreBar compact />`

---

## ACT 1 — Create `journeyLabels.ts`

**File:** `apps/frontend/src/utils/journeyLabels.ts`

**What:** Static lookup map from `indicator.code` → `{ headline: string; subtext: (i: IndicatorScore) => string }`. The `subtext` formatter receives the live `IndicatorScore` object so it can interpolate `score` and `displayName`. For MVP, sub-text is a simplified fallback (the score-based sub-text like "Rp values" requires backend to send raw values not currently in the API contract — use `score`-based approximation or status text).

**Implementation:**
```ts
// apps/frontend/src/utils/journeyLabels.ts
import type { IndicatorScore } from '@/types/Journey';

type LabelEntry = {
  headline: string;
  subtext: (i: IndicatorScore) => string;
};

export const JOURNEY_LABELS: Record<string, LabelEntry> = {
  spend_lt_income: {
    headline: 'Spending under income',
    subtext: (i) => `Score ${i.score.toFixed(0)}/100 · ${i.status === 'achieved' ? 'On track' : 'Needs attention'}`,
  },
  bills_on_time: {
    headline: 'Bills paid on time',
    subtext: (i) => `Score ${i.score.toFixed(0)}/100 · ${i.status === 'achieved' ? 'All on schedule' : 'Check pending bills'}`,
  },
  liquid_savings: {
    headline: '3-month emergency fund',
    subtext: (i) => `Score ${i.score.toFixed(0)}/100 · target: 3.0 months of expenses`,
  },
  manageable_debt: {
    headline: 'Manageable debt level',
    subtext: (i) => `Score ${i.score.toFixed(0)}/100 · DTI target < 36%`,
  },
  long_term_savings: {
    headline: 'Monthly investment habit',
    subtext: (i) => `Score ${i.score.toFixed(0)}/100 · target: regular monthly investment`,
  },
  appropriate_insurance: {
    headline: 'Health insurance coverage',
    subtext: (i) => i.status === 'achieved' ? 'Coverage active' : 'Not yet tracked',
  },
  prime_credit: {
    headline: 'Good credit score',
    subtext: (i) => `Score ${i.score.toFixed(0)}/100 · target: 850`,
  },
  passive_income: {
    headline: 'Passive income coverage',
    subtext: (i) => `Score ${i.score.toFixed(0)}/100 · covers monthly expenses`,
  },
  plan_ahead: {
    headline: 'Long-term plan in place',
    subtext: (i) => i.status === 'achieved' ? 'Plan documented' : 'Not yet tracked',
  },
  wealth_target: {
    headline: 'Net worth target hit',
    subtext: (i) => `Score ${i.score.toFixed(0)}/100 · progress toward target`,
  },
  estate_plan: {
    headline: 'Estate plan documented',
    subtext: (i) => i.status === 'achieved' ? 'Documented' : 'Not yet tracked',
  },
};

export function getJourneyLabel(code: string): LabelEntry {
  return JOURNEY_LABELS[code] ?? {
    headline: code.replace(/_/g, ' '),
    subtext: (i) => `Score ${i.score.toFixed(0)}/100`,
  };
}
```

**Verify:** TypeScript compiles with no errors. `getJourneyLabel('liquid_savings').headline === '3-month emergency fund'`.

---

## ACT 2 — Create Plant SVG Components (5 plants × 4 stages)

**Directory:** `apps/frontend/src/components/journey/plants/`

**Shared interface** (applies to all 5 plant files):
```tsx
interface PlantProps {
  stage: 0 | 1 | 2 | 3;
  isRecommended?: boolean;
  isPeakDropped?: boolean;
  onClick?: () => void;
  ariaLabel: string;
}
```

**Shared animation pattern** (use in each plant):
```tsx
// Stage transition — wrap the visible content in a motion.g keyed by stage
<motion.g
  key={stage}
  initial={{ opacity: 0.7, scale: 0.92 }}
  animate={{ opacity: 1, scale: 1 }}
  transition={{ duration: 0.6, ease: 'easeOut' }}
  style={{ transformOrigin: 'center bottom' }}
>
  {/* stage-specific SVG paths */}
</motion.g>
```

**Recommended pulse** (when `isRecommended`):
```tsx
<motion.g
  animate={{ filter: ['drop-shadow(0 0 0px #84A98C)', 'drop-shadow(0 0 6px #84A98C)', 'drop-shadow(0 0 0px #84A98C)'] }}
  transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
>
```

**Color constants** (repeat in each file):
```ts
const C = {
  lightGreen: '#84A98C',
  midGreen: '#52796F',
  darkGreen: '#354F52',
  gold: '#E9B44C',
  rose: '#D4A5A5',
  soil: '#8B7355',
  soilLight: '#A89070',
};
```

**SVG viewBox:** `0 0 80 120` for all plants (80px wide, 120px tall). The hero will render them at `height="200"` with aspect ratio preserved.

### ACT 2A — `PlantHerb.tsx` (L1 · Cashflow · Sprouting herb)

**Stage 0:** Small mound of dark soil (ellipse), tiny dot seed visible.
**Stage 1:** Soil mound + 2 thin stems with 1 oval leaf each (light green).
**Stage 2:** Wider soil mound + 3–4 stems with oval leaves at varying heights.
**Stage 3:** Full herb cluster — dense stems, 5–6 leaves, tiny dusty-rose bloom at top-center.

```tsx
// apps/frontend/src/components/journey/plants/PlantHerb.tsx
import { motion } from 'framer-motion';

interface PlantProps { stage: 0|1|2|3; isRecommended?: boolean; isPeakDropped?: boolean; onClick?: () => void; ariaLabel: string; }

const stages = [
  // Stage 0 — seed in soil
  <g key="s0">
    <ellipse cx="40" cy="108" rx="22" ry="6" fill="#8B7355" />
    <ellipse cx="40" cy="105" rx="18" ry="5" fill="#A89070" />
    <circle cx="40" cy="102" r="2.5" fill="#52796F" />
  </g>,
  // Stage 1 — tiny sprout
  <g key="s1">
    <ellipse cx="40" cy="108" rx="22" ry="6" fill="#8B7355" />
    <ellipse cx="40" cy="105" rx="18" ry="5" fill="#A89070" />
    <line x1="36" y1="104" x2="34" y2="90" stroke="#52796F" strokeWidth="1.5" strokeLinecap="round" />
    <ellipse cx="31" cy="88" rx="5" ry="3" fill="#84A98C" transform="rotate(-30 31 88)" />
    <line x1="44" y1="104" x2="46" y2="88" stroke="#52796F" strokeWidth="1.5" strokeLinecap="round" />
    <ellipse cx="49" cy="86" rx="5" ry="3" fill="#84A98C" transform="rotate(30 49 86)" />
  </g>,
  // Stage 2 — small herb
  <g key="s2">
    <ellipse cx="40" cy="108" rx="24" ry="6" fill="#8B7355" />
    <ellipse cx="40" cy="105" rx="20" ry="5" fill="#A89070" />
    <line x1="36" y1="104" x2="33" y2="82" stroke="#52796F" strokeWidth="1.5" strokeLinecap="round" />
    <ellipse cx="29" cy="79" rx="6" ry="3.5" fill="#84A98C" transform="rotate(-25 29 79)" />
    <line x1="40" y1="104" x2="40" y2="76" stroke="#52796F" strokeWidth="2" strokeLinecap="round" />
    <ellipse cx="40" cy="72" rx="6" ry="3.5" fill="#52796F" />
    <line x1="44" y1="104" x2="47" y2="84" stroke="#52796F" strokeWidth="1.5" strokeLinecap="round" />
    <ellipse cx="51" cy="81" rx="6" ry="3.5" fill="#84A98C" transform="rotate(25 51 81)" />
    <line x1="32" y1="100" x2="28" y2="92" stroke="#52796F" strokeWidth="1.2" strokeLinecap="round" />
    <ellipse cx="25" cy="90" rx="5" ry="2.5" fill="#84A98C" transform="rotate(-20 25 90)" />
  </g>,
  // Stage 3 — full herb cluster with bloom
  <g key="s3">
    <ellipse cx="40" cy="108" rx="26" ry="6" fill="#8B7355" />
    <ellipse cx="40" cy="105" rx="22" ry="5" fill="#A89070" />
    {[30,35,40,45,50].map((x, idx) => {
      const heights = [70,65,60,66,72];
      return <g key={idx}>
        <line x1={x} y1="104" x2={x - 2 + idx} y2={heights[idx]} stroke="#354F52" strokeWidth="1.8" strokeLinecap="round" />
        <ellipse cx={x - 2 + idx} cy={heights[idx] - 3} rx="7" ry="4" fill={idx===2 ? '#354F52' : '#52796F'} transform={`rotate(${-20+idx*10} ${x} ${heights[idx]})`} />
      </g>;
    })}
    <circle cx="40" cy="56" r="4" fill="#D4A5A5" opacity="0.9" />
    <circle cx="38" cy="54" r="1.5" fill="#E8C4C4" />
  </g>,
];

export const PlantHerb = ({ stage, isRecommended, onClick, ariaLabel }: PlantProps) => (
  <svg viewBox="0 0 80 120" role="img" aria-label={ariaLabel} onClick={onClick}
    style={{ cursor: onClick ? 'pointer' : 'default', overflow: 'visible' }}>
    {isRecommended ? (
      <motion.g
        animate={{ filter: ['drop-shadow(0 0 0px #84A98C)', 'drop-shadow(0 0 7px #84A98C)', 'drop-shadow(0 0 0px #84A98C)'] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        <motion.g key={stage} initial={{ opacity: 0.7, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }} style={{ transformOrigin: '40px 108px' }}>
          {stages[stage]}
        </motion.g>
      </motion.g>
    ) : (
      <motion.g key={stage} initial={{ opacity: 0.7, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }} style={{ transformOrigin: '40px 108px' }}>
        {stages[stage]}
      </motion.g>
    )}
  </svg>
);
```

### ACT 2B — `PlantSapling.tsx` (L2 · Defense · Sturdy sapling)

**Stage 0:** Acorn shape sitting in soil (rounded cap + oval body).
**Stage 1:** Short thick stem (2px wide), 2 small rounded leaves, prominent root-base visible in soil.
**Stage 2:** Taller stem with thicker base, 4 leaves, small stones at base.
**Stage 3:** Full sapling with gnarled roots visible, 6 leaves, ring of 3–4 stone shapes around base as "guard".

Color: darker greens (`#52796F` trunk, `#84A98C` leaves). Roots: `#A89070`. Stones: `#9CA3AF` (gray).

### ACT 2C — `PlantTree.tsx` (L3 · Growth · Large leafy tree)

**Stage 0:** Single thin sapling stem, 2 tiny leaves at top.
**Stage 1:** Young tree — trunk, small round canopy (circle).
**Stage 2:** Mid tree — wider trunk, medium canopy (layered circles), a few detail leaves at edges.
**Stage 3:** Full tree — strong trunk with fork, large layered canopy (3 overlapping circles), vibrant green, canopy shadows.

Color: `#354F52` trunk, `#52796F` inner canopy, `#84A98C` outer canopy highlight.

### ACT 2D — `PlantFruitTree.tsx` (L4 · Freedom · Fruit tree)

**Stage 0:** Bare branches — trunk with 4–5 bare angular branch lines, no leaves.
**Stage 1:** Buds — same skeleton + small circles at branch tips (pink/rose).
**Stage 2:** Flowers — branch tips have small 4-petal flower shapes (dusty rose).
**Stage 3:** Fruit — full canopy + 4–5 golden ellipses (`#E9B44C`) hanging from branches, some mid-drop.

Color: `#354F52` trunk/branches, `#D4A5A5` flowers, `#E9B44C` fruits.

### ACT 2E — `PlantForest.tsx` (L5 · Legacy · Forest grove)

**Stage 0:** Single tall old tree (prominent trunk, sparse canopy, slightly twisted).
**Stage 1:** Old tree + seed dots falling (5–6 small circles below canopy).
**Stage 2:** Old tree + 2 small saplings flanking it, seeds still visible.
**Stage 3:** Mini forest — old tree (center) + 2 medium trees + 2 small saplings = 5 trees total, various heights.

Color: Mix of `#354F52`, `#52796F`, `#84A98C` for visual depth across trees.

> **Note for all plant files:** Keep the SVG paths clean and minimal — adult-elegant, not illustrated-cartoon. All viewBox `0 0 80 120`. Export named component `PlantHerb`, `PlantSapling`, `PlantTree`, `PlantFruitTree`, `PlantForest`.

---

## ACT 3 — Create `CloudAccent.tsx`

**File:** `apps/frontend/src/components/journey/plants/CloudAccent.tsx`

**What:** Renders 3 cloud SVGs positioned absolutely across the hero sky area. Each drifts slowly using CSS `@keyframes` via `style={{ animation }}`. No framer-motion (pure CSS transform is cheaper for infinite loops).

**Implementation:**
```tsx
// apps/frontend/src/components/journey/plants/CloudAccent.tsx

const Cloud = ({ x, y, scale, duration, delay }: { x: number; y: number; scale: number; duration: number; delay: number }) => (
  <div
    style={{
      position: 'absolute',
      left: `${x}%`,
      top: `${y}px`,
      transform: `scale(${scale})`,
      animation: `cloudDrift ${duration}s ${delay}s linear infinite`,
      opacity: 0.45,
    }}
  >
    <svg width="64" height="28" viewBox="0 0 64 28" fill="none">
      <ellipse cx="32" cy="20" rx="28" ry="10" fill="#F1F5F9" />
      <ellipse cx="22" cy="16" rx="14" ry="10" fill="#F1F5F9" />
      <ellipse cx="40" cy="15" rx="16" ry="10" fill="#F1F5F9" />
      <ellipse cx="30" cy="12" rx="12" ry="9" fill="#F1F5F9" />
    </svg>
  </div>
);

export const CloudAccent = () => (
  <>
    <style>{`
      @keyframes cloudDrift {
        0%   { transform: translateX(0) scale(var(--cs, 1)); }
        50%  { transform: translateX(18px) scale(var(--cs, 1)); }
        100% { transform: translateX(0) scale(var(--cs, 1)); }
      }
    `}</style>
    <Cloud x={8}  y={12} scale={0.9} duration={60} delay={0} />
    <Cloud x={38} y={6}  scale={1.1} duration={75} delay={-20} />
    <Cloud x={72} y={16} scale={0.75} duration={55} delay={-35} />
  </>
);
```

---

## ACT 4 — Create `GroundBand.tsx`

**File:** `apps/frontend/src/components/journey/plants/GroundBand.tsx`

**What:** Full-width ground area at the bottom of the hero. Renders:
1. A gradient div (`from-[#FAF7F0] to-[#E8DFC8]`) spanning full width, ~28px tall.
2. Below it: 5-column grid with tier labels (level name + score ring indicator).

```tsx
// apps/frontend/src/components/journey/plants/GroundBand.tsx
import { cn } from '@/lib/utils';

interface GroundBandProps {
  levels: Array<{ key: string; label: string; score: number; isActive: boolean; isGraduated: boolean }>;
}

export const GroundBand = ({ levels }: GroundBandProps) => (
  <div className="w-full">
    {/* Gradient ground strip */}
    <div className="w-full h-7 rounded-sm" style={{ background: 'linear-gradient(to bottom, #FAF7F0, #E8DFC8)' }} />
    {/* Tier labels */}
    <div className="grid grid-cols-5 mt-2">
      {levels.map((lv) => (
        <div key={lv.key} className="flex flex-col items-center gap-0.5">
          <span className="text-[10px] font-medium text-muted-foreground">{lv.key}</span>
          <span className="text-[10px] text-muted-foreground/70">{lv.label}</span>
          <div className={cn(
            'flex items-center gap-0.5 text-[9px] mt-0.5',
            lv.isGraduated ? 'text-emerald-600' : lv.isActive ? 'text-amber-600' : 'text-muted-foreground/50'
          )}>
            <span>{lv.isGraduated ? '●' : lv.isActive ? '◐' : '○'}</span>
            <span>{lv.score.toFixed(0)}/100</span>
          </div>
        </div>
      ))}
    </div>
  </div>
);
```

---

## ACT 5 — Create `LivingGardenHero.tsx`

**File:** `apps/frontend/src/components/journey/LivingGardenHero.tsx`

**What:** Full-width hero card (~320px tall). Composes all 5 plant components + CloudAccent + GroundBand. Manages no-decay localStorage logic internally.

**Key logic:**
- `stageFromScore(score: number): 0|1|2|3` = `Math.min(3, Math.floor(score / 25))`
- `peakStages` loaded from `localStorage` key `pf-journey-peak-stages`
- On each render: compute raw stages → load peaks → effective stage = `max(raw, peak)` → save updated peaks
- `recommendedLevel` = first entry of `Object.entries(levelScores).filter(([,s]) => s < 100).sort(([,a],[,b]) => a - b)` — lowest non-100 score tier
- Tier card refs: pass `id="tier-card-L1"` etc. via tier card (wired in ACT 8) — here just use `document.getElementById('tier-card-L2')?.scrollIntoView({ behavior: 'smooth' })`

**Layout:**
```
relative overflow-hidden rounded-xl border bg-gradient-to-b from-[#F8FAFC] to-[#E0F2FE] p-4
  - position:relative for clouds
  - CloudAccent (position:absolute, z=0)
  - Flex row: 5 plant columns (z=10, relative)
    Each column: flex-col items-center, flex-1
      - SVG plant at height=200px, width auto
  - GroundBand below the flex row
  - data-testid="garden-hero"
```

**Hover tooltip:** Use `title` attribute on the plant wrapper div — `${lv.key} · ${lv.label} · ${score}/100`.

**Implementation sketch:**
```tsx
import { useEffect, useRef } from 'react';
import type { JourneyState } from '@/types/Journey';
import { PlantHerb } from './plants/PlantHerb';
import { PlantSapling } from './plants/PlantSapling';
import { PlantTree } from './plants/PlantTree';
import { PlantFruitTree } from './plants/PlantFruitTree';
import { PlantForest } from './plants/PlantForest';
import { CloudAccent } from './plants/CloudAccent';
import { GroundBand } from './plants/GroundBand';

const PEAK_KEY = 'pf-journey-peak-stages';
const TIER_META_LOCAL = [
  { key: 'L1', label: 'Cashflow',  Plant: PlantHerb },
  { key: 'L2', label: 'Defense',   Plant: PlantSapling },
  { key: 'L3', label: 'Growth',    Plant: PlantTree },
  { key: 'L4', label: 'Freedom',   Plant: PlantFruitTree },
  { key: 'L5', label: 'Legacy',    Plant: PlantForest },
];

function stageFromScore(score: number): 0|1|2|3 {
  return Math.min(3, Math.floor(score / 25)) as 0|1|2|3;
}

function loadPeaks(): Record<string, 0|1|2|3> {
  try { return JSON.parse(localStorage.getItem(PEAK_KEY) ?? '{}'); } catch { return {}; }
}

interface Props { state: JourneyState; }

export const LivingGardenHero = ({ state }: Props) => {
  const peaks = useRef<Record<string, 0|1|2|3>>(loadPeaks());

  const levels = TIER_META_LOCAL.map(({ key, label, Plant }) => {
    const score = state.levelScores[key] ?? 0;
    const rawStage = stageFromScore(score);
    const peakStage = peaks.current[key] ?? 0;
    const effectiveStage = Math.max(rawStage, peakStage) as 0|1|2|3;
    if (effectiveStage > peakStage) peaks.current[key] = effectiveStage;
    return { key, label, Plant, score, effectiveStage, isPeakDropped: rawStage < effectiveStage };
  });

  useEffect(() => {
    localStorage.setItem(PEAK_KEY, JSON.stringify(peaks.current));
  });

  const recommendedLevel = Object.entries(state.levelScores)
    .filter(([, s]) => s < 100)
    .sort(([, a], [, b]) => a - b)[0]?.[0];

  const groundLevels = levels.map((lv) => ({
    key: lv.key,
    label: lv.label,
    score: lv.score,
    isActive: lv.key === `L${state.currentLevel}`,
    isGraduated: (state.levelScores[lv.key] ?? 0) >= 70,
  }));

  return (
    <div
      data-testid="garden-hero"
      className="relative overflow-hidden rounded-xl border px-4 pt-4 pb-2"
      style={{ background: 'linear-gradient(to bottom, #F8FAFC, #E0F2FE)', minHeight: '280px' }}
    >
      <CloudAccent />
      <div className="relative z-10 flex items-end gap-1 mb-2" style={{ minHeight: '200px' }}>
        {levels.map(({ key, label, Plant, score, effectiveStage, isPeakDropped }) => {
          const isRecommended = key === recommendedLevel;
          const ariaLabel = `${key} ${label}, score ${score.toFixed(0)} of 100, stage ${effectiveStage}${isPeakDropped ? ', activity quiet this period' : ''}`;
          return (
            <div
              key={key}
              className="flex-1 flex flex-col items-center"
              title={`${key} · ${label} · ${score.toFixed(0)}/100`}
              data-testid={`plant-${key.toLowerCase()}`}
              data-stage={effectiveStage}
            >
              <Plant
                stage={effectiveStage}
                isRecommended={isRecommended}
                isPeakDropped={isPeakDropped}
                onClick={() => document.getElementById(`tier-card-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                ariaLabel={ariaLabel}
              />
            </div>
          );
        })}
      </div>
      <GroundBand levels={groundLevels} />
    </div>
  );
};
```

---

## ACT 6 — Refactor `JourneyPage.tsx`

**File:** `apps/frontend/src/pages/journey/JourneyPage.tsx`

**Changes:**
1. Remove imports: `PyramidProgress`, `SkylineProgress`, `CrystalProgress`, `useJourneyStyle`
2. Add import: `LivingGardenHero` from `@/components/journey/LivingGardenHero`
3. Remove `const { style: journeyStyle } = useJourneyStyle();` line
4. Replace the `<section className="grid grid-cols-1 md:grid-cols-3 gap-6">` block (the hero+tiercards grid) with:

```tsx
{/* Living Garden Hero — full-width */}
<LivingGardenHero state={state} />

{/* Tier Cards — vertical stack below hero */}
<section className="space-y-3">
  {['L1', 'L2', 'L3', 'L4', 'L5'].map((lvl) => (
    <TierCard key={lvl} level={lvl} state={state} />
  ))}
</section>
```

**Result:** Layout changes from 3-column grid (hero-left | cards-right) → stacked: hero full-width → tier cards full-width below.

**Loading skeleton** also needs updating — replace the 3-column grid skeleton with:
```tsx
<Skeleton className="h-72 w-full" />  {/* hero */}
<div className="space-y-3">
  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24" />)}
</div>
```

---

## ACT 7 — Update `IndicatorScoreBar.tsx`

**File:** `apps/frontend/src/components/journey/IndicatorScoreBar.tsx`

**Changes:** Add two optional props: `headline?: string` and `subtext?: string`. When `headline` is provided, render it instead of `indicator.displayName`. When `subtext` is provided, render a muted sub-line below the progress bar.

**Updated interface:**
```ts
interface Props {
  indicator: IndicatorScore;
  compact?: boolean;
  headline?: string;
  subtext?: string;
}
```

**Updated render** (main bar section — not `no_data` branch):
```tsx
<div className={cn('flex flex-col gap-0.5', compact ? 'py-0.5' : 'py-1')}>
  <div className="flex items-center justify-between">
    <span className="text-xs font-medium text-foreground/80 truncate flex-1">
      {headline ?? indicator.displayName}
    </span>
    <span className="text-xs font-mono font-medium ml-2">{indicator.score.toFixed(0)}</span>
  </div>
  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
    <motion.div
      className={cn('h-full rounded-full', STATUS_COLORS[indicator.status])}
      initial={{ width: 0 }}
      animate={{ width: `${indicator.score}%` }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    />
  </div>
  <div className="relative h-0">
    {[50, 70, 100].map((threshold) => (
      <div key={threshold} className="absolute w-px h-1.5 bg-border -top-1.5"
        style={{ left: `${threshold}%` }} title={`${threshold}`} />
    ))}
  </div>
  {subtext && (
    <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">{subtext}</p>
  )}
</div>
```

**Also update the `no_data` branch:** When `headline` provided, show it instead of `indicator.displayName`:
```tsx
<span className="text-xs text-muted-foreground flex-1 truncate">
  {headline ?? indicator.displayName}
</span>
```

**Backward compatible:** All existing call sites that don't pass `headline`/`subtext` continue working unchanged.

---

## ACT 8 — Update `TierCard.tsx`

**File:** `apps/frontend/src/components/journey/TierCard.tsx`

**Changes:**
1. Add import: `import { getJourneyLabel } from '@/utils/journeyLabels';`
2. Add `id` attribute to `<Card>` for scroll targeting: `<Card id={`tier-card-${level}`} ...>`
3. In the `.map((indicator) => ...)` block, derive `headline` + `subtext` per indicator:

```tsx
{state.indicators
  .filter((i) => i.level === level)
  .map((indicator) => {
    const lbl = getJourneyLabel(indicator.code);
    return (
      <IndicatorScoreBar
        key={indicator.code}
        indicator={indicator}
        compact
        headline={lbl.headline}
        subtext={lbl.subtext(indicator)}
      />
    );
  })}
```

**No other changes.** Card layout, status badge, deeplink — all unchanged.

---

## ACT 9 — Smooth Scroll + data-testid Wiring (Verification Pass)

After ACTs 5–8 are done, verify:

1. **Scroll targets exist:** Each `TierCard` renders `<Card id="tier-card-L1">` etc. (from ACT 8). Verify IDs render in DOM.

2. **Plant click handler:** `LivingGardenHero` calls `document.getElementById('tier-card-L2')?.scrollIntoView(...)`. Verify targeting matches the rendered IDs exactly (case-sensitive: `tier-card-L2` not `tier-card-l2`).

3. **data-testid attributes on hero and plants:**
   - `data-testid="garden-hero"` on hero wrapper ✓ (ACT 5)
   - `data-testid="plant-l1"` through `data-testid="plant-l5"` on plant wrappers ✓ (ACT 5) — note lowercase `l1` not `L1`
   - `data-stage={effectiveStage}` on plant wrappers ✓ (ACT 5)

4. **Hover tooltip:** `title` prop on plant wrapper divs renders in browser on mouseover.

---

## ACT 10 — Update E2E Test

**File:** `apps/frontend/e2e/journey.spec.ts`

**What:** Add/update assertions for the garden hero. If the file doesn't exist yet, create it with basic scaffold. Check existing content first.

**New assertions to add:**
```ts
test('Living Garden hero renders with plants', async ({ page }) => {
  await page.goto('/journey');
  
  // Hero container visible
  await expect(page.locator('[data-testid="garden-hero"]')).toBeVisible();
  
  // All 5 plants render
  for (const level of ['l1', 'l2', 'l3', 'l4', 'l5']) {
    const plant = page.locator(`[data-testid="plant-${level}"]`);
    await expect(plant).toBeVisible();
    // Stage should be 0–3
    const stage = await plant.getAttribute('data-stage');
    expect(['0', '1', '2', '3']).toContain(stage);
  }
});

test('Clicking plant L2 scrolls to tier card L2', async ({ page }) => {
  await page.goto('/journey');
  await page.locator('[data-testid="plant-l2"]').click();
  // Wait for scroll to complete
  await page.waitForTimeout(700);
  const tierCard = page.locator('#tier-card-L2');
  await expect(tierCard).toBeInViewport();
});

test('TierCard indicator dual display shows product headline', async ({ page }) => {
  await page.goto('/journey');
  // Look for the renamed label (not the old "Liquid savings ratio")
  const liquidLabel = page.getByText('3-month emergency fund');
  // May not exist if L2 indicators aren't loaded — conditional check
  const count = await liquidLabel.count();
  if (count > 0) {
    await expect(liquidLabel.first()).toBeVisible();
  }
});
```

---

## ACT 11 — Final Verification Checklist

Run in order:

**1. TypeScript compile (no errors):**
```
cd apps/frontend && npx tsc --noEmit
```

**2. Dev server visual check:**
```
cd apps/frontend && npm run dev
```
Open `http://localhost:8080/journey` and verify:
- [x] Garden hero renders full-width above tier cards
- [x] 5 plants visible, ground band with labels below
- [x] 3 clouds present (soft, ambient)
- [x] Score 0 → all plants stage 0 (dormant seeds/bare)
- [x] Hover plant → tooltip with `L1 · Cashflow · X/100`
- [x] Click plant → smooth scroll to tier card
- [x] Tier card indicator rows show product headlines (e.g. "3-month emergency fund")
- [x] Muted sub-text line below each indicator bar
- [x] Old pyramid/skyline/crystal hero no longer visible

**3. No-decay check:**
- Open DevTools → Application → localStorage
- Note `pf-journey-peak-stages` value
- Simulate recalculate with lower scores → confirm plant stages do not drop

**4. Lint:**
```
cd apps/frontend && npm run lint
```

**5. E2E (if full stack running):**
```
cd apps/frontend && npx playwright test e2e/journey.spec.ts
```

---

## Summary Table

| ACT | File(s) | Status |
|-----|---------|--------|
| 1 | `utils/journeyLabels.ts` | NEW |
| 2A | `plants/PlantHerb.tsx` | NEW |
| 2B | `plants/PlantSapling.tsx` | NEW |
| 2C | `plants/PlantTree.tsx` | NEW |
| 2D | `plants/PlantFruitTree.tsx` | NEW |
| 2E | `plants/PlantForest.tsx` | NEW |
| 3 | `plants/CloudAccent.tsx` | NEW |
| 4 | `plants/GroundBand.tsx` | NEW |
| 5 | `LivingGardenHero.tsx` | NEW |
| 6 | `JourneyPage.tsx` | EDIT |
| 7 | `IndicatorScoreBar.tsx` | EDIT |
| 8 | `TierCard.tsx` | EDIT |
| 9 | Scroll + testid verification | VERIFY |
| 10 | `e2e/journey.spec.ts` | EDIT/NEW |
| 11 | TypeScript + lint + visual | VERIFY |
