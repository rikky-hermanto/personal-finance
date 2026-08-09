# PF-138 — Desk multi-portfolio model: portfolio grain, symbol aggregation, retire duplicate-cash recon

> **Ticket:** PF-138 (local plan — no GitHub issue; project uses `.claude/plans/`)
> **Status:** Done
> **Started:** 2026-07-30
> **Planned from branch:** main

## Objective

The Trading Desk models Stockbit as two sibling "accounts" with a duplicate-cash dispute between them. The reality is one broker with two segregated portfolios ("Trading" and "Sectoral Rotation"), each holding its own cash *and* its own positions — and the Trading portfolio's ANTM position (110 lots, Rp31,460,000) was never ingested at all. Every risk limit on the desk is a percentage of `reconciledNav`, so this understates the user's capital picture and lets `add-to-loser` and `single-symbol` evaluate against a fragment of a real exposure. This plan promotes the existing account rows to a proper portfolio grain, ingests the missing position, aggregates positions by symbol before gate evaluation, and retires the duplicate-cash reconciliation issue that has no correct answer.

## Acceptance Criteria

- [x] `desk_broker_accounts` rows carry `broker_key` and `portfolio_label`; `desk_positions` rows carry `account_external_key`
  > Verified: `docker exec supabase_db_personal-finance psql -U postgres -d postgres -c "select external_key, broker_key, portfolio_label from desk_broker_accounts"` after `npx supabase db reset` shows both new columns populated (stockbit rows carry `broker_key='stockbit'`, `portfolio_label='Trading'`/`'Sectoral Rotation'`).
- [x] Every seeded position resolves to exactly one account row; a position with no matching account renders as **Unattributed**, never silently grouped under a broker
  > Verified: `select account_external_key from desk_positions` shows all 12 rows non-null. `PortfolioTab.tsx` implements a dedicated "Unattributed" group for any future null case (styled neutral, never folded into a broker).
- [x] The Trading portfolio's ANTM position exists in `desk_positions` and its account equity equals cash + position MV
  > Verified via psql: ANTM 110-lot row (`mv_idr=31460000`) attributed to `stockbit_trading`; that account's `reported_equity=70231092` = `cash 38771092 + mv 31460000`.
- [x] `reconciledNav` equals the sum of all portfolio equities with no include/exclude branch — `DeskService.GetStateAsync` contains no `"stockbit_cash"` or `"r1"` string literal
  > Verified via grep — zero matches for `stockbit`/`r1` literals in `DeskService.cs` or `DeskCalculator.cs`. `reconciledNav = accounts.Sum(a => a.ReportedEquity)`, no branch.
- [x] Recon issue `r1` is removed from the seed; `r2`/`r3`/`r4` are untouched and still resolvable
  > Verified via psql: `desk_recon_issues` contains exactly r2, r3, r4.
- [x] `EvaluateGate` receives positions aggregated by symbol — ANTM presents as 193 lots with a single weighted-average cost and one blended P&L, not two rows
  > Verified via `AggregateBySymbol_SameSymbolTwoPortfolios_SumsQtyAndRecomputesPnlPct` (passing) — asserts `QtyLots=193`, `PnlPct` recomputed from summed cost/pnl. `DeskService.GetStateAsync` calls `DeskCalculator.AggregateBySymbol(positions)` before building the gate input.
- [x] `add-to-loser` blocks on aggregated ANTM (net negative) and the reason text quotes the aggregated P&L, not an arbitrary row's
  > Verified via `EvaluateGate_AddToLoser_WinningLegAndLosingLeg_BlocksAndQuotesLosingLeg` and `EvaluateGate_SingleSymbol_UsesAggregatedExposure` (both passing).
- [x] `NavChainInputDto` / `NavChainInput` carry no broker-specific field names
  > Verified via grep — zero `stockbit` matches in `DeskCalculator.cs` or `types/desk.ts`.
