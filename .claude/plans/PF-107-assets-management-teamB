# Asset Management Module — Product Brainstorm & Plan

> Strategic plan for a comprehensive Asset Management module that elevates the app from cashflow tracking to true wealth management.
> Status: **Brainstorm + plan only — no execution requested.**

---

## Context

### Why this module is needed

The app today is a **cashflow tracker** — it answers *"where did my money go?"* It does not answer *"how much am I worth?"*, *"is my wealth growing?"*, or *"is my portfolio balanced?"*

Concretely, the current state has:
- **No proper Account/Wallet entity** — `wallet` is a free-text string on transactions ([apps/api/src/PersonalFinance.Domain/Entities/Transaction.cs](apps/api/src/PersonalFinance.Domain/Entities/Transaction.cs))
- **No proper Bank/Institution entity** — bank codes are hardcoded across [TransactionsController.cs:64-68](apps/api/src/PersonalFinance.Api/Controllers/TransactionsController.cs#L64-L68), [Program.cs:85-93](apps/api/src/PersonalFinance.Api/Program.cs#L85-L93), and [BankIdentifier.cs](apps/api/src/PersonalFinance.Infrastructure/Parsers/BankIdentifier.cs)
- **No balance tracking** — `bank_running_balance` exists on transactions but is used purely as a deduplication tie-breaker (PF-090), not as a balance ledger
- **No snapshots over time** — there is no historical view of what any account/asset was worth at a point in time
- **Custom wallets are stored in `localStorage`** — see [AccountsTab.tsx](apps/frontend/src/pages/cashflow/AccountsTab.tsx) (`pf_custom_wallets`), so they are device-local and unreliable
- **Settings already has a disabled placeholder** for "Banks & Accounts" in [SettingsLayout.tsx](apps/frontend/src/pages/settings/SettingsLayout.tsx) — the gap is acknowledged

### What "professional-grade" means for this user

This is a **single-user power-tool app** for an Indonesian user managing 5 banks across IDR/USD with mixed cash, investment, and real-asset exposure. Professional-grade here means:
- **Bloomberg-Terminal density** for the user, not a Mint-style consumer dashboard
- **Honest tracking** — no fake auto-sync; manual entry is fine when it's the truthful path
- **Time-series first** — every value has a date; net worth is a chart not a number
- **Multi-currency native** — IDR base, but FX-aware
- **Composable with cashflow** — a transaction debiting BCA reduces BCA's balance; the two modules are not separate islands

---

## Brainstorm: The Vision

### A. Asset & Liability Taxonomy

The module organizes everything a person owns or owes into a clean hierarchy:

**Assets**
| Class | Examples | Liquidity | Pricing |
|---|---|---|---|
| **Cash & Equivalents** | Checking, savings, e-wallets, physical cash | Immediate | Self-evident |
| **Equity** | Stocks (IDX, NYSE), ETFs, mutual funds | T+2 to T+7 | Auto (market) |
| **Fixed Income** | Bonds (SBN, ORI), deposits, P2P lending | Days to years | Manual or yield-curve |
| **Crypto** | BTC, ETH, stablecoins | Immediate | Auto (CoinGecko) |
| **Real Estate** | Primary home, rental, land | Months | Manual (quarterly) |
| **Vehicles** | Cars, motorcycles | Weeks | Manual (with depreciation curve) |
| **Receivables** | Money lent, security deposits | Variable | Face value |
| **Tangibles** | Gold, jewelry, collectibles | Days to weeks | Auto (gold) / manual |
| **Retirement** | BPJS, DPLK, pension | Locked until eligibility | Statement-based |

**Liabilities**
| Class | Examples | Tracked metrics |
|---|---|---|
| **Revolving** | Credit cards, BNPL (PayLater, Akulaku) | Outstanding balance, APR, due date |
| **Installment** | Personal loans, KPR (mortgage), KKB (car loan) | Principal, interest rate, remaining term, monthly payment |
| **Trade/Personal** | Money owed to friends/family | Face value, expected payback |

**Net Worth = Σ(Assets) − Σ(Liabilities)** — re-computed at every valuation event, snapshotted daily for trend charts.

---

### B. Domain Model (proposed)

Mirroring the existing `Domain/Entities/` + Supabase migration pattern. New entities:

```
Institution        ─┐
   id                │   (replaces hardcoded bank strings)
   name              │   - BCA, Superbank, Mandiri Sekuritas, Stockbit, Pintu, etc.
   type              │   - bank | broker | crypto_exchange | insurer | other
   country           │
   logo_url          │
                     │
Account            ─┤
   id                │   (replaces 'wallet' string on Transaction)
   name              │   - "BCA Tahapan", "Stockbit IDX", "Wise USD"
   account_type      │   - checking | savings | credit_card | brokerage | wallet | loan
   institution_id    │   FK → Institution
   currency          │   ISO 4217
   opening_balance   │
   opening_date      │
   is_active         │
   color, icon       │
                     │
Asset              ─┤   (anything that doesn't fit cleanly into Account)
   id                │   - real estate, vehicles, gold bars, collectibles
   name              │
   asset_class       │   enum (above)
   account_id?       │   nullable — investments live inside an Account; a house does not
   acquired_date     │
   acquisition_cost  │
   currency          │
   metadata          │   jsonb: { address, vin, grade, ticker, isin, ... }
                     │
Holding            ─┤   (for fungible investments inside a brokerage Account)
   id                │
   account_id        │   FK → Account
   ticker            │   "BBCA.JK", "BTC", "VOO"
   quantity          │
   cost_basis        │   weighted avg per unit
   currency          │
                     │
Valuation          ─┤   (time-series — the heart of the module)
   id                │
   subject_type      │   'account' | 'asset' | 'holding'
   subject_id        │
   value             │   in subject's native currency
   currency          │
   valued_at         │   timestamp
   source            │   'manual' | 'statement' | 'price_feed' | 'computed'
                     │
Liability          ─┤
   id                │
   name              │
   liability_type    │   revolving | installment | personal
   account_id?       │   FK → Account (credit card account links here)
   principal         │
   interest_rate     │
   start_date        │
   end_date?         │
   monthly_payment?  │
                     │
PriceQuote         ─┘   (cached price feed snapshots)
   ticker
   price
   currency
   quoted_at
   source           ('coingecko' | 'yahoo' | 'idx' | 'manual')
```

**Migration of existing data:**
- Backfill an `Account` row per distinct `transactions.wallet` string, plus an `Institution` per known bank
- Add `transactions.account_id` FK; populate from string match; keep `wallet` string for one release as fallback
- Localstorage `pf_custom_wallets` → server-persisted `Account` rows on first login

---

### C. Killer Features — the "professional-grade" differentiators

These are the views that move the app beyond Mint-clone territory:

1. **Net Worth Trend** — line chart, full history, with annotations for major events (bought house, paid off loan). Daily snapshot job ensures continuity even when no manual updates happen.
2. **Asset Allocation Donut + Drift** — current % vs. target %, with a "rebalance suggestions" panel ("you're 8% overweight crypto vs. your 15% target — sell IDR 12M to rebalance").
3. **Liquidity Ladder** — horizontal stack: *immediate* (cash, crypto) / *short-term* (stocks, gold) / *medium-term* (bonds, deposits) / *long-term* (real estate) / *illiquid* (BPJS). Answers "if I needed cash tomorrow, how much could I raise?"
4. **Currency Exposure** — donut by currency, with USD-equivalent of each. Critical because Wise multi-currency assets exist.
5. **Concentration Risk** — top 10 holdings as % of net worth; flags when any single holding > 10%.
6. **True Returns** — XIRR (money-weighted) per holding/portfolio, accounting for the cashflow timing of contributions. TWR (time-weighted) for benchmark comparison. Most apps just show absolute P&L — this is the table-stakes wealth tool feature.
7. **Cashflow ↔ Net Worth Reconciliation** — "this month you saved IDR 8M of cashflow, but your net worth grew IDR 12M — IDR 4M was market gains." Powerful insight.
8. **Goal Tracker with Runway** — "IDR 500M house down payment by Dec 2028 — at current savings rate, you'll arrive Mar 2029 (3 months late)." Pull current asset value + savings rate from cashflow.
9. **Debt Health Scorecard** — debt-to-asset, debt-to-income (from cashflow), debt service coverage. Visual payoff schedule (avalanche vs. snowball comparison).
10. **What-If Scenarios** — "if I pay off my KPR 2 years early, I save IDR 87M interest but reduce liquidity by IDR 200M — net worth +IDR 87M in 2030."
11. **Snapshot Compare** — side-by-side net worth on two dates ("Jan 1 vs today"), with breakdown of which assets drove the delta.
12. **Tax-Aware Reporting** — capital gains realized this year, broken into short-term (< 1y) vs long-term (≥ 1y), exportable for SPT filing.

### D. Data Ingestion — how data gets in

A wealth tool fails or wins based on this. Strategy:

| Source | Method | Effort | Examples |
|---|---|---|---|
| **Bank statement uploads (existing pipeline)** | Auto — every statement upload writes a `Valuation` row for that Account using the final `bank_running_balance` | Zero (already in flow) | BCA, Superbank, NeoBank, Wise, Jago |
| **Manual valuation** | Quick form — just `account/asset → value → date` | Low | Real estate, jewelry |
| **Auto price feed (free APIs)** | Background job — CoinGecko (crypto), IDX scrape (Indonesian stocks), gold spot price | Zero ongoing | BTC, BBCA.JK, gold |
| **LLM-parsed broker statements** | Reuse the `services/ai-service` pipeline — extend with broker-statement schema | Low | Stockbit PDF, Mandiri Sekuritas PDF |
| **Recurring reminders** | Notification: "Update real estate valuation (last updated 87 days ago)" | Low | All slow-moving assets |
| **CSV bulk import** | One-shot for migrating from a spreadsheet | One-time | First-time onboarding |

---

### E. UI / Module Structure

Follows the existing tabbed-workspace pattern from [CashflowLayout.tsx](apps/frontend/src/pages/cashflow/CashflowLayout.tsx) and [SettingsLayout.tsx](apps/frontend/src/pages/settings/SettingsLayout.tsx).

**New top-level workspace: `/assets/*`**

Sidebar entry added between Dashboard and Cashflow in [Sidebar.tsx](apps/frontend/src/components/Sidebar.tsx) — icon `Landmark` (lucide-react).

```
/assets
├── /assets/overview      → Net Worth headline · Allocation donut · Trend chart · Top holdings
├── /assets/accounts      → Cash, banking, brokerage accounts (graduates today's /cashflow/accounts)
├── /assets/investments   → Holdings table (ticker, qty, cost, mkt value, P&L, weight%, XIRR)
├── /assets/properties    → Real estate + vehicles (valuation cards with history sparkline)
├── /assets/liabilities   → Debt tracker · payoff schedule · debt-health scorecard
├── /assets/goals         → Savings targets with runway
└── /assets/history       → Daily/monthly net worth snapshots, snapshot-compare tool
```

**Settings additions** in `/settings/*`:
- Enable the disabled `banks` placeholder → **Institutions & Accounts** tab — CRUD for `Institution` and `Account`
- New tab: **Asset Targets** — set target allocation %, savings goals, alert thresholds

**Reuse, do not rebuild:**
- [AppShell.tsx](apps/frontend/src/components/AppShell.tsx) — wraps everything; no changes needed
- [DataTable.tsx](apps/frontend/src/components/DataTable.tsx) — server-paged, filterable; perfect for holdings table
- [FinancialChart.tsx](apps/frontend/src/components/FinancialChart.tsx) — net worth trend, valuation history
- [PageHeader.tsx](apps/frontend/src/components/PageHeader.tsx) — page title bar
- [`@/lib/format.ts`](apps/frontend/src/lib/format.ts) — `formatCurrency`, `formatCompact`
- shadcn primitives: `Card`, `Tabs`, `Dialog`, `AlertDialog`, `Sheet`, `Select`, `Badge`, `Popover`
- Theme tokens — semantic colors `--success` (gains), `--destructive` (losses), `--income`/`--expense`, `--chart-1..5`, plus `font-mono tabular-nums` / `.font-data` for all monetary values

**New components needed (rough list):**
- `NetWorthHeadline` — KPI card with delta vs. last period
- `NetWorthTrendChart` — `FinancialChart` wrapper
- `AllocationDonut` — Recharts pie with legend & drift indicators
- `LiquidityLadder` — horizontal stacked bar
- `HoldingsTable` — `DataTable` consumer
- `ValuationHistorySheet` — slide-over for editing snapshot history
- `AddValuationDialog` — quick-entry form
- `DebtPayoffChart` — composed chart (principal + interest over time)
- `GoalRunwayCard` — progress bar + ETA
- `SnapshotCompare` — two-column diff view

---

### F. Phased Delivery Plan

> **Decisions locked in 2026-05-15:**
> - **v1 scope = full taxonomy, manual entry.** All 9 asset classes + liabilities ship in Phase 1. Auto-pricing and broker parsing come later.
> - **Build `/assets/*` in parallel; do NOT touch `/cashflow/accounts`.** No migration of the existing Wallets tab in this module — that's a future cleanup. The two paths will coexist temporarily.
> - **Ship now without auth.** Skip the PF-S08 dependency. Add a `user_id` column on every new table from day 1 (default to a fixed single-user UUID for now) and add permissive RLS — so retrofitting auth later is a config flip, not a schema migration.
> - **Currency strategy = IDR-equivalent with FX snapshot at valuation time.** Every `Valuation` stores `value_native + currency + fx_rate_to_idr + value_idr` together. Net worth chart is computed in IDR using historical FX, not retroactively-rewritten current FX.

**Phase 1 — Full Balance Sheet (the big one)**
- Migrations: `institutions`, `accounts`, `assets`, `holdings`, `liabilities`, `valuations`, `fx_rates` tables — all with `user_id` + permissive RLS
- Domain entities + supabase-csharp models for all of the above
- CRUD endpoints + handlers (CQRS) for every entity
- `IFxRateService` — fetches & caches daily IDR rates (Bank Indonesia JISDOR feed or free alternative)
- Auto-write `Valuation` row from every bank statement upload using final `bank_running_balance` (extend each parser in `Infrastructure/Parsers/`)
- New workspace `/assets/*` with tabs: overview, accounts, investments, properties, liabilities (goals + history come in Phase 4)
- Settings: enable Institutions & Accounts CRUD tab
- `/cashflow/accounts` untouched — coexists
- *Outcome: full personal balance sheet, manually maintained, with Net Worth headline + breakdown by class. No fancy charts yet, but the data model is complete.*

**Phase 2 — Auto-Pricing**
- Background job (cron / Supabase Edge Function): CoinGecko (crypto), IDX scrape or RTI Business (Indonesian stocks), gold spot
- `price_quotes` cache table
- Daily price refresh → auto-writes new `Valuation` rows for affected Holdings
- Manual price override still supported
- *Outcome: portfolios update themselves; no daily clicking required.*

**Phase 3 — Daily Snapshots & Visual Insights**
- Daily net-worth snapshot job (writes a denormalized `daily_net_worth` row per user)
- Net Worth Trend chart (`FinancialChart` over `daily_net_worth`)
- Allocation donut (with drift vs target)
- Liquidity ladder
- Currency exposure donut
- Concentration risk table
- *Outcome: the visual layer that makes this feel like a wealth tool, not a database.*

**Phase 4 — Returns, Goals & Debt Health**
- XIRR / TWR computation per holding & portfolio
- `/assets/goals` tab — targets + runway calculation pulling savings rate from cashflow
- `/assets/history` tab — snapshot-compare, monthly closing values
- Debt health scorecard + payoff schedule
- Cashflow ↔ Net Worth reconciliation widget
- *Outcome: insights competitive with paid wealth tools.*

**Phase 5 — LLM Broker Statement Parsing**
- Extend `services/ai-service` with broker-statement schema (Stockbit, Mandiri Sekuritas, Pintu, Indodax)
- New `POST /parse-broker-statement` endpoint
- Auto-update Holdings + Valuations from broker statement uploads
- *Outcome: zero-touch portfolio updates — drop a PDF, balance updates.*

**Phase 6 — What-If, Tax, Auth Retrofit**
- Scenario modeller (early loan payoff, large purchases, allocation rebalance)
- Realized gains report (capital gains for SPT filing)
- **Retrofit PF-S08 Supabase Auth** — flip RLS policies from permissive to `auth.uid() = user_id`; wire JwtBearer middleware
- (Optional cleanup) Migrate `/cashflow/accounts` into `/assets/accounts` and remove the localStorage `pf_custom_wallets` code path
- *Outcome: the app becomes a financial-planning tool, properly secured.*

---

### G. Critical Files to Modify (when execution starts)

**Backend:**
- `apps/api/src/PersonalFinance.Domain/Entities/` — new: `Institution.cs`, `Account.cs`, `Asset.cs`, `Holding.cs`, `Valuation.cs`, `Liability.cs`, `PriceQuote.cs`
- `apps/api/src/PersonalFinance.Application/Commands/` — Create/Update/Delete commands per entity
- `apps/api/src/PersonalFinance.Application/Services/` — `INetWorthService`, `IValuationService`, `IPricingService`
- `apps/api/src/PersonalFinance.Application/Dtos/` — DTOs per entity
- `apps/api/src/PersonalFinance.Api/Controllers/` — `AccountsController`, `AssetsController`, `LiabilitiesController`, `NetWorthController`
- `apps/api/src/PersonalFinance.Infrastructure/Parsers/` — extend each parser to write a `Valuation` row using final `bank_running_balance`
- `supabase/migrations/` — new SQL migrations for all tables + RLS policies

**Frontend:**
- `apps/frontend/src/components/Sidebar.tsx` — add `/assets` nav entry
- `apps/frontend/src/App.tsx` — new `/assets/*` route block
- `apps/frontend/src/pages/assets/` — new directory with `AssetsLayout.tsx` + tab files
- `apps/frontend/src/api/` — new: `accountsApi.ts`, `assetsApi.ts`, `liabilitiesApi.ts`, `netWorthApi.ts`
- `apps/frontend/src/types/` — new: `Account.ts`, `Asset.ts`, `Liability.ts`, `Valuation.ts`
- `apps/frontend/src/components/dashboard/widgets/` — new: `NetWorthHeadline.tsx`, `AllocationDonut.tsx`, `NetWorthTrendChart.tsx`
- `apps/frontend/src/pages/cashflow/AccountsTab.tsx` — slim down or redirect to `/assets/accounts`; remove `localStorage` custom-wallet code
- `apps/frontend/src/pages/settings/SettingsLayout.tsx` — un-disable `banks` tab, add `targets` tab

---

### H. Cross-Cutting Concerns

- **Auth — ship-now, retrofit-later strategy (locked in).** Every new table includes `user_id uuid not null default '<single-user-uuid>'` from day 1, with a permissive RLS policy `USING (true)`. Phase 6 flips the policy to `USING (auth.uid() = user_id)` and wires JwtBearer — zero schema migration required.
- **Currency — FX snapshot at valuation time (locked in).** Every `Valuation` row stores `value_native + currency + fx_rate_to_idr + value_idr` together. Net worth queries always read `value_idr` directly — fast, and historically honest (a USD valuation from 2024 keeps its 2024 FX rate). New `fx_rates` table caches daily rates from Bank Indonesia JISDOR (free) or fixer.io. New `IFxRateService` in `Application/Services/`.
- **Wallets coexistence (locked in).** `/cashflow/accounts` is untouched. The new `/assets/accounts` is built fresh against the new `Account` entity. Some duplication of UI is accepted for this phase — Phase 6 cleans it up. Statement uploads will write to BOTH the existing `transactions.wallet` string AND the new `Account` (matched by name), so the old tab keeps working unchanged.
- **Time zones** — all `valued_at` stored as UTC; display in user TZ (Asia/Jakarta).
- **Performance** — net worth trend over 5 years = ~1,800 daily snapshots. Materialized `daily_net_worth` table populated by the daily snapshot job (Phase 3); no aggregation at query time.
- **Existing tech debt to resolve along the way** — TypeScript strict mode (PF-052), ILogger usage (PF-051) — new module ships clean from day 1.

---

## Verification Plan (when each phase ships)

| Phase | How to verify |
|---|---|
| 1 | Upload a BCA statement → check that an `Account` "BCA" exists with a `Valuation` matching the statement's closing balance. Check `/assets/overview` shows net worth = sum of all account closing balances. |
| 2 | Add a real-estate asset manually; add a credit card liability. Net worth should reflect the delta. Edit a valuation, see it appear in history. |
| 3 | Add a holding (BBCA.JK, qty 100, cost 9000); manually set price to 10000. Investments tab shows P&L IDR 100,000. |
| 4 | Wait for the price-feed job; check `price_quotes` populated; check Holdings auto-update; trend chart shows daily points; allocation donut renders. |
| 5 | Add 12 months of holdings + cashflow; verify XIRR calculation against a spreadsheet; verify goal runway accuracy. |
| 6 | Upload a Stockbit PDF; verify Holdings + Valuations updated automatically. |
| 7 | Run a what-if scenario (pay off loan early); verify projected net worth path; export realized gains CSV. |

E2E coverage: extend `apps/frontend/e2e/` with `assets.spec.ts` per phase.

---

## Resolved Decisions (2026-05-15)

| Decision | Choice |
|---|---|
| v1 scope | **Full taxonomy, manual entry** — all 9 asset classes + liabilities ship in Phase 1 |
| Wallets reconciliation | **Defer** — `/cashflow/accounts` stays untouched; `/assets/*` built in parallel |
| Auth timing | **Ship now, retrofit later** — `user_id` columns from day 1, RLS flipped on in Phase 6 |
| Currency strategy | **IDR-equivalent with FX snapshot** — every Valuation stores native + IDR + rate at the valuation time |
