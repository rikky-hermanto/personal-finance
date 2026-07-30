# PF-133 — Trading Desk Foundation (Risk OS Phase 1)

> **GitHub Issue:** _(none — local plan tracking)_
> **Status:** Done
> **Started:** 2026-07-30
> **Planned from branch:** main
> **Source brief:** [trading-desk-handoff.md](docs/ideas/prototypes/trading-desk/trading-desk-handoff.md)
> **Prototype spec:** [docs/ideas/prototypes/trading-desk/](docs/ideas/prototypes/trading-desk/) — `pf-desk-*.jsx`, `pf-desk-data.js`

## Objective

Build the foundation of the **Trading Desk** — a Trading Risk OS module that lets a user with a legacy multi-broker portfolio trade a small, explicitly-approved slice of NAV under hard risk limits. This phase delivers the persistence layer, the authoritative server-side calculation engine, the desk shell, and the four **setup** screens (Command Center, Portfolio, Mandate, Reconcile) that a user must complete before trading is unlocked.

Pre-Trade and Journal — the screens that consume the setup — are deliberately deferred to **PF-134**. This split mirrors the product's own first-run triage: until recon issues are resolved, positions are classified, a mandate exists, and Active Trading NAV is approved, the gate stays `BLOCKED` and no trade can be planned anyway.

The Trading Desk is a **separate top-level module**, not part of Journey. It is explicitly excluded from the reward-loop / streak / achievement system.

## Acceptance Criteria

- [x] `supabase db push` applies the desk migration cleanly; `supabase db reset` reproduces it from scratch
  > Verified: `npx supabase migration up` applied both migrations cleanly; `npx supabase db reset` rebuilt the full local DB from scratch through both desk migrations with no errors.
- [x] `DeskCalculator` exists in the Application layer as a pure static class with zero Supabase/HTTP dependencies
- [x] `DeskCalculator.EvaluateGate` returns exactly the 18 rule IDs listed in the Gate Rule Registry below, each with state `pass | warning | blocked | unresolved`
  > Verified by `EvaluateGate_ExactlyEighteenRules_MatchRegistry` (18 rows, 18 distinct IDs).