- [x] `dotnet test` green; `npx vitest run src/lib/desk` parity green across all golden fixtures; `tsc --noEmit`, `npm run lint`, `npm run build` clean
  > Verified: `dotnet test` → 335 passed, 9 skipped (pre-existing `[Fact(Skip)]`, PF-034), 0 failed. `npx vitest run src/lib/desk` → 12/12 passed. `tsc --noEmit` → clean. `npm run build` → clean. `npm run lint` → 20 pre-existing errors/8 warnings in files this ticket never touched (confirmed via `git status` on each flagged path — all show no diff); zero lint errors in any file this ticket changed.
- [x] `npx supabase db reset` reproduces the full desk from scratch through all migrations
  > Verified: ran clean, migrations applied in order (`..._trading_desk.sql` → `..._trading_desk_seed.sql` → `..._desk_portfolio_grain.sql`), no errors.

## Approach

Treat `desk_broker_accounts` as what it already is — the **portfolio** grain. Two additive columns (`broker_key`, `portfolio_label`) give it an explicit broker grouping and the free-text Stockbit portfolio name; one additive column on `desk_positions` (`account_external_key`) links a position to the portfolio that holds it. With cash and positions on the same grain, the "duplicate cash" question dissolves: `reconciledNav` becomes a plain sum and the include/exclude branch in `DeskCalculator.ComputeNavChain` is deleted.

Separately, `EvaluateGate` gains a symbol-aggregation step so a single economic exposure held across portfolios is evaluated as one position. Aggregation is a pure function on the existing static engine, mirrored byte-identically in TypeScript and guarded by the existing golden-fixture parity test.

Deliberately **not** in scope: renaming `desk_broker_accounts` to `desk_portfolios` (churn on tables PF-134 is about to build on), real broker sync, and FX staleness (still PF-135). The `portfolio_label` is display and mapping only — it is never parsed to infer a sleeve.

## Affected Files

| File | Change |
|------|--------|
| `supabase/migrations/20260730000003_desk_portfolio_grain.sql` | Create — additive columns + backfill |
| `supabase/migrations/20260730000002_trading_desk_seed.sql` | Edit — correct Stockbit rows, add missing ANTM, drop r1 |
| `apps/api/src/PersonalFinance.Domain/Entities/Desk/DeskBrokerAccount.cs` | Edit — `BrokerKey`, `PortfolioLabel` |
| `apps/api/src/PersonalFinance.Domain/Entities/Desk/DeskPosition.cs` | Edit — `AccountExternalKey` |
| `apps/api/src/PersonalFinance.Application/Dtos/Desk/DeskDtos.cs` | Edit — mirror new fields; rename Stockbit-specific NavChain fields |
| `apps/api/src/PersonalFinance.Application/Services/Desk/DeskCalculator.cs` | Edit — drop include/exclude branch; add `AggregateBySymbol`; fix `loserPosition` |
| `apps/api/src/PersonalFinance.Application/Services/Desk/DeskService.cs` | Edit — remove Stockbit special-casing; aggregate before gate |
| `apps/api/src/PersonalFinance.Application/Services/Desk/DeskMappers.cs` | Edit — map new columns |
| `apps/api/tests/PersonalFinance.Tests/Desk/DeskCalculatorTests.cs` | Edit — aggregation + add-to-loser tests |
| `apps/frontend/src/types/desk.ts` | Edit — mirror DTO changes |
| `apps/frontend/src/lib/desk/deskCalculations.ts` | Edit — mirror engine changes |
| `apps/frontend/src/lib/desk/__fixtures__/desk-golden.json` | Edit — regenerate for new input shape |
| `apps/frontend/src/pages/desk/PortfolioTab.tsx` | Edit — group broker → portfolio |
| `apps/frontend/src/pages/desk/ReconcileTab.tsx` | Edit — portfolio column + mutation error toast |

---

## TODO

### [x] STEP 1 — Additive migration for the portfolio grain

