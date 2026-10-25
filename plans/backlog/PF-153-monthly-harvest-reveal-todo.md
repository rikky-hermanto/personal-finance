---
id: PF-153
flags: [Blocked]
---

# PF-153 — Monthly Harvest: reveal the month's completed quests one by one on Journey

> **GitHub Issue:** _(create when scheduling)_
> **Status:** To Do
> **Started:** —
> **Board objective:** After each monthly upload, Journey shows that month's wins one at a time, and an overspent month still counts. Waits for the quest engine.
> **Depends on (blocking):** [PF-152](PF-152-quest-engine-v1-todo.md) (plan 2, Quest Engine v1: `quest_completions`, `seen_at`, the board, the toast this plan replaces), which itself waits for [PF-151](../done/PF-151-journey-score-fixes-before-quests-todo.md) (plan 1, score fixes: investing is not spending, so "green" and "red" are true). Both must be executed and accepted first. Names below were reconciled with PF-152's plan text on 2026-10-25; STEP 0 re-checks them against the code as shipped.
> **Sensitive:** schema and row-level security (one new table, two database functions) and a seen flag whose failure is silent. Phase 1 runs on the stronger model.
> **Planned from branch:** main

## Objective

Plan 3 of 3 for the Journey quests MVP. Plan 2 completes quests by itself after an upload and shows a plain toast. This plan replaces that toast with the Monthly Harvest: on the first Journey visit after something new happened, a calm panel tells you which month was harvested, how many of your accounts it covers, whether you spent less or more than you earned, then plays each new completion one at a time and offers next month's focus. A month where you overspent is harvested like any other, because hiding bad months would make every score a lie. The monthly rhythm (consecutive months with an upload, one free skip per quarter) lives here too.

Nothing in this plan can change a pyramid score (G1), every number comes from stored data or the catalog (G2), and the result always states how many accounts it is based on (G10).

## Acceptance Criteria

The five from the brief:

- [ ] After an upload that completes 2 quests, the next Journey visit plays exactly those 2 quest cards, and after the reveal is finished or skipped, a reload shows no reveal and the API returns `harvest: null`.
- [ ] For a fixture with 5 active cash-flow accounts of which 4 have transactions in the harvested month, the harvest says "Based on 4 of 5 accounts". An inactive account, or one with "include in cash flow" off, is not counted in the 5.
- [ ] A red-month fixture (expenses at or above income, with at least one new completion) shows "Harvested. Your garden grew.", contains none of the words on the no-shame list, uses no red or destructive colour, and awards "Honest Harvest" exactly once, even across repeated recalculations and later red months. A harvested month with no new completion (for example a second red month) says only "Harvested.", because nothing grew.
- [ ] With reduced motion on, the reveal shows all cards at once as static cards: no auto-advance, no animated entrance, no count-up.
- [ ] One skipped month in a calendar quarter keeps the rhythm; a second skipped month in the same quarter restarts it, and no loss message appears anywhere.

Also required:

- [ ] A month with no recorded income is "neutral", never green (FIN-04); exactly equal income and expenses is red (rubric 0-point breakpoint).
- [ ] Two finished months in a row without a harvest end the current rhythm quietly: the page shows only "Longest rhythm" and nothing about the break.
- [ ] A refresh of a month's figures (a late upload of the missing account) updates "N of M" but never re-opens a harvest the owner has already seen (checked in SQL).
- [ ] The first-run backfill shows as one summary card ("You'd already completed N quests") and marks all N completions seen.
- [ ] After the reveal is marked seen, leaving Journey and coming back inside the app (no page reload) shows no reveal and sends no second mark-seen call. The cached board is updated on success, not just refetched.
- [ ] A permanent result on a partly covered month states its basis: the `l1.in_the_green` and `l1.honest_harvest` evidence carry `covered` and `total`, and when `covered < total` the result line ends with "in the accounts you uploaded" (G10, FIN-04).
- [ ] The reveal does not advance and is not marked seen while the tab is hidden.
- [ ] The reveal is not a modal: no focus trap, no scroll lock, links elsewhere on the page work while it plays, Skip is always visible, it pauses while hovered or focused, and leaving mid-way replays only the cards not yet seen.
- [ ] Other users never see or change the owner's harvest rows (two-user RLS check), and `mark_harvest_seen` with someone else's completion ids changes nothing.
- [ ] Scores are identical with and without the ledger write (the G1 test from plan 2 is extended to cover it).
- [ ] Plan 2's toast code path is gone, `unseen` is gone from the board response, and the quests query refetches on every Journey visit (it used a 1-hour cache, which would hide a fresh harvest).
- [ ] No new push notification, scheduled job, daily counter or sharing surface exists.
- [ ] `dotnet build`, `dotnet test`, `npm run lint`, `npx tsc --noEmit -p tsconfig.app.json`, `npm run test:journey`, `npm run build` pass; `gitleaks detect` stays clean.

## Approach

Winner: **a month ledger written by the quest engine's own pass** (22 of 25 against 15 for "derive everything on read" and 15 for "a first-class harvest entity with its own lifecycle"; see Notes). Each recalculation pass already holds the last three full months in memory. After it inserts new completions, the engine also upserts one `harvest_months` row per month that has transactions: income, expenses, the green/red/neutral result, and "accounts covered of accounts total". A database function does the upsert and never touches `seen_at`, so refreshing a month's figures can never replay a harvest. Another database function marks a batch of completions and every ledger month up to a given month as seen in one transaction.

On read, PF-152's `QuestBoardService` fetches the ledger and the unseen completions (it already reads the completions) and hands them to a pure `HarvestAssembler`, which returns the `harvest` block (null when nothing is unseen); a `MonthlyRhythm` function returns `rhythm`. The board's `unseen` list and its toast are removed, because the Harvest replaces them: one source of truth for "what is new". All copy lives in one pure `HarvestCopy` class so a lint test can scan it. On the frontend, a non-modal `HarvestPanel` sits at the top of the Journey page. A small pure reducer decides which card is showing; the component only renders. It marks the harvest seen when the last card has been shown or the owner skips.

The ledger is a separate port, `IHarvestLedger`, on purpose: PF-152 tests that `IQuestStore`'s write surface is only completions, focus, snoozes and seen, and the engine must have no write path to scores (G1). A second small port keeps both promises true.

Deliberately not done: a modal or full-screen takeover, confetti or sound, storing a frozen copy of each harvest, re-deriving anything from all-time transactions on read, a sidebar garden widget (it does not exist in the app), garden art (plan 5), other hidden quests (plan 4), seasonal events (plan 6).

## Affected Files

| File | Change |
|------|--------|
| `supabase/migrations/{timestamp}_pf_153_harvest_months.sql` | Create — `harvest_months` table, owner RLS, grants, `upsert_harvest_months()` and `mark_harvest_seen()`. Timestamp must be later than plan 2's migration |
| `apps/api/src/PersonalFinance.Application/Dtos/HarvestDtos.cs` | Create — `HarvestMonthRecord`, `HarvestLedgerRow`, `HarvestItemDto`, `HarvestDto`, `RhythmDto` |
| `apps/api/src/PersonalFinance.Application/Interfaces/IHarvestLedger.cs` | Create — port for the ledger (ARCH-02) |
| `apps/api/src/PersonalFinance.Application/Services/Harvest/MonthlyRhythm.cs` | Create — rhythm with one free skip per quarter |
| `apps/api/src/PersonalFinance.Application/Services/Harvest/HarvestSummaryBuilder.cs` | Create — green/red/neutral and "N of M" |
| `apps/api/src/PersonalFinance.Application/Services/Harvest/HarvestCopy.cs` | Create — every sentence the Harvest shows |
| `apps/api/src/PersonalFinance.Application/Services/Harvest/HarvestAssembler.cs` | Create — builds the `harvest` block, folds the backfill |
| `apps/api/src/PersonalFinance.Application/Commands/Harvest/MarkHarvestSeenCommand.cs` (+ `Handler`) | Create — MediatR command |
| `apps/api/src/PersonalFinance.Application/Validation/MarkHarvestSeenCommandValidator.cs` | Create — id count and month format |
| `apps/api/src/PersonalFinance.Infrastructure/Supabase/SupabaseHarvestLedger.cs` | Create — calls the two functions and reads the ledger with the caller's JWT |
| `apps/api/src/PersonalFinance.Api/Program.cs` | Edit — register `IHarvestLedger` next to `ICashflowMutationService` |
| `apps/api/src/PersonalFinance.Api/Controllers/JourneyController.cs` | Edit — `POST /api/journey/harvest/seen` |
| `apps/api/src/PersonalFinance.Application/Services/QuestEngine.cs` (PF-152) | Edit — takes `IHarvestLedger`; writes the ledger after the detectors; isolated from failure |
| `apps/api/src/PersonalFinance.Application/Quests/{QuestContext,QuestContextFactory}.cs` (PF-152) | Edit — `MonthFacts` gains `TransactionCount` and `AccountIdsWithTransactions` |
| `apps/api/src/PersonalFinance.Application/Quests/Rules/{L1Rules,L2Rules}.cs`, `QuestCatalog.cs` (PF-152) | Edit — `GreenMonth` uses the shared classifier; `ValuationExists` stores `months`; new `RedMonthRecorded` rule and the `l1.honest_harvest` entry |
| `apps/api/src/PersonalFinance.Application/Services/QuestBoardService.cs`, `Dtos/QuestBoardDto.cs` (PF-152) | Edit — add `Harvest` and `Rhythm` (STEP 5); remove `Unseen`, `UnseenCompletionDto` and the fold once the toast is gone (STEP 10), because `HarvestAssembler` folds now |
| `apps/api/tests/PersonalFinance.Tests/Quests/*` (PF-152) | Edit — `FakeHarvestLedger`; engine constructor; the unseen-fold tests move to the assembler tests; the G2 reflection list changes |
| `apps/api/tests/PersonalFinance.Tests/Services/Harvest/*.cs` | Create — rhythm, summary, copy, assembler tests |
| `apps/api/tests/PersonalFinance.Tests/Infrastructure/SupabaseHarvestLedgerTests.cs` | Create — request shape and mapping through a stub HTTP handler |
| `apps/api/tests/PersonalFinance.Tests/Commands/MarkHarvestSeenCommandHandlerTests.cs`, `Controllers/JourneyControllerHarvestTests.cs` | Create |
| `apps/frontend/src/types/Journey.ts` | Edit — `Harvest`, `HarvestItem`, `Rhythm`; `QuestBoard` gets `harvest` and `rhythm`, loses `unseen` and `UnseenCompletion` in STEP 10, with the toast |
| `apps/frontend/src/api/journeyApi.ts` | Edit — `markHarvestSeen()` |
| `apps/frontend/src/lib/journey/harvest/{revealMachine,rhythm,harvestMotion}.ts` (+ `*.test.ts`) | Create — pure reveal reducer, rhythm label, motion constants. Under `lib/journey`, so PF-152's `npm run test:journey` script and CI step already run them |
| `apps/frontend/src/lib/journey/harvest/harvestStyles.test.ts` | Create — reads the three Harvest components as text and fails on any red or destructive class, so "never coloured red" is checked in CI, not only in the skipped-without-credentials Playwright spec |
| `apps/frontend/src/lib/journey/questToasts.ts`, `lib/journey/__tests__/questToasts.test.ts` (PF-152) | Delete — the toast planner has no caller once the Harvest replaces the toast |
| `apps/frontend/src/hooks/use-count-up.ts` | Create |
| `apps/frontend/src/components/journey/{HarvestPanel,HarvestCard,FocusPick}.tsx` | Create |
| `apps/frontend/src/pages/journey/JourneyPage.tsx` (PF-152) | Edit — mount the panel, rhythm line; remove the toast effect and its imports |
| `apps/frontend/e2e/journey.spec.ts` (PF-152) | Edit — remove PF-152's mocked-board toast-once test (replaced by the Harvest spec) |
| `apps/frontend/e2e/journey-harvest.spec.ts` | Create — Playwright with the quests endpoint stubbed |
| `docs/architecture/API-endpoints.md`, `docs/STATUS.md`, `docs/ideas/reward-loop-closure.md` | Edit — new endpoint and board fields; Journey row; note that the "quests completed while the app was closed" question is answered |

---

## TODO

# Phase 1 — Data and API

### [ ] STEP 0 — Confirm the dependencies and re-check the names (gate)
```bash
ls plans/done | grep -E "PF-151|PF-152"
grep -rl "quest_completions" supabase/migrations
grep -rn "class QuestEngine\|record MonthFacts\|record QuestBoardDto\|class QuestBoardService" apps/api/src | grep -v "/obj/"
ls apps/frontend/src/lib/journey apps/frontend/src/lib/journey/__tests__ 2>/dev/null
```
PF-151 and PF-152 must both be in `plans/done/` (or merged to the branch you are on) with `quest_completions` in a migration. If either is missing, stop. This plan was reconciled with PF-152's plan text; the table lists every name it relies on. If the code as shipped differs, change only the name in the step that uses it and note the difference in Notes.

