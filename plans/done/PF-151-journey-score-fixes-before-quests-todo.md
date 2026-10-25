---
id: PF-151
size: L
flags: []
sensitive: [money, schema]
rework: 0
loopFailures: 1
review: none
recommended:
  model: opus
  effort: high
  estimate5h: null
  estimateWeek: null
approved:
  model: sonnet
  effort: high
  by: owner
  at: 2026-10-25T13:34:26Z
  at-label: 2026-10-25 21:34 Asia/Makassar
  budgetOverride: true
run:
  worktree: .worktrees/pf-151
  branch: loop/pf-151
  slot: 1
  fixRounds: 0
  segments: 0
  checkpoint: .loop/runs/PF-151/checkpoint.json
  logs: .loop/runs/PF-151/
  dbSnapshot: .loop/runs/PF-151/db-before.dump
---

# PF-151 — Journey score fixes before quests: investing is not spending, no debt data is not a perfect score

> **GitHub Issue:** _(none — issues are no longer used, owner decision 2026-10-15)_
> **Status:** Done
> **Started:** 2026-10-25 (accepted and merged 2026-10-25)
> **Planned from branch:** main
> **Sensitive:** yes — schema change and scoring methodology (a wrong number here is silent, FIN-04)
> **Board objective:** Journey scores stop penalizing you for investing and stop showing a perfect debt score when no debts have been recorded.

Plan 1 of 3 for the Journey quests MVP. Plan 2 (Quest Engine v1) and plan 3 (Monthly Harvest) must not start until this one is executed. Plan 2 reuses the column and endpoint names defined here.

## Objective

Quests will celebrate Journey scores, so the scores must be true first. Today investing counts as spending (it lowers the L1 score of someone who invests), and a user with no debts recorded gets a perfect debt score (a fake 100 that also unlocks "Light Footprint"). This plan fixes both, moves insurance to the right level while that is still free, and makes the docs say what the code does.

## Acceptance Criteria

Scoring
- [x] Income 10 jt, consumption 8 jt and investing 1.5 jt (category `Investment`) give a spend ratio of 0.80 and a `spend_lt_income` score of 100 (it was 0.95 and 50).
  > Proven by `MonthlyConsumptionRatios_InvestingOnTopOfConsumption_RatioIs080AndScoreIs100` (passes).
- [x] A dividend credit (type `Income`, category `Investment`) stays income. It is not subtracted from spending and not counted as a contribution.
  > Proven by `MonthlyConsumptionRatios_DividendCredit_StaysIncomeAndLowersTheRatio` and `AverageMonthlySavingsOutflow_DividendCredit_IsNotCountedAsContribution` (pass).
- [x] `liquid_savings_ratio` divides by average monthly consumption (savings-category outflows excluded), not total expense (CIO ruling Q1).
  > `ComputeLiquidSavingsAsync` now calls `AverageMonthlyConsumption`; proven by `AverageMonthlyConsumption_InvestingOutflowPresent_ExcludesIt` (passes).
- [x] `liquid_savings_ratio` finds the owner's `savings` accounts (lowercase, as the CHECK constraint stores them) and evaluates instead of staying "not evaluated"; the before and after values are recorded separately from the G3 change.
  > Live 2026-10-25: before = not evaluated; after = live, 0.34 months (Rp 900,000 across 4 accounts ÷ ≈ Rp 2.67 m consumption), score 0. Needed a second casing fix found during STEP 12: the valuation lookup filtered `subject_type = "Account"` while the CHECK allows only `account`, so the total was always 0. Fixed via `JourneyScoringRules.AccountValuationSubjectType`, pinned by `AccountValuationSubjectType_MatchesTheLowercaseValueAllowedByTheCheckConstraint`.
- [x] `savings_rate` counts only `Expense` rows in the savings categories (CIO ruling Q2).
  > Proven by `AverageMonthlySavingsOutflow_*` tests.
- [x] With no liabilities and no confirmation, `manageable_dti` is `no_data`, is left out of the L2 average and of graduation, and `debt_free` does not unlock.
  > Proven by `EvaluateDti_NoLiabilitiesAndNoConfirmation_IsNotEvaluated`, `ComputeLevelScores_DtiNotEvaluated_IsLeftOutOfTheL2Average`, `AchievementsEarned_DtiNotEvaluated_DoesNotUnlockDebtFree`.
- [x] With the confirmation set and no liabilities, DTI is 0 and scores 100. A liability added afterwards makes DTI compute from that liability (the recorded liability overrides the confirmation).
  > Proven by `EvaluateDti_NoLiabilitiesButConfirmed_IsZeroAndScores100` and `EvaluateDti_LiabilityAddedAfterConfirmation_LiabilityOverridesConfirmation`.
- [x] A liability with no monthly payment means the debt service is unknown: `manageable_dti` is `no_data` (also when "no debts" is confirmed), and the reason names the liability that needs a payment. A payment of 0 that the owner entered counts as known.
  > Proven by `EvaluateDti_LiabilityWithoutMonthlyPayment_IsNotEvaluatedAndNamesTheLiability`, `EvaluateDti_ConfirmedButLiabilityWithoutPayment_IsNotEvaluated`, `EvaluateDti_PaymentEnteredAsZero_CountsAsKnown`.
- [x] Recalculating on the owner's current data (one liability, no payment) unlocks neither `debt_free` nor `graduated_l2`.
  > Live 2026-10-25 on the owner (1 card, no payment): `manageable_dti` = `no_data`; unlocked = `graduated_l1`, `positive_cashflow_3mo` only. `debt_free` and `graduated_l2` stay locked (L2 = cover 0).
- [x] `no_data` survives a page reload: `GET /api/journey/state` reports `manageable_dti` as `no_data`, not as score 0.
  > Rebuild mechanism proven by `BuildIndicatorDtos_UnevaluatedDtiStoredThroughLiveScoreMap_ComesBackAsNoData` (live scores stored via `LiveScoreMap`, rebuilt as `no_data`). Live reload confirm in STEP 12.
- [x] `appropriate_insurance` reports level `L2` from both `POST /recalculate` and `GET /state`.
  > `Definitions` table (recalc) and `BuildIndicatorDtos_AppropriateInsurance_ReportsLevelL2AndNoData` (GET /state) both place it at L2.
- [x] A level with zero live indicators is "Not evaluated": no score average, never cleared, and it blocks progression to the next level.
  > Proven by `ComputeLevelScores_LevelWithNoLiveIndicator_HasNoScore` and `DetermineCurrentLevel_WhenL2HasNoLiveIndicators_DoesNotSkipToL3`; UI shows "Not evaluated" in `TierCard`.

Confirmation flag
- [x] `GET`, `PUT` and `DELETE /api/journey/no-debts` read, set and clear the confirmation. `PUT` and `DELETE` recalculate the Journey before returning.
  > Endpoints added to `JourneyController`; handler stores then sends `RecalculateJourneyCommand`. Proven by the 4 `JourneyControllerNoDebtsTests` and 2 `SetNoDebtsConfirmationCommandHandlerTests` (store-then-recalculate order asserted).
- [x] A recalculation never clears or changes the confirmation, and setting it never changes scores except through the recalculation.
  > Live 2026-10-25 (owner): PUT set 14:00:40.50Z, POST /recalculate left the stored value unchanged, DELETE wrote null, scores row intact; repeated 14:36 after the UTC fix. `GET` now returns UTC (`...Z`) like `PUT`; it returned local time without an offset before (`JourneyConfirmationService`).
- [x] Assets > Liabilities, when empty, shows "I have no debts" (and, once confirmed, the date and an "Undo").
  > Live 2026-10-25 with a throwaway local user (headless Playwright on slot 1, user deleted afterwards): "I have no debts" shown; after pressing it "You confirmed on 25 Oct 2026 that you have no debts." and "Undo"; Journey then showed `dti 100`; after "Undo" the prompt returned and the flag was null.
- [x] An unevaluated debt indicator renders neutral text ("Not evaluated"), never green and never a score (FIN-04).
  > `IndicatorScoreBar` `no_data` branch renders grey "Not evaluated · update your debts" (link), never a bar/colour (code read). Live 2026-10-25: after "Undo" the L2 card reads a neutral grey "Not evaluated" with no score. The row itself is not reachable live while L2 is locked (`TierCard` hides rows when level > currentLevel; follow-up 5).

Docs and history
- [x] Rubric bumped to version 2 with a changelog entry; Audit Trail amended; take-home-income note for DTI; `formulas.md` breakpoint table updated; CLAUDE.md pyramid headlines show the Cleared (70) and Mastered (100) bars.
  > All done; the rubric changelog deploy-date is a `{fill in}` placeholder until STEP 12.
- [x] No `journey_indicator_snapshots` row from an earlier day is touched, and no achievement is deleted. Today's own row for an indicator that is not evaluated is removed, so state and snapshot never disagree on the same day.
  > Live 2026-10-25. Found and fixed during STEP 12: postgrest-csharp sends the primary key on `Upsert` even with `shouldInsert: false`, so every snapshot and every achievement was written as `id 0` over one shared row (a new achievement overwrote the previous one; the snapshot of any day overwrote all others). Now: snapshots delete only today's rows for the user, then insert the live ones; achievements insert only codes not yet unlocked (keeps the original `unlocked_at`). Verified: today holds exactly the 3 live indicators after 4 recalculations, DTI row appears when confirmed and is gone after Undo, `unlocked_at` unchanged across recalculations, no achievement deleted.
- [x] Before and after scores, the owner's `debt_free` and `graduated_l2` state, and the date are recorded in the Execution Notes.
  > Recorded 2026-10-25 in "Before / after" below.

Tests
- [x] Existing tests pass. New tests cover every case above (TEST-01) and are named `MethodName_Condition_ExpectedResult` (TEST-02).
  > `dotnet test` = 511 passed, 0 failed, 9 skipped (known CategoryRuleService integration skips). Frontend: `npm run lint` 0 errors (9 warnings, none in PF-151 files), `tsc --noEmit` clean, `npm run build` succeeds.

## CIO rulings (methodology review, `/cio` on 2026-10-25)

Recorded here because the plan depends on them. The CIO read the rubric, `formulas.md` §1–2, `JourneyScoringService.cs` and the earlier CIO Review in [pm-journey-quests-analysis.md](../brainstorms/pm-journey-quests-analysis.md).

Definitions to implement (one place in code, `JourneyScoringRules`):
- **Consumption** = rows with Type `Expense` and a category outside {Investment, Savings Transfer, Investasi, Tabungan}.
- **Savings outflow** = rows with Type `Expense` and a category inside that set. Category match is case-insensitive and trimmed.