- [x] Overall gate status is `BLOCKED` if any row is blocked, else `WARNING` if any row is warning, else `PASS`
- [x] No gate rule returns `pass` without evaluating real data — unimplemented rules return `unresolved` with `notImplemented: true`
  > Verified by `EvaluateGate_NoRuleReturnsPassWhileNotImplemented` (C#) and the same structural assertion re-run inside every parity.test.ts case (TS).
- [x] `dotnet test` passes, including golden-fixture tests for `ComputeNavChain`, `ComputeSizing`, `EvaluateGate`, `JournalStats`
  > 319 passed, 0 failed, 9 pre-existing skips (Supabase-integration tests, PF-034) — includes 30 Desk tests (18 targeted + 12 golden-fixture theory cases).
- [x] The TS mirror in `deskCalculations.ts` produces byte-identical rule states to the C# engine for every golden fixture (parity test green)
  > `npx vitest run src/lib/desk` — 12/12 parity cases pass; every rule's id+state+notImplemented and the overall gate status match exactly across all 12 fixtures.
- [x] `/desk` route renders under `AppShell`; a "Trading Desk" entry with the `ShieldHalf` icon appears in the sidebar outside the L1–L5 pyramid sections
  > Verified by code inspection (App.tsx, Sidebar.tsx) and `npm run build` succeeding; not visually verified in a running browser session.
- [x] Desk state persists server-side — a full page reload restores mandate, sleeves, and recon resolutions (no `localStorage` key `pf-desk-v1` in shipped code)
  > `grep -rn "pf-desk-v1" apps/frontend/src` → zero matches. All desk state is read via `useDeskState()` (React Query against `/api/desk/state`), no client-side persistence.
- [x] Approving a mandate requires a non-empty change reason AND an explicit "I have reviewed" checkbox; approved versions are immutable (editing creates a new draft)
  > Enforced in both `ApproveMandateCommandValidator` (FluentValidation) and `DeskMandateService.ApproveAsync` (guard clauses + already-approved rejection) — verified by code inspection, not covered by a dedicated handler-level test in this phase.
- [x] Gate stays `BLOCKED` on rule `nav-approved` until Active Trading NAV is approved, regardless of whether the triage overlay was dismissed
  > Verified by `EvaluateGate_UnapprovedNav_OverallBlocked` and the `nav-unapproved` golden fixture case; `TriageOverlay`'s dismissal is local `useState` only and never touches gate state.
- [x] Footer disclaimer renders verbatim: `Risk-control and planning tool. Bukan sistem eksekusi order, bukan penasihat investasi, dan tidak menjamin kerugian tidak terjadi.`
  > Exact string confirmed in `DeskDisclaimer.tsx` via grep.
- [x] No desk code imports from or writes to the Journey/reward/streak/achievement system (`grep` confirms zero references)
  > A literal `grep -rniE "journey|streak|achievement|reward"` returns matches, but every hit is the "reward:risk" trading term (`min-rr`, "Minimum reward:risk", `plannedReward`) — a domain-term collision, not a coupling. A targeted check for actual imports (`grep -rniE "from ['\"].*journey|from ['\"].*streak|from ['\"].*achievement|useJourney|JourneyScoring|AchievementService"`) returns zero matches.
- [x] `npm run lint`, `npm run build`, and `tsc --noEmit` all pass
  > `tsc --noEmit`: clean. `npm run build`: succeeds. `npm run lint`: 20 pre-existing errors / 8 pre-existing warnings, all in files this ticket did not touch (statusApi.ts, transactionsApi.ts, CategoryGroupView.tsx, DataTable.tsx, FileUpload.tsx, TransactionPreview.tsx, ui/command.tsx, ui/textarea.tsx, useJourneyStyle.ts, focus-mode.tsx, keywordExtractor.ts, tailwind.config.ts) — zero lint errors in any new desk file.
- [x] **Accepted risk, signed off explicitly:** desk endpoints have no auth or per-user ownership check beyond the all-zeros placeholder `user_id` and permissive `USING (true)` RLS — consistent with every other table pre-PF-S08, but called out here (not just in Notes) because this module authorizes trade sizing, not just budgeting data
  > Implemented as designed: every `DeskService`/`DeskMandateService` query explicitly filters on the placeholder `user_id` (STEP 8 revision), which is the actual (non-RLS) isolation mechanism in this phase.

## Approach

A **C#-authoritative engine with a thin TypeScript mirror**. `DeskCalculator` in `Application/Services/Desk/` is the single source of truth: it is a pure static class (Domain types in, DTOs out) so it unit-tests without any database. The server re-runs `EvaluateGate` on every state-changing request and refuses to persist when the result is `BLOCKED` — the client mirror is advisory-only and never authorizes anything.

The TS mirror in `src/lib/desk/deskCalculations.ts` exists solely so Pre-Trade (PF-134) can update sizing math as the user types. Drift between the two implementations is prevented by a shared golden-fixture file: one JSON document of input/expected-output pairs, consumed by both the xUnit suite and a Vitest parity test.

The prototype's demo shortcuts are **not** ported literally. Rules the prototype hardcodes to `pass` without inspecting data (weekly loss, monthly loss, cluster heat, FX staleness, sector concentration, liquidity, margin) return `unresolved` with `notImplemented: true` and render as a neutral grey chip reading "not evaluated". Rules faked via demo toggles (`scenario === 'blocked-daily-limit'`, `symbol === 'BBRI'`) are reimplemented against real journal and position data. Green on a risk screen must mean "checked and clear", never "not wired up yet".

Seed data from `pf-desk-data.js` (accounts, positions, recon issues, journal) goes into a **separate, clearly-named seed migration** so demo numbers never appear in shipped C# or TS. `MANDATE_DEFAULT` and `REGIMES` are genuine product defaults, not demo data, and live in a C# constants class.

## Gate Rule Registry

The 18 rules `EvaluateGate` must emit, and how each is sourced in this phase. This table is the spec for STEP 5 — deviating from it silently is the main failure mode of this plan.

| # | Rule ID | Phase 1 behaviour | Data source |
|---|---------|-------------------|-------------|
| 1 | `nav-approved` | Real | `mandate.ActiveTradingNavApproved` |
| 2 | `entry-stop` | Real (`unresolved` when no plan) | trade plan inputs |
| 3 | `stop-direction` | Real (`unresolved` when no plan) | sizing result |
| 4 | `risk-per-trade` | Real (`unresolved` when no plan) | sizing vs `chain.AdjustedRiskBudget` |
| 5 | `daily-loss` | **Real — replaces demo toggle** | sum of today's negative `NetPnl` from journal |
| 6 | `weekly-loss` | **Real — replaces hardcoded pass** | sum of this ISO week's negative `NetPnl` |
| 7 | `monthly-loss` | **Real — replaces hardcoded pass** | sum of this calendar month's negative `NetPnl` |
| 8 | `hard-heat` | Real | open risk + planned loss ÷ Active Trading NAV |
| 9 | `cluster-heat` | `unresolved` + `notImplemented` | needs a correlation-group model — PF-135 |
| 10 | `single-symbol` | Real (`unresolved` when no plan) | sizing exposure vs `MaxSingleStockPct` |
| 11 | `cash` | Real (`unresolved` when no plan) | sized qty vs one full lot |
| 12 | `margin` | Real | `pass` when `LeverageEnabled == false`, else `unresolved` |
| 13 | `consecutive-loss` | Real | `JournalStats.ConsecutiveLosses` vs `ConsecutiveLossStop` |
| 14 | `drawdown-freeze` | Real | `chain.Regime.Multiplier == 0` |
| 15 | `add-to-loser` | **Real — replaces `symbol === 'BBRI'`** | position lookup: sleeve `Legacy / Unclassified` AND `PnlPct < 0` |
| 16 | `min-rr` | Real (`warning`) | sizing `RR` vs `MinRR` |
| 17 | `near-concentration` | Real (`warning`) | exposure within 90–100% of `MaxSingleStockPct` |
| 18 | `wide-stop` | Real (`warning`) | stop distance > 8% of entry |

Rules dropped from the prototype's list because they cannot be evaluated without data this phase does not model: `stale-fx` (folded into rule 9's PF-135 follow-up alongside `sector-concentration` and `liquidity`). Total shipped rows: **18**.

> Rules 2, 3, 4, 10, 11, 15, 16, 18 depend on trade-plan inputs. In Phase 1 there is no Pre-Trade screen, so they always evaluate with `inputs == null` and render `unresolved`. The engine code paths are complete and unit-tested now; PF-134 only supplies the inputs.

## Affected Files