| Name (from PF-152's plan, STEPS 2, 10-21) | Used in |
|---|---|
| Table `quest_completions(id bigserial, user_id, quest_code, rung smallint, catalog_version, evidence jsonb, completed_at, seen_at)`; rung is 1-based (0 for single-step quests); the app role has `SELECT, INSERT` and `UPDATE (seen_at)` only | STEP 1 `mark_harvest_seen` (it updates `seen_at` only, which that grant allows), garden total |
| Entity `QuestCompletion` (`Evidence` is a `Dictionary<string, object?>`; `SeenAt`); `evidence["backfill"] == true` marks the first-run batch | STEPS 2, 5 |
| `IQuestStore.LoadCompletionsAsync`, `LoadCashflowAccountsAsync` (active accounts with "include in cash flow" on: the "M" of "N of M") | STEPS 4, 5 |
| `QuestEngine(IQuestStore, ILogger<QuestEngine>).EvaluateAsync(userId, ScoringSnapshot)`; `QuestContextFactory.FromSnapshot(...)`; `QuestContext.Months` as `MonthFacts(Year, Month, Income, Expense, TopExpenses)` (expense already excludes savings outflows, PF-151); `QuestContext.CashflowAccounts`; `QuestContext.Today` | STEP 4 |
| `abstract record QuestRule { Evaluate, Applies, Progress }`, `QuestKind.Recognition`, `QuestCatalog.Build()`, `QuestCopy.CompletionTitle(quest, rung, evidence)`, evidence keys: fence posts `months`/`valuedAt`, `l1.in_the_green` `month`/`ratio`, stars `score`/`raw`, `ValuationExists` none yet | STEPS 2, 4 |
| `QuestBoardDto { CatalogVersion, WorkingLevel, Focus, Offers, Unseen }`, `QuestBoardService(IQuestStore, TimeProvider)`, `GetQuestBoardQuery`, focus plus offers capped at 3 | STEP 5 |
| `POST /api/journey/quests/{code}/focus` returns the board; `POST /api/journey/quests/seen` stays but the page stops calling it; controller actions are expression-bodied through MediatR | STEPS 5, 10 |
| Frontend: types `QuestBoard`, `QuestCard` (kind, title, why, progress, deeplink), `UnseenCompletion`; `getJourneyQuests`, `setQuestFocus`, `markQuestsSeen`; `lib/journey/questToasts.ts` and its test; the toast effect in `JourneyPage`; `npm run test:journey` plus a CI step; a mocked-board toast test in `e2e/journey.spec.ts` | STEPS 8-11 |

> **Why:** This plan was drafted in parallel with PF-152 and then reconciled with its text, but the code may differ from either plan. The gate is cheap and keeps every later step compiling against what exists.
> **Check:** all four commands show what the table says; any difference is written down in Notes.

---

### [ ] STEP 1 — Migration: the ledger table and its two functions
Use the `db-migrate` skill. Create `supabase/migrations/20261027000000_pf_153_harvest_months.sql` (PF-152's is `20261026000000`; if anything newer exists by then, use a later timestamp):

```sql
-- PF-153: one row per harvested month per owner, plus the two functions that write it.
-- Same owner pattern as 20261014010000_pf_s08_owner_scope_deferred_modules.sql.
BEGIN;

CREATE TABLE public.harvest_months (
  user_id          uuid        NOT NULL REFERENCES auth.users(id),
  month            date        NOT NULL CHECK (extract(day FROM month) = 1),
  income_idr       numeric(20,2) NOT NULL CHECK (income_idr >= 0),
  expense_idr      numeric(20,2) NOT NULL CHECK (expense_idr >= 0),
  result           text        NOT NULL CHECK (result IN ('green', 'red', 'neutral')),
  accounts_covered smallint    NOT NULL CHECK (accounts_covered >= 0),
  accounts_total   smallint    NOT NULL CHECK (accounts_total >= accounts_covered),
  computed_at      timestamptz NOT NULL DEFAULT now(),
  seen_at          timestamptz,
  PRIMARY KEY (user_id, month)
);

ALTER TABLE public.harvest_months ENABLE ROW LEVEL SECURITY;

CREATE POLICY harvest_months_owner ON public.harvest_months FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- PF-S08 revoked every table privilege from authenticated; each new table needs an explicit grant.
-- No DELETE: a harvest row is never removed. Update is column-level, so user_id and month (the key)
-- can never be changed. This does not stop the owner writing seen_at through PostgREST directly;
-- the promise below is about the app's own refresh path, not the table.
GRANT SELECT, INSERT ON public.harvest_months TO authenticated;
GRANT UPDATE (income_idr, expense_idr, result, accounts_covered, accounts_total, computed_at, seen_at)
  ON public.harvest_months TO authenticated;

-- Insert or refresh the figures. seen_at is deliberately absent from this function's update list, so a
-- late upload that changes "4 of 5" to "5 of 5" can never re-open a harvest that was already seen.
CREATE OR REPLACE FUNCTION public.upsert_harvest_months(p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_owner uuid := auth.uid();
  v_count integer;
BEGIN
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 36 THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.harvest_months
    (user_id, month, income_idr, expense_idr, result, accounts_covered, accounts_total)
  SELECT v_owner, r.month, r.income_idr, r.expense_idr, r.result, r.accounts_covered, r.accounts_total
  FROM jsonb_to_recordset(p_rows) AS r(
    month date, income_idr numeric, expense_idr numeric, result text,
    accounts_covered smallint, accounts_total smallint)
  ON CONFLICT (user_id, month) DO UPDATE SET
    income_idr       = EXCLUDED.income_idr,
    expense_idr      = EXCLUDED.expense_idr,
    result           = EXCLUDED.result,
    accounts_covered = EXCLUDED.accounts_covered,
    accounts_total   = EXCLUDED.accounts_total,
    computed_at      = now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END
$$;

-- Mark a reveal as seen in one transaction: the listed completions, and every unseen ledger month
-- up to p_through_month. RLS limits both updates to the caller's own rows, so foreign ids do nothing.
CREATE OR REPLACE FUNCTION public.mark_harvest_seen(p_completion_ids bigint[], p_through_month date)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF coalesce(array_length(p_completion_ids, 1), 0) > 200 THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  UPDATE public.quest_completions
     SET seen_at = now()
   WHERE id = ANY (coalesce(p_completion_ids, ARRAY[]::bigint[])) AND seen_at IS NULL;

  IF p_through_month IS NOT NULL THEN
    UPDATE public.harvest_months
       SET seen_at = now()
     WHERE month <= p_through_month AND seen_at IS NULL;
  END IF;
END
$$;

REVOKE ALL ON FUNCTION public.upsert_harvest_months(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_harvest_months(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.mark_harvest_seen(bigint[], date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_harvest_seen(bigint[], date) TO authenticated;

COMMIT;
```

Apply with `supabase db push` (local only), then run this check. It rolls back, so it leaves nothing behind. Get the connection string from `supabase status`.
```sql
BEGIN;
SELECT id AS owner FROM auth.users ORDER BY created_at LIMIT 1 \gset
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :'owner', 'role', 'authenticated')::text, true);

SELECT public.upsert_harvest_months('[{"month":"2026-09-01","income_idr":10000000,"expense_idr":8000000,"result":"green","accounts_covered":4,"accounts_total":5}]'::jsonb);
UPDATE public.harvest_months SET seen_at = now() WHERE month = '2026-09-01';
SELECT public.upsert_harvest_months('[{"month":"2026-09-01","income_idr":10000000,"expense_idr":8500000,"result":"green","accounts_covered":5,"accounts_total":5}]'::jsonb);
SELECT expense_idr, accounts_covered, seen_at IS NOT NULL AS still_seen FROM public.harvest_months;
-- expect: 8500000.00 | 5 | t   (figures refreshed, seen flag kept)

SELECT set_config('request.jwt.claims',
  json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
SELECT count(*) FROM public.harvest_months;   -- expect 0: another user sees nothing
ROLLBACK;

BEGIN;
SET LOCAL ROLE anon;
SELECT public.upsert_harvest_months('[]'::jsonb);   -- expect: permission denied
ROLLBACK;
```
Then a second rollback-only check for `mark_harvest_seen`: a stranger's call changes nothing, and the owner's call stops at the month cut-off. Adapt the `INSERT INTO public.quest_completions` columns to plan 2's real table (STEP 0). The codes and 2001 months are made up so they cannot collide with real rows.
```sql
BEGIN;
SELECT id AS owner FROM auth.users ORDER BY created_at LIMIT 1 \gset
INSERT INTO public.quest_completions (user_id, quest_code, rung, catalog_version) VALUES
  (:'owner', 'pf153.check.a', 0, 1),
  (:'owner', 'pf153.check.b', 0, 1);
INSERT INTO public.harvest_months (user_id, month, income_idr, expense_idr, result, accounts_covered, accounts_total) VALUES
  (:'owner', '2001-08-01', 1, 1, 'red', 1, 1),
  (:'owner', '2001-09-01', 1, 1, 'red', 1, 1);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
SELECT public.mark_harvest_seen(ARRAY(SELECT id FROM public.quest_completions WHERE quest_code LIKE 'pf153.check.%'), '2001-09-01');
RESET ROLE;
SELECT 'stranger' AS caller,
       (SELECT count(*) FROM public.quest_completions WHERE quest_code LIKE 'pf153.check.%' AND seen_at IS NOT NULL) AS completions_seen,
       (SELECT count(*) FROM public.harvest_months WHERE month IN ('2001-08-01', '2001-09-01') AND seen_at IS NOT NULL) AS months_seen;
-- expect: 0 | 0

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :'owner', 'role', 'authenticated')::text, true);
SELECT public.mark_harvest_seen(
  ARRAY(SELECT id FROM public.quest_completions WHERE quest_code = 'pf153.check.a'), '2001-08-01');
RESET ROLE;
SELECT 'owner' AS caller,
       (SELECT count(*) FROM public.quest_completions WHERE quest_code LIKE 'pf153.check.%' AND seen_at IS NOT NULL) AS completions_seen,
       (SELECT string_agg(to_char(month, 'YYYY-MM'), ',') FROM public.harvest_months WHERE month IN ('2001-08-01', '2001-09-01') AND seen_at IS NOT NULL) AS months_seen;
-- expect: 1 | 2001-08   (September 2001 stays unseen)
ROLLBACK;
```
These checks were run on 2026-10-25 against a throwaway Postgres 16 container with minimal stand-ins for `auth.users`, `auth.uid()`, the two roles and plan 2's table. They have not yet run on the real Supabase stack, so run them there.

> **Why:** A plain PostgREST upsert sends every column the C# model has and could silently null `seen_at`, which would replay old harvests with no error anywhere. A function with an explicit update list makes that impossible and is testable in SQL. `user_id` comes from `auth.uid()` inside the function, never from the payload. The `GRANT` line matters because PF-S08 revoked all table privileges: without it the API gets "permission denied" and, because the engine swallows ledger failures (STEP 4), nothing would show up except an empty Harvest.
> **Check:** the first block prints `8500000.00 | 5 | t`, `0`, and a permission error for `anon`; the second prints `0 | 0` for the stranger and `1 | 2001-08` for the owner. Also confirm, as `authenticated`, that `DELETE` on `harvest_months` is refused ("permission denied") and that `UPDATE public.harvest_months SET month = month` and `SET user_id = user_id` are refused too (the column-level grant leaves the key out). If `upsert_harvest_months` now fails with "permission denied for table harvest_months", the column list in the grant is missing a column the function updates.

---

### [ ] STEP 2 — Pure harvest logic, tests first
Create the DTOs, then the four pure classes. They depend on nothing but the BCL, which is why they are easy to test. (The classes and the four test files below were compiled and run in a scratch project on 2026-10-25, with warnings as errors on the classes: 43 tests pass, 48 with the ledger adapter tests of STEP 3. The real test project has not run them yet.)

`apps/api/src/PersonalFinance.Application/Dtos/HarvestDtos.cs`
```csharp
namespace PersonalFinance.Application.Dtos;

public sealed record HarvestMonthRecord(
    DateOnly Month, decimal IncomeIdr, decimal ExpenseIdr, string Result,
    int AccountsCovered, int AccountsTotal);

public sealed record HarvestLedgerRow(HarvestMonthRecord Record, bool Seen);

public sealed record HarvestItemDto(
    string Code, string Glyph, string Title, string? Line, int Count,
    IReadOnlyList<long> CompletionIds, bool IsBackfill);

public sealed record HarvestDto(
    string? Month, string Title, string? Basis, int? AccountsCovered, int? AccountsTotal,
    string? Result, string? ResultLine, string? Closing,
    int GardenBefore, int GardenAfter, IReadOnlyList<HarvestItemDto> Items);

public sealed record RhythmDto(int Current, int Longest);
```

`apps/api/src/PersonalFinance.Application/Services/Harvest/MonthlyRhythm.cs`
```csharp
using PersonalFinance.Application.Dtos;

namespace PersonalFinance.Application.Services.Harvest;

/// <summary>
/// Counts consecutive harvested months. One missing month between two harvested months is
/// forgiven once per calendar quarter; any other gap starts a new run quietly.
/// Product rule: plans/brainstorms/pm-journey-quests-analysis.md (Ritual quest type).
/// </summary>
public static class MonthlyRhythm
{
    public static RhythmDto Compute(IEnumerable<DateOnly> harvestedMonths, DateOnly lastFullMonth)
    {
        var last = FirstOfMonth(lastFullMonth);
        var months = harvestedMonths
            .Select(FirstOfMonth)
            .Where(m => m <= last)
            .Distinct()
            .OrderBy(m => m)
            .ToList();
        if (months.Count == 0) return new RhythmDto(0, 0);

        var run = 0;
        var longest = 0;
        var skipsUsed = new HashSet<(int Year, int Quarter)>();
        DateOnly? previous = null;

        foreach (var month in months)
        {
            if (previous is null)
            {
                run = 1;
            }
            else
            {
                var missing = MonthsBetween(previous.Value, month) - 1;
                if (missing == 0)
                {
                    run++;
                }
                else if (missing == 1 && skipsUsed.Add(QuarterOf(previous.Value.AddMonths(1))))
                {
                    run++; // the skipped month itself is not counted
                }
                else
                {
                    run = 1;
                    skipsUsed.Clear();
                }
            }
            longest = Math.Max(longest, run);
            previous = month;
        }

        // Two or more finished months without a harvest: the run has ended. Nothing is shown about it.
        var current = MonthsBetween(months[^1], last) >= 2 ? 0 : run;
        return new RhythmDto(current, longest);
    }

    private static DateOnly FirstOfMonth(DateOnly d) => new(d.Year, d.Month, 1);

    private static int MonthsBetween(DateOnly from, DateOnly to) =>
        (to.Year - from.Year) * 12 + (to.Month - from.Month);

    private static (int Year, int Quarter) QuarterOf(DateOnly d) => (d.Year, (d.Month - 1) / 3 + 1);
}
```

`apps/api/src/PersonalFinance.Application/Services/Harvest/HarvestSummaryBuilder.cs`
```csharp
using PersonalFinance.Application.Dtos;

namespace PersonalFinance.Application.Services.Harvest;

public static class HarvestSummaryBuilder
{
    public const string Green = "green";
    public const string Red = "red";
    public const string Neutral = "neutral";

    // Source: docs/ideas/scoring-rubric.md and docs/reference/finance-domain/formulas.md section 1:
    // a spend ratio of 1.00 is the 0-point breakpoint of spend_lt_income. Green means spending stayed
    // under income. No income recorded is neutral, never green (FIN-04).
    public static string Classify(decimal incomeIdr, decimal expenseIdr) =>
        incomeIdr <= 0m ? Neutral : expenseIdr < incomeIdr ? Green : Red;

    /// <summary>"N of M": how many of the cash-flow accounts have a transaction in the month.</summary>
    public static (int Covered, int Total) Coverage(
        IReadOnlyCollection<Guid> cashflowAccountIds, IReadOnlySet<Guid>? accountsWithTransactions) =>
        (accountsWithTransactions is null ? 0 : cashflowAccountIds.Count(accountsWithTransactions.Contains),
         cashflowAccountIds.Count);

    /// <summary>Null when the month has no transactions: nothing was harvested.</summary>
    public static HarvestMonthRecord? Build(
        DateOnly month, decimal incomeIdr, decimal expenseIdr, int transactionCount,
        IReadOnlyCollection<Guid> cashflowAccountIds, IReadOnlySet<Guid> accountsWithTransactions)
    {
        if (transactionCount <= 0) return null;
        var (covered, total) = Coverage(cashflowAccountIds, accountsWithTransactions);
        return new HarvestMonthRecord(
            new DateOnly(month.Year, month.Month, 1), incomeIdr, expenseIdr,
            Classify(incomeIdr, expenseIdr), covered, total);
    }
}
```

`apps/api/src/PersonalFinance.Application/Services/Harvest/HarvestCopy.cs`
```csharp
using System.Globalization;
using System.Text.RegularExpressions;

namespace PersonalFinance.Application.Services.Harvest;

/// <summary>
/// Every sentence the Harvest shows. Numbers come only from stored evidence or counts (G2).
/// A template whose evidence key is missing yields no line instead of an invented one.
/// </summary>
public static partial class HarvestCopy
{
    // Only said when at least one card was added. With nothing new the claim would be false.
    public const string Closing = "Harvested. Your garden grew.";
    public const string ClosingNothingNew = "Harvested.";
    public const string GardenTitle = "New in your garden";
    public const string BackfillLine = "Your garden starts with them.";

    public static string MonthTitle(DateOnly month) =>
        $"{month.ToString("MMMM", CultureInfo.InvariantCulture)} harvested";

    public static string Basis(int covered, int total) =>
        total <= 0 ? "Based on your uploaded transactions" : $"Based on {covered} of {total} accounts";

    public const string PartialQualifier = " in the accounts you uploaded";

    // A verdict on some of the accounts must say so (G10, FIN-04). Neutral already says what is missing.
    public static string ResultLine(string result, int covered, int total)
    {
        var partial = total > 0 && covered < total ? PartialQualifier : "";
        return result switch
        {
            HarvestSummaryBuilder.Green => "Spending stayed under income" + partial,
            HarvestSummaryBuilder.Red => "Spending ran above income" + partial,
            _ => "No income was recorded this month",
        };
    }

    public static string BackfillTitle(int count) =>
        count == 1 ? "You'd already completed 1 quest" : $"You'd already completed {count} quests";

    private sealed record Entry(string Glyph, string? Template);

    // A key in braces must be a number in the evidence the quest detectors store (PF-152 rules).
    private static readonly IReadOnlyDictionary<string, Entry> Registry = new Dictionary<string, Entry>
    {
        ["l1.meet_your_money"] = new("🌱", "Your first statement is in."),
        ["l1.sort_the_pile"] = new("🏷️", "Your five biggest expenses all have a category."),
        ["l1.full_picture"] = new("🧭", "Another account joins your picture."),
        ["l1.in_the_green"] = new("🌿", "A month where spending stayed under income."),
        ["l1.honest_harvest"] = new("🌧️", "A month that ran over, harvested anyway. Honest data keeps every score true."),
        ["l2.count_your_cushion"] = new("🪴", "You are covered for {months:0.0} months."),
        ["l2.map_your_debts"] = new("🪨", "Your debts are mapped."),
        ["l2.fence_posts"] = new("🪵", "{months:0.0} months of cover, one fence post higher."),
        ["l1.boss"] = new("🌳", "Every Foundations indicator has cleared its bar."),
        ["l2.boss"] = new("🛡️", "Every Defense indicator has cleared its bar."),
    };

    private static readonly Entry StarEntry = new("⭐", null);
    private static readonly Entry DefaultEntry = new("🌱", null);

    /// <summary>All fixed sentences, for the no-shame lint test.</summary>
    public static IEnumerable<string> AllFixedText() =>
        new[]
        {
            Closing, ClosingNothingNew, GardenTitle, BackfillLine, BackfillTitle(2),
            MonthTitle(new DateOnly(2026, 9, 1)), Basis(4, 5), Basis(0, 0),
            ResultLine(HarvestSummaryBuilder.Green, 5, 5), ResultLine(HarvestSummaryBuilder.Red, 5, 5),
            ResultLine(HarvestSummaryBuilder.Green, 4, 5), ResultLine(HarvestSummaryBuilder.Red, 4, 5),
            ResultLine(HarvestSummaryBuilder.Neutral, 4, 5),
        }.Concat(Registry.Values.Where(e => e.Template is not null).Select(e => e.Template!));

    public static IReadOnlyCollection<string> RegisteredCodes => Registry.Keys.ToList();

    public static (string Glyph, string? Line) Reveal(string code, IReadOnlyDictionary<string, object?> evidence)
    {
        var entry = Registry.TryGetValue(code, out var found) ? found
            : code.StartsWith("stars.", StringComparison.Ordinal) ? StarEntry
            : DefaultEntry;
        return (entry.Glyph, entry.Template is null ? null : Fill(entry.Template, evidence));
    }

    private static string? Fill(string template, IReadOnlyDictionary<string, object?> evidence)
    {
        var missing = false;
        var text = PlaceholderPattern().Replace(template, m =>
        {
            evidence.TryGetValue(m.Groups["key"].Value, out var value);
            switch (value)
            {
                // Newtonsoft returns long and double for JSON numbers; anything else is not a number.
                case sbyte or byte or short or ushort or int or uint or long or ulong or float or double or decimal:
                    var format = m.Groups["fmt"].Success ? m.Groups["fmt"].Value : "0.##";
                    return Convert.ToDecimal(value, CultureInfo.InvariantCulture)
                        .ToString(format, CultureInfo.InvariantCulture);
                default:
                    missing = true;
                    return "";
            }
        });
        return missing ? null : text;
    }

    [GeneratedRegex(@"\{(?<key>\w+)(?::(?<fmt>[^}]+))?\}")]
    private static partial Regex PlaceholderPattern();
}
```

`apps/api/src/PersonalFinance.Application/Services/Harvest/HarvestAssembler.cs`
```csharp
using System.Globalization;
using PersonalFinance.Application.Dtos;

namespace PersonalFinance.Application.Services.Harvest;

/// <summary>A quest completion the owner has not seen yet, in the shape the Harvest needs.</summary>
public sealed record HarvestInputItem(
    long Id, string Code, string Title, IReadOnlyDictionary<string, object?> Evidence,
    bool IsBackfill, DateTime CompletedAt);

public static class HarvestAssembler
{
    // Rows of one engine pass share the same completed_at, so the story order is explicit:
    // quests first, then stars, and the level-cleared moment last.
    private static int RevealOrder(string code) =>
        code.EndsWith(".boss", StringComparison.Ordinal) ? 2
        : code.StartsWith("stars.", StringComparison.Ordinal) ? 1
        : 0;

    /// <summary>True for a completion the engine flagged as part of the first-run batch (PF-152).</summary>
    public static bool IsBackfillEvidence(IReadOnlyDictionary<string, object?> evidence) =>
        evidence.TryGetValue("backfill", out var flag) && flag is true;

    /// <summary>Null when there is nothing to reveal, which is how a seen harvest never replays.</summary>
    public static HarvestDto? Build(
        IReadOnlyList<HarvestInputItem> unseen,
        IReadOnlyList<HarvestMonthRecord> unseenMonths,
        int gardenTotal)
    {
        if (unseen.Count == 0 && unseenMonths.Count == 0) return null;

        HarvestMonthRecord? month = unseenMonths.Count == 0 ? null : unseenMonths.MaxBy(m => m.Month);

        var items = new List<HarvestItemDto>();
        var backfill = unseen.Where(i => i.IsBackfill).OrderBy(i => i.Id).ToList();
        if (backfill.Count > 0)
        {
            items.Add(new HarvestItemDto(
                "backfill", "🌳", HarvestCopy.BackfillTitle(backfill.Count), HarvestCopy.BackfillLine,
                backfill.Count, backfill.Select(b => b.Id).ToList(), true));
        }
        foreach (var row in unseen.Where(i => !i.IsBackfill)
                     .OrderBy(i => i.CompletedAt).ThenBy(i => RevealOrder(i.Code)).ThenBy(i => i.Id))
        {
            var (glyph, line) = HarvestCopy.Reveal(row.Code, row.Evidence);
            items.Add(new HarvestItemDto(row.Code, glyph, row.Title, line, 1, [row.Id], false));
        }

        var added = items.Sum(i => i.Count);
        return new HarvestDto(
            Month: month?.Month.ToString("yyyy-MM", CultureInfo.InvariantCulture),
            Title: month is null ? HarvestCopy.GardenTitle : HarvestCopy.MonthTitle(month.Month),
            Basis: month is null ? null : HarvestCopy.Basis(month.AccountsCovered, month.AccountsTotal),
            AccountsCovered: month?.AccountsCovered,
            AccountsTotal: month?.AccountsTotal,
            Result: month?.Result,
            ResultLine: month is null
                ? null
                : HarvestCopy.ResultLine(month.Result, month.AccountsCovered, month.AccountsTotal),
            Closing: month is null ? null
                : items.Count > 0 ? HarvestCopy.Closing : HarvestCopy.ClosingNothingNew,
            GardenBefore: Math.Max(0, gardenTotal - added),
            GardenAfter: gardenTotal,
            Items: items);
    }
}
```

Tests, under `apps/api/tests/PersonalFinance.Tests/Services/Harvest/` (namespace `PersonalFinance.Tests.Services.Harvest`). Write them before the classes and watch them fail, then add the classes (TDD).

`MonthlyRhythmTests.cs`
```csharp
using System.Globalization;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Services.Harvest;

namespace PersonalFinance.Tests.Services.Harvest;

public class MonthlyRhythmTests
{
    [Theory]
    [InlineData("", "2026-09", 0, 0)]                                                // nothing yet
    [InlineData("2026-09", "2026-09", 1, 1)]                                         // first harvest
    [InlineData("2026-07,2026-08,2026-09", "2026-09", 3, 3)]                         // consecutive
    [InlineData("2026-07,2026-09,2026-10", "2026-10", 3, 3)]                         // one skip in the quarter keeps it
    [InlineData("2026-04,2026-05,2026-06,2026-08,2026-10,2026-11", "2026-11", 2, 4)] // second skip in Q3 restarts
    [InlineData("2026-03,2026-05,2026-06,2026-07,2026-09", "2026-09", 5, 5)]         // skips in different quarters are both free
    [InlineData("2026-01,2026-02,2026-05", "2026-05", 1, 2)]                         // two missing months in a row restart
    [InlineData("2026-01,2026-02,2026-03", "2026-04", 3, 3)]                         // last finished month still pending: alive
    [InlineData("2026-01,2026-02,2026-03", "2026-05", 0, 3)]                         // two finished months without one: ended quietly
    [InlineData("2025-11,2025-12,2026-01", "2026-01", 3, 3)]                         // year boundary
    [InlineData("2025-11,2026-01", "2026-01", 2, 2)]                                 // December skipped between Nov and Jan
    [InlineData("2026-09,2026-10", "2026-09", 1, 1)]                                 // months after the last finished month are ignored
    public void Compute_ByCase_ReturnsCurrentAndLongest(string harvested, string lastFull, int current, int longest)
    {
        // Arrange
        var months = harvested.Split(',', StringSplitOptions.RemoveEmptyEntries).Select(ParseMonth).ToList();

        // Act
        var result = MonthlyRhythm.Compute(months, ParseMonth(lastFull));

        // Assert
        Assert.Equal(new RhythmDto(current, longest), result);
    }

    [Fact]
    public void Compute_DuplicatesAndMidMonthDates_AreNormalised()
    {
        // Arrange
        DateOnly[] months = [new(2026, 9, 15), new(2026, 9, 1)];

        // Act
        var result = MonthlyRhythm.Compute(months, new DateOnly(2026, 9, 30));

        // Assert
        Assert.Equal(new RhythmDto(1, 1), result);
    }

    private static DateOnly ParseMonth(string s) =>
        DateOnly.ParseExact(s + "-01", "yyyy-MM-dd", CultureInfo.InvariantCulture);
}
```

`HarvestSummaryBuilderTests.cs`
```csharp
using PersonalFinance.Application.Services.Harvest;

namespace PersonalFinance.Tests.Services.Harvest;

public class HarvestSummaryBuilderTests
{
    [Theory]
    [InlineData(10_000_000, 9_999_999, "green")]
    [InlineData(10_000_000, 10_000_000, "red")]   // a spend ratio of 1.00 is the rubric's 0-point breakpoint
    [InlineData(10_000_000, 12_000_000, "red")]
    [InlineData(0, 500_000, "neutral")]           // no income recorded is never green (FIN-04)
    public void Classify_ByIncomeAndExpense_ReturnsResult(int income, int expense, string expected)
    {
        // Act
        var result = HarvestSummaryBuilder.Classify(income, expense);

        // Assert
        Assert.Equal(expected, result);
    }

    [Fact]
    public void Build_OneAccountHasNoTransactions_CountsFourOfFive()
    {
        // Arrange
        Guid[] accounts = [Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid()];
        var withTransactions = new HashSet<Guid>(accounts.Take(4));

        // Act
        var record = HarvestSummaryBuilder.Build(new DateOnly(2026, 9, 17), 10m, 8m, 40, accounts, withTransactions);

        // Assert
        Assert.NotNull(record);
        Assert.Equal(new DateOnly(2026, 9, 1), record.Month);
        Assert.Equal(4, record.AccountsCovered);
        Assert.Equal(5, record.AccountsTotal);
    }

    [Fact]
    public void Build_TransactionOnAccountOutsideTheList_IsNotCounted()
    {
        // Arrange
        Guid[] accounts = [Guid.NewGuid(), Guid.NewGuid()];
        var withTransactions = new HashSet<Guid> { accounts[0], Guid.NewGuid() };

        // Act
        var record = HarvestSummaryBuilder.Build(new DateOnly(2026, 9, 1), 10m, 8m, 3, accounts, withTransactions);

        // Assert
        Assert.NotNull(record);
        Assert.Equal(1, record.AccountsCovered);
        Assert.Equal(2, record.AccountsTotal);
    }

    [Fact]
    public void Coverage_NullAccountSet_CountsZeroOfTotal()
    {
        // Arrange
        Guid[] accounts = [Guid.NewGuid(), Guid.NewGuid()];

        // Act
        var (covered, total) = HarvestSummaryBuilder.Coverage(accounts, null);

        // Assert
        Assert.Equal((0, 2), (covered, total));
    }

    [Fact]
    public void Build_NoTransactionsInMonth_ReturnsNull()
    {
        // Act
        var record = HarvestSummaryBuilder.Build(
            new DateOnly(2026, 9, 1), 0m, 0m, 0, [Guid.NewGuid()], new HashSet<Guid>());

        // Assert
        Assert.Null(record);
    }
}
```

`HarvestCopyTests.cs`
```csharp
using System.Globalization;
using System.Text.RegularExpressions;
using PersonalFinance.Application.Services.Harvest;

namespace PersonalFinance.Tests.Services.Harvest;

public class HarvestCopyTests
{
    private static readonly Regex Shame = new(
        @"\b(fail\w*|bad|worse|worst|wast\w*|shame\w*|guilt\w*|lazy|behind|late|lost|lose|loss|miss\w*|broke\w*|streak\w*|overspen\w*|mistake\w*|careless|irresponsible)\b",
        RegexOptions.IgnoreCase);

    private static Dictionary<string, object?> Ev(params (string Key, object? Value)[] pairs) =>
        pairs.ToDictionary(p => p.Key, p => p.Value);

    [Fact]
    public void AllFixedText_EverySentence_HasNoShameWording()
    {
        // Act
        var offenders = HarvestCopy.AllFixedText().Where(t => Shame.IsMatch(t)).ToList();

        // Assert
        Assert.Empty(offenders);
    }

    [Fact]
    public void Reveal_EvidenceHasMonths_FormatsWithInvariantCulture()
    {
        // Arrange: Indonesian formatting would print "1,4"
        var previous = CultureInfo.CurrentCulture;
        CultureInfo.CurrentCulture = new CultureInfo("id-ID");
        try
        {
            // Act: a double, which is what Newtonsoft returns for a JSON 1.4
            var (glyph, line) = HarvestCopy.Reveal("l2.count_your_cushion", Ev(("months", 1.4)));

            // Assert
            Assert.Equal("🪴", glyph);
            Assert.Equal("You are covered for 1.4 months.", line);
        }
        finally
        {
            CultureInfo.CurrentCulture = previous;
        }
    }

    [Theory]
    [InlineData(2L)]
    [InlineData(2)]
    [InlineData(2.0)]
    public void Reveal_WholeNumberOfAnyNumericType_ShowsOneDecimal(object months)
    {
        // Act
        var (_, line) = HarvestCopy.Reveal("l2.fence_posts", Ev(("months", months)));

        // Assert
        Assert.Equal("2.0 months of cover, one fence post higher.", line);
    }

    [Fact]
    public void Reveal_EvidenceKeyMissing_ReturnsNoLineInsteadOfInventingOne()
    {
        // Act
        var (_, line) = HarvestCopy.Reveal("l2.count_your_cushion", Ev());

        // Assert
        Assert.Null(line);
    }

    [Theory]
    [InlineData("abc")]
    [InlineData(true)]
    [InlineData(null)]
    public void Reveal_EvidenceIsNotANumber_ReturnsNoLine(object? months)
    {
        // Act
        var (_, line) = HarvestCopy.Reveal("l2.count_your_cushion", Ev(("months", months)));

        // Assert
        Assert.Null(line);
    }

    [Fact]
    public void Reveal_StarCode_UsesStarGlyphAndNoLine()
    {
        // Act
        var (glyph, line) = HarvestCopy.Reveal("stars.spend_lt_income", Ev());

        // Assert
        Assert.Equal("⭐", glyph);
        Assert.Null(line);
    }

    [Fact]
    public void Basis_NoAccountsAtAll_FallsBackToUploadedTransactions()
    {
        Assert.Equal("Based on your uploaded transactions", HarvestCopy.Basis(0, 0));
    }
}
```

`HarvestAssemblerTests.cs`
```csharp
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Services.Harvest;

namespace PersonalFinance.Tests.Services.Harvest;

public class HarvestAssemblerTests
{
    private static Dictionary<string, object?> Ev(params (string Key, object? Value)[] pairs) =>
        pairs.ToDictionary(p => p.Key, p => p.Value);

    private static HarvestMonthRecord September(string result = "green", int covered = 4, int total = 5) =>
        new(new DateOnly(2026, 9, 1), 10_000_000m, 8_000_000m, result, covered, total);

    [Fact]
    public void Build_TwoUnseenCompletions_ReturnsExactlyThoseTwoCardsQuestBeforeStar()
    {
        // Arrange
        var unseen = new List<HarvestInputItem>
        {
            new(42, "l2.count_your_cushion", "Count your cushion", Ev(("months", 1.4)), false, new DateTime(2026, 10, 3)),
            new(41, "stars.spend_lt_income", "⭐⭐ Spending under 89% of income", Ev(), false, new DateTime(2026, 10, 3)),
        };

        // Act
        var harvest = HarvestAssembler.Build(unseen, [September()], gardenTotal: 7);

        // Assert
        Assert.NotNull(harvest);
        Assert.Equal(2, harvest.Items.Count);
        Assert.Equal([42L], harvest.Items[0].CompletionIds);   // the quest first
        Assert.Equal([41L], harvest.Items[1].CompletionIds);   // then the star, although its id is lower
        Assert.Equal("You are covered for 1.4 months.", harvest.Items[0].Line);
        Assert.Equal(5, harvest.GardenBefore);
        Assert.Equal(7, harvest.GardenAfter);
    }

    [Fact]
    public void Build_NothingUnseenAndNoUnseenMonth_ReturnsNull()
    {
        // This is what the API returns after the reveal was marked seen: it never replays.
        Assert.Null(HarvestAssembler.Build([], [], gardenTotal: 7));
    }

    [Fact]
    public void Build_MonthWithMissingAccount_StatesFourOfFive()
    {
        // Act
        var harvest = HarvestAssembler.Build([], [September(covered: 4, total: 5)], 3);

        // Assert
        Assert.NotNull(harvest);
        Assert.Equal("September harvested", harvest.Title);
        Assert.Equal("Based on 4 of 5 accounts", harvest.Basis);
        Assert.Equal("2026-09", harvest.Month);
    }

    [Fact]
    public void Build_RedMonthWithANewCompletion_UsesNeutralClosingCopy()
    {
        // Arrange
        var unseen = new List<HarvestInputItem>
        {
            new(5, "l1.honest_harvest", "Honest Harvest", Ev(), false, DateTime.UtcNow),
        };

        // Act
        var harvest = HarvestAssembler.Build(unseen, [September(result: "red", covered: 5, total: 5)], 3);

        // Assert
        Assert.NotNull(harvest);
        Assert.Equal("red", harvest.Result);
        Assert.Equal("Harvested. Your garden grew.", harvest.Closing);
        Assert.Equal("Spending ran above income", harvest.ResultLine);
    }

    [Fact]
    public void Build_MonthWithNothingNew_DoesNotClaimTheGardenGrew()
    {
        // Act: a second red month after Honest Harvest was already awarded
        var harvest = HarvestAssembler.Build([], [September(result: "red")], 3);

        // Assert
        Assert.NotNull(harvest);
        Assert.Empty(harvest.Items);
        Assert.Equal("Harvested.", harvest.Closing);
    }

    [Theory]
    [InlineData("green", 4, 5, "Spending stayed under income in the accounts you uploaded")]
    [InlineData("red", 4, 5, "Spending ran above income in the accounts you uploaded")]
    [InlineData("green", 5, 5, "Spending stayed under income")]
    [InlineData("neutral", 4, 5, "No income was recorded this month")]
    [InlineData("green", 0, 0, "Spending stayed under income")]   // no accounts known: the basis line says so
    public void Build_PartialCoverage_QualifiesTheResultLine(string result, int covered, int total, string expected)
    {
        // Act
        var harvest = HarvestAssembler.Build([], [September(result, covered, total)], 3);

        // Assert
        Assert.Equal(expected, harvest!.ResultLine);
    }

    [Fact]
    public void Build_SeveralUnseenMonths_HeadlinesTheLatestOne()
    {
        // Arrange
        var august = new HarvestMonthRecord(new DateOnly(2026, 8, 1), 1m, 1m, "red", 1, 1);

        // Act
        var harvest = HarvestAssembler.Build([], [august, September()], 0);

        // Assert
        Assert.Equal("2026-09", harvest!.Month);
    }

    [Fact]
    public void Build_FirstRunBackfill_FoldsIntoOneSummaryCarryingEveryId()
    {
        // Arrange
        var unseen = new List<HarvestInputItem>
        {
            new(1, "l1.meet_your_money", "Meet your money", Ev(), true, DateTime.UtcNow),
            new(2, "l1.in_the_green", "In the green", Ev(), true, DateTime.UtcNow),
            new(3, "l2.map_your_debts", "Map your debts", Ev(), true, DateTime.UtcNow),
        };

        // Act
        var harvest = HarvestAssembler.Build(unseen, [], 3);

        // Assert
        Assert.NotNull(harvest);
        var card = Assert.Single(harvest.Items);
        Assert.True(card.IsBackfill);
        Assert.Equal(3, card.Count);
        Assert.Equal([1L, 2L, 3L], card.CompletionIds);
        Assert.Equal("You'd already completed 3 quests", card.Title);
    }

    [Fact]
    public void Build_CompletionsWithoutAMonth_UsesGardenTitleAndNoClosing()
    {
        // Arrange
        var unseen = new List<HarvestInputItem>
        {
            new(9, "l2.count_your_cushion", "Count your cushion", Ev(("months", 0.8)), false, DateTime.UtcNow),
        };

        // Act
        var harvest = HarvestAssembler.Build(unseen, [], 1);

        // Assert
        Assert.NotNull(harvest);
        Assert.Null(harvest.Month);
        Assert.Equal("New in your garden", harvest.Title);
        Assert.Null(harvest.Closing);
    }

    [Fact]
    public void Build_SameInstant_PlacesQuestsThenStarsThenLevelClearedLast()
    {
        // Arrange: one engine pass stores catalog order (boss before stars) with one timestamp
        var at = new DateTime(2026, 10, 3, 9, 0, 0);
        var unseen = new List<HarvestInputItem>
        {
            new(10, "l1.boss", "Foundations cleared", Ev(), false, at),
            new(11, "stars.spend_lt_income", "⭐ Spending under 95% of income", Ev(), false, at),
            new(12, "l1.in_the_green", "In the green", Ev(), false, at),
        };

        // Act
        var harvest = HarvestAssembler.Build(unseen, [], 3);

        // Assert
        Assert.NotNull(harvest);
        Assert.Equal(["l1.in_the_green", "stars.spend_lt_income", "l1.boss"], harvest.Items.Select(i => i.Code).ToArray());
        Assert.Equal("Every Foundations indicator has cleared its bar.", harvest.Items[2].Line);
    }

    [Fact]
    public void IsBackfillEvidence_FlagTrue_ReturnsTrue()
    {
        Assert.True(HarvestAssembler.IsBackfillEvidence(Ev(("backfill", true))));
    }

    [Theory]
    [InlineData(false)]
    [InlineData("true")]
    [InlineData(null)]
    public void IsBackfillEvidence_AnythingButBooleanTrue_ReturnsFalse(object? flag)
    {
        Assert.False(HarvestAssembler.IsBackfillEvidence(Ev(("backfill", flag))));
        Assert.False(HarvestAssembler.IsBackfillEvidence(Ev()));
    }
}
```
Run `dotnet test --filter "FullyQualifiedName~Harvest"` from `apps/api/`.

> **Why:** Every acceptance rule that can be decided without a database lives here as a pure function (TEST-03: no Supabase needed). Red/green is a single function so plan 2's "In the green" and Honest Harvest can never disagree (STEP 4). Copy is in one class so the no-shame lint covers all of it, and the Indonesian-locale test guards a real trap: this is an Indonesian machine, and `1.4.ToString()` would print "1,4" in English copy.
> **Check:** `dotnet test --filter "FullyQualifiedName~Harvest"` is green; the `10_000_000 / 10_000_000` row is red.

---

### [ ] STEP 3 — The ledger port and its Supabase adapter
`apps/api/src/PersonalFinance.Application/Interfaces/IHarvestLedger.cs`
```csharp
using PersonalFinance.Application.Dtos;

namespace PersonalFinance.Application.Interfaces;

/// <summary>The owner's harvested months. The owner is the signed-in caller; no method takes a user id.</summary>
public interface IHarvestLedger
{
    /// <summary>Insert or refresh month figures. Never changes whether a month was seen.</summary>
    Task UpsertMonthsAsync(IReadOnlyList<HarvestMonthRecord> months, CancellationToken ct = default);

    Task<IReadOnlyList<HarvestLedgerRow>> ListAsync(CancellationToken ct = default);

    /// <summary>Marks the completions, and every ledger month up to <paramref name="throughMonth"/>, as seen.</summary>
    Task MarkSeenAsync(IReadOnlyList<long> completionIds, DateOnly? throughMonth, CancellationToken ct = default);
}
```

`apps/api/src/PersonalFinance.Infrastructure/Supabase/SupabaseHarvestLedger.cs`, modelled on `SupabaseCashflowMutationService.PostAsync` (same two headers, caller's JWT, no user id in any body):
```csharp
using System.Globalization;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Infrastructure.Supabase;

/// <summary>Reads and writes the harvest ledger with the caller's own JWT, so owner RLS applies.</summary>
public sealed class SupabaseHarvestLedger(
    HttpClient http, SupabaseSettings settings, ICurrentUser caller, ILogger<SupabaseHarvestLedger> logger)
    : IHarvestLedger
{
    private const string DateFormat = "yyyy-MM-dd";

    public async Task UpsertMonthsAsync(IReadOnlyList<HarvestMonthRecord> months, CancellationToken ct = default)
    {
        if (months.Count == 0) return;
        var rows = months.Select(m => new
        {
            month = m.Month.ToString(DateFormat, CultureInfo.InvariantCulture),
            income_idr = m.IncomeIdr,
            expense_idr = m.ExpenseIdr,
            result = m.Result,
            accounts_covered = m.AccountsCovered,
            accounts_total = m.AccountsTotal,
        }).ToArray();
        using var _ = await SendAsync(HttpMethod.Post, "rpc/upsert_harvest_months", new { p_rows = rows }, ct);
    }

    public async Task<IReadOnlyList<HarvestLedgerRow>> ListAsync(CancellationToken ct = default)
    {
        using var response = await SendAsync(HttpMethod.Get,
            "harvest_months?select=month,income_idr,expense_idr,result,accounts_covered,accounts_total,seen_at"
            + "&order=month.desc&limit=120", null, ct);
        var rows = await response.Content.ReadFromJsonAsync<List<LedgerRowJson>>(ct) ?? [];
        return rows.Select(r => new HarvestLedgerRow(
            new HarvestMonthRecord(
                DateOnly.ParseExact(r.Month, DateFormat, CultureInfo.InvariantCulture),
                r.IncomeIdr, r.ExpenseIdr, r.Result, r.AccountsCovered, r.AccountsTotal),
            r.SeenAt is not null)).ToList();
    }

    public async Task MarkSeenAsync(
        IReadOnlyList<long> completionIds, DateOnly? throughMonth, CancellationToken ct = default)
    {
        using var _ = await SendAsync(HttpMethod.Post, "rpc/mark_harvest_seen", new
        {
            p_completion_ids = completionIds,
            p_through_month = throughMonth?.ToString(DateFormat, CultureInfo.InvariantCulture),
        }, ct);
    }

    private async Task<HttpResponseMessage> SendAsync(
        HttpMethod method, string path, object? payload, CancellationToken ct)
    {
        _ = caller.UserId; // fails fast when the request has no verified user
        using var request = new HttpRequestMessage(method, $"{settings.Url.TrimEnd('/')}/rest/v1/{path}");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", caller.AccessToken);
        request.Headers.Add("apikey", settings.AnonKey);
        if (payload is not null) request.Content = JsonContent.Create(payload);

        var response = await http.SendAsync(request, ct);
        if (response.IsSuccessStatusCode) return response;

        var status = (int)response.StatusCode;
        response.Dispose();
        logger.LogError("Harvest ledger call {Path} failed with HTTP {Status}", path.Split('?')[0], status);
        throw new HarvestLedgerException(status);
    }

    private sealed record LedgerRowJson(
        [property: JsonPropertyName("month")] string Month,
        [property: JsonPropertyName("income_idr")] decimal IncomeIdr,
        [property: JsonPropertyName("expense_idr")] decimal ExpenseIdr,
        [property: JsonPropertyName("result")] string Result,
        [property: JsonPropertyName("accounts_covered")] int AccountsCovered,
        [property: JsonPropertyName("accounts_total")] int AccountsTotal,
        [property: JsonPropertyName("seen_at")] DateTimeOffset? SeenAt);
}

/// <summary>A harvest ledger call failed. The message carries only the HTTP status (ERR-01).</summary>
public sealed class HarvestLedgerException(int status)
    : Exception($"Harvest ledger request failed with HTTP {status}.");
```
Register it next to the cashflow mutation service in `Program.cs` (line ~144):
```csharp
builder.Services.AddHttpClient<IHarvestLedger, SupabaseHarvestLedger>();
```
Test it with a stub HTTP handler, the same pattern as `Authentication/CashflowMutationClientTests.cs`. Create `apps/api/tests/PersonalFinance.Tests/Infrastructure/SupabaseHarvestLedgerTests.cs` (compiled and run against the adapter above in a scratch project before this plan was finished: 5 tests pass):
```csharp
using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Infrastructure.Supabase;

namespace PersonalFinance.Tests.Infrastructure;

public sealed class SupabaseHarvestLedgerTests
{
    private static HarvestMonthRecord September() =>
        new(new DateOnly(2026, 9, 1), 10_000_000m, 8_000_000m, "green", 4, 5);

    [Fact]
    public async Task UpsertMonthsAsync_OneMonth_PostsRpcWithCallerJwtAndNoUserId()
    {
        // Arrange
        string? path = null, authorization = null, apiKey = null, body = null;
        using var http = new HttpClient(new StubHandler(async request =>
        {
            path = request.RequestUri!.AbsolutePath;
            authorization = request.Headers.Authorization?.ToString();
            apiKey = request.Headers.GetValues("apikey").Single();
            body = await request.Content!.ReadAsStringAsync();
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("1") };
        }));

        // Act
        await CreateLedger(http).UpsertMonthsAsync([September()]);

        // Assert
        Assert.Equal("/rest/v1/rpc/upsert_harvest_months", path);
        Assert.Equal("Bearer verified-user-token", authorization);
        Assert.Equal("public-anon-key", apiKey);
        using var parsed = JsonDocument.Parse(body!);
        Assert.False(parsed.RootElement.TryGetProperty("user_id", out _));
        var row = parsed.RootElement.GetProperty("p_rows")[0];
        Assert.False(row.TryGetProperty("user_id", out _));
        Assert.Equal("2026-09-01", row.GetProperty("month").GetString());
        Assert.Equal(4, row.GetProperty("accounts_covered").GetInt32());
        Assert.Equal(8_000_000m, row.GetProperty("expense_idr").GetDecimal());
    }

    [Fact]
    public async Task ListAsync_PostgrestRows_MapsMonthResultAndSeenFlag()
    {
        // Arrange
        const string json = """
            [{"month":"2026-09-01","income_idr":10000000.00,"expense_idr":8000000.00,"result":"green","accounts_covered":4,"accounts_total":5,"seen_at":null},
             {"month":"2026-08-01","income_idr":9000000.00,"expense_idr":9500000.00,"result":"red","accounts_covered":5,"accounts_total":5,"seen_at":"2026-10-04T01:02:03+00:00"}]
            """;
        using var http = new HttpClient(new StubHandler(_ => Task.FromResult(
            new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(json, Encoding.UTF8, "application/json")
            })));

        // Act
        var rows = await CreateLedger(http).ListAsync();

        // Assert
        Assert.Equal(2, rows.Count);
        Assert.Equal(new DateOnly(2026, 9, 1), rows[0].Record.Month);
        Assert.Equal(4, rows[0].Record.AccountsCovered);
        Assert.False(rows[0].Seen);
        Assert.Equal("red", rows[1].Record.Result);
        Assert.True(rows[1].Seen);
    }

    [Fact]
    public async Task MarkSeenAsync_IdsAndMonth_PostsBothArguments()
    {
        // Arrange
        string? path = null, body = null;
        using var http = new HttpClient(new StubHandler(async request =>
        {
            path = request.RequestUri!.AbsolutePath;
            body = await request.Content!.ReadAsStringAsync();
            return new HttpResponseMessage(HttpStatusCode.NoContent);
        }));

        // Act
        await CreateLedger(http).MarkSeenAsync([41, 42], new DateOnly(2026, 9, 1));

        // Assert
        Assert.Equal("/rest/v1/rpc/mark_harvest_seen", path);
        using var parsed = JsonDocument.Parse(body!);
        Assert.Equal([41L, 42L],
            parsed.RootElement.GetProperty("p_completion_ids").EnumerateArray().Select(e => e.GetInt64()).ToArray());
        Assert.Equal("2026-09-01", parsed.RootElement.GetProperty("p_through_month").GetString());
    }

    [Fact]
    public async Task MarkSeenAsync_NoMonth_SendsJsonNull()
    {
        // Arrange
        string? body = null;
        using var http = new HttpClient(new StubHandler(async request =>
        {
            body = await request.Content!.ReadAsStringAsync();
            return new HttpResponseMessage(HttpStatusCode.NoContent);
        }));

        // Act
        await CreateLedger(http).MarkSeenAsync([7], null);

        // Assert
        using var parsed = JsonDocument.Parse(body!);
        Assert.Equal(JsonValueKind.Null, parsed.RootElement.GetProperty("p_through_month").ValueKind);
    }

    [Fact]
    public async Task UpsertMonthsAsync_ServerRefuses_ThrowsWithoutLeakingTheBody()
    {
        // Arrange
        using var http = new HttpClient(new StubHandler(_ => Task.FromResult(
            new HttpResponseMessage(HttpStatusCode.Forbidden) { Content = new StringContent("secret-detail") })));

        // Act
        var exception = await Assert.ThrowsAsync<HarvestLedgerException>(
            () => CreateLedger(http).UpsertMonthsAsync([September()]));

        // Assert
        Assert.Contains("403", exception.Message);
        Assert.DoesNotContain("secret-detail", exception.Message);
    }

    private static SupabaseHarvestLedger CreateLedger(HttpClient http) => new(
        http,
        new SupabaseSettings { Url = "http://127.0.0.1:55421", AnonKey = "public-anon-key" },
        new StubCurrentUser(),
        NullLogger<SupabaseHarvestLedger>.Instance);

    private sealed class StubCurrentUser : ICurrentUser
    {
        public Guid UserId { get; } = Guid.NewGuid();
        public string AccessToken => "verified-user-token";
    }

    private sealed class StubHandler(Func<HttpRequestMessage, Task<HttpResponseMessage>> send) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken) => send(request);
    }
}
```

> **Why:** The port keeps Supabase out of the engine and board code (ARCH-02, ARCH-05), so those can be tested with Moq. Raw HTTP with the caller's JWT is the pattern PF-S08 settled on; an RPC through the shared SDK client would be a second mechanism to trust. No method takes a user id, so a caller cannot ask for someone else's ledger.
> **Check:** `dotnet test --filter "FullyQualifiedName~SupabaseHarvestLedger"` passes.

---

### [ ] STEP 4 — Engine: write the ledger each pass, and add "Honest Harvest"
Edit PF-152's engine, context, rules and catalog (names from the STEP 0 table).

1. **Per-month facts.** In `Application/Quests/QuestContext.cs` extend `MonthFacts` with two trailing parameters that have defaults, so PF-152's tests that build it positionally keep compiling:
```csharp
public sealed record MonthFacts(
    int Year, int Month, decimal Income, decimal Expense, IReadOnlyList<ExpenseFact> TopExpenses,
    int TransactionCount = 0,
    IReadOnlySet<Guid>? AccountIdsWithTransactions = null);
```
   In `QuestContextFactory.FromSnapshot`, where each of the three months is built, fill them from the transactions the snapshot already holds: `TransactionCount` is every transaction dated in that calendar month (not only income and expense rows) and `AccountIdsWithTransactions` is the distinct non-null `AccountId` values among them. No new query. The "M" of "N of M" is the list PF-152's engine already loads: `ctx.CashflowAccounts` (active accounts with "include in cash flow" on).
   Test (`QuestContextFactoryTests`): `FromSnapshot_MonthFacts_CountTransactionsAndAccountsPerMonth` (September has 3 rows from accounts A and B plus one row with no account: count 3, ids {A, B}; a month with no rows: count 0 and an empty set).

2. **One red/green rule.** Make PF-152's `GreenMonth` rule decide with `HarvestSummaryBuilder.Classify(m.Income, m.Expense) == HarvestSummaryBuilder.Green`. Its existing tests (equal is not green, zero income is not green) must pass unchanged. Now the quest and the harvest cannot disagree. Also add `covered` and `total` to its stored evidence, computed with `HarvestSummaryBuilder.Coverage(ctx.CashflowAccounts.Select(a => a.Id).ToList(), m.AccountIdsWithTransactions)` for the month it reports. The completion is permanent while the ledger row keeps refreshing, so the permanent record must state how many accounts it was based on (G10). Test: `GreenMonth_PartlyCoveredMonth_StoresCoveredAndTotalInEvidence`.

3. **Write the ledger each pass.** `QuestEngine` takes a second port and calls it after the completions are stored (also when nothing new completed, so a late upload refreshes "N of M"):
```csharp
public sealed class QuestEngine(IQuestStore store, IHarvestLedger harvestLedger, ILogger<QuestEngine> logger)
    : IQuestEngine
{
    // ... EvaluateAsync as in PF-152, then, just before `return fresh;`:
    //     await UpdateHarvestLedgerAsync(ctx, ct);

    private async Task UpdateHarvestLedgerAsync(QuestContext ctx, CancellationToken ct)
    {
        // A failed transaction load must not look like "no months were harvested".
        if (!ctx.TransactionsLoaded) return;

        var accountIds = ctx.CashflowAccounts.Select(a => a.Id).ToList();
        var records = ctx.Months
            .Select(m => HarvestSummaryBuilder.Build(
                new DateOnly(m.Year, m.Month, 1), m.Income, m.Expense, m.TransactionCount,
                accountIds, m.AccountIdsWithTransactions ?? new HashSet<Guid>()))
            .OfType<HarvestMonthRecord>()
            .ToList();
        try
        {
            await harvestLedger.UpsertMonthsAsync(records, ct);
        }
        catch (Exception ex)
        {
            // Same rule as the recalculation trigger: Journey never fails an import.
            logger.LogError(ex, "Could not update the harvest ledger");
        }
    }
}
```
   The `IHarvestLedger` registration was added in STEP 3. Update every place PF-152's tests construct `QuestEngine`: add a `FakeHarvestLedger` (an in-memory `IHarvestLedger` that records the months it was given and can be told to throw).

4. **Honest Harvest.** Add a rule to `Application/Quests/Rules/` (the base type and `NoEvidence` are PF-152's):
```csharp
namespace PersonalFinance.Application.Quests;

/// <summary>Met once any harvested month in the window had spending at or above income. Never shames: the
/// reveal copy is "harvested anyway". Uses the same classifier as the harvest and "In the green".</summary>
public sealed record RedMonthRecorded : QuestRule
{
    public override IReadOnlyList<RungResult> Evaluate(QuestContext ctx, QuestDefinition quest)
    {
        if (!ctx.TransactionsLoaded) return [new RungResult(0, false, NoEvidence)];

        var red = ctx.Months
            .Where(m => m.TransactionCount > 0
                     && HarvestSummaryBuilder.Classify(m.Income, m.Expense) == HarvestSummaryBuilder.Red)
            .OrderBy(m => m.Year).ThenBy(m => m.Month)
            .FirstOrDefault();

        if (red is null) return [new RungResult(0, false, NoEvidence)];

        // The award is permanent, so it records how many accounts it was based on (G10).
        var (covered, total) = HarvestSummaryBuilder.Coverage(
            ctx.CashflowAccounts.Select(a => a.Id).ToList(), red.AccountIdsWithTransactions);
        return [new RungResult(0, true, new Dictionary<string, object?>
        {
            ["month"] = $"{red.Year:0000}-{red.Month:00}",
            ["covered"] = covered,
            ["total"] = total,
        })];
    }
}
```
   and add one entry to the `quests` list in `QuestCatalog.Build()`, next to the other L1 quests. It is kind `Recognition`, so PF-152's board never offers or lists it before it happens. It is the only hidden quest in this plan:
```csharp
new("l1.honest_harvest", "L1", QuestKind.Recognition, new RedMonthRecorded(), [], false,
    "Honest Harvest", "You harvested a month that ran over. Honest data keeps every score true.", null),
```

5. **A small evidence addition.** `ValuationExists` (PF-152) stores no evidence today, but the reveal line "You are covered for 1.4 months" needs it. When the `liquid_savings_ratio` indicator is live, return evidence `{ "months": <that indicator's Raw> }` (the same stored, rounded raw value the fence posts use); otherwise `NoEvidence`. The reveal line then simply does not appear when the cover is not evaluated.

Tests (`tests/PersonalFinance.Tests/Quests/`, with `FakeQuestStore` and the new `FakeHarvestLedger`):
- `Evaluate_ThreeMonthsOfData_UpsertsOneRecordPerMonthWithTransactions` (a month with no transactions is absent; accounts total is the cash-flow account count; covered counts accounts with a row that month)
- `Evaluate_FiveAccountsFourWithData_RecordsFourOfFive` (the acceptance fixture, through the engine)
- `Evaluate_LedgerWriteThrows_StillStoresCompletionsAndLogs`
- `Evaluate_TransactionsLoadFailed_DoesNotTouchTheLedger`
- `Evaluate_NothingNewCompleted_StillRefreshesTheLedger`
- `Evaluate_RedMonthOnTwoPassesAndASecondRedMonth_StoresHonestHarvestOnce`
- `Evaluate_NoIncomeMonth_DoesNotAwardHonestHarvest`; `Evaluate_ExpenseEqualsIncome_AwardsHonestHarvest`
- `RedMonthRecorded_*` rule tests with plain objects, including `TransactionsLoaded = false` and `RedMonthRecorded_PartlyCoveredMonth_StoresCoveredAndTotal` (4 of 5 accounts gives `covered = 4`, `total = 5`)
- `ValuationExists_CoverIndicatorLive_StoresMonths` and `ValuationExists_CoverNotEvaluated_StoresNoEvidence`
- extend PF-152's G1 test: with the ledger fake in place, the scoring state returned by `RecalculateJourneyCommandHandler` is the same instance whatever the engine or the ledger does
- extend PF-152's catalog tests: `Catalog_G8Lint_CoversHonestHarvest`, and `Catalog_EveryNonStarQuest_HasRevealCopy` (every catalog code that does not start with `stars.` is in `HarvestCopy.RegisteredCodes`, so a new quest cannot ship without its reveal line)
- extend PF-152's `IQuestStore` write-surface reflection test only if you touched `IQuestStore` (you should not have: the ledger is its own port)

> **Why:** The engine pass is the only place the three months of transactions are already in memory, so the ledger costs one extra database call and no extra reads. The ledger is a separate port so PF-152's promise that `IQuestStore` can only write completions, focus, snoozes and seen stays true, and so does G1: nothing here can write a score. Swallowing the ledger error follows PF-152's rule that the import never fails because of Journey; the price of swallowing is silence, which is why STEP 7 checks that a row really appears after an upload.
> **Check:** `dotnet test` passes; `grep -rn "Expense < \|ExpenseIdr <" apps/api/src/PersonalFinance.Application/Quests` finds no second red/green rule.

---

### [ ] STEP 5 — Board service, seen command, endpoint
1. **Board.** Edit PF-152's `QuestBoardService` (it already reads the completions, the state row and the cash-flow accounts) and its DTO:
   - Inject `IHarvestLedger`. In `GetBoardAsync` and in `SetFocusAsync` / `SnoozeAsync` (they return the same board shape), read `ledger.ListAsync(ct)` once.
   - Build the assembler inputs from the completion rows that have no `SeenAt`. A row whose code is no longer in the catalog is skipped:
```csharp
var unseenItems = completions
    .Where(c => c.SeenAt is null && QuestCatalog.Find(c.QuestCode) is not null)
    .Select(c => new HarvestInputItem(
        c.Id, c.QuestCode,
        QuestCopy.CompletionTitle(QuestCatalog.Find(c.QuestCode)!, c.Rung, c.Evidence),
        c.Evidence, HarvestAssembler.IsBackfillEvidence(c.Evidence), c.CompletedAt))
    .ToList();
var unseenMonths = ledgerRows.Where(r => !r.Seen).Select(r => r.Record).ToList();

var harvest = HarvestAssembler.Build(unseenItems, unseenMonths, gardenTotal: completions.Count);
var lastFull = new DateOnly(today.Year, today.Month, 1).AddMonths(-1);
var rhythm = MonthlyRhythm.Compute(ledgerRows.Select(r => r.Record.Month), lastFull);
```
   - `QuestBoardDto`: add `HarvestDto? Harvest` and `RhythmDto Rhythm`. **Keep `Unseen` for now**: PF-152's page still toasts from it until STEP 10 removes the toast and then the field, so Phase 1 adds fields and breaks no contract. `IQuestBoardService.MarkSeenAsync` and `POST /api/journey/quests/seen` stay.
   - Add tests on a `FakeQuestStore` plus `FakeHarvestLedger`: `Board_Harvest_TwoUnseenCompletionsAndAnUnseenMonth_HasExactlyTwoItems`; `Board_Harvest_AfterMarkedSeen_IsNull`; `Board_Harvest_FirstRunFlag_FoldsToOneItemWithEveryId`; `Board_Harvest_UnknownCatalogCode_IsSkipped`; `Board_Rhythm_ReflectsTheLedger`. Extend `BoardDtos_HaveNoPointsLikeMember` to reflect over `HarvestDto`, `HarvestItemDto` and `RhythmDto` too.
2. **Command.** Create `Application/Commands/Harvest/MarkHarvestSeenCommand.cs`:
```csharp
using MediatR;

namespace PersonalFinance.Application.Commands.Harvest;

public record MarkHarvestSeenCommand(IReadOnlyList<long> Ids, string? Month) : IRequest<Unit>;
```
   and `MarkHarvestSeenCommandHandler.cs`:
```csharp
using System.Globalization;
using FluentValidation;
using MediatR;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Application.Commands.Harvest;

public class MarkHarvestSeenCommandHandler(
    IHarvestLedger ledger, IValidator<MarkHarvestSeenCommand> validator)
    : IRequestHandler<MarkHarvestSeenCommand, Unit>
{
    public async Task<Unit> Handle(MarkHarvestSeenCommand request, CancellationToken ct)
    {
        await validator.ValidateAndThrowAsync(request, ct);
        DateOnly? through = request.Month is null
            ? null
            : DateOnly.ParseExact(request.Month + "-01", "yyyy-MM-dd", CultureInfo.InvariantCulture);
        await ledger.MarkSeenAsync(request.Ids, through, ct);
        return Unit.Value;
    }
}
```
   `Application/Validation/MarkHarvestSeenCommandValidator.cs`: `Ids` not null and at most 200, every id greater than 0; `Month` null or matching `^\d{4}-(0[1-9]|1[0-2])$`. Register it the way PF-152 registers `MarkQuestsSeenCommandValidator`. The command has no user id on purpose: `auth.uid()` inside the database function decides the owner, and the ledger adapter sends only the caller's own JWT.
3. **Endpoint.** In `JourneyController` (PF-152 made its actions expression-bodied; ARCH-04 allows 15 lines) add:
```csharp
public sealed record MarkHarvestSeenRequest(List<long> Ids, string? Month);

[HttpPost("harvest/seen")]
public async Task<IActionResult> MarkHarvestSeen([FromBody] MarkHarvestSeenRequest body, CancellationToken ct)
{
    await mediator.Send(new MarkHarvestSeenCommand(body.Ids, body.Month), ct);
    return NoContent();
}
```
4. **Tests.** `MarkHarvestSeenCommandHandlerTests` (Moq `IHarvestLedger`; a real `MarkHarvestSeenCommandValidator`): a valid call passes the ids and the parsed first-of-month to the ledger once; `Month = null` passes null; 201 ids, an id of 0 and `"2026-13"` each throw `ValidationException` and never reach the ledger. `JourneyControllerHarvestTests` (extend PF-152's `JourneyControllerQuestTests` style): the action sends the command with the body values and returns `NoContent`, and `JourneyController` still has no AI client parameter.

> **Why:** The board only maps and delegates, so everything with a decision in it is already covered by the pure tests. Adding fields now and removing `unseen` only when its last reader goes (STEP 10) keeps Phase 1 safe to ship alone, and in the end leaves one source of truth for "what is new". The user id is never in the request, and the validator caps the id list because the database function would otherwise accept an arbitrarily long array.
> **Check:** `dotnet build` and `dotnet test` from `apps/api/` are green.

---

### [ ] STEP 6 — API docs
Edit `docs/architecture/API-endpoints.md`: add `POST /api/journey/harvest/seen` (body `{ "ids": [41, 42], "month": "2026-09" }`, 204, idempotent), document `harvest` and `rhythm` on `GET /api/journey/quests`. (STEP 12 removes `unseen` from that description once it is gone.) Keep any curl example in the style of the neighbouring rows.

> **Why:** CLAUDE.md lists this file as the endpoint reference, and plan 2's board shape changes here.
> **Check:** the file shows the new row and the new fields.

---

### [ ] STEP 7 — Phase 1 gate: live check against the local stack
Start the stack (`docker-up` skill). Use a **throwaway signed-in test user** (the PF-S08 disposable test accounts if that harness is up, otherwise a user you create in Studio and delete afterwards), never the owner's real rows. Get a token without printing it:
```bash
TOKEN=$(curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}" | jq -r .access_token)
```
Then:
1. **Real flow.** Upload `apps/frontend/e2e/fixtures/bca-sample.csv` as the test user. In psql run `select month, result, accounts_covered, accounts_total, seen_at from harvest_months;`. A row must exist. If it does not, the likeliest causes are the missing `GRANT` or a swallowed error: read the API log.
2. **Seed two unseen completions and one unseen month** for the test user's id with psql as the local superuser (two `quest_completions` rows with `catalog_version` set and `seen_at` null, one `harvest_months` row with 4 of 5 and `seen_at` null). The first-run backfill flag is `evidence = '{"backfill": true}'` on three or more rows; seed that too and confirm the board returns one folded card with all the ids.
3. `curl -s -H "Authorization: Bearer $TOKEN" $API/api/journey/quests | jq .harvest` returns exactly 2 items and `"basis": "Based on 4 of 5 accounts"`.
4. `curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"ids":[<id1>,<id2>],"month":"2026-09"}' $API/api/journey/harvest/seen -o /dev/null -w "%{http_code}"` prints `204`.
5. The same GET as step 3 now prints `null`.
6. With a second user's token, POST seen with the first user's completion ids, then confirm in psql that the first user's rows are unchanged (`seen_at` still null for any row you reseeded).
7. Delete the seeded rows with psql as the local superuser (the app role cannot delete from either table, by design) and, if you made one, the test user. Confirm `GET /api/journey/state` scores are the same as before you started.
8. If PF-152's two-user harness (`scripts/pf_s08_module_isolation.py`, extended in its STEP 24) can run, add these harvest checks to it instead of repeating them by hand (items 3 to 6 are exactly the shape of its quest checks). Otherwise record them as manual, not as passed by script.
9. Record the results in the plan Notes.

> **Why:** The unit tests cannot see RLS, grants or the swallowed-error path, and the "never replays" promise is a database fact (PF-034's integration harness does not exist yet). This is the only place those are proven.
> **Check:** the five outputs above match, and psql shows the test user's rows only.

---

# Phase 2 — Reveal UI

### [ ] STEP 8 — Types, API client and the pure frontend logic (tests first)
Edit `apps/frontend/src/types/Journey.ts` (PF-152 defined `QuestBoard`, `QuestCard` and `UnseenCompletion`): add the interfaces below and give `QuestBoard` the two fields `harvest: Harvest | null;` and `rhythm: Rhythm;`. Leave `unseen` and `UnseenCompletion` for now, since the toast still reads them; STEP 10 deletes them:
```ts
export interface HarvestItem {
  code: string;
  glyph: string;
  title: string;
  line: string | null;
  count: number;
  completionIds: number[];
  isBackfill: boolean;
}

export interface Harvest {
  month: string | null; // "2026-09"
  title: string;
  basis: string | null;
  accountsCovered: number | null;
  accountsTotal: number | null;
  result: 'green' | 'red' | 'neutral' | null;
  resultLine: string | null;
  closing: string | null;
  gardenBefore: number;
  gardenAfter: number;
  items: HarvestItem[];
}

export interface Rhythm {
  current: number;
  longest: number;
}
```
Add to `apps/frontend/src/api/journeyApi.ts`:
```ts
export const markHarvestSeen = async (body: { ids: number[]; month: string | null }): Promise<void> => {
  const r = await authenticatedFetch(`${API}/api/journey/harvest/seen`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error('Failed to mark harvest seen');
};
```
Create `apps/frontend/src/lib/journey/harvest/revealMachine.ts`:
```ts
export interface RevealState {
  /** Index of the newest card on screen. Equals itemCount once every card has been shown. */
  step: number;
  itemCount: number;
}

export type RevealAction = { type: 'next' } | { type: 'skip' };

/** Reduced motion shows everything at once, so it starts finished. */
export const initialReveal = (itemCount: number, reducedMotion: boolean): RevealState => ({
  step: reducedMotion ? itemCount : 0,
  itemCount,
});

export const revealReducer = (state: RevealState, action: RevealAction): RevealState =>
  action.type === 'skip'
    ? { ...state, step: state.itemCount }
    : { ...state, step: Math.min(state.step + 1, state.itemCount) };

export const isFinished = (state: RevealState): boolean => state.step >= state.itemCount;

/** Cards on screen: the ones already played plus the newest, or all of them once finished. */
export const shownCount = (state: RevealState): number =>
  isFinished(state) ? state.itemCount : state.step + 1;
```
Create `apps/frontend/src/lib/journey/harvest/rhythm.ts`:
```ts
import type { Rhythm } from '@/types/Journey';

const months = (n: number) => `${n} ${n === 1 ? 'month' : 'months'}`;

/** One quiet line. After a restart it simply shows the new count: no message about the break. */
export const rhythmLabel = ({ current, longest }: Rhythm): string | null => {
  if (current > 0) {
    return longest > current
      ? `Monthly rhythm · ${months(current)} · longest ${months(longest)}`
      : `Monthly rhythm · ${months(current)}`;
  }
  return longest > 0 ? `Longest rhythm · ${months(longest)}` : null;
};
```
Create `apps/frontend/src/lib/journey/harvest/harvestMotion.ts`:
```ts
// Calm on purpose: no confetti, no sound, no shake. Count-up and pulse timings are the values already
// validated in the HTML prototype (docs/ideas/reward-loop-closure.md); the entrance matches the garden
// hero's stage change.
export const CARD_DWELL_MS = 2600;
export const CARD_ENTER_SECONDS = 0.45;
export const COUNT_UP_SECONDS = 0.8;
export const GLYPH_PULSE_SECONDS = 0.65;
```
Tests next to them. `revealMachine.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { initialReveal, isFinished, revealReducer, shownCount } from './revealMachine';

describe('revealMachine', () => {
  it('plays one card at a time and finishes after the last one', () => {
    let s = initialReveal(2, false);
    expect(shownCount(s)).toBe(1);
    expect(isFinished(s)).toBe(false);
    s = revealReducer(s, { type: 'next' });
    expect(shownCount(s)).toBe(2);
    expect(isFinished(s)).toBe(false);
    s = revealReducer(s, { type: 'next' });
    expect(isFinished(s)).toBe(true);
    expect(shownCount(s)).toBe(2);
  });

  it('skip jumps to finished with every card shown', () => {
    const s = revealReducer(initialReveal(3, false), { type: 'skip' });
    expect(isFinished(s)).toBe(true);
    expect(shownCount(s)).toBe(3);
  });

  it('reduced motion starts finished with every card shown', () => {
    const s = initialReveal(2, true);
    expect(isFinished(s)).toBe(true);
    expect(shownCount(s)).toBe(2);
  });

  it('a harvest with no cards is finished immediately', () => {
    expect(isFinished(initialReveal(0, false))).toBe(true);
  });

  it('never moves past the end', () => {
    let s = initialReveal(1, false);
    for (let i = 0; i < 5; i++) s = revealReducer(s, { type: 'next' });
    expect(s.step).toBe(1);
  });
});
```
`rhythm.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { rhythmLabel } from './rhythm';

const SHAME = /\b(fail\w*|bad|worse|worst|wast\w*|shame\w*|guilt\w*|lazy|behind|late|lost|lose|loss|miss\w*|broke\w*|streak\w*|mistake\w*)\b/i;

describe('rhythmLabel', () => {
  it('shows the current rhythm and the longest when it is longer', () => {
    expect(rhythmLabel({ current: 7, longest: 9 })).toBe('Monthly rhythm · 7 months · longest 9 months');
    expect(rhythmLabel({ current: 7, longest: 7 })).toBe('Monthly rhythm · 7 months');
    expect(rhythmLabel({ current: 1, longest: 1 })).toBe('Monthly rhythm · 1 month');
  });

  it('after a quiet restart only shows the new count', () => {
    expect(rhythmLabel({ current: 2, longest: 7 })).toBe('Monthly rhythm · 2 months · longest 7 months');
  });

  it('when the run has ended it shows only the longest', () => {
    expect(rhythmLabel({ current: 0, longest: 9 })).toBe('Longest rhythm · 9 months');
  });

  it('shows nothing before the first harvest', () => {
    expect(rhythmLabel({ current: 0, longest: 0 })).toBeNull();
  });

  it('never uses loss or shame wording', () => {
    for (let current = 0; current <= 12; current++) {
      for (let longest = current; longest <= 12; longest++) {
        expect(rhythmLabel({ current, longest }) ?? '').not.toMatch(SHAME);
      }
    }
  });
});
```
No new script is needed: PF-152 added `"test:journey": "vitest run src/lib/journey"` and a CI step, and these files live under `src/lib/journey/harvest/`, so they run there. Leave `vitest.config.ts` alone (PF-038 owns widening it).

> **Why:** The reveal's decisions (which card, when it is finished, what the rhythm line says) are pure, so they are testable in the existing Vitest setup, which runs in Node without a DOM. A `test:harvest` script follows the `test:macro` precedent and does not widen the config that PF-038 owns. Starting finished under reduced motion makes "static cards" a state, not a styling trick.
> **Check:** `npm run test:journey` passes; `npx tsc --noEmit -p tsconfig.app.json` is clean. (These files and their 10 tests were typechecked under strict settings and run with Vitest 2.1.9 in a scratch project on 2026-10-25; the app's own `tsc`, ESLint and Vitest config have not run them yet.)

---

### [ ] STEP 9 — Components
Read `ai/design/ui-rules.md` and the `data-oriented-zenmode` skill first. Rules that apply here: `.pf-card` is the card, no dividers (whitespace only), no bare percentages, emoji sized to their text block (two lines of text means `text-lg`), colours from theme tokens so dark mode works. The result is **never** coloured red or with the destructive token, for green and red months alike.

`apps/frontend/src/hooks/use-count-up.ts`
```ts
import { useEffect, useRef, useState } from 'react';
import { animate } from 'framer-motion';
import { COUNT_UP_SECONDS } from '@/lib/journey/harvest/harvestMotion';

/** Counts from the value on screen to `target`. Without animation it shows `target` at once. */
export const useCountUp = (target: number, animated: boolean, start: number = target): number => {
  const [value, setValue] = useState(animated ? start : target);
  const latest = useRef(value);

  useEffect(() => {
    if (!animated) {
      latest.current = target;
      setValue(target);
      return;
    }
    const controls = animate(latest.current, target, {
      duration: COUNT_UP_SECONDS,
      ease: 'easeOut',
      onUpdate: (v) => {
        latest.current = v;
        setValue(Math.round(v));
      },
    });
    return () => controls.stop();
  }, [target, animated]);

  return value;
};
```

`apps/frontend/src/components/journey/HarvestCard.tsx`
```tsx
import { motion } from 'framer-motion';
import { CARD_ENTER_SECONDS, GLYPH_PULSE_SECONDS } from '@/lib/journey/harvest/harvestMotion';
import type { HarvestItem } from '@/types/Journey';

interface Props {
  item: HarvestItem;
  animated: boolean;
}

export const HarvestCard = ({ item, animated }: Props) => (
  <motion.li
    data-testid="harvest-card"
    initial={animated ? { opacity: 0, y: 8 } : false}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: animated ? CARD_ENTER_SECONDS : 0, ease: 'easeOut' }}
    className="flex items-start gap-3 rounded-lg bg-muted/40 px-4 py-3"
  >
    <motion.span
      aria-hidden
      className="mt-0.5 select-none text-lg"
      animate={animated ? { scale: [1, 1.3, 1] } : undefined}
      transition={{ duration: GLYPH_PULSE_SECONDS, ease: 'easeOut' }}
    >
      {item.glyph}
    </motion.span>
    <div className="min-w-0 flex-1">
      <p className="text-sm font-medium leading-snug">{item.title}</p>
      {item.line && <p className="mt-0.5 text-xs text-muted-foreground">{item.line}</p>}
    </div>
  </motion.li>
);
```

`apps/frontend/src/components/journey/FocusPick.tsx` (the `offers` are PF-152's `QuestCard` objects from the board):
```tsx
import { cn } from '@/lib/utils';
import type { QuestCard } from '@/types/Journey';

interface Props {
  offers: QuestCard[];
  focusCode: string | null;
  pending: boolean;
  onPick: (code: string) => void;
}

export const FocusPick = ({ offers, focusCode, pending, onPick }: Props) => (
  <div className="space-y-2">
    <p className="text-xs text-muted-foreground">Pick next month's focus. You can swap it any time.</p>
    <ul className="grid gap-2 md:grid-cols-3">
      {offers.map((offer) => {
        const chosen = offer.code === focusCode;
        return (
          <li key={offer.code}>
            <button
              type="button"
              aria-pressed={chosen}
              disabled={pending}
              onClick={() => onPick(offer.code)}
              className={cn(
                'w-full rounded-lg px-3 py-2 text-left text-sm transition-colors',
                chosen
                  ? 'bg-amber-50 text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:ring-amber-800'
                  : 'bg-muted/40 hover:bg-muted',
              )}
            >
              <span className="font-medium">{offer.title}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{offer.why}</span>
            </button>
          </li>
        );
      })}
    </ul>
  </div>
);
```

`apps/frontend/src/components/journey/HarvestPanel.tsx`
```tsx
import { useEffect, useReducer, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { HarvestCard } from '@/components/journey/HarvestCard';
import { FocusPick } from '@/components/journey/FocusPick';
import { useCountUp } from '@/hooks/use-count-up';
import { CARD_DWELL_MS } from '@/lib/journey/harvest/harvestMotion';
import { initialReveal, isFinished, revealReducer, shownCount } from '@/lib/journey/harvest/revealMachine';
import { rhythmLabel } from '@/lib/journey/harvest/rhythm';
import type { Harvest, QuestCard, Rhythm } from '@/types/Journey';

interface Props {
  harvest: Harvest;
  rhythm: Rhythm;
  offers: QuestCard[];
  focusCode: string | null;
  focusPending: boolean;
  onSeen: (ids: number[], month: string | null) => void;
  onPickFocus: (code: string) => void;
  onDone: () => void;
}

export const HarvestPanel = ({
  harvest, rhythm, offers, focusCode, focusPending, onSeen, onPickFocus, onDone,
}: Props) => {
  const reduced = useReducedMotion() ?? false;
  const animated = !reduced;
  const [state, dispatch] = useReducer(
    revealReducer,
    undefined,
    () => initialReveal(harvest.items.length, reduced),
  );
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(() => document.hidden);
  const seenSent = useRef(false);
  const finished = isFinished(state);

  // A tab opened in the background must not play the reveal, or use it up, unwatched.
  useEffect(() => {
    const onChange = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  // Advance by itself, but never while the owner is hovering or focused inside the panel.
  useEffect(() => {
    if (finished || reduced || paused || hidden) return;
    const timer = window.setTimeout(() => dispatch({ type: 'next' }), CARD_DWELL_MS);
    return () => window.clearTimeout(timer);
  }, [state.step, finished, reduced, paused, hidden]);

  // Mark seen once, when every card has been shown or the owner skipped, and only while visible.
  useEffect(() => {
    if (!finished || hidden || seenSent.current) return;
    seenSent.current = true;
    onSeen(harvest.items.flatMap((item) => item.completionIds), harvest.month);
  }, [finished, hidden, harvest, onSeen]);

  const shown = harvest.items.slice(0, shownCount(state));
  const runningTotal = harvest.gardenBefore + shown.reduce((sum, item) => sum + item.count, 0);
  const garden = useCountUp(runningTotal, animated, harvest.gardenBefore);
  const rhythmText = rhythmLabel(rhythm);

  return (
    <section
      aria-label="Monthly harvest"
      data-testid="harvest-panel"
      data-result={harvest.result ?? 'none'}
      className="pf-card space-y-4 p-5"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={(e) => { if (e.key === 'Escape' && !finished) dispatch({ type: 'skip' }); }}
    >
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">{harvest.title}</h2>
          {harvest.basis && <p className="mt-0.5 text-xs text-muted-foreground">{harvest.basis}</p>}
          {harvest.resultLine && <p className="mt-2 text-sm">{harvest.resultLine}</p>}
          {harvest.closing && <p className="mt-1 text-sm text-muted-foreground">{harvest.closing}</p>}
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs text-muted-foreground">
            Garden <span className="font-mono tabular-nums text-foreground" data-testid="garden-count">{garden}</span>
          </p>
          {!finished && (
            <Button size="sm" variant="ghost" onClick={() => dispatch({ type: 'skip' })}>
              Skip
            </Button>
          )}
        </div>
      </header>

      {shown.length > 0 && (
        <ul aria-live="polite" className="space-y-2">
          {shown.map((item) => (
            <HarvestCard key={item.completionIds.join('-')} item={item} animated={animated} />
          ))}
        </ul>
      )}

      {finished && (
        <div className="space-y-4">
          {rhythmText && <p className="text-xs text-muted-foreground">{rhythmText}</p>}
          {offers.length > 0 && (
            <FocusPick offers={offers} focusCode={focusCode} pending={focusPending} onPick={onPickFocus} />
          )}
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={onDone}>Done</Button>
          </div>
        </div>
      )}
    </section>
  );
};
```

Then add `apps/frontend/src/lib/journey/harvest/harvestStyles.test.ts`. Vitest here runs in Node without a DOM, so it checks the source text of the three components instead of rendering them. `import.meta.glob` is a Vite feature and Vitest uses the same config; if `tsc` complains about it, `src/vite-env.d.ts` needs `/// <reference types="vite/client" />`. This test was not run when the plan was written, so run it and make it fail once on purpose (add `text-red-500` to a component, see it fail, remove it):
```ts
import { describe, expect, it } from 'vitest';

const sources = import.meta.glob('/src/components/journey/{HarvestPanel,HarvestCard,FocusPick}.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

// A harvest is never coloured as bad news, for green and red months alike (no red, no destructive token).
const FORBIDDEN = /(?:text|bg|ring|border|from|to|fill|stroke)-(?:red|rose|destructive)\b|destructive|expense/;

describe('Harvest components', () => {
  it('finds the three component files', () => {
    expect(Object.keys(sources)).toHaveLength(3);
  });

  it.each(Object.entries(sources))('%s uses no red or destructive class', (_path, source) => {
    expect(source).not.toMatch(FORBIDDEN);
  });
});
```

> **Why:** One render path serves all three modes: animated, skipped and reduced-motion differ only in the reducer's starting step and the `animated` flag. The panel is an ordinary section in the page flow (not a dialog), so there is nothing to trap focus or lock scroll. Pausing on hover and focus, plus an always-visible Skip, satisfies the rule that auto-advancing content can be stopped. `onSeen` is guarded by a ref because React effects can run twice in development.
> **Check:** `npx tsc --noEmit` and `npm run lint` are clean. (In a scratch project with stand-ins for the shadcn `Button` and `cn`, these four files typechecked under strict settings, and a jsdom render of `HarvestPanel` confirmed: one card at a time, mark-seen called once with `[41, 42]` and `"2026-09"`, Skip shows both cards, a red month renders the neutral copy with no red or destructive class, and with reduced motion both cards show at once with no Skip button and a final count of 7. That render test is not part of the repo because Vitest here runs in Node without a DOM; Playwright in STEP 11 covers the same points in the real app.)

---

### [ ] STEP 10 — Wire it into the Journey page and remove the toast
Edit `apps/frontend/src/pages/journey/JourneyPage.tsx` as PF-152's STEP 21 left it.

1. **Remove the toast.** Delete the `announced` ref and the effect that calls `planCompletionToasts`, `toast(...)` and `markQuestsSeen`, plus the imports that become unused (`toast` from `sonner`, `planCompletionToasts`, `markQuestsSeen`, and `useRef` if nothing else uses it). Delete `apps/frontend/src/lib/journey/questToasts.ts` and `lib/journey/__tests__/questToasts.test.ts`, and the `markQuestsSeen` client function in `journeyApi.ts` (the server endpoint `POST /api/journey/quests/seen` stays; nothing in the UI calls it any more). Open `e2e/journey.spec.ts` and delete PF-152's mocked-board "toast once, none after reload" test; STEP 11 replaces it.
2. **Refetch on every visit.** PF-152 already sets `refetchOnMount: 'always'` on both the quests and the state queries. Confirm that both still have it: without it a harvest created minutes ago hides behind a cached board.
3. **Snapshot the harvest once**, so a refetch (after mark-seen, or on window focus) cannot remove the panel in the middle of the reveal:
```tsx
const [revealed, setRevealed] = useState<Harvest | null>(null);
const [dismissed, setDismissed] = useState(false);
useEffect(() => {
  if (board?.harvest && !revealed) setRevealed(board.harvest);
}, [board, revealed]);

// The board is cached under ['journey-quests'] (not 'journey-state'). Strip the harvest from the cache
// as soon as the server confirms, so leaving Journey and coming back cannot snapshot a stale copy and
// replay it. On failure the cache is left alone, which replays next time: a missed seen call must never
// swallow a harvest.
const seen = useMutation({
  mutationFn: markHarvestSeen,
  onSuccess: () => {
    queryClient.setQueryData<QuestBoard>(['journey-quests'], (old) => (old ? { ...old, harvest: null } : old));
    queryClient.invalidateQueries({ queryKey: ['journey-quests'] });
  },
});
const { mutate: markSeen } = seen;
const onSeen = useCallback(
  (ids: number[], month: string | null) => markSeen({ ids, month }),
  [markSeen],
);
```
   `onSeen` must be a stable callback so the panel's effect does not re-run. Reuse PF-152's focus mutation (the one behind the card's **Focus** button, which calls `setQuestFocus` and stores the returned board with `setQueryData(['journey-quests'], board)`); do not add a second one.
4. **Render** the panel above the garden hero and tier cards, and the rhythm line under the "Active Quests" heading. The focus pick shows the current focus (if any) together with the offers, which together are at most three cards:
```tsx
{revealed && !dismissed && board && (
  <HarvestPanel
    harvest={revealed}
    rhythm={board.rhythm}
    offers={[...(board.focus ? [board.focus] : []), ...board.offers]}
    focusCode={board.focus?.code ?? null}
    focusPending={focusMutation.isPending}
    onSeen={onSeen}
    onPickFocus={(code) => focusMutation.mutate(code)}
    onDone={() => setDismissed(true)}
  />
)}
```
```tsx
{board && rhythmLabel(board.rhythm) && (
  <p data-testid="rhythm-line" className="mb-3 text-xs text-muted-foreground">{rhythmLabel(board.rhythm)}</p>
)}
```
   (`focusMutation` stands for the name PF-152 gave its focus mutation; `rhythmLabel` and `Harvest` come from `@/lib/journey/harvest/rhythm` and `@/types/Journey`; import `QuestBoard` from `@/types/Journey` too.)
   Open `JourneyPage.tsx` and confirm the query keys are still `['journey-state']` and `['journey-quests']` before pasting step 3: using the wrong key here is exactly the bug that makes a seen harvest replay on in-app navigation.
5. **Now remove the old server list**, since its last reader is gone: delete `Unseen` from `QuestBoardDto`, delete `UnseenCompletionDto` and the backfill fold in `QuestBoardService`, delete `unseen` from the frontend `QuestBoard` type and the `UnseenCompletion` interface, and delete PF-152's `Board_Unseen_BackfillFoldsIntoOneItem` and `Board_Unseen_NormalCompletionsAreSeparate` tests (STEP 5 added their replacements) and `UnseenCompletionDto` from the reflection list. Run `dotnet test` from `apps/api/`.

> **Why:** The reveal replaces the toast instead of living beside it, so there is one reward path and one place that marks things seen. The snapshot makes "never replays" a server fact (the seen flag) while keeping the panel stable on screen. A reload during the reveal replays only what was not yet marked seen, by design.
> **Check:** `npm run lint`, `npx tsc --noEmit -p tsconfig.app.json`, `npm run test:journey` and `npm run build` pass; `grep -rn "toast(\|questToasts\|markQuestsSeen" apps/frontend/src` finds nothing.

---

### [ ] STEP 11 — Playwright spec with the quests endpoint stubbed
Create `apps/frontend/e2e/journey-harvest.spec.ts`. It signs in with the disposable PF-S08 test credentials (the same variables `auth-cashflow.spec.ts` uses), stubs only `GET /api/journey/quests` and `POST /api/journey/harvest/seen`, and leaves everything else real. The stubbed board has PF-152's `QuestBoard` shape plus `harvest` and `rhythm`; if PF-152 shipped a different field name, change it in `board()` below. (The older tests in `e2e/journey.spec.ts` open `/journey` without signing in, which the sign-in requirement of PF-S08/S09 no longer allows; this spec signs in explicitly. Fixing the old ones is not part of this ticket.)
```ts
import { expect, test, type Page } from '@playwright/test';

const email = process.env.PF_S08_TEST_EMAIL_A;
const password = process.env.PF_S08_TEST_PASSWORD_A;
test.skip(!email || !password, 'needs the PF-S08 disposable browser credentials');

const offers = [
  { code: 'l1.sort_the_pile', kind: 'discovery', title: 'Sort the mystery pile', why: 'Give your top five merchants a category.', progress: null, deeplink: '/settings/categories' },
];

const harvest = (result: 'green' | 'red', basis = 'Based on 4 of 5 accounts') => ({
  month: '2026-09',
  title: 'September harvested',
  basis,
  accountsCovered: 4,
  accountsTotal: 5,
  result,
  // 4 of 5 accounts, so the real server adds the qualifier
  resultLine: `${result === 'red' ? 'Spending ran above income' : 'Spending stayed under income'} in the accounts you uploaded`,
  closing: 'Harvested. Your garden grew.',
  gardenBefore: 5,
  gardenAfter: 7,
  items: [
    { code: 'l2.count_your_cushion', glyph: '🪴', title: 'Count your cushion', line: 'You are covered for 1.4 months.', count: 1, completionIds: [41], isBackfill: false },
    { code: 'stars.spend_lt_income', glyph: '⭐', title: '⭐⭐ Spending under 89% of income', line: null, count: 1, completionIds: [42], isBackfill: false },
  ],
});

const board = (h: unknown, rhythm = { current: 7, longest: 9 }) => ({
  catalogVersion: 1, workingLevel: 'L1', focus: null, offers, harvest: h, rhythm,
});

async function stub(page: Page, initial: unknown, rhythm?: { current: number; longest: number }) {
  let current = initial;
  const seenBodies: unknown[] = [];
  await page.route('**/api/journey/quests', (route) => route.fulfill({ json: board(current, rhythm) }));
  await page.route('**/api/journey/harvest/seen', async (route) => {
    seenBodies.push(route.request().postDataJSON());
    current = null; // what the server does once the reveal is marked seen
    await route.fulfill({ status: 204 });
  });
  return seenBodies;
}

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email!);
  await page.getByLabel('Password').fill(password!);
  await page.getByLabel('Password').press('Enter');
  await expect(page).toHaveURL(/\/journey$/);
}

test('plays exactly the two completions, marks them seen once, and never replays after a reload', async ({ page }) => {
  const seen = await stub(page, harvest('green'));
  await signIn(page);

  const panel = page.getByTestId('harvest-panel');
  await expect(panel).toContainText('September harvested');
  await expect(panel).toContainText('Based on 4 of 5 accounts');
  await expect(page.getByTestId('harvest-card')).toHaveCount(1);
  await expect(page.getByTestId('harvest-card')).toHaveCount(2, { timeout: 10_000 });
  await expect(panel.getByRole('button', { name: 'Done' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('harvest-card')).toHaveCount(2);

  await expect.poll(() => seen.length).toBe(1);
  expect(seen[0]).toEqual({ ids: [41, 42], month: '2026-09' });

  await page.reload();
  await expect(page.getByRole('heading', { name: /Your Financial Journey/i })).toBeVisible();
  await expect(page.getByTestId('harvest-panel')).toHaveCount(0);
});

test('coming back to Journey inside the app does not replay a harvest that was already seen', async ({ page }) => {
  const seen = await stub(page, harvest('green'));
  await signIn(page);
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect.poll(() => seen.length).toBe(1);

  // No page reload: the react-query cache survives this navigation.
  await page.getByRole('link', { name: /Achievements/ }).click();
  await expect(page).toHaveURL(/\/journey\/achievements$/);
  await page.goBack();
  await expect(page.getByRole('heading', { name: /Your Financial Journey/i })).toBeVisible();

  await expect(page.getByTestId('harvest-panel')).toHaveCount(0);
  expect(seen.length).toBe(1);
});

test('Skip finishes at once and still marks everything seen', async ({ page }) => {
  const seen = await stub(page, harvest('green'));
  await signIn(page);
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.getByTestId('harvest-card')).toHaveCount(2);
  await expect.poll(() => seen.length).toBe(1);
});

test('does not block the page while it plays', async ({ page }) => {
  await stub(page, harvest('green'));
  await signIn(page);
  await expect(page.getByTestId('harvest-panel')).toBeVisible();
  await page.getByRole('link', { name: /Achievements/ }).click();
  await expect(page).toHaveURL(/\/journey\/achievements$/);
});

test('reduced motion shows all cards at once as static cards', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const seen = await stub(page, harvest('green'));
  await signIn(page);
  await expect(page.getByTestId('harvest-card')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Skip' })).toHaveCount(0);
  await expect(page.getByTestId('garden-count')).toHaveText('7');
  await expect.poll(() => seen.length).toBe(1);
});

test('a red month keeps the neutral copy, no shame wording and no red styling', async ({ page }) => {
  await stub(page, harvest('red'));
  await signIn(page);
  const panel = page.getByTestId('harvest-panel');
  await expect(panel).toContainText('Harvested. Your garden grew.');
  await expect(panel).toContainText('Spending ran above income');
  const text = (await panel.innerText()).toLowerCase();
  expect(text).not.toMatch(/\b(fail\w*|bad|worse|worst|wast\w*|shame\w*|guilt\w*|lazy|behind|late|lost|miss\w*|broke\w*|streak\w*|mistake\w*)\b/);
  await expect(panel.locator('[class*="red-"], [class*="destructive"], [class*="expense"]')).toHaveCount(0);
});

test('a restarted rhythm shows only the new count', async ({ page }) => {
  await stub(page, null, { current: 2, longest: 7 });
  await signIn(page);
  const line = page.getByTestId('rhythm-line');
  await expect(line).toHaveText('Monthly rhythm · 2 months · longest 7 months');
  await expect(line).not.toHaveText(/lost|broke|streak|miss/i);
});
```
Run it against the running stack:
```bash
cd apps/frontend
npx playwright test e2e/journey-harvest.spec.ts
```

> **Why:** Playwright is this project's primary functional coverage, and the DOM-level promises (reduced motion, non-modal, no red styling, no replay after reload) cannot be checked in the Node-only Vitest setup. Stubbing just the two Harvest endpoints keeps the test deterministic without a seeded database; the real server behaviour was proven in STEP 7.
> **Check:** all seven tests pass (they skip, with a message, if the credentials are not set; run them with the credentials before calling this step done).

---

### [ ] STEP 12 — Look at it, update the docs, run every gate
1. In the real app (`docker-up`, sign in, seed one harvest as in STEP 7 against a throwaway user), look at `http://localhost:8080/journey` in light and dark theme and at 390 px width: the panel is calm, uses `pf-card`, has no divider lines, no confetti, and nothing shifts the hero below it unexpectedly. Toggle "Emulate CSS prefers-reduced-motion" in DevTools and confirm static cards. Confirm the panel does not trap Tab, and Esc skips.
2. `docs/architecture/API-endpoints.md`: remove `unseen` from the `GET /api/journey/quests` description and keep the `POST /api/journey/quests/seen` row (the endpoint stays). `docs/STATUS.md`: in the Journey row add "Monthly Harvest reveal after each upload, month ledger (N of M accounts, green/red), monthly rhythm with one free skip per quarter".
3. `docs/ideas/reward-loop-closure.md`: under the open question about quests that complete while the app is closed, add one line: "Answered by PF-153: completions queue as unseen and play as the Monthly Harvest at the next Journey visit."
4. Gates, from the repo root:
```bash
cd apps/api && dotnet build && dotnet test && cd ../..
cd apps/frontend && npm run lint && npx tsc --noEmit -p tsconfig.app.json && npm run test:desk && npm run test:macro && npm run test:journey && npm run build && cd ../..
gitleaks detect
```
5. Leave the work uncommitted for review (the `execute` skill does the status moves).

> **Why:** The visual rules are easy to break without noticing (a divider, a red token), and the docs would otherwise still say the quest result is a toast.
> **Check:** every command exits 0; the docs lines exist.

---

## Notes

- **Ticket id.** This plan was first saved as PF-151 because PF-151 and PF-152 did not exist yet. Both were written in parallel while this was being drafted (PF-151 score fixes, PF-152 quest engine), so this plan was renumbered to PF-153 and reconciled with PF-152's text, as PF-152's own Notes ask. No GitHub issue exists for any of the three.
- **Deliberate changes to PF-152's work.** (1) The board's `unseen` list, `UnseenCompletionDto`, the backfill fold in `QuestBoardService`, the toast effect, `questToasts.ts` and its tests, the `markQuestsSeen` client function and PF-152's mocked toast e2e test are removed here: the Harvest replaces them. PF-152's endpoint `POST /api/journey/quests/seen` stays as an API. (2) `MonthFacts` gets two defaulted fields. (3) `ValuationExists` gains `months` evidence. (4) `QuestEngine` takes one more constructor argument. If PF-152 is executed first, these edits are on top of shipped code; keep them small and run its tests after each.
- **Pure code is independent of PF-152's types.** `MonthlyRhythm`, `HarvestSummaryBuilder`, `HarvestCopy` and `HarvestAssembler` take primitives and plain dictionaries, and were compiled and tested in a scratch project (STEP 2). Only the glue in STEPS 4 and 5 touches PF-152's classes, and that glue was written against PF-152's plan text, not compiled.
- **Alternatives scored when planning (feature grid, 25 points).** A, derive on read, no new table: 15. It repeats PF-152's spending rules outside the engine, needs an all-time scan for the rhythm, and cannot tell an unseen month with no new quests from a seen one. B, the month ledger written in the engine pass: 22 (the winner). C, a first-class `harvests` table with its own lifecycle and a foreign key from completions: 15. It would reopen PF-152's schema for a history feature nobody asked for. The idea worth keeping from C: the ledger can grow into harvest history later without a rewrite.
- **Why a table and not "derive on read".** Deriving the month summary and the rhythm on every `GET` would re-implement plan 2's spending rules outside the engine, scan all-time transactions for the rhythm, and could not tell a brand-new month with no new quests from one already seen. The ledger is the "stored data" that G2 asks for.
- **The ledger only covers the last three full months at the time of each pass** (that is the window plan 2 loads). The rhythm therefore starts from the first harvest the app records; older history is not back-filled. Say so if a user asks why uploading a year at once shows a rhythm of 3. A wider scan would be a follow-up, not part of this plan.
- **M counts today's active cash-flow accounts**, as specified. An account added in October therefore lowers "N of M" for September. That errs on the side of saying the picture may be incomplete, which is the safe direction. Refining it by each account's opening date is a deliberate follow-up if it feels wrong.
- **A month is harvested only by a pass that runs after the month ends.** Statements uploaded on the 28th still complete quests at once (they play as "New in your garden", with no month title), but "September harvested" with its "N of M" waits for the next trigger after 1 October. The board is a pure read and does not write the ledger, so there is no month-start trigger. Accepted: it matches the stated rhythm of uploading after the month closes.
- **Changed after review (2026-10-25).** Four fixes from the `/consult` design review: (1) mark-seen now strips the harvest from the `['journey-quests']` cache (STEP 10 used to invalidate the wrong key, so a seen harvest replayed on in-app navigation); (2) "Harvested. Your garden grew." is said only when at least one card was added, otherwise "Harvested."; (3) permanent results on a partly covered month carry `covered` and `total` in their evidence, and the result line says "in the accounts you uploaded" when `covered < total`; (4) the reveal waits while the tab is hidden, the update grant is column-level, and a source-text test keeps red classes out of the components. The scratch-project verification counts quoted in STEP 2 (43 and 48 tests) were taken before these changes: the new and changed tests (`Build_RedMonthWithANewCompletion_*`, `Build_MonthWithNothingNew_*`, `Build_PartialCoverage_*`, `Coverage_*`, the edited `ResultLine` signature) have not been run.
- **Open question for a CIO ruling, not decided here.** Whether a month with low coverage (for example the salary account missing or the only account uploaded) should be called green or red at all, or should be neutral until coverage passes a threshold. The qualifier line is the cheap fix; a threshold changes `GreenMonth` in plan 2 and is a methodology call (`/cio`).
- **Equal income and expenses is red; no income is neutral.** Both follow the rubric's 0-point breakpoint and FIN-04. The word "red" never appears in the UI; the result is described in plain sentences and never coloured.
- **"Garden grew" is the brief's wording and is used verbatim.** Until plan 5 adds garden items, the visible growth is the Garden counter and the cards, not new art. Plan 5 should make that sentence literally true; flag it there.
- **Honest Harvest inside a first-run backfill is folded into the single summary**, so the surprise is lost for that one case. Accepted.
- **Seen semantics.** Marked when the last card has been shown, or on Skip, or immediately in reduced-motion mode. If the owner leaves halfway, the unseen remainder replays next time. Two open tabs can both play the reveal once; the server keeps one seen flag.
- **Failure modes that are silent by design** and therefore checked in STEP 7: the ledger write is swallowed on error (a missing `GRANT` would look like "no harvest ever appears"), and `seen_at` must survive a refresh (STEP 1 SQL).
- **Time zone.** `lastFullMonth` uses the server's local date like the existing scoring code (`DateTime.Today`). The owner and the server share a zone today; revisit when the API moves to Azure.
- **Compliance.** The copy only describes the owner's own figures ("Spending ran above income"); it recommends nothing and quotes no rate (FIN-05, FIN-06). The focus offers come from plan 2, already gated by G7. No `/compliance` run is needed unless copy gains advice.
- **Out of scope, as briefed:** garden visuals beyond the existing Living Garden Hero (plan 5); challenges and other hidden quests (plan 4); seasonal events (plan 6); a sidebar garden widget (none exists in the app, checked by search).
- **Size.** About 5 to 6 working days (Phase 1 about 3, Phase 2 about 2.5). If it runs long, split at the phase boundary: Phase 1 only adds fields and one endpoint, so it can ship alone while PF-152's toast keeps working until STEP 10.
- **Not done on purpose.** No harvest history page, no per-account "missing" names (only counts, per the brief), no backfill of rhythm beyond the three-month window, no change to PF-152's `/quests/seen`, no push or daily mechanics.
- **Verification already done while planning (2026-10-25), in scratch projects, not in the repo:** the migration and both checks on a throwaway Postgres 16 container with stand-ins for Supabase's `auth` schema and PF-152's table (outputs as stated in STEP 1); the C# classes and 48 xUnit tests including the ledger adapter against a stub HTTP handler; the TypeScript files under strict `tsc` and 10 Vitest tests; and a jsdom render of `HarvestPanel` (animated order, mark-seen once, Skip, red copy with no red classes, reduced motion). Not verified: anything that touches PF-152's real classes, the real Supabase stack, the real `tsc`/ESLint config, or a browser.

## Execution Notes

### Phase 1 — Data and API
Model: **Opus 5.5** · Effort: **high**. New table, owner security and a seen flag that fails silently if one SQL line is wrong.
Before you start: PF-151 and PF-152 are executed, accepted and merged (STEP 0 checks this); the local Supabase stack is running.

```
/execute plans/in-progress/PF-153-monthly-harvest-reveal-todo.md phase 1
```

### Phase 2 — Reveal UI
Model: **Sonnet 5.5** · Effort: **high**. Frontend only, exact code is in the steps, tests included.
Before you start: Phase 1 is done and `GET /api/journey/quests` returns `harvest` and `rhythm`.

```
/execute plans/in-progress/PF-153-monthly-harvest-reveal-todo.md phase 2
```

### Stop and ask if

- PF-151 or PF-152 is not finished, or PF-152's completions table, seen flag, engine pass or `QuestContext` differs so much from the STEP 0 table that it cannot be reconciled in a few lines.
- The engine's snapshot does not carry `AccountId` per transaction, so "N of M" would need an extra query.
- The STEP 1 SQL shows `seen_at` reset by a refresh, or another user can read the owner's harvest.
- After a real upload, no `harvest_months` row appears and the cause is not an obvious missing grant.