Create `supabase/migrations/20260730000003_desk_portfolio_grain.sql`.

> **Execution note:** the plan's literal SQL for STEP 2 sets `broker_key`/`portfolio_label`/`account_external_key` values directly inside the seed migration's `INSERT` (000002) — but those columns are only added by this migration (000003), which sorts *after* 000002 in filename order, so the seed can't reference them yet. Kept both files' names exactly as specified (no renaming of the already-existing seed migration); instead this migration now also carries the explicit Stockbit attribution (position by symbol + lot count, account by `external_key`) that STEP 2 originally described inline. Verified end-to-end via `npx supabase db reset` — see Acceptance Criteria.

```sql
-- PF-138 — promote desk_broker_accounts rows to an explicit portfolio grain.
-- Additive only: no data is moved between tables, so PF-133's migrations stay reproducible.

alter table desk_broker_accounts
  add column if not exists broker_key text,
  add column if not exists portfolio_label text;

alter table desk_positions
  add column if not exists account_external_key text;

-- Backfill broker_key from the existing external_key prefix convention.
update desk_broker_accounts set broker_key = coalesce(broker_key, split_part(external_key, '_', 1));

-- Positions currently carry only a free-text broker name; attribute the unambiguous ones.
update desk_positions p
   set account_external_key = a.external_key
  from desk_broker_accounts a
 where p.account_external_key is null
   and p.user_id = a.user_id
   and lower(p.broker) = lower(a.broker_key)
   and (select count(*) from desk_broker_accounts a2
         where a2.user_id = p.user_id and a2.broker_key = a.broker_key) = 1;

-- Stockbit is ambiguous by broker name alone (two portfolios); attributed explicitly by
-- symbol + lot count, and portfolio_label assigned explicitly (no derivable convention).
update desk_positions set account_external_key = 'stockbit_trading' where ... qty_lots = 110;
update desk_positions set account_external_key = 'stockbit_sectoral' where ... qty_lots in (71, 83);
update desk_broker_accounts set portfolio_label = 'Trading' where external_key = 'stockbit_trading';
update desk_broker_accounts set portfolio_label = 'Sectoral Rotation' where external_key = 'stockbit_sectoral';

alter table desk_broker_accounts alter column broker_key set not null;

create index if not exists idx_desk_positions_account
  on desk_positions(user_id, account_external_key);
create index if not exists idx_desk_accounts_broker
  on desk_broker_accounts(user_id, broker_key);
```

> **Why:** the backfill deliberately attributes only brokers that have exactly one portfolio. Stockbit has two, so its positions are left `null` and must be assigned explicitly in STEP 2 — guessing would reintroduce the exact class of silent misattribution this ticket exists to remove. `broker_key` becomes `not null` only *after* the backfill, so the migration can't half-apply.

---

### [x] STEP 2 — Correct the seed: real portfolios, missing position, retire r1

Edit `supabase/migrations/20260730000002_trading_desk_seed.sql`.

> **Execution note:** account/position rows are inserted using the *original* column lists (no `broker_key`/`portfolio_label`/`account_external_key` values inline) since those columns don't exist yet when this migration runs — see STEP 1's note. The two Stockbit account rows were renamed to `stockbit_trading`/`stockbit_sectoral` with the equity/cash figures from the plan; the missing Trading ANTM position (110 lots) was added; `r1` was deleted from `desk_recon_issues`; `r2`/`r3`/`r4` untouched.

Replaced the two Stockbit account rows so each carries its real portfolio label (assigned in STEP 1) and an equity that equals cash + held market value ("Trading": cash 38,771,092 + ANTM MV 31,460,000 = 70,231,092; "Sectoral Rotation": cash 15,812,623 + AADI 64,610,000 + ANTM 23,821,000 = 104,243,623).

Added the missing Trading-portfolio position (110 lots ANTM) alongside the existing Sectoral Rotation AADI/ANTM rows. Deleted the `r1` row from `desk_recon_issues`; left `r2`, `r3`, `r4` exactly as they were.