| Q | Ruling | Implemented in |
|---|---|---|
| Q1 — does the exclusion apply to the `liquid_savings_ratio` denominator? | **Yes.** The denominator becomes consumption. Contributions stop when income stops, so counting them overstates the monthly need and understates cover; it would repeat the L1 trap one level up. Do **not** switch to "essential expense" now (needs category tagging, a bigger methodology change). No other change to this indicator now. | STEP 3 |
| Q2 — `savings_rate` counts dividend credits as contributions | **Fix in this plan.** It is a methodology error (inflates the numerator, and the dividend already inflates income), and both indicators must share one definition of the savings categories. The numerator becomes savings outflow only. L3 can only fall, only for users with Income-typed rows in those categories; the owner has none. Record it in the changelog as a methodology change, not a breakpoint change. | STEP 3 |
| Q3 — transfer legs and sale proceeds sitting in income | **Accepted limitation, document it.** An income-side exclusion by category would hide dividends. Income-typed rows in savings categories (dividends, sale proceeds, a transfer's receiving leg) stay income. Not made worse by G3 (BI FAST transfers are already typed Expense). Revisit with transfer detection ([money-tracing.md](../../docs/ideas/money-tracing.md)). Only `Investment` is produced by a preset today; the other three names are future-proofing. | Rubric text, STEP 9 |
| Q4 — liability with no monthly payment | **Deferring was acceptable, with conditions; superseded by the architect review (2026-10-25): the rule below is implemented in this plan, because achievements are never revoked and the owner's only liability has no payment.** An empty payment means *unknown*, never zero. Follow-up rule (one line): *"`manageable_dti` is evaluated only if every recorded liability has a monthly payment; otherwise it is not evaluated and names the liability that needs one."* `debt_free` requires the DTI indicator to be evaluated (status not `no_data`) and score 100. The confirmation **never expires** (an expiring claim becomes a nag); store the timestamp, show the date, allow clear. Cheap mitigation with no code: enter the payment on that liability before the post-deploy recalculation (STEP 12). | STEP 4, STEP 12, Notes |
| Q5 — blast radius of removing the fake DTI | **The brief's claim is true only if another L2 indicator is live.** If DTI was the *only* live L2 indicator, L2 goes from "cleared on a fake 100" to "no live indicator", and `graduated_l2` could have been awarded on that alone. A level with zero live indicators is **not evaluated** (neither cleared nor failed). `DetermineCurrentLevel` already blocks progression at such a level (`if (!liveIndicators.Any()) break;`) and must keep doing so. The level card must say "Not evaluated", not "0/100". | STEP 5, STEP 8 |
| Q6 — G11 and versioning | G11 is a pure relabel (indicator is `no_data`): change the level in code (one definitions table) and the rubric; no score or achievement copy changes. When insurance data goes live, it becomes a condition for clearing L2, which is its own methodology change. **Versioning:** the owner's brief governs. Snapshots record what the user was shown under the rule then in force, so they are **not recomputed**. Rubric becomes **version 2**, v1 is the implicit baseline, the Audit Trail sentence about a recompute migration is replaced (otherwise the doc contradicts itself). Any trend chart across the boundary must annotate it (note for plans 2–3). | STEP 5, STEP 9 |
| Q7 — headline arithmetic | **All numbers are correct.** Cleared (70): spend 0.95 − 0.4 × 0.15 = **0.89**; cover 1.5 + 0.4 × 1.5 = **2.1 months**; DTI 0.36 − 0.4 × 0.16 = **0.296**; savings 0.05 + 0.4 × 0.10 = **9%**. Mastered (100): 0.80, 3.0 months, 0.20, 15%. L2 reads "cover **and** DTI", with "once debts are recorded". L4 (derived from the rubric's 0%→0, 50%→100): cleared 35%, mastered 50% of monthly expenses, shown as "not scored yet". L5: "no indicator yet". Bars are per indicator; clearing a level needs every live indicator at 70. | STEP 10 |

Additional CIO findings that changed the scope:
- 🔴 **`no_data` does not survive a reload.** `PersistStateAsync` stores `no_data` indicators as score 0, and `BuildIndicatorDtos` rebuilds them as `not_started` with score 0. G4 is not delivered unless this is fixed (STEP 5). The indicator levels are also written in two places; they become one table.
- ⚠ **Empty months count as zero** in the cover denominator and the DTI income average (the spend ratio skips them correctly). For cover this overstates the result. Logged as a follow-up, not changed here (it would move scores for non-investors).

## Blast Radius

From the brief, refined by the CIO and by a read-only look at the owner's local database on 2026-10-25:

- **L1 only rises.** `spend_lt_income` loses savings outflows from expense, so nobody loses an L1 clearance. (The owner has no `Investment` rows today, so their L1 number does not move; the unit test is the proof of G3.)
- **L2 can lose a false live indicator.** Removing a fake DTI of 100 can lower the L2 average, but cannot flip L2 clearance **when at least one other L2 indicator is live**. If DTI was the only live L2 indicator, L2 stops being "cleared" and becomes "not evaluated", and `graduated_l2` may have been earned on that alone (CIO Q5).
- **L3 can only fall**, and only for users whose savings categories contain Income-typed rows (dividend credits). The `consistent_investor` achievement could have been earned on dividends; report it, don't delete it.
- **History is kept.** `journey_indicator_snapshots` is never rewritten. The only rows this plan may change are today's own: a recalculation upserts them, and an indicator that becomes not evaluated has its row for today deleted (STEP 5). Rows from earlier days are not touched.
- **Owner's data (read-only check, 2026-10-25):** no achievements are unlocked, so nothing was earned on empty data; the snapshot table is empty; the stored state row is stale (last computed 2026-07-30, all zeros). The owner has **one revolving credit-card liability with no monthly payment recorded** and **4 savings accounts** (stored lowercase, `savings`; an earlier read of this plan said "no Savings account" because it matched the capitalised `Savings`, which the CHECK constraint on `accounts.account_type` never allows). The liquid-savings indicator filters on `"Savings"`, so it has never evaluated for the owner; STEP 3b item 5 fixes that, so after this plan cover is live and is a second L2 indicator. Under the **old** rules DTI computes as 0 and scores 100 (income exists: 8,000,000 in both July and August) and is the only live L2 indicator, so **any recalculation on the old code unlocks `debt_free` and `graduated_l2`, and achievements are never revoked.** For that reason STEP 1 does not recalculate on the old code, and STEP 4 makes an unknown payment "not evaluated". Under the **new** rules the owner's DTI is `no_data` (the card has no payment), so `debt_free` cannot unlock; `graduated_l2` can unlock only if cover (live after the casing fix) scores 70 or more on its own. If the owner enters the card's minimum payment, DTI is computed from it and `debt_free` is then earned legitimately if it scores 100. STEP 12 reports what unlocked; it never deletes an achievement.
- **The casing fix is a score change.** `liquid_savings_ratio` goes from "not evaluated" to a computed score for anyone whose savings accounts exist, which moves the L2 average and can change graduation. It is isolated in STEP 3b item 5 with its own before/after line.
- **No transactions are in the savings categories** and none are dividends, so G3 and the `savings_rate` fix change no owner number today.

## Approach

Move the rules out of the Supabase-bound service into a small pure class, `JourneyScoringRules` (consumption and savings-outflow predicates, averages, DTI evaluation, achievement rules, one indicator-definitions table), so every acceptance case is a plain unit test. `JourneyScoringService` calls it. The "no debts" confirmation is a nullable timestamp column on `user_journey_state`, read and written through a **narrow entity** that maps only that column, so the full-row upsert that every recalculation performs can never overwrite it. A new `IJourneyConfirmationService` does the reads and writes; a `SetNoDebtsConfirmationCommand` stores the value and recalculates; three actions on `JourneyController` expose it. Persisting only live indicators (and rebuilding the rest as `no_data`) makes "not evaluated" survive a reload. The UI change is the Liabilities empty state plus neutral "Not evaluated" text.

Deliberately not done: quests, the recalculation trigger after uploads (plan 2), any other breakpoint change, the empty-month averaging (noted), rewriting snapshot history, a separate inputs table.

## Affected Files

| File | Change |
|------|--------|
| `supabase/migrations/20261025000000_pf_151_no_debts_confirmation.sql` | Create — nullable `no_debts_confirmed_at` column (via `/db-migrate`) |
| `apps/api/src/PersonalFinance.Application/Services/JourneyScoringRules.cs` | Create — pure rules: categories, averages, DTI evaluation, achievements, definitions |
| `apps/api/src/PersonalFinance.Application/Services/JourneyScoringService.cs` | Edit — use the rules, take `IJourneyConfirmationService`, persist live indicators only, rebuild from definitions, `internal` visibility for testable statics |
| `apps/api/src/PersonalFinance.Domain/Entities/JourneyDebtConfirmation.cs` | Create — narrow entity over `user_journey_state` |
| `apps/api/src/PersonalFinance.Application/Interfaces/IJourneyConfirmationService.cs` | Create |
| `apps/api/src/PersonalFinance.Application/Services/JourneyConfirmationService.cs` | Create — Supabase read/write of the flag |
| `apps/api/src/PersonalFinance.Application/Dtos/NoDebtsConfirmationDto.cs` | Create |
| `apps/api/src/PersonalFinance.Application/Commands/Journey/SetNoDebtsConfirmationCommand.cs` and `...Handler.cs` | Create — store, then recalculate |
| `apps/api/src/PersonalFinance.Api/Controllers/JourneyController.cs` | Edit — three `no-debts` actions |
| `apps/api/src/PersonalFinance.Api/Program.cs` | Edit — register `IJourneyConfirmationService` |
| `apps/api/tests/PersonalFinance.Tests/Services/JourneyScoringRulesTests.cs` | Create |
| `apps/api/tests/PersonalFinance.Tests/Services/JourneyScoringServiceTests.cs` | Edit — add level and rebuild tests (existing tests stay) |
| `apps/api/tests/PersonalFinance.Tests/Commands/SetNoDebtsConfirmationCommandHandlerTests.cs` | Create |
| `apps/api/tests/PersonalFinance.Tests/Controllers/JourneyControllerNoDebtsTests.cs` | Create |
| `apps/frontend/src/api/journeyApi.ts`, `apps/frontend/src/types/Journey.ts` | Edit — three calls and a type |
| `apps/frontend/src/components/assets/NoDebtsPrompt.tsx` | Create |
| `apps/frontend/src/pages/assets/LiabilitiesTab.tsx` | Edit — empty state uses `NoDebtsPrompt` |
| `apps/frontend/src/utils/journeyLabels.ts`, `components/journey/IndicatorScoreBar.tsx`, `components/journey/TierCard.tsx`, `pages/journey/AchievementsPage.tsx` | Edit — "Not evaluated" rendering and `debt_free` copy |
| `docs/ideas/scoring-rubric.md` | Edit — version 2, changelog, definitions, bars, Audit Trail |
| `docs/reference/finance-domain/formulas.md` | Edit — §1 notes, §2 table |
| `CLAUDE.md` | Edit — pyramid headlines (surgical edit: the file already has uncommitted changes) |
| `docs/architecture/API-endpoints.md`, `docs/STATUS.md` | Edit — new endpoints, status line |

---

## TODO

### [x] STEP 1 — Record the "before" state (read-only, plus one recalculation on the old code)

Do this **before changing any code**. The local Supabase must be running (`npm start`, or `docker ps` shows `supabase_db_personal-finance`).

```bash
docker exec -i supabase_db_personal-finance psql -U postgres -d postgres <<'SQL'
select achievement_code, unlocked_at::date from journey_achievements order by unlocked_at;
select current_level, total_score, level_scores, indicator_scores, last_computed_at::date from user_journey_state;
select count(*) as liabilities, count(monthly_payment) as with_payment from liabilities;
select count(*) as savings_accounts from accounts where lower(account_type) = 'savings';
select a.name, max(v.valued_at) as latest_valuation from accounts a
  left join valuations v on v.subject_id = a.id and lower(v.subject_type) = 'account'
 where lower(a.account_type) = 'savings' group by a.name;
select snapshot_date, indicator_code, score from journey_indicator_snapshots order by snapshot_date, indicator_code;
select category, type, count(*) from transactions
 where category in ('Investment','Savings Transfer','Investasi','Tabungan') group by 1,2;
SQL
```

**Do not press Recalculate on the old code, and do not open a page that triggers a recalculation.** On the owner's data the old rules score DTI at 100 (the one liability has no payment) and it is the only live L2 indicator, so a recalculation would unlock `debt_free` and `graduated_l2` on unknown debt, and achievements are never revoked. Instead record the "before" numbers without writing anything:

1. `GET /api/journey/state` is safe: it only recalculates when no state row exists, and one does. Copy what it returns (it is the stale 2026-07-30 row) into "Before / after".
2. Work out the old-rule scores by hand from this read-only query, using the old formulas (every `Expense` row counts as spending; DTI = sum of `monthly_payment` ÷ average income; cover is not evaluated for the owner because of the casing bug). Note the result as "old rules, computed by hand, not persisted".

```bash
docker exec -i supabase_db_personal-finance psql -U postgres -d postgres <<'SQL'
select to_char(date,'YYYY-MM') as month, type, category, sum(amount_idr) as total
  from transactions where date >= date_trunc('month', current_date) - interval '3 months'
 group by 1,2,3 order by 1,2,3;
SQL
```

Optional and the owner's call: if Rikky enters the credit card's minimum payment first, the old and new DTI are both real and nothing fake can unlock either way.

> **Why:** The brief requires before and after scores in the plan. A persisted "before" run on the old code is exactly the event this plan exists to prevent, and it would happen before the gate in STEP 12. A hand calculation costs ten minutes and writes nothing. The read-only queries also confirm the Blast Radius facts are still true on the day of execution (they were read on 2026-10-25).

---

### [x] STEP 2 — Add the confirmation column (`/db-migrate`)

> **Applied 2026-10-25** to the local stack with `npx supabase migration up --local` (the loop cannot run `supabase db push`). Verified: `no_debts_confirmed_at` is a nullable `timestamp with time zone`; the only policy is `user_journey_state_owner` (ALL, authenticated). The worktree needed a copy of the gitignored `20260516000001_assets_seed.sql` for the CLI history check; it stays untracked.

Run `/db-migrate` with this file:

```sql
-- supabase/migrations/20261025000000_pf_151_no_debts_confirmation.sql
-- PF-151: the owner can confirm "I have no debts" so manageable_dti can be evaluated with no
-- liability row. NULL means not confirmed. The existing user_journey_state_owner policy
-- (FOR ALL TO authenticated, user_id = auth.uid()) and the table-level grants already cover a
-- new column, so no policy or grant changes.
BEGIN;

ALTER TABLE public.user_journey_state
  ADD COLUMN IF NOT EXISTS no_debts_confirmed_at timestamptz;

COMMENT ON COLUMN public.user_journey_state.no_debts_confirmed_at IS
  'When the owner confirmed they have no debts. NULL = not confirmed. A recorded liability overrides it at scoring time.';

COMMIT;
```

Verify after applying:

```bash
docker exec -i supabase_db_personal-finance psql -U postgres -d postgres <<'SQL'
select column_name, data_type, is_nullable from information_schema.columns
 where table_schema = 'public' and table_name = 'user_journey_state' and column_name = 'no_debts_confirmed_at';
select policyname, cmd, roles from pg_policies where tablename = 'user_journey_state';
SQL
```

Expected: one `timestamp with time zone`, nullable column; exactly one policy, `user_journey_state_owner`, command `ALL`.

> **Why:** A schema change goes through the migration skill, never ad hoc (governance and `backend.md`). Adding a nullable column leaves existing rows and the owner RLS pattern unchanged, which is a hard requirement of the brief.

---

### [x] STEP 3 — G3: one definition of consumption and savings, and use it in three indicators

**3a. Create the rules class** `apps/api/src/PersonalFinance.Application/Services/JourneyScoringRules.cs` (later steps add to it):

```csharp
using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Application.Services;

/// <summary>
/// Pure Journey scoring rules: no Supabase, no clock. Kept apart from JourneyScoringService so
/// every rule can be tested with plain objects. Methodology: docs/ideas/scoring-rubric.md (v2).
/// </summary>
internal static class JourneyScoringRules
{
    // Source: docs/ideas/scoring-rubric.md v2, "Spending vs saving". These categories mean money
    // moved to the future rather than consumed. spend_lt_income and liquid_savings_ratio leave them
    // out of expense; savings_rate counts only them. Only "Investment" is produced by a preset today.
    private static readonly HashSet<string> SavingsCategories = new(StringComparer.OrdinalIgnoreCase)
    {
        "Investment", "Savings Transfer", "Investasi", "Tabungan",
    };

    public static bool IsExpense(Transaction t) =>
        t.Type.Equals("Expense", StringComparison.OrdinalIgnoreCase);

    public static bool IsIncome(Transaction t) =>
        t.Type.Equals("Income", StringComparison.OrdinalIgnoreCase);

    private static bool IsSavingsCategory(Transaction t) =>
        SavingsCategories.Contains(t.Category?.Trim() ?? string.Empty);

    /// <summary>Money spent on living: an Expense row outside the savings categories.</summary>
    public static bool IsConsumption(Transaction t) => IsExpense(t) && !IsSavingsCategory(t);

    /// <summary>Money moved to saving or investing: an Expense row inside the savings categories.</summary>
    public static bool IsSavingsOutflow(Transaction t) => IsExpense(t) && IsSavingsCategory(t);

    public static decimal MonthTotal(
        IEnumerable<Transaction> transactions, DateTime month, Func<Transaction, bool> include) =>
        transactions
            .Where(t => t.Date.Year == month.Year && t.Date.Month == month.Month && include(t))
            .Sum(t => t.AmountIdr);

    /// <summary>Consumption ÷ income for each month that has income; months without income have no ratio.</summary>
    public static List<decimal> MonthlyConsumptionRatios(
        IEnumerable<Transaction> transactions, IEnumerable<DateTime> months)
    {
        var all = transactions.ToList();
        return months
            .Select(m => (Income: MonthTotal(all, m, IsIncome), Consumption: MonthTotal(all, m, IsConsumption)))
            .Where(x => x.Income > 0)
            .Select(x => x.Consumption / x.Income)
            .ToList();
    }

    public static decimal AverageMonthlyIncome(IEnumerable<Transaction> transactions, IEnumerable<DateTime> months) =>
        AverageMonthly(transactions, months, IsIncome);

    public static decimal AverageMonthlyConsumption(IEnumerable<Transaction> transactions, IEnumerable<DateTime> months) =>
        AverageMonthly(transactions, months, IsConsumption);

    public static decimal AverageMonthlySavingsOutflow(IEnumerable<Transaction> transactions, IEnumerable<DateTime> months) =>
        AverageMonthly(transactions, months, IsSavingsOutflow);

    // A month with no rows counts as zero, exactly as the service did before PF-151.
    // Known follow-up (CIO): this overstates cover when months are missing. See Notes.
    private static decimal AverageMonthly(
        IEnumerable<Transaction> transactions, IEnumerable<DateTime> months, Func<Transaction, bool> include)
    {
        var all = transactions.ToList();
        return months.Select(m => MonthTotal(all, m, include)).DefaultIfEmpty(0m).Average();
    }
}
```

**3b. Edit `JourneyScoringService.cs`.**

1. `ComputeSpendLtIncomeAsync`: replace the `const string description` value with `"3-month rolling average of spending (excluding money you saved or invested) vs. income"`, and replace the `var ratios = months.Select(m => { ... }).Where(...).Select(...).ToList();` block (currently lines 103–118) with:

```csharp
            var ratios = JourneyScoringRules.MonthlyConsumptionRatios(transactions, months);
```

2. `ComputeLiquidSavingsAsync`: change the `description` to `"Emergency fund in months of average monthly spending (excluding money you saved or invested)"` and replace the `var avgMonthlyExpense = months.Select(...)...Average();` block (currently lines 174–180) with:

```csharp
            var avgMonthlyExpense = JourneyScoringRules.AverageMonthlyConsumption(transactions, months);
```

3. `ComputeSavingsRateAsync`: delete the local `investmentCategories` set; replace the `avgMonthlyIncome` and `avgMonthlyContribution` blocks with:

```csharp
            var avgMonthlyIncome = JourneyScoringRules.AverageMonthlyIncome(transactions, months);

            if (avgMonthlyIncome <= 0)
                return NotAvailable(code, level, displayName, "No income data to compute savings rate");

            var avgMonthlyContribution = JourneyScoringRules.AverageMonthlySavingsOutflow(transactions, months);
```

4. Change `private static` to `internal static` on `ScoreSpendRatio`, `ScoreLiquidSavings`, `ScoreDti`, `ScoreSavingsRate`, `ComputeLevelScores`, `DetermineCurrentLevel` and `BuildIndicatorDtos` (existing reflection tests use `BindingFlags.NonPublic`, which still finds `internal` members; the Application project already grants `InternalsVisibleTo("PersonalFinance.Tests")`).

5. **Fix the savings-account casing (this changes a score; record it separately in Before / after).** `ComputeLiquidSavingsAsync` filters `account_type` with `Operator.Equals, "Savings"` (line ~147), but the CHECK constraint on `accounts.account_type` allows only `'checking','savings','credit_card','brokerage','wallet','loan'`, so the filter never matches and the indicator has never evaluated. Add to `JourneyScoringRules`:

```csharp
    // Source: CHECK constraint on public.accounts.account_type (20260515000001_assets_management.sql) allows only lowercase values.
    internal const string SavingsAccountType = "savings";
```

and change the filter to `.Filter("account_type", Operator.Equals, JourneyScoringRules.SavingsAccountType)`. Add to `JourneyScoringRulesTests`:

```csharp
    [Fact]
    public void SavingsAccountType_MatchesTheLowercaseValueAllowedByTheCheckConstraint()
    {
        Assert.Equal("savings", JourneyScoringRules.SavingsAccountType);
    }
```

Record in Before / after: `liquid_savings_ratio` before (not evaluated) and after, the L2 average, and each savings account's latest valuation date (the score still uses the latest valuation regardless of age; G6 is handled by plan 2 for quests and stars, not here).

**3c. Tests** — create `apps/api/tests/PersonalFinance.Tests/Services/JourneyScoringRulesTests.cs`:

```csharp
using PersonalFinance.Application.Services;
using PersonalFinance.Domain.Entities;
using Xunit;

namespace PersonalFinance.Tests.Services;

public class JourneyScoringRulesTests
{
    private static readonly DateTime[] September = [new DateTime(2026, 9, 1)];

    private static Transaction Tx(string type, string category, decimal amount, int month = 9) =>
        new() { Type = type, Category = category, AmountIdr = amount, Date = new DateTime(2026, month, 15) };

    // ─── G3: investing is not spending ─────────────────────────────────────────

    [Fact]
    public void MonthlyConsumptionRatios_InvestingOnTopOfConsumption_RatioIs080AndScoreIs100()
    {
        // Arrange — the brief's example: income 10 jt, consumption 8 jt, investing 1.5 jt
        var txs = new List<Transaction>
        {
            Tx("Income", "Salary", 10_000_000m),
            Tx("Expense", "Food", 8_000_000m),
            Tx("Expense", "Investment", 1_500_000m),
        };

        // Act
        var ratios = JourneyScoringRules.MonthlyConsumptionRatios(txs, September);
        var score = JourneyScoringService.ScoreSpendRatio(ratios.Average());

        // Assert
        Assert.Equal(0.80m, Assert.Single(ratios));
        Assert.Equal(100m, score);
    }

    [Theory]
    [InlineData("Investment")]
    [InlineData("Savings Transfer")]
    [InlineData("Investasi")]
    [InlineData("Tabungan")]
    [InlineData("investment")]
    [InlineData("  INVESTASI ")]
    public void IsSavingsOutflow_ExpenseInSavingsCategory_IsTrueAndNotConsumption(string category)
    {
        var tx = Tx("Expense", category, 1m);

        Assert.True(JourneyScoringRules.IsSavingsOutflow(tx));
        Assert.False(JourneyScoringRules.IsConsumption(tx));
    }

    [Fact]
    public void IsConsumption_ExpenseInOrdinaryCategory_IsTrue()
    {
        Assert.True(JourneyScoringRules.IsConsumption(Tx("Expense", "Food", 1m)));
        Assert.False(JourneyScoringRules.IsSavingsOutflow(Tx("Expense", "Food", 1m)));
    }

    [Fact]
    public void MonthlyConsumptionRatios_DividendCredit_StaysIncomeAndLowersTheRatio()
    {
        // Arrange — dividend: Income typed, category Investment (the DIVIDEN preset)
        var txs = new List<Transaction>
        {
            Tx("Income", "Salary", 9_000_000m),
            Tx("Income", "Investment", 1_000_000m),
            Tx("Expense", "Food", 8_000_000m),
        };

        // Act
        var ratios = JourneyScoringRules.MonthlyConsumptionRatios(txs, September);

        // Assert — 8 jt / 10 jt: the dividend counts as income
        Assert.Equal(0.80m, Assert.Single(ratios));
    }

    [Fact]
    public void MonthlyConsumptionRatios_MonthWithoutIncome_IsSkipped()
    {
        var txs = new List<Transaction> { Tx("Expense", "Food", 5_000_000m) };

        var ratios = JourneyScoringRules.MonthlyConsumptionRatios(txs, September);

        Assert.Empty(ratios);
    }

    // ─── Q1: cover uses consumption ────────────────────────────────────────────

    [Fact]
    public void AverageMonthlyConsumption_InvestingOutflowPresent_ExcludesIt()
    {
        var txs = new List<Transaction>
        {
            Tx("Expense", "Food", 8_000_000m),
            Tx("Expense", "Investment", 1_500_000m),
        };

        var average = JourneyScoringRules.AverageMonthlyConsumption(txs, September);

        Assert.Equal(8_000_000m, average);
    }

    // ─── Q2: savings rate counts outflows only ─────────────────────────────────

    [Fact]
    public void AverageMonthlySavingsOutflow_DividendCredit_IsNotCountedAsContribution()
    {
        var txs = new List<Transaction>
        {
            Tx("Expense", "Investment", 1_500_000m),
            Tx("Income", "Investment", 400_000m),
        };

        var average = JourneyScoringRules.AverageMonthlySavingsOutflow(txs, September);

        Assert.Equal(1_500_000m, average);
    }

    [Fact]
    public void AverageMonthlyIncome_MonthsWithoutRows_CountAsZero()
    {
        // Pins the existing averaging convention (follow-up in Notes) so a change is deliberate.
        var txs = new List<Transaction> { Tx("Income", "Salary", 9_000_000m, month: 9) };
        DateTime[] threeMonths = [new(2026, 7, 1), new(2026, 8, 1), new(2026, 9, 1)];

        var average = JourneyScoringRules.AverageMonthlyIncome(txs, threeMonths);

        Assert.Equal(3_000_000m, average);
    }
}
```

Run `dotnet test --filter "FullyQualifiedName~Journey"` from `apps/api/`. All existing `JourneyScoringServiceTests` must still pass.

> **Why:** The savings-category set already exists inside `ComputeSavingsRateAsync`; leaving two definitions in one file is how the spend ratio ended up disagreeing with the savings rate. One predicate for all three indicators is the CIO's Q1/Q2 ruling and FIN-02 (the set cites its source). Pure functions are what make the brief's 10 jt / 8 jt / 1.5 jt example a real test (TEST-01) instead of a manual check, because the service itself needs a live Supabase client.

---

### [x] STEP 4 — G4: DTI is "not evaluated" without debt data; `debt_free` needs an evaluated DTI

**4a. Narrow entity** `apps/api/src/PersonalFinance.Domain/Entities/JourneyDebtConfirmation.cs`:

```csharp
using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;

namespace PersonalFinance.Domain.Entities;

/// <summary>
/// Narrow view of user_journey_state holding only the user-entered "I have no debts" confirmation.
/// JourneyScoringService upserts the full UserJourneyState row on every recalculation; keeping this
/// column off that entity means a recalculation can never overwrite the confirmation, and writing
/// the confirmation (a partial upsert) never touches the scores.
/// </summary>
[Table("user_journey_state")]
public class JourneyDebtConfirmation : BaseModel
{
    [PrimaryKey("user_id", shouldInsert: true)]
    public Guid UserId { get; set; }

    [Column("no_debts_confirmed_at")]
    public DateTime? NoDebtsConfirmedAt { get; set; }
}
```

**4b. Interface** `apps/api/src/PersonalFinance.Application/Interfaces/IJourneyConfirmationService.cs`:

```csharp
namespace PersonalFinance.Application.Interfaces;

public interface IJourneyConfirmationService
{
    /// <summary>When the owner confirmed "I have no debts", or null when not confirmed.</summary>
    Task<DateTime?> GetNoDebtsConfirmedAtAsync(Guid userId, CancellationToken ct = default);

    /// <summary>Sets the confirmation time, or clears it when <paramref name="confirmedAt"/> is null.</summary>
    Task SetNoDebtsConfirmedAtAsync(Guid userId, DateTime? confirmedAt, CancellationToken ct = default);
}
```

**4c. Service** `apps/api/src/PersonalFinance.Application/Services/JourneyConfirmationService.cs`:

```csharp
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Domain.Entities;
using static Supabase.Postgrest.Constants;

namespace PersonalFinance.Application.Services;

public class JourneyConfirmationService(
    Supabase.Client supabase,
    ILogger<JourneyConfirmationService> logger
) : IJourneyConfirmationService
{
    public async Task<DateTime?> GetNoDebtsConfirmedAtAsync(Guid userId, CancellationToken ct = default)
    {
        var rows = await supabase.From<JourneyDebtConfirmation>()
            .Filter("user_id", Operator.Equals, userId.ToString())
            .Get();

        return rows.Models.FirstOrDefault()?.NoDebtsConfirmedAt;
    }

    public async Task SetNoDebtsConfirmedAtAsync(Guid userId, DateTime? confirmedAt, CancellationToken ct = default)
    {
        // Partial upsert: only user_id and the confirmation are sent, so scores are untouched and
        // a missing row is created with the table defaults. A null clears the column.
        await supabase.From<JourneyDebtConfirmation>()
            .Upsert(new JourneyDebtConfirmation { UserId = userId, NoDebtsConfirmedAt = confirmedAt });

        logger.LogInformation("No-debts confirmation {Action} for user {UserId}",
            confirmedAt.HasValue ? "set" : "cleared", userId);
    }
}
```

**4d. Add the DTI and achievement rules** to `JourneyScoringRules.cs` (add `using PersonalFinance.Application.Dtos;` at the top, then these members inside the class):

```csharp
    /// <summary>Result of DTI evaluation: either a ratio, or the reason it is not evaluated.</summary>
    internal readonly record struct DtiOutcome(decimal? Dti, string? NotEvaluatedReason);

    /// <summary>
    /// manageable_dti is evaluated only when the app has debt information: at least one recorded
    /// liability (which always overrides the confirmation), or the owner's "I have no debts"
    /// confirmation. With neither, it is "not evaluated" (FIN-04), never a perfect score.
    /// Income is take-home income seen in bank statements, so DTI reads higher than the gross-income
    /// convention in formulas.md §1 (conservative).
    /// A liability with no monthly_payment means the debt service is unknown, never zero: the
    /// indicator is not evaluated and names the liability that needs a payment (CIO Q4). This holds
    /// even when "no debts" is confirmed, and matters because achievements are never revoked: an
    /// unknown must not be able to score 100. A payment the owner entered as 0 is known.
    /// </summary>
    public static DtiOutcome EvaluateDti(
        IReadOnlyCollection<Liability> liabilities, DateTime? noDebtsConfirmedAt, decimal avgMonthlyIncome)
    {
        if (liabilities.Count == 0 && noDebtsConfirmedAt is null)
            return new DtiOutcome(null, "No debts recorded and none confirmed");

        var missingPayment = liabilities.FirstOrDefault(l => !l.MonthlyPayment.HasValue);
        if (missingPayment is not null)
            return new DtiOutcome(null, $"Add the monthly payment for {missingPayment.Name} to evaluate debt");

        if (avgMonthlyIncome <= 0)
            return new DtiOutcome(null, "No income data to compute DTI");

        var monthlyDebtService = liabilities.Sum(l => l.MonthlyPayment!.Value);

        return new DtiOutcome(monthlyDebtService / avgMonthlyIncome, null);
    }

    /// <summary>
    /// Achievements the current indicators earn. An indicator that is not evaluated (no_data)
    /// never earns anything, and a level with no live indicator is never cleared (FIN-04).
    /// </summary>
    public static List<string> AchievementsEarned(IReadOnlyCollection<IndicatorScoreDto> indicators)
    {
        var earned = new List<string>();

        IndicatorScoreDto? Live(string code) =>
            indicators.FirstOrDefault(i => i.Code == code && i.Status != "no_data");

        if (Live("spend_lt_income")?.Score >= 70) earned.Add("positive_cashflow_3mo");
        if (Live("liquid_savings_ratio")?.Score >= 100) earned.Add("emergency_ready");
        if (Live("manageable_dti")?.Score >= 100) earned.Add("debt_free");
        if (Live("savings_rate")?.Score >= 70) earned.Add("consistent_investor");

        foreach (var (level, code) in new[] { ("L1", "graduated_l1"), ("L2", "graduated_l2"), ("L3", "graduated_l3") })
        {
            var live = indicators.Where(i => i.Level == level && i.Status != "no_data").ToList();
            if (live.Count > 0 && live.All(i => i.Score >= 70)) earned.Add(code);
        }

        return earned;
    }
```

**4e. Edit `JourneyScoringService.cs`:**

1. Constructor: add the dependency.

```csharp
public class JourneyScoringService(
    Supabase.Client supabase,
    IJourneyConfirmationService confirmation,
    ILogger<JourneyScoringService> logger
) : IJourneyScoringService
```

2. In `RecalculateAsync` change `var dti = await ComputeDtiAsync(ct);` to `var dti = await ComputeDtiAsync(userId, ct);`.

3. Replace the whole `ComputeDtiAsync` body:

```csharp
    private async Task<IndicatorScoreDto> ComputeDtiAsync(Guid userId, CancellationToken ct)
    {
        const string code = "manageable_dti";
        const string level = "L2";
        const string displayName = "Manageable debt (DTI)";
        const string description = "Monthly debt payments as % of take-home income";

        try
        {
            // Read inside the try: if the confirmation cannot be read, the indicator fails closed
            // as "not evaluated" instead of guessing.
            var confirmedAt = await confirmation.GetNoDebtsConfirmedAtAsync(userId, ct);
            var liabilities = await supabase.From<Liability>().Get();

            var today = DateTime.Today;
            var start = new DateTime(today.Year, today.Month, 1).AddMonths(-3);
            var transactions = await FetchTransactionsAsync(start, today);

            var months = Enumerable.Range(1, 3).Select(i => today.AddMonths(-i)).ToList();
            var avgMonthlyIncome = JourneyScoringRules.AverageMonthlyIncome(transactions, months);

            var outcome = JourneyScoringRules.EvaluateDti(liabilities.Models, confirmedAt, avgMonthlyIncome);
            if (outcome.Dti is not { } dti)
                return NotAvailable(code, level, displayName, outcome.NotEvaluatedReason!);

            var score = ScoreDti(dti);
            var status = DeriveStatus(score);

            return new IndicatorScoreDto(code, level, Math.Round(score, 1), Math.Round(dti, 4), status, displayName, description);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to compute {Indicator}", code);
            return NotAvailable(code, level, displayName, "Computation error");
        }
    }
```

4. In `EvaluateAchievementsAsync` replace everything from `var toUnlock = new List<string>();` down to the `graduated_l3` line (currently lines 375–390) with:

```csharp
        var toUnlock = JourneyScoringRules.AchievementsEarned(indicators);
```

**4f. Tests** — append to `JourneyScoringRulesTests.cs` (add `using PersonalFinance.Application.Dtos;`):

```csharp
    // ─── G4: DTI is not evaluated without debt data ────────────────────────────

    private static Liability Debt(decimal? monthlyPayment) => new() { Name = "Loan", MonthlyPayment = monthlyPayment };

    [Fact]
    public void EvaluateDti_NoLiabilitiesAndNoConfirmation_IsNotEvaluated()
    {
        var outcome = JourneyScoringRules.EvaluateDti([], noDebtsConfirmedAt: null, avgMonthlyIncome: 10_000_000m);

        Assert.Null(outcome.Dti);
        Assert.False(string.IsNullOrWhiteSpace(outcome.NotEvaluatedReason));
    }

    [Fact]
    public void EvaluateDti_NoLiabilitiesButConfirmed_IsZeroAndScores100()
    {
        var outcome = JourneyScoringRules.EvaluateDti([], new DateTime(2026, 10, 25, 0, 0, 0, DateTimeKind.Utc), 10_000_000m);

        Assert.Equal(0m, outcome.Dti);
        Assert.Equal(100m, JourneyScoringService.ScoreDti(outcome.Dti!.Value));
    }

    [Fact]
    public void EvaluateDti_LiabilityRecordedWithoutConfirmation_ComputesFromTheLiability()
    {
        var outcome = JourneyScoringRules.EvaluateDti([Debt(3_000_000m)], null, 10_000_000m);

        Assert.Equal(0.30m, outcome.Dti);
    }

    [Fact]
    public void EvaluateDti_LiabilityAddedAfterConfirmation_LiabilityOverridesConfirmation()
    {
        var confirmed = new DateTime(2026, 10, 25, 0, 0, 0, DateTimeKind.Utc);

        var outcome = JourneyScoringRules.EvaluateDti([Debt(3_000_000m)], confirmed, 10_000_000m);

        Assert.Equal(0.30m, outcome.Dti);
    }

    [Fact]
    public void EvaluateDti_NoIncome_IsNotEvaluated()
    {
        var outcome = JourneyScoringRules.EvaluateDti([Debt(3_000_000m)], null, 0m);

        Assert.Null(outcome.Dti);
    }

    [Fact]
    public void EvaluateDti_LiabilityWithoutMonthlyPayment_IsNotEvaluatedAndNamesTheLiability()
    {
        // Arrange — the owner's real case: one credit card, payment unknown
        var card = new Liability { Name = "Kartu Kredit BCA", MonthlyPayment = null };

        // Act
        var outcome = JourneyScoringRules.EvaluateDti([card], null, 10_000_000m);

        // Assert — unknown is never zero, so it can never score 100
        Assert.Null(outcome.Dti);
        Assert.Contains("Kartu Kredit BCA", outcome.NotEvaluatedReason);
    }

    [Fact]
    public void EvaluateDti_OneOfTwoLiabilitiesWithoutPayment_IsNotEvaluated()
    {
        var outcome = JourneyScoringRules.EvaluateDti([Debt(3_000_000m), Debt(null)], null, 10_000_000m);

        Assert.Null(outcome.Dti);
    }

    [Fact]
    public void EvaluateDti_ConfirmedButLiabilityWithoutPayment_IsNotEvaluated()
    {
        var confirmed = new DateTime(2026, 10, 25, 0, 0, 0, DateTimeKind.Utc);

        var outcome = JourneyScoringRules.EvaluateDti([Debt(null)], confirmed, 10_000_000m);

        Assert.Null(outcome.Dti);
    }

    [Fact]
    public void EvaluateDti_PaymentEnteredAsZero_CountsAsKnown()
    {
        var outcome = JourneyScoringRules.EvaluateDti([Debt(0m)], null, 10_000_000m);

        Assert.Equal(0m, outcome.Dti);
    }

    // ─── Achievements and graduation ───────────────────────────────────────────

    private static IndicatorScoreDto Ind(string code, string level, decimal score, string status) =>
        new(code, level, score, null, status, code, "");

    [Fact]
    public void AchievementsEarned_DtiNotEvaluated_DoesNotUnlockDebtFree()
    {
        var indicators = new List<IndicatorScoreDto> { Ind("manageable_dti", "L2", 0m, "no_data") };

        var earned = JourneyScoringRules.AchievementsEarned(indicators);

        Assert.DoesNotContain("debt_free", earned);
    }

    [Fact]
    public void AchievementsEarned_DtiEvaluatedAt100_UnlocksDebtFree()
    {
        var indicators = new List<IndicatorScoreDto> { Ind("manageable_dti", "L2", 100m, "achieved") };

        var earned = JourneyScoringRules.AchievementsEarned(indicators);

        Assert.Contains("debt_free", earned);
    }

    [Fact]
    public void AchievementsEarned_L2HasOnlyAnUnevaluatedIndicator_DoesNotGraduateL2()
    {
        var indicators = new List<IndicatorScoreDto>
        {
            Ind("spend_lt_income", "L1", 90m, "achieved"),
            Ind("manageable_dti", "L2", 0m, "no_data"),
        };

        var earned = JourneyScoringRules.AchievementsEarned(indicators);

        Assert.Contains("graduated_l1", earned);
        Assert.DoesNotContain("graduated_l2", earned);
    }

    [Fact]
    public void AchievementsEarned_L2LiveIndicatorsAllAtLeast70_GraduatesL2()
    {
        var indicators = new List<IndicatorScoreDto>
        {
            Ind("liquid_savings_ratio", "L2", 75m, "achieved"),
            Ind("manageable_dti", "L2", 0m, "no_data"),
        };

        var earned = JourneyScoringRules.AchievementsEarned(indicators);

        Assert.Contains("graduated_l2", earned);
    }
```

Also add to `JourneyScoringServiceTests.cs` (it already has the `InvokeDetermineCurrentLevel` helper) a level-averaging pair:

```csharp
    [Fact]
    public void ComputeLevelScores_DtiNotEvaluated_IsLeftOutOfTheL2Average()
    {
        var indicators = new List<IndicatorScoreDto>
        {
            new("liquid_savings_ratio", "L2", 80m, null, "achieved", "Liquid savings", ""),
            new("manageable_dti", "L2", 0m, null, "no_data", "DTI", ""),
        };

        var scores = JourneyScoringService.ComputeLevelScores(indicators);

        Assert.Equal(80m, scores["L2"]);
    }

    [Fact]
    public void ComputeLevelScores_LevelWithNoLiveIndicator_HasNoScore()
    {
        var indicators = new List<IndicatorScoreDto>
        {
            new("manageable_dti", "L2", 0m, null, "no_data", "DTI", ""),
        };

        var scores = JourneyScoringService.ComputeLevelScores(indicators);

        Assert.False(scores.ContainsKey("L2"));
    }

    [Fact]
    public void DetermineCurrentLevel_WhenL2HasNoLiveIndicators_DoesNotSkipToL3()
    {
        var indicators = new List<IndicatorScoreDto>
        {
            new("spend_lt_income", "L1", 90m, null, "achieved", "Spend", ""),
            new("manageable_dti", "L2", 0m, null, "no_data", "DTI", ""),
            new("savings_rate", "L3", 95m, null, "achieved", "Savings rate", ""),
        };
        var levelScores = new Dictionary<string, decimal> { ["L1"] = 90m, ["L3"] = 95m };

        var level = InvokeDetermineCurrentLevel(levelScores, indicators);

        Assert.Equal(1, level);
    }
```

> **Why:** Rule (c) in the brief and FIN-04: green means *checked*, so no debt data means "not evaluated". Reading the flag inside the existing try/catch makes a failed read fail closed. The narrow entity is not cleverness for its own sake: `PersistStateAsync` upserts a whole `UserJourneyState` on every recalculation, so a flag stored on that entity would be reset to null by the very recalculation the confirmation triggers. An unknown monthly payment is "not evaluated", never zero: achievements are only ever added, so a DTI of 100 computed from a missing payment would permanently award `debt_free` on the owner's real data (architect review, 2026-10-25).

---

### [x] STEP 5 — "Not evaluated" survives a reload; insurance moves to L2 (G11); one definitions table

**5a. Add the definitions to `JourneyScoringRules.cs`:**

```csharp
    internal sealed record IndicatorDefinition(
        string Code, string Level, string DisplayName, string Description, bool HasDataSource);

    // One place for each indicator's level and label. RecalculateAsync (fresh scores) and
    // BuildIndicatorDtos (scores rebuilt from storage) both read this, so they cannot disagree.
    public static readonly IReadOnlyList<IndicatorDefinition> Definitions =
    [
        new("spend_lt_income", "L1", "Spend less than income",
            "3-month rolling average of spending (excluding money you saved or invested) vs. income", true),
        new("pay_bills_on_time", "L1", "Pay bills on time", "Bill due-date tracking not yet available", false),
        new("liquid_savings_ratio", "L2", "Liquid savings ratio",
            "Emergency fund in months of average monthly spending (excluding money you saved or invested)", true),
        new("manageable_dti", "L2", "Manageable debt (DTI)", "Monthly debt payments as % of take-home income", true),
        // G11: protection belongs to Defense. A hospital bill without cover empties the emergency fund.
        new("appropriate_insurance", "L2", "Appropriate insurance", "Insurance module not yet available", false),
        new("savings_rate", "L3", "Long-term savings rate", "Investment contributions as % of monthly income", true),
        new("prime_credit", "L3", "Prime credit score", "Credit bureau integration not yet available", false),
        new("passive_income", "L4", "Passive income coverage", "Dividend/yield tracker not yet available", false),
    ];

    /// <summary>Scores worth storing: indicators that were evaluated. Unevaluated ones are left out.</summary>
    public static Dictionary<string, decimal> LiveScoreMap(IEnumerable<IndicatorScoreDto> indicators) =>
        indicators.Where(i => i.Status != "no_data").ToDictionary(i => i.Code, i => i.Score);
```

**5b. Edit `JourneyScoringService.cs`:**

1. In `RecalculateAsync` replace the four unavailable-indicator calls (`pay_bills_on_time`, `appropriate_insurance`, `prime_credit`, `passive_income`) with a helper that reads the level and name from the table:

```csharp
        indicators.Add(Unavailable("pay_bills_on_time", "Bill due-date tracking not yet available"));
        ...
        indicators.Add(Unavailable("appropriate_insurance", "Insurance module not yet available"));
        indicators.Add(Unavailable("prime_credit", "Credit bureau integration not yet available"));
        indicators.Add(Unavailable("passive_income", "Dividend/yield tracker not yet available"));
```

and add next to `NotAvailable`:

```csharp
    private static IndicatorScoreDto Unavailable(string code, string reason)
    {
        var definition = JourneyScoringRules.Definitions.First(d => d.Code == code);
        return NotAvailable(code, definition.Level, definition.DisplayName, reason);
    }
```

2. In `PersistStateAsync` replace `var indicatorMap = indicators.ToDictionary(i => i.Code, i => i.Score);` with `var indicatorMap = JourneyScoringRules.LiveScoreMap(indicators);`.

3. Replace the whole `BuildIndicatorDtos` method:

```csharp
    internal static List<IndicatorScoreDto> BuildIndicatorDtos(Dictionary<string, decimal> liveScores) =>
        JourneyScoringRules.Definitions.Select(d =>
            d.HasDataSource && liveScores.TryGetValue(d.Code, out var score)
                ? new IndicatorScoreDto(d.Code, d.Level, score, null, DeriveStatus(score), d.DisplayName, d.Description)
                : new IndicatorScoreDto(d.Code, d.Level, 0m, null, "no_data", d.DisplayName, d.Description)).ToList();
```

4. In `PersistSnapshotsAsync`, after the existing loop over live indicators, remove today's row for any indicator that is not evaluated, so state and snapshot cannot disagree on the same day (for example "I have no debts" then Undo: the confirm run wrote DTI = 100, the undo run makes it `no_data`). Rows from earlier days are never touched:

```csharp
        foreach (var indicator in indicators.Where(i => i.Status == "no_data"))
        {
            try
            {
                await supabase.From<JourneyIndicatorSnapshot>()
                    .Filter("user_id", Operator.Equals, userId.ToString())
                    .Filter("snapshot_date", Operator.Equals, today.ToString("yyyy-MM-dd"))
                    .Filter("indicator_code", Operator.Equals, indicator.Code)
                    .Delete();
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to clear today's snapshot for {Indicator}", indicator.Code);
            }
        }
```

This is Supabase-bound, so it has no unit test (same exception as `JourneyConfirmationService`); STEP 12 checks it with SQL.

**5c. Tests** — add to `JourneyScoringServiceTests.cs`:

```csharp
    [Fact]
    public void BuildIndicatorDtos_UnevaluatedDtiStoredThroughLiveScoreMap_ComesBackAsNoData()
    {
        // Arrange — a fresh recalculation where DTI is not evaluated
        var fresh = new List<IndicatorScoreDto>
        {
            new("spend_lt_income", "L1", 80m, 0.9m, "achieved", "Spend", ""),
            new("manageable_dti", "L2", 0m, null, "no_data", "DTI", ""),
        };

        // Act — what GET /state rebuilds from storage
        var rebuilt = JourneyScoringService.BuildIndicatorDtos(JourneyScoringRules.LiveScoreMap(fresh));

        // Assert — "not evaluated" must not turn into a score of 0
        var dti = rebuilt.Single(i => i.Code == "manageable_dti");
        Assert.Equal("no_data", dti.Status);
        Assert.Equal("achieved", rebuilt.Single(i => i.Code == "spend_lt_income").Status);
    }

    [Fact]
    public void BuildIndicatorDtos_AppropriateInsurance_ReportsLevelL2AndNoData()
    {
        var rebuilt = JourneyScoringService.BuildIndicatorDtos(new Dictionary<string, decimal>());

        var insurance = rebuilt.Single(i => i.Code == "appropriate_insurance");
        Assert.Equal("L2", insurance.Level);
        Assert.Equal("no_data", insurance.Status);
    }

    [Fact]
    public void Definitions_EveryIndicatorCodeAppearsOnce()
    {
        var codes = JourneyScoringRules.Definitions.Select(d => d.Code).ToList();

        Assert.Equal(codes.Count, codes.Distinct().Count());
    }
```

> **Why:** Without 5b the whole G4 fix is cosmetic: recalculation would return "not evaluated" and the next page load would show a red 0 (CIO finding). Storing only evaluated indicators and rebuilding the rest as `no_data` is the smallest change that makes the stored shape honest. A rows written before this change still hold 0 for unevaluated indicators until the post-deploy recalculation (STEP 12). One table for levels means G11 cannot be applied in one place and forgotten in the other.

---

### [x] STEP 6 — Command, DTO, endpoints, registration

> **Note:** Code, DI registration, and tests done (4 controller + 2 handler tests pass). Sub-step 6g (live narrow-entity upsert proof) is pending the migration apply + API restart — see STEP 2 / STEP 12.

**6a.** `apps/api/src/PersonalFinance.Application/Dtos/NoDebtsConfirmationDto.cs`:

```csharp
namespace PersonalFinance.Application.Dtos;

/// <summary>The owner's "I have no debts" confirmation. ConfirmedAt is null when not confirmed.</summary>
public record NoDebtsConfirmationDto(DateTime? ConfirmedAt);
```

**6b.** `apps/api/src/PersonalFinance.Application/Commands/Journey/SetNoDebtsConfirmationCommand.cs`:

```csharp
using MediatR;
using PersonalFinance.Application.Dtos;

namespace PersonalFinance.Application.Commands.Journey;

public record SetNoDebtsConfirmationCommand(Guid UserId, bool Confirmed) : IRequest<NoDebtsConfirmationDto>;
```

**6c.** `apps/api/src/PersonalFinance.Application/Commands/Journey/SetNoDebtsConfirmationCommandHandler.cs`:

```csharp
using MediatR;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Application.Commands.Journey;

public class SetNoDebtsConfirmationCommandHandler(
    IJourneyConfirmationService confirmation,
    IMediator mediator,
    ILogger<SetNoDebtsConfirmationCommandHandler> logger
) : IRequestHandler<SetNoDebtsConfirmationCommand, NoDebtsConfirmationDto>
{
    public async Task<NoDebtsConfirmationDto> Handle(SetNoDebtsConfirmationCommand request, CancellationToken ct)
    {
        DateTime? confirmedAt = request.Confirmed ? DateTime.UtcNow : null;

        await confirmation.SetNoDebtsConfirmedAtAsync(request.UserId, confirmedAt, ct);
        logger.LogInformation("Recalculating journey after no-debts confirmation change for {UserId}", request.UserId);

        // The score must reflect the change before the caller sees the response.
        await mediator.Send(new RecalculateJourneyCommand(request.UserId), ct);

        return new NoDebtsConfirmationDto(confirmedAt);
    }
}
```

**6d.** `JourneyController.cs`: add `using PersonalFinance.Application.Commands.Journey;`, add `IJourneyConfirmationService confirmation` to the primary constructor (before `ICurrentUser caller`), and add:

```csharp
    [HttpGet("no-debts")]
    public async Task<ActionResult<NoDebtsConfirmationDto>> GetNoDebts(CancellationToken ct)
    {
        var confirmedAt = await confirmation.GetNoDebtsConfirmedAtAsync(caller.UserId, ct);
        return Ok(new NoDebtsConfirmationDto(confirmedAt));
    }

    [HttpPut("no-debts")]
    public async Task<ActionResult<NoDebtsConfirmationDto>> ConfirmNoDebts(CancellationToken ct)
    {
        var result = await mediator.Send(new SetNoDebtsConfirmationCommand(caller.UserId, true), ct);
        return Ok(result);
    }

    [HttpDelete("no-debts")]
    public async Task<ActionResult<NoDebtsConfirmationDto>> ClearNoDebts(CancellationToken ct)
    {
        var result = await mediator.Send(new SetNoDebtsConfirmationCommand(caller.UserId, false), ct);
        return Ok(result);
    }
```

The owner comes from `ICurrentUser`, never from the request (CLAUDE.md auth rule). `PUT` is idempotent and re-stamps the time.

**6e.** `Program.cs`, in the Journey block after `IJourneyScoringService`:

```csharp
            builder.Services.AddScoped<IJourneyConfirmationService, JourneyConfirmationService>();
```

**6f. Tests.**

`apps/api/tests/PersonalFinance.Tests/Commands/SetNoDebtsConfirmationCommandHandlerTests.cs`:

```csharp
using MediatR;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using PersonalFinance.Application.Commands.Journey;
using PersonalFinance.Application.Interfaces;
using Xunit;

namespace PersonalFinance.Tests.Commands;

public class SetNoDebtsConfirmationCommandHandlerTests
{
    private static readonly Guid Owner = Guid.Parse("8d2f5a61-1c3b-4e7a-b9d0-6e4f2a1c7b35");

    private static SetNoDebtsConfirmationCommandHandler Handler(
        Mock<IJourneyConfirmationService> confirmation, Mock<IMediator> mediator) =>
        new(confirmation.Object, mediator.Object, NullLogger<SetNoDebtsConfirmationCommandHandler>.Instance);

    [Fact]
    public async Task Handle_Confirmed_StoresATimestampThenRecalculates()
    {
        // Arrange
        var calls = new List<string>();
        var confirmation = new Mock<IJourneyConfirmationService>();
        confirmation.Setup(c => c.SetNoDebtsConfirmedAtAsync(Owner, It.IsAny<DateTime?>(), It.IsAny<CancellationToken>()))
            .Callback(() => calls.Add("store")).Returns(Task.CompletedTask);
        var mediator = new Mock<IMediator>();
        mediator.Setup(m => m.Send(It.IsAny<RecalculateJourneyCommand>(), It.IsAny<CancellationToken>()))
            .Callback(() => calls.Add("recalculate"));

        // Act
        var result = await Handler(confirmation, mediator)
            .Handle(new SetNoDebtsConfirmationCommand(Owner, true), CancellationToken.None);

        // Assert
        Assert.NotNull(result.ConfirmedAt);
        Assert.Equal(new[] { "store", "recalculate" }, calls);
        confirmation.Verify(c => c.SetNoDebtsConfirmedAtAsync(
            Owner, It.Is<DateTime?>(d => d.HasValue), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_Cleared_StoresNullThenRecalculates()
    {
        // Arrange
        var confirmation = new Mock<IJourneyConfirmationService>();
        var mediator = new Mock<IMediator>();

        // Act
        var result = await Handler(confirmation, mediator)
            .Handle(new SetNoDebtsConfirmationCommand(Owner, false), CancellationToken.None);

        // Assert
        Assert.Null(result.ConfirmedAt);
        confirmation.Verify(c => c.SetNoDebtsConfirmedAtAsync(Owner, null, It.IsAny<CancellationToken>()), Times.Once);
        mediator.Verify(m => m.Send(It.Is<RecalculateJourneyCommand>(c => c.UserId == Owner),
            It.IsAny<CancellationToken>()), Times.Once);
    }
}
```

`apps/api/tests/PersonalFinance.Tests/Controllers/JourneyControllerNoDebtsTests.cs`:

```csharp
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Moq;
using PersonalFinance.Api.Controllers;
using PersonalFinance.Application.Commands.Journey;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;
using Xunit;

namespace PersonalFinance.Tests.Controllers;

public class JourneyControllerNoDebtsTests
{
    private static readonly Guid Owner = Guid.Parse("8d2f5a61-1c3b-4e7a-b9d0-6e4f2a1c7b35");

    private readonly Mock<IMediator> _mediator = new();
    private readonly Mock<IJourneyConfirmationService> _confirmation = new();

    private JourneyController Controller()
    {
        var caller = new Mock<ICurrentUser>();
        caller.SetupGet(c => c.UserId).Returns(Owner);
        return new JourneyController(
            _mediator.Object, new Mock<IJourneyScoringService>().Object,
            new Mock<IJourneyAdvisorClient>().Object, _confirmation.Object, caller.Object);
    }

    [Fact]
    public async Task GetNoDebts_WhenConfirmed_ReturnsTheTimestamp()
    {
        // Arrange
        var at = new DateTime(2026, 10, 25, 8, 0, 0, DateTimeKind.Utc);
        _confirmation.Setup(c => c.GetNoDebtsConfirmedAtAsync(Owner, It.IsAny<CancellationToken>())).ReturnsAsync(at);

        // Act
        var result = await Controller().GetNoDebts(CancellationToken.None);

        // Assert
        var dto = Assert.IsType<NoDebtsConfirmationDto>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.Equal(at, dto.ConfirmedAt);
    }

    [Fact]
    public async Task GetNoDebts_WhenNotConfirmed_ReturnsNull()
    {
        _confirmation.Setup(c => c.GetNoDebtsConfirmedAtAsync(Owner, It.IsAny<CancellationToken>())).ReturnsAsync((DateTime?)null);

        var result = await Controller().GetNoDebts(CancellationToken.None);

        var dto = Assert.IsType<NoDebtsConfirmationDto>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.Null(dto.ConfirmedAt);
    }

    [Fact]
    public async Task ConfirmNoDebts_SendsAConfirmedCommandForTheCaller()
    {
        // Arrange
        _mediator.Setup(m => m.Send(It.IsAny<SetNoDebtsConfirmationCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new NoDebtsConfirmationDto(DateTime.UtcNow));

        // Act
        await Controller().ConfirmNoDebts(CancellationToken.None);

        // Assert
        _mediator.Verify(m => m.Send(
            It.Is<SetNoDebtsConfirmationCommand>(c => c.UserId == Owner && c.Confirmed),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ClearNoDebts_SendsAnUnconfirmedCommandForTheCaller()
    {
        _mediator.Setup(m => m.Send(It.IsAny<SetNoDebtsConfirmationCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new NoDebtsConfirmationDto(null));

        await Controller().ClearNoDebts(CancellationToken.None);

        _mediator.Verify(m => m.Send(
            It.Is<SetNoDebtsConfirmationCommand>(c => c.UserId == Owner && !c.Confirmed),
            It.IsAny<CancellationToken>()), Times.Once);
    }
}
```

`JourneyConfirmationService` (two thin Supabase calls) has no unit test; it is covered by the live checks in STEP 6g and STEP 12 and belongs with the other Supabase-bound services awaiting the integration harness (PF-034). See Governance in Notes.

**6g. Prove the narrow-entity upsert now, before building the frontend.** This is the one assumption that would invalidate the design, so check it as soon as the endpoints exist. Apply the migration (STEP 2), build and restart the API, sign in as the owner, and run the console snippet from STEP 12 item 3 (`GET`, `PUT`, `POST /recalculate`, `GET`, `DELETE`, `GET`). Required results: the second `GET` returns the same timestamp as the `PUT` (a recalculation does not clear it), and the last `GET` returns `null` (`DELETE` really writes null). Leave the flag cleared.

Already verified while reviewing this plan: postgrest-csharp 4.0.3 and 4.1.0 both default `ColumnAttribute` to `NullValueHandling.Include`, so a null `NoDebtsConfirmedAt` is sent and clears the column, and merge-duplicates updates only the columns in the payload. 6g confirms it against the real stack. If it fails, stop (see "Stop and ask if").

With the new rules the owner's DTI is `no_data`, so this check cannot unlock `debt_free`. `graduated_l2` can unlock if cover alone scores 70 or more; that is a legitimate result of the recalculation, so note it in "Before / after".

> **Why:** MediatR for the write follows the existing pattern (`RecalculateJourneyCommand`), keeps the action under 15 lines (ARCH-04), and lets the handler guarantee "store, then recalculate" in one place. The interface lives in `Application/Interfaces` (ARCH-02). Taking the user from `ICurrentUser` keeps the owner out of the request body.

---

### [x] STEP 7 — Frontend: API calls and the Liabilities empty state

**7a.** `apps/frontend/src/types/Journey.ts`, add:

```ts
export interface NoDebtsConfirmation {
  confirmedAt: string | null;
}
```

**7b.** `apps/frontend/src/api/journeyApi.ts`: import the type (`import type { JourneyState, NoDebtsConfirmation, Quest } from '@/types/Journey';`) and append:

```ts
export const getNoDebtsConfirmation = async (): Promise<NoDebtsConfirmation> => {
  const r = await authenticatedFetch(`${API}/api/journey/no-debts`);
  if (!r.ok) throw new Error('Failed to load debt confirmation');
  return r.json();
};

export const confirmNoDebts = async (): Promise<NoDebtsConfirmation> => {
  const r = await authenticatedFetch(`${API}/api/journey/no-debts`, { method: 'PUT' });
  if (!r.ok) throw new Error('Failed to confirm no debts');
  return r.json();
};

export const clearNoDebts = async (): Promise<NoDebtsConfirmation> => {
  const r = await authenticatedFetch(`${API}/api/journey/no-debts`, { method: 'DELETE' });
  if (!r.ok) throw new Error('Failed to clear debt confirmation');
  return r.json();
};
```

**7c.** Create `apps/frontend/src/components/assets/NoDebtsPrompt.tsx`:

```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { clearNoDebts, confirmNoDebts, getNoDebtsConfirmation } from '@/api/journeyApi';

const formatDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// Shown in place of the table when no liability is recorded. The Journey debt score stays
// "not evaluated" until the owner adds a debt or confirms here (FIN-04).
export const NoDebtsPrompt = () => {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['no-debts-confirmation'],
    queryFn: getNoDebtsConfirmation,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['no-debts-confirmation'] });
    queryClient.invalidateQueries({ queryKey: ['journey-state'] });
  };
  const confirm = useMutation({ mutationFn: confirmNoDebts, onSuccess: refresh });
  const clear = useMutation({ mutationFn: clearNoDebts, onSuccess: refresh });

  if (isLoading) return null;

  const confirmedAt = data?.confirmedAt ?? null;

  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      {confirmedAt ? (
        <>
          <p className="text-sm text-foreground">
            You confirmed on {formatDay(confirmedAt)} that you have no debts.
          </p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Your debt score on Journey is based on that. Adding a debt later replaces it.
          </p>
          <Button variant="ghost" size="sm" disabled={clear.isPending} onClick={() => clear.mutate()}>
            Undo
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-foreground">No debts recorded yet.</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Add a debt above, or tell us you have none. Until then your debt score on Journey stays
            "not evaluated".
          </p>
          <Button size="sm" disabled={confirm.isPending} onClick={() => confirm.mutate()}>
            I have no debts
          </Button>
        </>
      )}
      {(confirm.isError || clear.isError) && (
        <p className="text-xs text-destructive">Could not save that. Try again.</p>
      )}
    </div>
  );
};
```

**7d.** `apps/frontend/src/pages/assets/LiabilitiesTab.tsx`: add `import { NoDebtsPrompt } from '@/components/assets/NoDebtsPrompt';` and replace the empty-state line

```tsx
        <p className="text-sm text-muted-foreground text-center py-12">No liabilities yet. Add one to get started.</p>
```

with

```tsx
        <NoDebtsPrompt />
```

> **Why:** The owner asked for a minimal UI in the Liabilities empty state. A recorded liability hides the prompt entirely, which matches "a recorded liability always overrides the confirmation". Invalidating `['journey-state']` makes Journey show the new score on next view. No dividers and no card chrome, per the UI rules; shadcn `Button` per `frontend.md`.

---

### [x] STEP 8 — Frontend: "Not evaluated" is neutral text, never a score or green

1. `apps/frontend/src/utils/journeyLabels.ts`, append:

```ts
// Indicators that stay blank until the user gives the app something. They say "Not evaluated"
// and point to where (FIN-04: unevaluated is neutral, never a score and never green).
export const NOT_EVALUATED_ACTIONS: Record<string, { action: string; href: string }> = {
  // Generic on purpose: after a reload only the stored score survives, not the reason. The reason
  // ("Add the monthly payment for X", "No debts recorded and none confirmed") is in the recalculate response.
  manageable_dti: { action: 'update your debts', href: '/assets/liabilities' },
};
```

2. `apps/frontend/src/components/journey/IndicatorScoreBar.tsx`: import `Link` from `react-router-dom` and `NOT_EVALUATED_ACTIONS` from `@/utils/journeyLabels`, and replace the `no_data` branch with:

```tsx
  if (indicator.status === 'no_data') {
    const needsInput = NOT_EVALUATED_ACTIONS[indicator.code];
    return (
      <div className={cn('flex items-center gap-2', compact ? 'py-0.5' : 'py-1')}>
        <span className="text-xs text-muted-foreground flex-1 truncate">
          {headline ?? indicator.displayName}
        </span>
        {needsInput ? (
          <Link
            to={needsInput.href}
            className="text-[10px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Not evaluated · {needsInput.action}
          </Link>
        ) : (
          <span className="text-[10px] text-muted-foreground/60 italic">Coming soon</span>
        )}
      </div>
    );
  }
```

3. `apps/frontend/src/components/journey/TierCard.tsx`: after `liveIndicators` add `const hasLiveIndicators = liveIndicators.length > 0;` and replace both score renderings:

- non-active row: `{levelScore.toFixed(0)}/100` becomes `{hasLiveIndicators ? \`${levelScore.toFixed(0)}/100\` : 'Not evaluated'}`
- active header: `{levelScore.toFixed(0)} / 100` becomes `{hasLiveIndicators ? \`${levelScore.toFixed(0)} / 100\` : 'Not evaluated'}`

4. `apps/frontend/src/pages/journey/AchievementsPage.tsx`: change the `debt_free` description to `'Debts recorded (or none confirmed) and payments at most 20% of income'`.

> **Why:** CIO Q5 and FIN-04. Without step 2 an unevaluated DTI would say "Coming soon", which is wrong (the app is waiting for the owner, not for a feature). Without step 3 a level with no live indicator would read "0/100" and look failed. The pyramid, crystal and skyline visualisations already filter out `no_data` indicators; they are not changed here.

---

### [x] STEP 9 — Docs: `docs/ideas/scoring-rubric.md` (version 2)

Make surgical edits (Edit tool). Leave every breakpoint table as is.

1. **Title block.** Under `# Financial Journey Scoring Rubric` add:

```markdown
> **Rubric version:** 2 — effective from the first recalculation after PF-151 is deployed (date recorded in the changelog below). Version 1 is every rule before that date.
> **Two bars per level:** *Cleared* = every live indicator scores at least **70**. *Mastered* = score **100**. Bars are per indicator.
```

2. **Score Formula.** Add a bullet: "A level with **no live indicator** is *not evaluated*: it has no score, is never cleared, and blocks progression to the next level."

3. **Hierarchy diagram.** L2 line: `Defense — cushion and protection`.

4. **Cleared / Mastered table** (new section after Score Formula):

| Indicator | Cleared (70) | Mastered (100) |
|---|---|---|
| `spend_lt_income` | spending at most 89% of income | 80% |
| `liquid_savings_ratio` | cover at least 2.1 months | 3 months |
| `manageable_dti` | debt payments at most 29.6% of income | 20% |
| `savings_rate` | savings rate at least 9% | 15% |
| `passive_income_coverage` (not scored yet; derived from 0%→0, 50%→100) | 35% of monthly expenses | 50% |

5. **New section "Spending vs saving"** (before the indicators): define consumption and savings outflow exactly as in the CIO rulings above (four categories, case-insensitive, `Expense` rows only), say `spend_lt_income` and `liquid_savings_ratio` use consumption and `savings_rate` uses savings outflow, and state the **accepted limitation** (Q3): Income-typed rows in those categories (dividends, sale proceeds, a transfer's receiving leg) stay income until transfer detection exists.

6. **Indicator 1 (`spend_lt_income`).** Change the ratio column to `consumption / income` and the data source to "3-month rolling average of (consumption ÷ income) per month; months with no income are skipped".

7. **Indicator 3 (`liquid_savings_ratio`).** Data source: divide by average monthly **consumption** (last 3 months), not total expense. Add: "Months with no transactions currently count as zero spending, which overstates cover; tracked as a follow-up."

8. **Indicator 4 (`manageable_dti`).** Replace the data-source bullet with:
   - `liabilities.monthly_payment` sum ÷ average monthly **take-home income from bank statements**. This is net income, so it reads higher than the gross-income 36% convention in `formulas.md` §1 (conservative).
   - **Not evaluated** (status `no_data`) when no liability is recorded and the owner has not confirmed "I have no debts".
   - The confirmation is one timestamp, never expires, is shown with its date, and can be cleared. A recorded liability always overrides it.
   - With the confirmation and no liabilities, DTI is 0 and scores 100.
   - **Unknown payment:** DTI is evaluated only if every recorded liability has a monthly payment (an entered 0 counts as known). Otherwise it is not evaluated and names the liability that needs one, even when "no debts" is confirmed. An unknown is never zero.

9. **Indicator 5 (`savings_rate`).** Data source: Expense rows in the savings categories, as % of average monthly income. Dividend credits are not contributions.

10. **Move `appropriate_insurance`** from the L3 section into L2 (after DTI) as indicator 5, and renumber the display numbers 1–8 (`savings_rate` becomes 6; codes do not change). Add one line: "Moved from L3 in version 2. When insurance data goes live it becomes a condition for clearing L2, which will be its own methodology change."

11. **Achievement table.** `debt_free` trigger: "`manageable_dti` evaluated and = 100 (payments at most 20% of income, with debts recorded or none confirmed)".

12. **Replace the Audit Trail text** with:

```markdown
Every score shown to the user is derived from this document. The "How is this scored?" tooltip in the
pyramid UI links to the relevant indicator section above. Formula changes require a version bump and a
changelog entry. Historical snapshots are **not** recomputed: each snapshot is read under the rubric
version in force on its date, and any trend across a version boundary must show that boundary.

## Changelog

### Version 2 — {fill in the deploy date at STEP 12} (PF-151)
- `spend_lt_income`: spending now means consumption; money moved to saving or investing is no longer spending (G3).
- `liquid_savings_ratio`: the denominator is consumption (CIO Q1).
- `savings_rate`: counts savings outflows only; dividend credits are no longer contributions (CIO Q2). L3 can only fall, for users with such rows.
- `manageable_dti`: not evaluated without debt data or the "no debts" confirmation, nor while any recorded liability has no monthly payment; `debt_free` requires an evaluated DTI (G4). Take-home income note added.
- `appropriate_insurance` moved from L3 to L2 (G11). Not scored, so no score changes.
- Cleared (70) and Mastered (100) bars named. A level with no live indicator is not evaluated.
- Audit Trail amended: history is not recomputed.

### Version 1 — baseline
Everything before the date above.
```

> **Why:** The rubric is the methodology source of truth (`finance-domain.md`). The old Audit Trail sentence demanded a snapshot-recompute migration, which the brief forbids; leaving both would make the document contradict itself (CIO Q6). Naming the take-home-income assumption is the CIO's "defensible but unstated" finding.

---

### [x] STEP 10 — Docs: `formulas.md`, CLAUDE.md headlines, API endpoints

> **Note:** formulas.md (§1 notes + §2 table, dated 2026-10-25), CLAUDE.md pyramid headlines, and API-endpoints.md done. README.md pyramid block carries no indicator headline text, so no change there. The rubric changelog deploy-date fill-in and the STATUS.md line are STEP 12 items (deploy day).

1. **`docs/reference/finance-domain/formulas.md`**
   - §1: in the Savings rate and Expense ratio rows, add "expense = consumption: money moved to saving or investing is excluded (rubric v2)"; in the DTI row, add "the Journey indicator divides by take-home income from bank statements, not gross; it reads higher (conservative)"; in the Liquid savings ratio row, say the denominator is consumption.
   - §2: replace the breakpoint table (use method names instead of line numbers, which drift) and update the "as of" date and `Last updated`:

```markdown
| Indicator | 0 points | 50 points | 70 points (cleared) | 100 points (mastered) | Code |
|-----------|----------|-----------|--------------------|----------------------|------|
| `spend_lt_income` (consumption/income) | ≥ 1.00 | 0.95 | 0.89 | ≤ 0.80 | `ScoreSpendRatio` |
| `liquid_savings_ratio` (months of cover) | ≤ 0.5 | 1.5 | 2.1 | ≥ 3.0 | `ScoreLiquidSavings` |
| `manageable_dti` (debt service/income) | ≥ 0.50 | 0.36 | 0.296 | ≤ 0.20 | `ScoreDti` |
| `savings_rate` | ≤ 0 | 0.05 | 0.09 | ≥ 0.15 | `ScoreSavingsRate` |
```

   Link the `Code` names to `JourneyScoringService.cs` without `#L` anchors. The row label was `emergency_ready` (an achievement code); the indicator is `liquid_savings_ratio`. Add one sentence: "`manageable_dti` is *not evaluated* without debt data (rubric v2)."

2. **`CLAUDE.md`** (surgical edit; the file already has uncommitted changes from other work, so do not rewrite it). Replace the five pyramid lines with:

```
                 ▲
               ████             L5 · Legacy       — Estate planning, succession, tax · no indicator yet
             ████████           L4 · Freedom      — FIRE, passive income · not scored yet (rubric: 35% cleared, 50% mastered of expenses)
           ████████████         L3 · Growth       — Cleared: savings rate ≥ 9% · Mastered: ≥ 15%
         ████████████████       L2 · Defense      — Cleared: cover ≥ 2.1 months and DTI ≤ 29.6% · Mastered: 3 months and ≤ 20%
       ████████████████████     L1 · Foundations  — Cleared: spending ≤ 89% of income · Mastered: ≤ 80%
```

   and add under the block: `Cleared = every live indicator scores ≥ 70; Mastered = score 100 (per indicator). Spending excludes money you invest or save. DTI is judged once debts are recorded or confirmed. Source: [scoring-rubric.md](docs/ideas/scoring-rubric.md).` Then `grep -n "Investing ≥15%\|debt-to-income < 20%" README.md docs -r`: if README.md carries the same block, align it the same way and keep its emojis.

3. **`docs/architecture/API-endpoints.md`**: after `GET /api/journey/quests` add `GET /api/journey/no-debts` (`GetNoDebts`), `PUT /api/journey/no-debts` (`ConfirmNoDebts`), `DELETE /api/journey/no-debts` (`ClearNoDebts`).

> **Why:** `formulas.md` states "when code and this document disagree, one of them is a bug". The CLAUDE.md headlines said 3 months / under 20% / at least 15%, which are the Mastered bars, while graduation actually needs the Cleared ones. The arithmetic was checked by the CIO (Q7).

---

### [x] STEP 11 — Run the gates

> **Gates green (2026-10-25):** `dotnet build` clean; `dotnet test` = **511 passed, 0 failed, 9 skipped**. Frontend (after `npm ci` in the main checkout, whose `node_modules` was empty): lint 0 errors, `tsc` clean, build succeeds.

```bash
cd apps/api && dotnet build && dotnet test
cd ../frontend && npm run lint && npx tsc --noEmit -p tsconfig.app.json && npm run build
```

(or `/ci-check quick`). All existing tests must pass; the new tests are the ones named in STEPs 3–6. Fix failures in the code, not the tests (THINK-04).

> **Why:** CI-01 gates. `dotnet test` is also where the reflection-based tests prove that changing the statics to `internal` broke nothing.

---

### [x] STEP 12 — Apply, recalculate, verify, record

> **Done 2026-10-25 (hand run after the loop).** Checks ran against slot 1 (API :7308, frontend :8180) with an owner session minted through the local GoTrue admin API instead of the browser console, and the empty-state UI with headless Playwright as a throwaway user. Two defects found and fixed here: the snapshot/achievement `id 0` upsert and the valuation `subject_type` casing (see the acceptance notes). Rubric changelog date and the STATUS line filled in; the board is refreshed by `run.mjs sync`.

1. Apply the migration if STEP 2 only created the file (the stack uses `supabase db push` / `npx supabase migration up`), restart the API, and sign in as the owner.
2. **Pre-recalculation check (read-only).** Run the STEP 1 SQL again. Expect the owner's card to still have no payment, so the recalculation below must leave `manageable_dti` as `no_data` and must not unlock `debt_free`. If the owner entered a payment since, DTI is computed from it and `debt_free` may unlock legitimately.
3. **Live endpoint checks.** In the signed-in app tab's console:

```js
const key = Object.keys(localStorage).find(k => k.endsWith('-auth-token'));
const token = JSON.parse(localStorage.getItem(key)).access_token;
const call = (method, path) => fetch(`http://localhost:7208${path}`, { method, headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
console.log(await call('GET', '/api/journey/no-debts'));    // { confirmedAt: null }
console.log(await call('PUT', '/api/journey/no-debts'));    // { confirmedAt: "<now>" }
console.log(await call('POST', '/api/journey/recalculate'));// recalculation must not clear the flag
console.log(await call('GET', '/api/journey/no-debts'));    // still the same timestamp
console.log(await call('DELETE', '/api/journey/no-debts')); // { confirmedAt: null }
console.log(await call('GET', '/api/journey/no-debts'));    // null, and the scores row is intact
```

   If the key is stored differently, read the session from the app's Supabase client instead. Leave the flag **cleared** when done unless Rikky wants it set.
4. **Recalculate** (Journey page, Recalculate), then `GET /api/journey/state`. Check: `manageable_dti` and `appropriate_insurance` levels are `L2`; reload the page and confirm an unevaluated indicator still reads `no_data`; check the SQL for `achievements` and the stored `indicator_scores`. Also check the snapshot rule: `select indicator_code, snapshot_date from journey_indicator_snapshots where snapshot_date = current_date` must not list `manageable_dti` while it is `no_data`, and no row from an earlier day changed.
5. **Empty-state UI.** The owner has a liability, so the prompt is hidden for them (correct). To see the prompt, sign in as a user with no liabilities (the disposable "empty" test user of the PF-S08 harness, see `playwright.pf-s08.config.ts` and [pf-s08-cashflow-pilot.md](../../docs/runbooks/pf-s08-cashflow-pilot.md)), or use dev tools to inspect it. Do **not** delete the owner's liability. Check: prompt shows "I have no debts"; after pressing it, the date and "Undo" show; Journey shows the debt row without "Not evaluated" and the level card shows a score; after "Undo" it returns to "Not evaluated · update your debts" in neutral grey, and today's snapshot row for `manageable_dti` is gone.
6. **Record** in "Before / after" (Execution Notes): the after scores, the date, which achievements are now unlocked (especially `debt_free`, `graduated_l2`, `consistent_investor`), and whether any was earned on empty or unknown data. Report it; do not delete anything.
7. Fill the deploy date into the rubric changelog ("Version 2 — …") and the "as of" date in `formulas.md`. Add a dated line to `docs/STATUS.md` in the style of the existing 2026-10-25 entry.
8. Regenerate the board: `node "$HOME/.claude/skills/loop-lib/scripts/board.mjs" --root . --write`.

> **Why:** The brief requires a recalculation after deploy and the before/after record. The owner's real data is the case that exposed the unknown-payment hole, so the report on what unlocked matters more than the code. The console snippet avoids handling a token in a shell and proves the two things most likely to break silently: that a recalculation does not erase the flag, and that clearing really writes null.

---

## Notes

- **Owner-visible consequence.** The owner has one revolving liability with no monthly payment and 4 `savings` accounts (STEP 3b item 5 makes cover evaluate). The brief said to note the unknown-payment case and not fix it; the architect review (2026-10-25) moved the one-line rule into this plan, because achievements are never revoked and a recalculation on either the old rules or a "100 on unknown" rule would permanently award `debt_free`. After this plan the card makes DTI `no_data` and the Journey says so. `graduated_l2` ("Level 2 Cleared") can still unlock if cover alone scores 70 or more, since L2 clears when every *live* indicator is at 70 (CIO Q5). Entering the card's minimum payment turns DTI live and is the way to get a real `debt_free` decision.
- **Why a narrow entity, not a new property on `UserJourneyState`.** Every recalculation upserts the whole `UserJourneyState` row. A property on that entity would be sent as null each time and could erase the confirmation. The narrow entity maps one column; PostgREST merge-duplicates updates only the columns present in the payload. STEP 6g proves it against the real stack, before the frontend is built, and STEP 12 repeats it. If it fails, stop (see below).
- **Rows written before this change** hold `0` for unevaluated indicators, so until the first recalculation after deploy `GET /state` shows `manageable_dti` as score 0 / not started (the owner's stored row is also stale: last computed 2026-07-30, all zeros). `GetStateAsync` only recalculates when no row exists.
- **Adding a liability does not recalculate the Journey** until plan 2 adds the trigger (`AssetUpdatedEvent` has a handler but no publisher today). The score updates at the next recalculation, or when the confirmation is set or cleared.
- **Follow-ups found, not fixed (out of scope):** (1) a liability whose `end_date` has passed still counts as debt service, so a paid-off loan row keeps DTI above zero until it is deleted; (2) months with no transactions count as zero in the cover denominator and the DTI income average, which overstates cover (the spend ratio skips them correctly), to be tied to the "based on N of M accounts" work (G10) in plan 2; (3) income-side leakage from transfer legs and sale proceeds (CIO Q3, accepted); (4) `positive_cashflow_3mo` unlocks on the 3-month average, not three consecutive months (earlier CIO finding); (5) `DetermineCurrentLevel` returns 1 both for "L1 cleared" and "nothing cleared" (plan 2 must use the first level not yet cleared); (6) the label keys in `journeyLabels.ts` (`manageable_debt`, `liquid_savings`, `long_term_savings`) do not match the real codes, so those rows fall back to a de-underscored code name; (7) the LLM quest fallback in `JourneyAdvisorClient` still names `manageable_dti` (plan 2 removes that path); (8) `EvaluateAchievementsAsync` upserts `journey_achievements` without an `on_conflict` target while the table has `UNIQUE (user_id, achievement_code)`: check what a repeated unlock does (a logged error per recalculation, or a re-stamped `unlocked_at`) before plan 3 shows "unlocked on {date}"; (9) `PUT no-debts` on a user with no state row inserts a bare row with zero scores and `last_computed_at = now()`, and `GetStateAsync` trusts any existing row; the recalculation that follows overwrites it, but if that fails the zeros stay until the next recalculation.
- **Governance.** ARCH-02 (interface in `Application/Interfaces`), ARCH-03 (path matches namespace: `Commands/Journey`), ARCH-04 (actions under 15 lines), ARCH-05 (handler uses an Application interface), CODE-02 (`...Async` names), ERR-02 (new service injects `ILogger`), TEST-01/02/03, FIN-01 (decimal everywhere), FIN-02 (savings set cites the rubric), FIN-04 (not evaluated is neutral). **One conscious exception:** `JourneyConfirmationService` has no unit test (TEST-01) because it is two thin Supabase calls; it is exercised by STEP 12 and belongs with the other services waiting on the integration harness (PF-034).
- The working tree already has uncommitted edits (CLAUDE.md, docs/STATUS.md, docs/INDEX.md, plans/BOARD.md, others). Edit surgically and commit only the files of this plan. Commits carry no AI co-author trailer.
- `liquid_savings_ratio` still uses the latest valuation regardless of its date (G6 belongs to plan 2, which applies it to fence posts and to the liquid-savings star). Nothing here makes the score itself stale-proof.

## Execution Notes

Model: **Opus 5.5** · Effort: **high**. The plan is marked Sensitive: a schema change plus scoring rules where a wrong guess produces plausible-looking wrong numbers, and the narrow-entity upsert behaviour must be verified against the real stack.
Before you start: local Supabase running (`npm start`); optionally ask Rikky to enter the credit card's minimum payment first (see Notes; not required, because an unknown payment is now "not evaluated"). **STEP 1 must not recalculate on the old code.** Plans 2 and 3 wait for this one.

```
/execute plans/in-progress/PF-151-journey-score-fixes-before-quests-todo.md
```

### Stop and ask if

- A recalculation on the owner's data (no monthly payment on the card) unlocks `debt_free`, or leaves `manageable_dti` anything other than `no_data`: the unknown-payment rule is not working; stop and report. Never delete an achievement.
- Anyone presses Recalculate (or opens a page that triggers it) on the old code before STEP 4 is in: stop and tell Rikky, because `debt_free` and `graduated_l2` will already be unlocked on unknown debt.
- The live checks (STEP 6g or STEP 12) show a recalculation clearing `no_debts_confirmed_at`, or `DELETE` not writing null: the narrow-entity approach is wrong; stop before building on it (the fallback is a small `SECURITY INVOKER` SQL function for the write).
- The migration would drop data, change a policy, or the `user_journey_state_owner` policy is not the only policy on the table.

### Before / after (fill in during STEP 1 and STEP 12)

**Before recorded 2026-10-25 (read-only; STEP 1).** Window = Sep/Aug/Jul 2026 (owner's transactions span 2026-05-01…2026-08-03; 24 rows). Stored state row is stale: `current_level 1, total 0.00, level_scores {}, indicator_scores all 0, last_computed 2026-07-30`. No achievements unlocked; snapshot table empty; no transactions in the savings categories. Old-rule scores below are **computed by hand, not persisted** (STEP 1 forbids recalculating on old code — the old DTI of 100 would unlock `debt_free` + `graduated_l2` on unknown debt). "After" fills in on the deploy-day recalculation (STEP 12).

| | Before (old rules, hand-computed) | After (new rules) |
|---|---|---|
| Date | 2026-10-25 | 2026-10-25 (recalculated 13:49 and 14:00 UTC, after the fixes) |
| `spend_lt_income` (score, ratio) | 100, ratio 0.50 (Jul 0.756, Aug 0.244; Sep no income) | 100, ratio 0.50 (unchanged) |
| `liquid_savings_ratio` | not evaluated (casing bug: filter `Savings` ≠ stored `savings`) | live: 0.34 months (Rp 900,000 ÷ ≈ Rp 2.67 m), score 0 |
| `manageable_dti` (score or `no_data`) | 100 (fake: card has no payment → debt service read as 0) | `no_data` (card has no monthly payment); survives reload |
| `savings_rate` | 0 (no savings outflows) | 0 (unchanged) |
| `appropriate_insurance` (level) | L3 | L2 (recalculate and GET /state) |
| L1 / L2 / L3 level scores, total, current level | L1 100, L2 100 (dti only), L3 0; total 66.67; current level 2 | L1 100, L2 0 (cover only), L3 0; total 33.33; current level 1 |
| Achievements unlocked | none persisted (old recalc *would* unlock positive_cashflow_3mo, debt_free, graduated_l1, graduated_l2) | `graduated_l1`, `positive_cashflow_3mo`. Not `debt_free`, not `graduated_l2`, not `consistent_investor`. None earned on unknown debt; `positive_cashflow_3mo` rests on two months of income (Jul, Aug), see follow-up 4 |
| Owner liabilities (count, with payment) | 1, with payment 0 | unchanged (1 card, no payment); "no debts" flag left cleared |

### Hand-run additions (2026-10-25, after the loop run)

- **Snapshot and achievement writes (`JourneyScoringService`).** Both used `Upsert`, which in postgrest-csharp serializes the primary key even with `shouldInsert: false`, so every row was `id 0`. Existing on main, unnoticed because both tables were empty. Snapshots now delete today's rows for the user and insert the live ones (one delete, one batch insert); achievements insert only new codes. This also settles follow-up 8.
- **Valuation casing (`ComputeLiquidSavingsAsync`).** `subject_type` is now `account`, as the CHECK constraint stores it. Without it cover was live but always computed from Rp 0.
- **UTC on `GET /api/journey/no-debts`** (`JourneyConfirmationService`).
- **Not fixed, new follow-ups:** (10) the full-row `UserJourneyState` upsert also sends `created_at`, so the state row's `created_at` is `0001-01-01`; (11) a savings account with no valuation counts as Rp 0 rather than unknown; (12) `scripts/loop-env.mjs` waits for `/health` < 500, but the API reports 503 whenever the compose `db` on 5432 is down, so `up` fails although the API is serving.

## ✅ Owner Review Checklist (G3)

**State:** Code, docs and the local migration are done; backend (511/0/9) and frontend gates are green; every live check in STEP 12 passed on 2026-10-25 (hand run, no independent verifier). What is left for you: read the diff, and optionally repeat one live check in your own browser session.

**Known defects to confirm (fixed during the hand run, still only proven live, not by a unit test):**
- **Snapshot/achievement writes.** `PersistSnapshotsAsync` and `EvaluateAchievementsAsync` in `JourneyScoringService.cs` now use `Insert` (see Hand-run additions). Supabase-bound, so no unit test can catch a regression; check with the SQL in E.
- **Narrow-entity upsert.** Verified live (recalculation keeps the flag, DELETE writes null). Re-check once in your own session if you want a second pair of eyes.

### A. Before you start
- ☐ Branch `loop/pf-151`, worktree `.worktrees/pf-151`. Local Supabase up (`docker ps` shows `supabase_db_personal-finance`).
- ☐ The owner's data is intact: 1 credit-card liability (no monthly payment), 4 `savings` accounts, 0 achievements, stale state row (2026-07-30). Do **not** delete the owner's liability.

### B. Read the code
- ☐ `JourneyScoringRules.cs` — one savings-category set (FIN-02 source comment), `EvaluateDti` (unknown payment → not evaluated, names the liability), `AchievementsEarned` (no_data earns nothing; level needs ≥1 live indicator), `Definitions` (insurance at L2), `SavingsAccountType = "savings"`.
- ☐ `JourneyScoringService.cs` — DTI reads the confirmation inside the try (fails closed); `PersistStateAsync` stores via `LiveScoreMap`; `BuildIndicatorDtos` rebuilds `no_data` from `Definitions`; `PersistSnapshotsAsync` deletes today's `no_data` rows; account filter now `savings`.
- ☐ `JourneyDebtConfirmation.cs` maps only `user_id` + `no_debts_confirmed_at` (narrow entity). `JourneyController` takes the owner from `ICurrentUser`, never the body.

### C. Run the tests
- ☐ Backend: from `apps/api`, `dotnet build PersonalFinance.slnx && dotnet test` → expect **511 passed, 0 failed, 9 skipped**. (Stop the slot-1 API first so the bin is not locked: `node scripts/loop-env.mjs down 1`.)
- ☐ Frontend: from `apps/frontend`, `npm run lint && npx tsc --noEmit -p tsconfig.app.json && npm run build` → 0 lint errors, clean. (Passed in the hand run; `node_modules` is now installed in the main checkout.)

### D. Apply the migration and start the stack
- ☑ Migration applied locally 2026-10-25 and verified (STEP 2).
- ☐ Rebuild and start the API (**only after** the column exists — the new entity queries it), then sign in as the owner.

### E. Live checks (one per criterion proven only with mocks)
- ☐ **Narrow-entity (STEP 6g / 12):** in the signed-in console run the GET→PUT→recalculate→GET→DELETE→GET snippet (STEP 12 item 3). Pass = the second `GET` returns the same timestamp as `PUT` (recalc did not clear it) and the last `GET` returns `null`. Leave the flag cleared.
- ☐ **Owner recalculation (STEP 12):** press Recalculate, then `GET /api/journey/state`. Pass = `manageable_dti` is `no_data` (not score 0) and `debt_free` is **not** unlocked; `appropriate_insurance` is level `L2`; reload keeps `manageable_dti` as `no_data`. Record the `after` column and whether `graduated_l2`/`consistent_investor` unlocked (cover may now score ≥ 70). Never delete an achievement.
- ☐ **Cover is now live:** record `liquid_savings_ratio` before (not evaluated) → after (a score), and the L2 average, in Before/after.
- ☐ **Snapshot and achievement rows (SQL):** `select id, snapshot_date, indicator_code from journey_indicator_snapshots order by id` → no `id 0` rows beyond the pre-fix history, today lists only live indicators (no `manageable_dti`); `select id, achievement_code, unlocked_at from journey_achievements` → `graduated_l1` (id 0, written before the fix) and `positive_cashflow_3mo`, timestamps unchanged by a further Recalculate.
- ☐ **Empty-state UI:** as a user with no liabilities (the PF-S08 empty test user), confirm the "I have no debts" prompt, the date + "Undo" after confirming, the Journey debt row showing a score, and after "Undo" the grey "Not evaluated · update your debts" and today's `manageable_dti` snapshot row gone.

### F. Optional stretch
- ☐ Enter the credit card's minimum payment and recalculate to see a real `debt_free` decision (owner's call; not required).

### G. Decide and close
- ☑ Rubric changelog dated 2026-10-25 and a dated `docs/STATUS.md` line added (STEP 12 item 7).
- ☐ "Accepted" = backend + frontend gates green, the narrow-entity sequence behaves, and the owner recalculation leaves `debt_free` locked with `manageable_dti` = `no_data`. This branch is **not** merged via a PR, so run `/loop-accept` as normal (do not avoid it) — or, if you merge by hand, ask Claude to move the plan to `done/` and remove the branch and worktree. Plans 2 and 3 may start only after this is accepted.

## Loop Notes
- 2026-10-25 22:38 Asia/Makassar All 12 steps and 20 ACs done in a hand run; migration applied locally; backend 511/0/9 and frontend gates green; live checks passed; fixed id-0 snapshot/achievement upserts and valuation casing. Awaiting owner review.
- 2026-10-25 23:00 Asia/Makassar Accepted by the owner and merged into main locally (`Merge loop/pf-151: PF-151`). Moved to done by hand: a hand run cannot reach ready-to-review, so there is no loop verifier verdict for this ticket. Worktree and branch removed, slot 1 released. Not pushed.