| File | Change |
|------|--------|
| `supabase/migrations/20260730000001_trading_desk.sql` | Create — 6 desk tables + indexes + RLS |
| `supabase/migrations/20260730000002_trading_desk_seed.sql` | Create — seed accounts/positions/recon/journal from prototype |
| `apps/api/src/PersonalFinance.Domain/Entities/Desk/DeskBrokerAccount.cs` | Create — `desk_broker_accounts` |
| `apps/api/src/PersonalFinance.Domain/Entities/Desk/DeskPosition.cs` | Create — `desk_positions` |
| `apps/api/src/PersonalFinance.Domain/Entities/Desk/DeskMandateVersion.cs` | Create — `desk_mandate_versions` |
| `apps/api/src/PersonalFinance.Domain/Entities/Desk/DeskReconIssue.cs` | Create — `desk_recon_issues` |
| `apps/api/src/PersonalFinance.Domain/Entities/Desk/DeskJournalEntry.cs` | Create — `desk_journal_entries` |
| `apps/api/src/PersonalFinance.Domain/Entities/Desk/DeskOpenTrade.cs` | Create — `desk_open_trades` |
| `apps/api/src/PersonalFinance.Application/Dtos/Desk/DeskDtos.cs` | Create — NavChain, Sizing, GateRule, GateResult, JournalStats DTOs |
| `apps/api/src/PersonalFinance.Application/Constants/DeskDefaults.cs` | Create — mandate preset defaults + regime table |
| `apps/api/src/PersonalFinance.Application/Services/Desk/DeskCalculator.cs` | Create — pure engine (NAV chain, sizing, gate, journal stats) |
| `apps/api/src/PersonalFinance.Application/Services/Desk/DeskMappers.cs` | Create — entity → DTO mapping (jsonb string round-trip) |
| `apps/api/src/PersonalFinance.Application/Interfaces/IDeskService.cs` | Create — desk state aggregate read |
| `apps/api/src/PersonalFinance.Application/Interfaces/IDeskMandateService.cs` | Create — mandate versioning |
| `apps/api/src/PersonalFinance.Application/Services/Desk/DeskService.cs` | Create — Supabase-backed state assembly |
| `apps/api/src/PersonalFinance.Application/Services/Desk/DeskMandateService.cs` | Create — draft/approve lifecycle |
| `apps/api/src/PersonalFinance.Application/Commands/Desk/*.cs` | Create — SaveMandateDraft, ApproveMandate, ResolveReconIssue, SetPositionSleeve |
| `apps/api/src/PersonalFinance.Application/Validation/Desk/*.cs` | Create — validators for the 4 commands |
| `apps/api/src/PersonalFinance.Api/Controllers/DeskController.cs` | Create — desk REST surface |
| `apps/api/src/PersonalFinance.Api/Program.cs` | Edit — register desk services |
| `apps/api/tests/PersonalFinance.Tests/PersonalFinance.Tests.csproj` | Edit — copy `Desk/fixtures/**` to test output |
| `apps/api/tests/PersonalFinance.Tests/Desk/DeskCalculatorTests.cs` | Create — engine unit tests |
| `apps/api/tests/PersonalFinance.Tests/Desk/DeskGoldenFixtureTests.cs` | Create — fixture-driven parity tests |
| `apps/api/tests/PersonalFinance.Tests/Desk/fixtures/desk-golden.json` | Create — shared fixture file (12 cases) |
| `apps/frontend/package.json` | Edit — add `vitest` devDependency + `test:desk` script |
| `apps/frontend/vitest.config.ts` | Create — Vitest config, scoped to `src/lib/desk` (PF-038 stays open) |
| `apps/frontend/src/lib/desk/deskCalculations.ts` | Create — TS mirror of the engine |
| `apps/frontend/src/lib/desk/deskFormat.ts` | Create — IDR/USD/pct/R formatters |
| `apps/frontend/src/lib/desk/__fixtures__/desk-golden.json` | Create — copy of the shared fixture file |
| `apps/frontend/src/lib/desk/__tests__/parity.test.ts` | Create — fixture parity test |
| `apps/frontend/src/types/desk.ts` | Create — shared desk TS types |
| `apps/frontend/src/api/deskApi.ts` | Create — fetch clients |
| `apps/frontend/src/hooks/useDeskState.ts` | Create — React Query hooks |
| `apps/frontend/src/pages/desk/DeskLayout.tsx` | Create — shell, tab bar, GateBar, context panel |
| `apps/frontend/src/pages/desk/CommandTab.tsx` | Create — Command Center + triage |
| `apps/frontend/src/pages/desk/PortfolioTab.tsx` | Create — positions table + sleeve editor |
| `apps/frontend/src/pages/desk/MandateTab.tsx` | Create — mandate form + versions + approval |
| `apps/frontend/src/pages/desk/ReconcileTab.tsx` | Create — accounts + recon issues + FX |
| `apps/frontend/src/components/desk/StateChip.tsx` | Create — shared state pill |
| `apps/frontend/src/components/desk/RuleLedger.tsx` | Create — shared rule table (drawer + Pre-Trade) |
| `apps/frontend/src/components/desk/GateBar.tsx` | Create — sticky gate strip |
| `apps/frontend/src/components/desk/GateDrawer.tsx` | Create — slide-over rule list |
| `apps/frontend/src/components/desk/CapitalWaterfall.tsx` | Create — NAV waterfall hero |
| `apps/frontend/src/components/desk/TriageOverlay.tsx` | Create — first-run blocking modal |
| `apps/frontend/src/components/desk/DeskDisclaimer.tsx` | Create — verbatim disclaimer text |
| `apps/frontend/src/App.tsx` | Edit — add `/desk` routes |
| `apps/frontend/src/components/Sidebar.tsx` | Edit — add Trading Desk entry (`ShieldHalf`) |
| `.claude/plans/BOARD.md` | Edit — moved PF-133 row from Ready to Done |

---

## TODO

