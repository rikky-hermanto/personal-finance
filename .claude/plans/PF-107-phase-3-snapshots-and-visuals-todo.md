# PF-107 Phase 3 — Historical Snapshots + Visual Suite

> **Parent Issue:** PF-107 (Assets Management)
> **Phase:** 3 of 6 — Full visual experience + scalable history
> **Status:** Not started
> **Depends on:** Phase 2 complete (auto-pricing live, Asset Class Delta chart in place)
> **Blocks:** Phase 4

## Objective

Replace the raw-`valuations`-query trend chart with a materialized `daily_net_worth` table that scales to years of history without degrading query time. Layer the full visual suite on top: Treemap (Team A's best visualization idea), Liquidity Ladder, Currency Exposure donut, Concentration Risk widget, Snapshot Compare tool, and event annotations on the trend chart. After Phase 3, the user's Overview page should feel like a Bloomberg terminal for personal wealth — information-dense but scannable at a glance.

## Acceptance Criteria

- [ ] `daily_net_worth` table exists and is populated daily by a background job
- [ ] `NetWorthTrendChart` switches to reading from `daily_net_worth` (faster, no aggregation on query)
- [ ] **Treemap** added to Overview: box size = `value_idr`, color = month-over-month % change (green/red)
- [ ] **Liquidity Ladder** added to Overview: horizontal stack showing Immediate / Short-term / Medium-term / Long-term / Illiquid buckets with total IDR per bucket
- [ ] **Currency Exposure donut** added to Overview: IDR vs USD vs AUD vs SGD allocation (with USD-equivalent total)
- [ ] **Concentration Risk widget**: top-10 holdings as % of net worth; flags any holding > 10% of NW in red
- [ ] **Snapshot Compare tool** on `/assets/history` route: user picks two dates, sees side-by-side diff with attribution per asset class
- [ ] **Event annotations** on Net Worth Trend chart: user can add a text note to any date (stored in DB); renders as a small dot + tooltip on the chart (replicates Excel red-text annotations)
- [ ] All new visuals follow data-oriented-theme — no glassmorphism, no gradient fills
- [ ] Trend chart performance: 5 years of daily snapshots (~1,800 rows) renders in < 500ms

## Approach

`daily_net_worth` table stores one row per (user_id, date) with pre-aggregated totals per asset class plus `total_idr`. Background job runs nightly (30 minutes after `DailyPricingJob`) reading the latest `valuations` per subject and writing a snapshot row. Liquidity bucket classification lives in a static mapping (e.g. `cash = Immediate`, `investments = Medium-term`, `real_estate = Illiquid`). Treemap uses Recharts `Treemap` component (already in Recharts, no new dependency).

Out of scope: XIRR/returns (Phase 4), IDX equities auto-pricing (fragile scraping, defer further), reconciliation with cashflow (backlog).

## Affected Files

| File | Change |
|------|--------|
| `supabase/migrations/NNNN_daily_net_worth.sql` | Create — `daily_net_worth` + `net_worth_events` tables |
| `apps/api/src/PersonalFinance.Infrastructure/Jobs/DailySnapshotJob.cs` | Create — nightly materialization |
| `apps/api/src/PersonalFinance.Api/Controllers/NetWorthController.cs` | Modify — add history, snapshot-compare, events endpoints |
| `apps/frontend/src/pages/assets/AssetsLayout.tsx` | Modify — add History tab |
| `apps/frontend/src/pages/assets/HistoryTab.tsx` | Create |
| `apps/frontend/src/components/assets/NetWorthTrendChart.tsx` | Modify — switch to `daily_net_worth`, add event annotations |
| `apps/frontend/src/components/assets/AssetsTreemap.tsx` | Create |
| `apps/frontend/src/components/assets/LiquidityLadder.tsx` | Create |
| `apps/frontend/src/components/assets/CurrencyExposureDonut.tsx` | Create |
| `apps/frontend/src/components/assets/ConcentrationRiskWidget.tsx` | Create |
| `apps/frontend/src/components/assets/SnapshotCompare.tsx` | Create |
| `apps/frontend/src/api/netWorthApi.ts` | Modify — add history (from daily_net_worth), events, compare endpoints |

---

## TODO

### [ ] STEP 1 — Create daily_net_worth + net_worth_events migration

```sql
-- daily_net_worth: pre-aggregated snapshot per user per day
CREATE TABLE public.daily_net_worth (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL,
  snapshot_date   date NOT NULL,
  total_idr       numeric(30,2) NOT NULL,
  -- per-class totals (denormalized for fast charting — 9 columns vs a JOIN)
  cash_idr            numeric(30,2) NOT NULL DEFAULT 0,
  investments_idr     numeric(30,2) NOT NULL DEFAULT 0,
  fixed_income_idr    numeric(30,2) NOT NULL DEFAULT 0,
  crypto_idr          numeric(30,2) NOT NULL DEFAULT 0,
  real_estate_idr     numeric(30,2) NOT NULL DEFAULT 0,
  tangibles_idr       numeric(30,2) NOT NULL DEFAULT 0,
  vehicles_idr        numeric(30,2) NOT NULL DEFAULT 0,
  receivables_idr     numeric(30,2) NOT NULL DEFAULT 0,
  retirement_idr      numeric(30,2) NOT NULL DEFAULT 0,
  total_liabilities_idr numeric(30,2) NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, snapshot_date)
);

-- net_worth_events: user annotations on the trend chart
CREATE TABLE public.net_worth_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  event_date  date NOT NULL,
  label       text NOT NULL,   -- e.g. "BTC CL happening, Bearish Mansek down"
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS (permissive until PF-S08)
ALTER TABLE public.daily_net_worth ENABLE ROW LEVEL SECURITY;
CREATE POLICY "daily_net_worth_open" ON public.daily_net_worth USING (true) WITH CHECK (true);
ALTER TABLE public.net_worth_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "net_worth_events_open" ON public.net_worth_events USING (true) WITH CHECK (true);
```

> **Why denormalize per-class columns instead of a `class` + `value` row-per-class design?** The trend chart needs all 9 class values for a single date in one query. A normalized design would need a GROUP BY that aggregates 9 rows per date into a single chart point — 5 years × 9 rows = 16,200 rows GROUP BY'd on every chart load. Denormalized = 1,800 rows, 0 aggregation. The extra 9 columns are a ~72 bytes overhead per row. Worth it.

---

### [ ] STEP 2 — Create DailySnapshotJob

```csharp
// Infrastructure/Jobs/DailySnapshotJob.cs
// Runs at midnight WIB (17:00 UTC) — after DailyPricingJob (04:00 UTC)
// For each user: compute latest value per subject → aggregate by asset_class
// → upsert one row in daily_net_worth (INSERT ... ON CONFLICT (user_id, snapshot_date) DO UPDATE)
```

Also expose a one-time backfill endpoint for admin use:
```
POST /api/admin/networth/backfill?from=2025-09-01
```

Backfill iterates over each day, takes the latest `valuations` per subject as-of that day, and writes `daily_net_worth` rows. This populates the user's historical data from their Phase 1B manual entries.

> **Why a backfill endpoint instead of a migration script?** The backfill reads from `valuations` which has variable content per user. It can't run as SQL — it needs application-level aggregation logic. An admin endpoint is simpler to invoke (`curl -X POST ...`) and easier to monitor via logs.

---

### [ ] STEP 3 — Build AssetsTreemap

```tsx
// components/assets/AssetsTreemap.tsx
// Recharts <Treemap> — no new dependency needed
// Data shape: { name: 'BCA Tabungan', value: 138734923, change: 0.032 }
// Box size = value_idr (proportional to NW)
// Box color = month-delta %:
//   > +2% → --success (green)
//   -2% to +2% → --muted (grey)
//   < -2% → --destructive (red)
// Box label: asset name (truncated) + IDR value (abbreviated: "Rp 139M")
// Click → opens ValuationHistorySheet for that asset
```

Position on Overview: below the existing 3-widget row (Headline + TrendChart + AllocationDonut). The Treemap is the "portfolio at a glance" complement to the Donut's allocation view.

> **Why Treemap AND AllocationDonut?** They answer different questions. The Donut answers "how is NW allocated by class?" (static, no performance signal). The Treemap answers "which specific holdings are driving the change?" (performance-weighted, individual). A user checking their portfolio reads the Donut first (is crypto too big?) then the Treemap (which crypto holding is hot/cold?).

---

### [ ] STEP 4 — Build LiquidityLadder

```tsx
// components/assets/LiquidityLadder.tsx
// Horizontal segmented bar, 5 buckets
// Bucket classification (static mapping, no user config in Phase 3):
//   Immediate  → cash (checking, savings, e-wallet)
//   Short-term → fixed_income < 1yr maturity, crypto (liquid exchange balances)
//   Medium-term→ investments (stocks, MF — T+2 settlement + market risk)
//   Long-term  → real_estate, tangibles (gold — can sell but takes days/weeks)
//   Illiquid   → receivables, retirement (BPJS), vehicles

// Display under bar: "If you needed cash tomorrow: Rp 138M available immediately"
```

> **Why hardcode the bucket classification instead of letting user configure it?** Adding configuration for liquidity bucket per asset class would require a new Settings page, new DB table, and a non-trivial UI. The default classification is correct for 95% of cases. If the user wants gold to be "Medium-term" (they can sell quickly online), they can do it in a future Settings phase. Don't over-engineer Phase 3.

---

### [ ] STEP 5 — Build CurrencyExposureDonut

Simple Recharts PieChart — one slice per currency in the user's portfolio (IDR, USD, AUD, SGD). Values from the sum of `value_idr` for all `valuations` grouped by `currency`.

Show a subtitle: `Total in USD equivalent: $XX,XXX` for non-IDR readers.

---

### [ ] STEP 6 — Build ConcentrationRiskWidget

```tsx
// components/assets/ConcentrationRiskWidget.tsx
// Table: top 10 holdings by value_idr as % of total NW
// Red flag icon next to any holding > 10% of NW
// "BTC: Rp 94M (7.7% of NW)" — within limit
// "Mansek: Rp 753M (61.3% of NW) ⚠" — concentrated

// GET /api/networth/concentration → top 10 with flagged boolean
```

> **Why 10% threshold?** A single position > 10% of NW is the standard institutional concentration-risk alert trigger. Not a hard rule but a sensible default for a retail investor. The user's Excel shows Mansek at ~60% of NW — this widget will immediately surface that concentration on first render.

---

### [ ] STEP 7 — Build SnapshotCompare tool

New `/assets/history` tab with a two-date selector. User picks two dates; app shows a side-by-side table:

| Asset Class | Sep 2025 | Apr 2026 | Δ IDR | Δ % |
|---|---|---|---|---|
| Cash | Rp 117M | Rp 139M | +Rp 22M | +18.4% |
| Investments | Rp 996M | Rp 928M | −Rp 68M | −6.9% |
| ... | | | | |
| **Net Worth** | **Rp 1.28B** | **Rp 1.23B** | **−Rp 55M** | **−4.3%** |

Backend: `GET /api/networth/compare?dateA=2025-09-30&dateB=2026-04-30` — reads two rows from `daily_net_worth` and returns the diff.

---

### [ ] STEP 8 — Add event annotations to NetWorthTrendChart

```tsx
// In NetWorthTrendChart.tsx:
// Overlay <ReferenceLine> or custom dot on the line for each event in net_worth_events
// Hover tooltip: "2025-11-30: BTC CL happening, Bearish Mansek down"
// "Add Note" button opens a small form: date picker + text input
```

API:
```
GET /api/networth/events            → list of annotations
POST /api/networth/events           → create annotation { event_date, label }
DELETE /api/networth/events/{id}    → delete annotation
```

> **Why events in DB instead of localStorage?** The user's Excel annotations ("BTC CL happening", "AUD naik tajam", "Gaji terakhir turun") are significant enough to survive a device change. They're historical context for portfolio decisions. Storing in DB ensures they appear on the trend chart even if accessed from a different browser.

---

## Notes

- **Backfill before demo**: After deploying Phase 3, run the backfill endpoint to populate `daily_net_worth` from the Phase 1B manual-entry data. Without it, the trend chart will have gaps and the Snapshot Compare will show empty cells for historical dates.
- **Treemap performance**: For portfolios with many small holdings, limit the Treemap to top 20 by `value_idr`. Small boxes are unreadable and slow to render. Show a "and 8 more" label below.
- **LiquidityLadder bucket override (future)**: When Phase 5 adds Settings, add a "Liquidity" tab to Asset Target settings where users can override the default bucket per asset class. Phase 3 hardcodes; Phase 5 makes it configurable.
- **event annotations replicates Excel**: The user explicitly annotates each monthly column with red notes ("Gaji terakhir turun, 2 m Eskalasi AS - Iran, nego damai", etc.). This feature directly digitizes that habit. When demoing Phase 3, migrate those notes manually as the first events to show the continuity.