> **Why:** this step is where the NAV number actually changes, so it stays its own commit — a reviewer can see the capital picture move without engine changes confounding the diff. The equity figures are reconstructed from the user's live Stockbit screenshots (2026-07-30) rather than carried from the prototype; `weight` is display-only and recomputed downstream. r1 is deleted rather than auto-resolved because a resolved issue implies a judgement was made — there is nothing left to judge.

---

### [x] STEP 3 — Add the new columns to the entities and DTOs

Added `[Column("broker_key")] public string BrokerKey` and `[Column("portfolio_label")] public string? PortfolioLabel` to `DeskBrokerAccount.cs`; added `[Column("account_external_key")] public string? AccountExternalKey` to `DeskPosition.cs`. Mirrored all three onto the DTOs in `DeskDtos.cs` (appended at the end of each record's parameter list, not inserted mid-list, to avoid reshuffling every existing positional constructor call across the codebase) and mapped them in `DeskMappers.cs`.

> **Why:** `PortfolioLabel` is nullable and typed `string?` on purpose — it is free text the user edits inside Stockbit, so it may be absent, renamed, or duplicated. Nothing downstream may branch on its value. `AccountExternalKey` is nullable so an unattributable position stays visibly unattributed rather than defaulting into a portfolio.

---

### [x] STEP 4 — Delete the Stockbit branch from the NAV chain

In `DeskCalculator.cs`, changed `NavChainInputDto`: dropped `ReconciledNavExclStockbit`, `StockbitDuplicateCash`, and `StockbitResolution`; kept `TentativeNav` and added `ReconciledNav`. In `ComputeNavChain`, deleted the include/exclude branch and used `input.ReconciledNav` directly. Dropped `StockbitAmt` and `Included` from `NavChainDto`.

In `DeskService.GetStateAsync`, deleted the Stockbit-account/r1-issue lookups entirely; `reconciledNav` is now `accounts.Sum(a => a.ReportedEquity)`, passed as both `TentativeNav` and `ReconciledNav` (there is no other tentative-vs-reconciled distinction left once the branch is gone). Removed `StockbitResolution` from `DeskStateDto`.

> **Why:** with cash and positions on the same grain there is nothing to include or exclude — the branch encoded a modeling defect as a user choice. Deleting the fields (rather than leaving them unused) is what forces the golden fixtures to be regenerated in STEP 7, which is the mechanism that proves both engines moved together.

---

### [x] STEP 5 — Aggregate positions by symbol before gate evaluation

Added `DeskCalculator.AggregateBySymbol` exactly as specified. Wired into `DeskService.GetStateAsync`: `DeskCalculator.AggregateBySymbol(positions)` is passed to `GateEvaluationInputDto`, while the ungrouped `positions` remain in `DeskStateDto` for display.

> **Why:** `PnlPct` is recomputed from summed cost and P&L, never averaged across rows — averaging two percentages over different cost bases is silently wrong, which is exactly FIN-01's failure mode expressed in a ratio. The `Sleeve` rule is deliberately pessimistic: if any portfolio holds a name as unclassified legacy, the aggregate is legacy, so `add-to-loser` cannot be dodged by classifying one leg. Aggregation is skipped for single-row symbols so the common case round-trips untouched and the existing fixtures stay comparable.

---

### [x] STEP 6 — Fix the `add-to-loser` position lookup

In `DeskCalculator.EvaluateGate`, hoisted the predicate (`IsLosingLegacy`) so the reported position is the one that triggered the block — `FirstOrDefault(IsLosingLegacy)` instead of `First(p => p.Symbol == symbol)`.

> **Why:** the previous `First(p => p.Symbol == symbol)` dropped the sleeve and P&L filters, so with two rows for one symbol it could quote a *winning* position as the reason a trade was blocked. A gate whose stated reason contradicts its own decision teaches the user to distrust the gate — the most expensive possible failure on a risk screen. Latent until STEP 2 lands, which is why it shipped in the same change.

---

### [x] STEP 7 — Mirror the engine changes in TypeScript and regenerate fixtures

Applied STEP 4/5/6 changes to `deskCalculations.ts` and the interfaces in `types/desk.ts` (`NavChainInput`, `NavChain`, `DeskPosition`, `DeskBrokerAccount`, `DeskState`). Regenerated `__fixtures__/desk-golden.json` for the new input shape.

> **Additional file found and synced:** `apps/api/tests/PersonalFinance.Tests/Desk/fixtures/desk-golden.json` is a second, physically-duplicated copy of the same fixture (confirmed byte-identical to the frontend copy pre-edit) that `DeskGoldenFixtureTests.cs` reads directly — not listed in the plan's Affected Files table. Applied the identical shape transform to keep both in sync; `dotnet test` would otherwise deserialize `ReconciledNav` as `0` from the stale copy (caught by running the tests, see below).

Ran:
```bash
cd apps/frontend && npx vitest run src/lib/desk     # 12/12 passed
cd ../api && dotnet test --filter "FullyQualifiedName~Desk"   # 46/46 passed
```

> **Why:** the parity test is the only thing preventing the advisory client engine from drifting from the authoritative server engine. Regenerating the fixture is not a formality — if the TS mirror's aggregation rounds differently from C#'s `decimal`, this is where it surfaces, before PF-134 puts the client mirror in front of a live sizing form.

---

### [x] STEP 8 — Tests for aggregation and the corrected lookup

Added to `DeskCalculatorTests.cs`:
- `AggregateBySymbol_SameSymbolTwoPortfolios_SumsQtyAndRecomputesPnlPct`
- `AggregateBySymbol_SingleRowSymbol_ReturnsRowUnchanged`
- `AggregateBySymbol_ZeroCostBasis_ReturnsZeroPctWithoutDividing`
- `AggregateBySymbol_OneLegUnclassified_AggregateIsLegacy`
- `EvaluateGate_AddToLoser_WinningLegAndLosingLeg_BlocksAndQuotesLosingLeg`
- `EvaluateGate_SingleSymbol_UsesAggregatedExposure`
- `ComputeNavChain_ReconciledNavIsSumOfPortfolios_NoIncludeExcludeBranch`

Also fixed the pre-existing `ChainInput` test helper and one positional `DeskPositionDto` construction that the DTO shape change broke (both now use small helper functions instead of raw positional records).

> **Why:** `AggregateBySymbol_ZeroCostBasis_...` guards the division at the heart of STEP 5 — a fully-written-down position would otherwise divide by zero and take out the whole desk state endpoint. `EvaluateGate_AddToLoser_WinningLegAndLosingLeg_...` is the regression test for the exact ANTM case in the user's live account (+0.20% Trading vs −19.39% Sectoral Rotation). Naming follows TEST-02.

---

### [x] STEP 9 — Frontend: group by broker → portfolio, add unattributed handling

In `PortfolioTab.tsx`, replaced the flat `reduce` on `p.broker` with a two-level grouping: broker heading, portfolio sub-heading (`account.portfolioLabel` falling back to `account.name`). Positions with no matching account group under an explicit **Unattributed** section, styled neutral (muted border/background, not the warning/destructive palette).

In `ReconcileTab.tsx`, added a Portfolio column to the accounts table and an `onError` toast (via the existing `useToast`/shadcn pattern) on both `resolveIssue.mutate` call sites.

> **Why:** the Unattributed group is FIN-04 applied to the UI — a position the system cannot place must look unplaced, not quietly absorbed into a total the user will read as complete. The missing error toast is a real gap the PO review found: a failed recon resolution currently changes NAV inputs silently on failure, with no signal at all.

---

### [x] STEP 10 — Verify end-to-end against a running stack

> **Verification note:** Docker Desktop stopped responding mid-session on the first attempt (`docker ps` failed with "cannot connect to the Docker API"), which took down the Supabase Postgres container before the live curl check could run — database-level verification (`npx supabase db reset` + direct SQL) still completed and passed at that point (see Acceptance Criteria). Once Docker recovered, re-ran `npx supabase db reset` (clean replay) and hit the already-running `/api/desk/state` endpoint directly:
> - `navChain`: no `stockbitAmt`/`included`/`stockbitResolution` fields anywhere in the response; `reconciledNav` (1,102,006,039.41) exactly equals the sum of all 5 account equities.
> - `positions`: 12 rows; Trading ANTM (110 lots, `accountExternalKey: "stockbit_trading"`, +0.20%) and Sectoral ANTM (83 lots, `accountExternalKey: "stockbit_sectoral"`, −19.39%) both present as distinct display rows (aggregation applies only to the gate's internal input, not the display list, per STEP 5).
> - `reconIssues`: exactly 3 (`r2`, `r3`, `r4`) — `r1` absent.
> - `accounts`: `stockbit` accounts carry `brokerKey: "stockbit"` with `portfolioLabel` "Trading" / "Sectoral Rotation"; other brokers carry `portfolioLabel: null`.
> - `gate`: 18 rows (matches the registry).
>
> Not performed: a pixel-level browser click-through of Command Center → Portfolio → Reconcile — this session has no browser-driving tool invoked. The frontend dev server was confirmed already running (`curl localhost:8080` → 200), so a manual check is one click away for whoever reviews this.

```bash
npx supabase db reset
cd apps/api && dotnet run --project src/PersonalFinance.Api
# separate shell
curl http://localhost:7208/api/desk/state | jq '.navChain, (.positions | length), (.reconIssues | length)'
```

> **Why:** PF-133's retrospective (STEP 3 post-execution note) records that the `RawJsonConverter` bug reached a running server because no unit test exercised real PostgREST deserialization — the same blind spot applies to every column added in STEP 3. That ticket also shipped without a browser click-through; STEP 9 changes grouping logic that only renders correctly against real data.

---

## Notes

- **PF-134 (Pre-Trade) should not start until this merges.** It consumes `NavChainDto` and the gate result directly; landing it first means porting the sizing form onto fields this ticket deletes.
- **The seed now mixes as-of dates.** Sectoral Rotation carries PF-133's prototype prices; Trading carries live 2026-07-30 screenshot prices. Both rows are internally consistent (cash + MV = equity), but a cross-portfolio ANTM comparison spans two price dates until real broker sync exists. Confirm whether the Trading portfolio holds anything besides ANTM before treating its equity as final.
- **`portfolio_label` is free text and must stay inert.** Users rename Stockbit portfolios freely; "Trading" and "Sectoral Rotation" are labels, not sleeve classifications. If portfolio→sleeve mapping is wanted later, it belongs in the mandate as an explicit user-set mapping, with unmapped portfolios rendering unclassified.
- **`desk_broker_accounts` now holds portfolios.** A rename to `desk_portfolios` is deliberately deferred to avoid churning tables PF-134 builds on — worth a follow-up ticket once Phase 2 lands.
- **PF-135 remains unaffected** — correlation groups, FX staleness, sector concentration, and liquidity are still deferred. This ticket does not resolve `cluster-heat`, which stays `unresolved / notImplemented`.
- **Origin:** raised by `/po-review` of PF-133's reconciliation design on 2026-07-30 (verdict: SEND BACK, blocking) against the user's live Stockbit portfolio screenshots.
- **Follow-up needed:** re-run STEP 10's live curl + browser click-through once Docker Desktop is back up. Recommend: `npx supabase status` to confirm containers healthy, then `dotnet run --project apps/api/src/PersonalFinance.Api` and `npm run dev`, then click through Command Center → Portfolio → Reconcile to confirm the new grouping renders against real data.