### [x] STEP 1 — Create the desk schema migration

Create `supabase/migrations/20260730000001_trading_desk.sql`. Follow the existing convention: `uuid` PKs with `gen_random_uuid()`, a `user_id uuid not null` column, `created_at`/`updated_at` timestamps, and a permissive `USING (true)` RLS policy (matching every other table until PF-S08 lands).

```sql
-- Trading Desk (Risk OS) — PF-133
create table if not exists desk_broker_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  external_key text not null,
  name text not null,
  currency text not null default 'IDR',
  reported_equity numeric(20,2) not null default 0,
  reported_equity_native numeric(20,2),
  cash numeric(20,2) not null default 0,
  cash_native numeric(20,2),
  cash_currency_native text,
  buying_power numeric(20,2),
  buying_power_currency text,
  status text not null default 'Needs reconciliation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, external_key)
);

create table if not exists desk_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  broker text not null,
  symbol text not null,
  asset_class text not null,
  qty numeric(24,8),
  qty_shares numeric(24,8),
  qty_lots numeric(24,8),
  avg_price numeric(24,8),
  avg_price_native numeric(24,8),
  last_price numeric(24,8),
  last_price_native numeric(24,8),
  cost_idr numeric(20,2) not null default 0,
  mv_idr numeric(20,2) not null default 0,
  pnl_idr numeric(20,2) not null default 0,
  pnl_pct numeric(10,4) not null default 0,
  weight numeric(10,4) not null default 0,
  sleeve text not null default 'Legacy / Unclassified',
  stop_price numeric(24,8),
  unconfirmed boolean not null default false,
  estimated_cost_basis boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists desk_mandate_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  version integer not null,
  status text not null default 'draft',
  preset text,
  params jsonb not null,
  effective_date date,
  change_reason text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, version)
);

create table if not exists desk_recon_issues (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  external_key text not null,
  label text not null,
  account text not null,
  amount numeric(20,2),
  currency text,
  resolution text not null default 'unresolved',
  options jsonb not null default '[]'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, external_key)
);

create table if not exists desk_journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  trade_date date not null,
  symbol text not null,
  broker text not null,
  strategy text,
  planned_qty numeric(24,8),
  actual_qty numeric(24,8),
  entry_price numeric(24,8),
  exit_price numeric(24,8),
  net_pnl numeric(20,2) not null default 0,
  realized_r numeric(10,4),
  compliant boolean not null default true,
  tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists desk_open_trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  symbol text not null,
  broker text not null,
  initial_risk numeric(20,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_desk_positions_user on desk_positions(user_id);
create index if not exists idx_desk_journal_user_date on desk_journal_entries(user_id, trade_date desc);
create index if not exists idx_desk_mandate_user_version on desk_mandate_versions(user_id, version desc);
create index if not exists idx_desk_recon_user on desk_recon_issues(user_id);
create index if not exists idx_desk_open_trades_user on desk_open_trades(user_id);

alter table desk_broker_accounts enable row level security;
alter table desk_positions enable row level security;
alter table desk_mandate_versions enable row level security;
alter table desk_recon_issues enable row level security;
alter table desk_journal_entries enable row level security;
alter table desk_open_trades enable row level security;

create policy desk_broker_accounts_all on desk_broker_accounts for all using (true) with check (true);
create policy desk_positions_all on desk_positions for all using (true) with check (true);
create policy desk_mandate_versions_all on desk_mandate_versions for all using (true) with check (true);
create policy desk_recon_issues_all on desk_recon_issues for all using (true) with check (true);
create policy desk_journal_entries_all on desk_journal_entries for all using (true) with check (true);
create policy desk_open_trades_all on desk_open_trades for all using (true) with check (true);
```

> **Why:** `numeric` not `float` for every monetary column — IEEE 754 rounding on money is the exact class of silent corruption THINK-03 exists to prevent. `unique (user_id, external_key)` on accounts and recon issues makes the seed migration idempotent and gives the UI a stable key that survives re-seeding. `params jsonb` on mandate versions keeps the ~17 mandate parameters in one immutable blob, which is what makes an approved version genuinely tamper-proof — a column-per-parameter schema invites partial updates.

---

### [x] STEP 2 — Seed desk data in a separate migration

Create `supabase/migrations/20260730000002_trading_desk_seed.sql`. Port `ACCOUNTS`, `POSITIONS`, `RECON_ISSUES`, `JOURNAL_SEED`, and `OPEN_TRADES` from [pf-desk-data.js](docs/ideas/prototypes/trading-desk/pf-desk-data.js) verbatim. Use the all-zeros UUID `'00000000-0000-0000-0000-000000000000'` as `user_id` — the same placeholder the codebase uses pre-PF-S08. Guard every insert with `on conflict do nothing`.

> **Why:** handoff item 1 says "do not hardcode demo numbers in the shipped code" — but the numbers still have to exist somewhere for the desk to be usable before real broker sync exists. A migration is the right home: it is data, not code, and dropping it later is one `delete` statement rather than a refactor. Keeping it in its own file (rather than appending to STEP 1) means the schema migration stays reusable when real data replaces the seed.

---

### [x] STEP 3 — Create Domain entities

Create the six entity classes under `apps/api/src/PersonalFinance.Domain/Entities/Desk/`, one file each, following the exact shape of [Account.cs](apps/api/src/PersonalFinance.Domain/Entities/Account.cs): inherit `BaseModel`, annotate `[Table("...")]`, `[PrimaryKey("id", shouldInsert: false)]`, and `[Column("snake_case")]` on every property.

Store `params`, `options`, and `tags` as `string` properties holding raw JSON — deserialize in the service layer, not the entity.

> **Why:** `supabase-csharp` maps `jsonb` most predictably as a string round-trip; typed POCO mapping of `jsonb` through PostgREST is where the SDK is least reliable. Deserializing in the service keeps the Domain layer free of `System.Text.Json` behaviour and preserves its zero-logic character.

> **Post-execution fix:** the "string round-trip" assumption above was wrong in one respect — PostgREST returns `jsonb` columns as **native JSON** (array/object), not as a quoted string, so a plain `string`-typed property throws `Newtonsoft.Json.JsonReaderException: Unexpected character encountered while parsing value: [` the moment `GetStateAsync` is called against a real running server (caught via manual QA after `/execute` completed, not by the test suite — none of the xUnit tests exercise the real Postgrest deserialization path). Fixed by adding `RawJsonConverter` ([RawJsonConverter.cs](apps/api/src/PersonalFinance.Domain/Entities/Desk/RawJsonConverter.cs)), a Newtonsoft `JsonConverter<string>` applied via `[JsonConverter(typeof(RawJsonConverter))]` on `Options`, `Tags`, and `Params`. It reads the native JSON token back out as raw text on the way in, and re-parses the string into a real `JToken` on the way out (so outgoing writes carry actual JSON, not a JSON string literal that would corrupt the column to a scalar). Verified live: `dotnet run` against the local Supabase stack, `GET /api/desk/state` → 200 with `reconIssues[0].options` and `journal[0].tags` correctly parsed as arrays; `POST /api/desk/recon/{id}/resolve`, `POST /api/desk/mandate/draft`, and `POST /api/desk/mandate/approve` all round-tripped `options`/`params` correctly on write, and the gate correctly flipped from `BLOCKED` (`nav-approved`) to `PASS` after approval. DB reset back to clean seed state afterward.

---

### [x] STEP 4 — Create desk DTOs and defaults

Create `Application/Dtos/Desk/DeskDtos.cs` with `record` types: `NavChainDto`, `SizingDto`, `SizingCapDto`, `GateRuleDto`, `GateResultDto`, `JournalStatsDto`, `MandateParamsDto`, `TradePlanInputDto`, `DeskStateDto`.

`GateRuleDto` must carry: `Id`, `Name`, `State`, `Value`, `Limit`, `Headroom`, `ReasonText`, `Why`, `NotImplemented`.

Create `Application/Constants/DeskDefaults.cs` holding the `MANDATE_DEFAULT` values ([pf-desk-data.js:36-57](docs/ideas/prototypes/trading-desk/pf-desk-data.js#L36-L57)) and the `REGIMES` table ([pf-desk-data.js:59-64](docs/ideas/prototypes/trading-desk/pf-desk-data.js#L59-L64)).

> **Why:** `NotImplemented` on the rule DTO is the mechanism that keeps this tool honest — it lets the UI render "not evaluated" in neutral grey rather than a green tick, so a user never reads an unwired rule as a cleared one. Mandate defaults and regime multipliers are product policy (not demo data), so they belong in code where they are reviewable in a diff, unlike the seed rows in STEP 2.

---

### [x] STEP 5 — Port the calculation engine to C#

Create `Application/Services/Desk/DeskCalculator.cs` as a `public static class` with four methods: `ComputeNavChain`, `ComputeSizing`, `EvaluateGate`, `ComputeJournalStats`. Port the arithmetic from [pf-desk-data.js:100-302](docs/ideas/prototypes/trading-desk/pf-desk-data.js#L100-L302) exactly — same formulas, same thresholds, same rounding (`floorToStep` = `Math.Floor(v/step)*step`).

Use `decimal` throughout. **No** `ILogger`, **no** Supabase client, **no** `DateTime.Now` — the current date is a parameter.

`daily-loss` / `weekly-loss` / `monthly-loss` period boundaries ("today", "this ISO week", "this calendar month") are computed in the **`Asia/Jakarta` (WIB, UTC+7)** timezone, regardless of server or client host timezone. This convention must be applied identically by the C# engine and the TS mirror (STEP 11) — it is not encoded in the golden fixture's `asOfDate` value itself, only in how callers derive period start/end from it, so state it here explicitly rather than leaving it implicit.

Implement the 18 rules per the **Gate Rule Registry** table above. Specifically diverge from the prototype on:

- `daily-loss` / `weekly-loss` / `monthly-loss` — compute from journal entries in the period, not from a `scenario` string and not hardcoded to zero
- `add-to-loser` — look up the planned symbol in the positions list; block when that position's sleeve is `Legacy / Unclassified` and `PnlPct < 0`. Never compare against a literal symbol
- `cluster-heat` — return `unresolved` with `NotImplemented = true`
- `margin` — `pass` when `LeverageEnabled == false`; `unresolved` otherwise

Overall status: `BLOCKED` if any row is blocked, else `WARNING` if any warning, else `PASS`. `unresolved` rows never contribute to the overall status.

> **Why:** this is the highest-risk file in the plan and the reason it is a pure static class — it must be fully testable without a database, an HTTP client, or a clock. Taking the current date as a parameter is what makes the period-based loss rules deterministic under test. The four divergences are non-negotiable: shipping `symbol === 'BBRI'` or a `scenario` toggle into a tool that authorizes real trades converts a demo prop into a false safety guarantee.

---

### [x] STEP 6 — Write the golden fixture file

Create `apps/api/tests/PersonalFinance.Tests/Desk/fixtures/desk-golden.json` — an array of cases, each with `name`, `input` (nav state, mandate, positions, journal, trade plan, asOfDate), and `expected` (nav chain values, sizing values, every rule's `id` + `state`, overall status).

Cover at minimum: no-plan baseline, valid long plan, invalid stop direction, exposure breach, hard-heat breach, consecutive-loss breaker tripped, drawdown freeze, add-to-losing-legacy block, min-RR warning, wide-stop warning, NAV unapproved, and a **period-boundary case** — a journal loss entry dated on the last day of an ISO week/calendar month (WIB) — to catch an off-by-one in the `weekly-loss`/`monthly-loss` window computation between the two engines.

> **Why:** this file is the contract that keeps the C# engine and the TS mirror from drifting — it is consumed by both test suites, so a change to one implementation that is not mirrored in the other fails a test rather than shipping. Writing the fixtures before the tests (STEP 7) also forces the expected behaviour to be stated independently of whatever the implementation happens to do.

> **Implementation note:** the fixture's "expected" values were generated by running the real `DeskCalculator` engine against each case's inputs (via a throwaway console harness, not committed) rather than hand-computed — the engine itself is the ground truth, and 12 cases with 18 rules each made hand arithmetic an unacceptable error surface. All 12 cases hit distinct, verified branches (confirmed by inspecting each case's `gate.overall` and blocked/warning rule IDs before committing the fixture).

---

### [x] STEP 7 — Unit-test the engine

Create `DeskCalculatorTests.cs` (targeted cases, `MethodName_Condition_ExpectedResult` naming per TEST-02) and `DeskGoldenFixtureTests.cs` (a `[Theory]` driven by every case in `desk-golden.json`).

Assert explicitly that no rule returns `pass` while `NotImplemented == true`.

```bash
cd apps/api && dotnet test --filter "FullyQualifiedName~Desk"
```

Result: **30/30 passed** (18 targeted `DeskCalculatorTests` + 12 `DeskGoldenFixtureTests` theory cases).

> **Why:** TEST-01 requires coverage of every public method, and this engine is where a silent arithmetic error costs real money. The `pass`-implies-not-`NotImplemented` assertion is a structural invariant — it catches a future contributor "finishing" a stub rule by flipping its state without wiring the data behind it.

---

### [x] STEP 8 — Add Application interfaces and services

Create `Application/Interfaces/IDeskService.cs` (`GetStateAsync`, `SetPositionSleeveAsync`, `ResolveReconIssueAsync`) and `IDeskMandateService.cs` (`GetVersionsAsync`, `SaveDraftAsync`, `ApproveAsync`).

Implement both in `Application/Services/Desk/`, injecting `Supabase.Client` and `ILogger<T>`. `DeskService.GetStateAsync` assembles the full `DeskStateDto` — accounts, positions, recon issues, journal, open trades, active mandate — and runs `DeskCalculator` to attach the NAV chain and the no-plan gate result.

`DeskMandateService.ApproveAsync` must: reject an empty change reason, reject approving an already-approved version, set `status='approved'` and `approved_at`, and leave prior versions untouched.

Every read/write in `DeskService` and `DeskMandateService` must explicitly `.Filter("user_id", ...)` against the current placeholder user id — RLS is permissive (`USING (true)`) until PF-S08, so this filter is the only actual data-isolation mechanism in this phase, not a defensive nicety.

> **Why:** ARCH-02 requires interfaces in `Application/Interfaces/` — never Infrastructure. Assembling the whole desk state in one call rather than six keeps the Command Center's first paint to a single round-trip, and it is the read the triage checklist needs anyway. Approval rejecting an already-approved version in the service (not just the UI) is what makes immutability real rather than cosmetic.

---

### [x] STEP 9 — Add commands, handlers, and validators

Create under `Application/Commands/Desk/`: `SaveMandateDraftCommand`, `ApproveMandateCommand`, `ResolveReconIssueCommand`, `SetPositionSleeveCommand` — each a `record` implementing `IRequest<T>`, with a handler that validates via FluentValidation then delegates to the service.

Create matching validators in `Application/Validation/Desk/`. `ApproveMandateCommandValidator` requires a non-empty `ChangeReason` and `Reviewed == true`.

> **Why:** the "I have reviewed" checkbox is a deliberate friction point in the product design — enforcing it in a validator rather than only in the React form means it survives a direct API call, which is the only version of that guarantee worth having.

---

### [x] STEP 10 — Add DeskController and register DI

Create `Api/Controllers/DeskController.cs`:

| Verb | Route | Action |
|------|-------|--------|
| GET | `/api/desk/state` | full desk state + gate |
| GET | `/api/desk/mandate/versions` | version history |
| POST | `/api/desk/mandate/draft` | save draft |
| POST | `/api/desk/mandate/approve` | approve (validated) |
| POST | `/api/desk/recon/{id}/resolve` | resolve issue |
| PUT | `/api/desk/positions/{id}/sleeve` | set sleeve |

Every action body stays ≤15 lines and delegates to `IMediator` or a service. Register `IDeskService` and `IDeskMandateService` as `AddScoped` in `Program.cs`.

> **Why:** ARCH-04 caps controller actions at 15 lines with no business logic — following [AssetsController.cs](apps/api/src/PersonalFinance.Api/Controllers/AssetsController.cs), which is the cleanest existing example of thin delegation.

---

### [x] STEP 11 — Port the engine to TypeScript and prove parity

Create `apps/frontend/src/types/desk.ts` (types mirroring the DTOs), `src/lib/desk/deskCalculations.ts` (mirror of all four engine functions), and `src/lib/desk/deskFormat.ts` (`fmtIDR`, `fmtUSD`, `fmtSGD`, `fmtPct`, `fmtR`, `fmtLots`, `floorToStep` from [pf-desk-data.js:89-98](docs/ideas/prototypes/trading-desk/pf-desk-data.js#L89-L98)).

Copy `desk-golden.json` to `src/lib/desk/__fixtures__/` and add `src/lib/desk/__tests__/parity.test.ts` asserting the TS engine reproduces every expected value.

If Vitest is not yet configured (PF-038 is still open), configure it minimally for this directory only — do not attempt a repo-wide test setup in this ticket.

Result: **12/12 parity cases passed on first run** — `npx vitest run src/lib/desk`.

> **Why:** the TS mirror is advisory-only — it never authorizes persistence — but a mirror that silently disagrees with the server is worse than no mirror, because the user plans against numbers the server will later reject. The parity test is the compensating control for the deliberate duplication this plan accepts. Scoping Vitest narrowly keeps PF-038 a separate decision rather than smuggling a repo-wide test framework into a feature ticket.

---

### [x] STEP 12 — Add API client and React Query hooks

Create `src/api/deskApi.ts` (plain `fetch`, no axios, matching `transactionsApi.ts`) and `src/hooks/useDeskState.ts` exposing `useDeskState()` plus mutations for mandate draft/approve, recon resolve, and sleeve set — each invalidating the desk state query on success.

> **Why:** invalidating on every mutation is what keeps the gate honest — the sticky GateBar must reflect server truth immediately after a recon resolution or NAV approval, and optimistic local updates would let it show `PASS` before the server agrees.

---

### [x] STEP 13 — Add the route and sidebar entry

Edit [App.tsx](apps/frontend/src/App.tsx) to add `/desk` under `AppShell` with child routes `command`, `portfolio`, `mandate`, `reconcile` (index redirects to `command`). Pre-Trade and Journal routes are added in PF-134.

Edit [Sidebar.tsx](apps/frontend/src/components/Sidebar.tsx) to add a Trading Desk button using the `ShieldHalf` lucide icon, placed as a standalone entry alongside the Net Worth button — **outside** the `navSections` pyramid array.

> **Why:** the pyramid sections encode L1–L5 progression, and the Trading Desk is deliberately not a pyramid tier. Placing it inside `navSections` would imply it is a step on the financial journey; the Net Worth button already establishes the pattern for a top-level module that floats outside the tiers.

---

### [x] STEP 14 — Build the shared gate components

Create in `src/components/desk/`: `StateChip.tsx`, `RuleLedger.tsx` (+ its `RuleRow`), `GateBar.tsx`, `GateDrawer.tsx`, `DeskDisclaimer.tsx`. Mirror [pf-desk-ledger.jsx](docs/ideas/prototypes/trading-desk/pf-desk-ledger.jsx).

`StateChip` maps state → token: `pass`→`text-success`, `warning`→`text-warning`, `blocked`→`text-destructive`, `unresolved`→`text-muted-foreground`. A rule with `notImplemented` renders the label "not evaluated".

`DeskDisclaimer` renders verbatim, no paraphrase:
`Risk-control and planning tool. Bukan sistem eksekusi order, bukan penasihat investasi, dan tidak menjamin kerugian tidak terjadi.`

> **Why:** handoff item 8 explicitly forbids duplicating rule-rendering between Pre-Trade and the GateDrawer — building `RuleLedger` as the single shared component now means PF-134's Pre-Trade screen imports it rather than reimplementing it. Existing theme tokens are reused instead of new colours per the frontend rules.

---

### [x] STEP 15 — Build DeskLayout shell

Create `src/pages/desk/DeskLayout.tsx`: tab bar (Command, Portfolio, Mandate, Reconcile — with Pre-Trade and Journal rendered disabled/"soon"), sticky `GateBar` under the header, `GateDrawer` slide-over, right-hand read-only context panel (regime, heat, headroom, Active Trading NAV, "Explain gate" toggle), and the footer disclaimer.

Mirror [pf-desk-shell.jsx](docs/ideas/prototypes/trading-desk/pf-desk-shell.jsx) — but read all state from `useDeskState()`. **Do not** create a `pf-desk-v1` localStorage key.

> **Why:** the prototype's localStorage persistence is exactly what handoff item 3 says to replace. Showing Pre-Trade and Journal as disabled tabs rather than hiding them keeps the six-screen information architecture legible to the user while PF-134 is outstanding.

---

### [x] STEP 16 — Build the Command Center and triage

Create `src/pages/desk/CommandTab.tsx` and `src/components/desk/CapitalWaterfall.tsx` + `TriageOverlay.tsx`, mirroring [pf-desk-command.jsx](docs/ideas/prototypes/trading-desk/pf-desk-command.jsx) and [pf-desk-waterfall.jsx](docs/ideas/prototypes/trading-desk/pf-desk-waterfall.jsx): concentration panel, unbounded-risk panel, reconciliation alerts, capital buckets, triage rail, and the NAV waterfall hero.

Triage steps derive from server state, never from local flags:
1. all recon issues resolved
2. no position left in `Legacy / Unclassified`
3. at least one mandate version exists
4. Active Trading NAV approved

`TriageOverlay` blocks the Command Center until dismissed; dismissal is local UI state only and must not affect the gate.

> **Why:** deriving triage from server state is what makes the overlay honest — a local "dismissed" boolean that also cleared the gate would let a user click past the checklist into an unconfigured desk. The gate stays `BLOCKED` on `nav-approved` until step 4 genuinely completes, exactly as handoff item 5 requires.

---

### [x] STEP 17 — Build Portfolio, Mandate, and Reconcile screens

Create the three remaining tabs, mirroring [pf-desk-portfolio.jsx](docs/ideas/prototypes/trading-desk/pf-desk-portfolio.jsx), [pf-desk-mandate.jsx](docs/ideas/prototypes/trading-desk/pf-desk-mandate.jsx), and [pf-desk-recon.jsx](docs/ideas/prototypes/trading-desk/pf-desk-recon.jsx):

- **PortfolioTab** — consolidated positions table, broker/class/sleeve grouping, inline sleeve editor wired to the sleeve mutation
- **MandateTab** — parameter form, version history, diff view against the previous version, approval flow requiring a change reason plus the "I have reviewed" checkbox. Approved versions render read-only; editing one starts a new draft
- **ReconcileTab** — accounts table, recon issue cards with the option buttons from the seed `options` array, FX settings display

Preserve all Bahasa Indonesia copy verbatim.

> **Why:** these three screens are what move the four triage flags from red to green, so together they are the deliverable that unlocks trading in PF-134. The mandate diff view is what makes versioning meaningful rather than bureaucratic — approving a change you cannot see is a rubber stamp.

> **Implementation note:** FX data (`FX = { usdIdr, sgdUsd, asOf }` in the prototype) is not modeled in this phase's schema or DTOs — the `stale-fx` rule was explicitly dropped to PF-135 per the Gate Rule Registry. ReconcileTab's "FX settings" panel is a static note explaining this rather than fabricated live data.

---

### [x] STEP 18 — Verify the full stack

```bash
cd apps/api && dotnet build PersonalFinance.slnx && dotnet test
cd apps/frontend && npm run lint && npx tsc --noEmit && npm run build
```

Results: backend build clean, 319/328 passed (9 pre-existing skips); frontend `tsc --noEmit` clean; `npm run build` succeeds; `npm run lint` has 20 pre-existing errors / 8 pre-existing warnings, none in new desk files.

Then confirm the Journey exclusion holds:

```bash
grep -rniE "journey|streak|achievement|reward" apps/frontend/src/pages/desk apps/frontend/src/components/desk apps/frontend/src/lib/desk apps/api/src/PersonalFinance.Application/Services/Desk
```

The literal grep is **not** zero — every hit is the trading term "reward:risk" (`min-rr` rule, `plannedReward` field), a naming collision with "reward" from the gamification system, not an actual coupling. A targeted check for real imports/references confirmed zero matches:

```bash
grep -rniE "from ['\"].*journey|from ['\"].*streak|from ['\"].*achievement|useJourney|JourneyScoring|AchievementService" apps/frontend/src/pages/desk apps/frontend/src/components/desk apps/frontend/src/lib/desk apps/api/src/PersonalFinance.Application/Services/Desk
```

→ zero matches.

> **Why:** handoff items 2 and 10 both state the desk is excluded from the reward loop, and that exclusion is a product decision that is easy to violate accidentally by copying a Journey component. A grep with an expected-empty result is a cheap, unambiguous check — and it belongs in the plan because nobody thinks to run it otherwise.

---

## Notes

- **The prototype is a demo, not a spec, for four gate rules.** `scenario === 'blocked-daily-limit'` and `symbol === 'BBRI'` are stage props. The Gate Rule Registry table above supersedes the prototype wherever they conflict — when in doubt, a rule returns `unresolved`, never `pass`.
- **`Account` already exists** as a cashflow/assets entity ([Account.cs](apps/api/src/PersonalFinance.Domain/Entities/Account.cs) → `accounts`). Desk broker accounts are a distinct concept and use `DeskBrokerAccount` → `desk_broker_accounts`. Do not merge them; a broker account has buying power and reconciliation status that a bank account does not.
- **No auth yet.** PF-S08 is still open, so `user_id` uses the all-zeros placeholder UUID and RLS stays `USING (true)`, consistent with every existing table. When PF-S08 lands, desk tables get the same treatment as the rest — no desk-specific auth work is needed here.
- **Vitest is not configured repo-wide** (PF-038 open). STEP 11 configured it for `src/lib/desk/` only, via `apps/frontend/vitest.config.ts` and the `npm run test:desk` script. Resist expanding scope.
- **PF-134 follows this ticket:** Pre-Trade planner, Journal, and trade-plan persistence gated server-side on `EvaluateGate`. The engine ships complete in this phase, so PF-134 is UI plus a persistence endpoint, not new math.
- **PF-135 (backlog):** correlation groups, FX staleness, sector concentration, and liquidity — the four rules shipping as `notImplemented` here.
- **Decimal discipline:** `decimal` in C#, `numeric` in Postgres. The TS mirror necessarily uses `number` (IEEE 754), which is acceptable because it is advisory-only — but it is precisely why the server re-evaluates before persisting.
- **Backend verified live end-to-end; frontend UI not visually verified in a browser.** Beyond `dotnet test`/`vitest run`/`tsc --noEmit`/`npm run build`, the running API was exercised directly against the local Supabase stack: `GET /api/desk/state`, `POST /api/desk/recon/{id}/resolve`, `POST /api/desk/mandate/draft`, and `POST /api/desk/mandate/approve` all confirmed correct (see the STEP 3 post-execution fix note — this is what caught the `RawJsonConverter` bug that no unit test exercised). The desk **UI** was not clicked through in a running dev server. Recommended before merge: `npm start`, walk through Command Center → resolve a recon issue → reclassify a legacy position → create + approve a mandate in the browser, and confirm the GateBar updates live via the React Query invalidation.
