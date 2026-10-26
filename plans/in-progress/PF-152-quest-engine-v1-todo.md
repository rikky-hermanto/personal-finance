---
id: PF-152
flags: [Ready]
size: L
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
  model: opus
  effort: high
  by: owner
  at: 2026-10-26T01:40:12Z
  at-label: 2026-10-26 09:40 Asia/Makassar
  budgetOverride: true
run:
  worktree: .worktrees/pf-152
  branch: loop/pf-152
  slot: 1
  fixRounds: 0
  segments: 0
  checkpoint: .loop/runs/PF-152/checkpoint.json
  logs: .loop/runs/PF-152/
  dbSnapshot: .loop/runs/PF-152/db-before.dump
---

# PF-152 — Quest Engine v1: self-completing L1/L2 quests, stars and a quest board

> **GitHub Issue:** _(none; local-only plan)_
> **Status:** To Do
> **Started:** —
> **Board objective:** Journey quests finish by themselves when your uploaded data shows you did them, and you see a short note. Starts after the score fixes.
> **Was blocked by (PF-151 done 2026-10-25):** [PF-151](../done/PF-151-journey-score-fixes-before-quests-todo.md), plan 1 of 3, "Journey score fixes before quests" (G3 investing is not spending, G4 DTI "not evaluated" plus the "I have no debts" flag, G11 insurance to L2). It must be executed and accepted first. This plan reuses its names, read from the plan on 2026-10-25: column `user_journey_state.no_debts_confirmed_at`, narrow entity `JourneyDebtConfirmation`, `IJourneyConfirmationService.GetNoDebtsConfirmedAtAsync`, `JourneyScoringRules` (`IsConsumption`, `IsSavingsOutflow`, `LiveScoreMap`, `Definitions`, `EvaluateDti`) and `BuildIndicatorDtos(liveScores)`. STEP 1 re-checks them against the code as executed.
> **Sensitive:** Phase 1 only. Schema and RLS (new table, owner policy) and scoring code that feeds money decisions (G1: scores must not change because of quests). Phase 2 is not sensitive.
> **Planned from branch:** main
> **Spec:** [quest-engine-v1-design.md](../brainstorms/quest-engine-v1-design.md) is the design and is not re-opened here. [diagram-quest-engine-v1.html](../brainstorms/diagram-quest-engine-v1.html) is its high-level design. Product rules and guardrails G1, G2, G6, G7, G8: [pm-journey-quests-analysis.md](../brainstorms/pm-journey-quests-analysis.md).
> **Next in the series:** plan 3 (Monthly Harvest) builds on this plan's board DTO, `quest_completions` and `seen_at`.

## Objective

Today nothing recalculates the Journey after a statement upload (`POST /api/transactions/submit` publishes no event, and `AssetUpdatedEvent` has a handler but no publisher), and `GET /api/journey/quests` asks an LLM for three invented quests on every load. This plan adds the recalculation trigger, a small in-process rules engine that runs inside the recalculation pass and stores one permanent row per completed quest rung, stars on every live indicator, and a quest board that replaces the LLM path. Nothing the engine does can change a score, and no LLM is involved anywhere in the quest path.

## Acceptance Criteria

- [ ] Uploading a statement completes "Meet your money" with no Recalculate click: after `POST /api/transactions/submit` inserts at least one row, `quest_completions` holds `l1.meet_your_money` for that user.
- [ ] Running recalculation twice stores one row per `(user_id, quest_code, rung)`; the second pass inserts nothing.
- [ ] A completion toast appears once on the next Journey visit and not again after a reload (`seen_at` is set by `POST /api/journey/quests/seen`).
- [ ] Scores are identical with and without the engine: the engine has no write path to scores, and a recalculation returns the same state whether the engine succeeds, does nothing, or throws (G1).
- [ ] A stale savings valuation blocks every quest that celebrates cover (G6): with cover of 1.6 months but a savings valuation dated two calendar months ago, no `l2.fence_posts` rung and no `stars.liquid_savings_ratio` star completes. With the valuation dated this or last month, fence post rungs 1 to 3 and the matching stars complete. The rule lives in the quest context, so a future quest that reads cover inherits it.
- [ ] Setting a focus never changes the snoozes, and snoozing never changes the focus. Both survive a recalculation (checked through PostgREST, not only in unit tests).
- [ ] When nothing can be offered but the working level is not cleared, the board still says what is left: `levelGoal` names the level and the live indicators below the clearing bar, with no points.
- [ ] "Today" is the calendar day in Asia/Jakarta, not the host's: with the clock pinned to 2026-10-31 18:00 UTC (01:00 on 1 November in Jakarta), freshness and the three-month window already use November.
- [ ] A slower, older recalculation never overwrites the scores of a newer one in `user_journey_state`.
- [ ] `GET /api/journey/quests` makes no AI service call. `IJourneyAdvisorClient`, `JourneyAdvisorClient`, `JourneyQuestDto`, `POST /journey/advise`, its prompt, models and tests are gone, and nothing references them.
- [ ] The board never offers more than 3 quests (focus included), and offers follow the working level, not `currentLevel` (G7): with L1 not cleared, `l2.fence_posts` is never offered, and the L2 discovery quests are.
- [ ] No quest card, board field or toast carries a point value (G2); a reflection test fails on any DTO member named like points, gain or XP.
- [ ] A catalog lint test fails on product, issuer, asset-class, allocation-percentage or return wording, and it is proven to catch a bad sample (G8). Codes are unique and rungs ascend.
- [ ] `GET /api/journey/state` returns `stars` (0 to 3) on each indicator and real `rawValue` values read back from the database. Recalculation does not reset the focus quest or the snoozes.
- [ ] The first pass for a user with no earlier completions that completes more than one quest is folded into a single "You'd already completed N quests" item on the board.
- [ ] A successful submit that inserts rows publishes exactly one `TransactionsSubmittedEvent`; an all-duplicates submit and a failed submit publish none; a failed recalculation never fails the import. Account, valuation, liability and asset writes publish `AssetUpdatedEvent` after they succeed.
- [ ] `quest_completions` is owner-only: another signed-in user cannot read, insert or mark another user's rows (checked through the API and directly through PostgREST).
- [ ] `dotnet build`, `dotnet test`, `pytest`, `npm run lint`, `tsc --noEmit`, `npm run test:journey` and `npm run build` pass; `CLAUDE.md`, `docs/architecture/API-endpoints.md` and the Journey scoring card in `docs/architecture/diagram-system-design.html` are updated.

## Approach

Winning approach: the design as written, with the engine running synchronously inside the recalculation pass on a `ScoringSnapshot`, so the caller's token (RLS) is used and no service-role key or background job exists. Scoring is refactored from "each indicator fetches its own data" to "load once, compute from the snapshot" with the formula bodies untouched, and the engine, catalog, rules and board live in a new `Application/Quests/` folder. Persistence goes through a small `IQuestStore` interface (Application) with a Supabase implementation (Infrastructure), so the engine and board are testable without Supabase and PostgREST's duplicate handling stays in one place. The asset-side trigger is one MediatR pipeline behavior on a marker interface (`IAffectsJourney`) instead of nine edited handlers, so it cannot be forgotten for a new command and is testable in isolation.

Delivery is **two phases in one plan**, because `GET /api/journey/quests` changes shape and the frontend must follow in the same plan. **Phase 1 (STEPS 1 to 17)** is backend only and changes no existing contract: trigger, snapshot, persisted raw values, stars on `/state`, catalog, rules, store, engine. **Phase 2 (STEPS 18 to 26)** is the board service, the four endpoints, the frontend, the removal of the LLM path, and the docs. The cut line is after STEP 17: if Phase 1 runs past four working days, ship it and move Phase 2 into its own ticket. Guardrails are never traded for time.

Deliberately not done: the Harvest reveal and the monthly ritual (plan 3); challenges, hidden quests and L3 action quests (plan 4); garden items (plan 5); background evaluation; any LLM wording. The hard-coded `CashflowQuestStrip` on the Cashflow overview is noted and left alone.

## Affected Files

| File | Change |
|------|--------|
| `supabase/migrations/20261026000000_pf_152_quest_completions.sql` | Create — `quest_completions`, owner RLS, grants; `indicator_raw`, `focus_quest_code`, `quest_snoozes` on `user_journey_state` |
| `apps/api/src/PersonalFinance.Domain/Entities/QuestCompletion.cs` | Create — entity for `quest_completions` |
| `apps/api/src/PersonalFinance.Domain/Entities/UserJourneyFocus.cs`, `UserJourneySnoozes.cs` | Create — two narrow entities on `user_journey_state`, one column each, so a focus write can never carry the snoozes or the reverse |
| `apps/api/src/PersonalFinance.Application/Services/AppTimeProvider.cs` | Create — `TimeProvider` pinned to Asia/Jakarta |
| `apps/api/src/PersonalFinance.Domain/Entities/UserJourneyState.cs` | Edit — add `IndicatorRaw` |
| `apps/api/src/PersonalFinance.Domain/Events/TransactionsSubmittedEvent.cs` | Create — one event per successful batch |
| `apps/api/src/PersonalFinance.Application/EventHandlers/JourneyRecalcOnTransactionsSubmittedHandler.cs` | Create — recalculates for the importing user, never fails the import |
| `apps/api/src/PersonalFinance.Application/Interfaces/IAffectsJourney.cs` | Create — marker for commands that change scored data |
| `apps/api/src/PersonalFinance.Application/Behaviors/PublishAssetUpdatedBehavior.cs` | Create — publishes `AssetUpdatedEvent` after a tagged command succeeds |
| `apps/api/src/PersonalFinance.Application/Commands/{Accounts,Valuations,Liabilities,Assets}/*Create/Update/Delete*Command.cs` | Edit — 11 records gain `, IAffectsJourney` |
| `apps/api/src/PersonalFinance.Api/Controllers/TransactionsController.cs` | Edit — publish `TransactionsSubmittedEvent` after a successful submit |
| `apps/api/src/PersonalFinance.Api/Controllers/AccountsController.cs` | Edit — publish `AssetUpdatedEvent` from `SetCashflowFlag` |
| `apps/api/src/PersonalFinance.Application/Quests/*` | Create — `QuestDefinition`, `QuestRule` + 9 rules, `QuestCatalog`, `StarRungs`, `QuestCopy`, `QuestContext`, `QuestContextFactory`, `WorkingLevel`, `ScoringSnapshot` |
| `apps/api/src/PersonalFinance.Application/Interfaces/{IQuestStore,IQuestEngine,IQuestBoardService}.cs` | Create — ARCH-02 |
| `apps/api/src/PersonalFinance.Application/Services/{QuestEngine,QuestBoardService}.cs` | Create |
| `apps/api/src/PersonalFinance.Infrastructure/Supabase/SupabaseQuestStore.cs` | Create — PostgREST access, ignore-duplicates insert |
| `apps/api/src/PersonalFinance.Application/Services/JourneyScoringService.cs` | Edit — load once, compute from snapshot, persist raw values, stars, savings load, `RecalculateWithSnapshotAsync` |
| `apps/api/src/PersonalFinance.Application/Interfaces/IJourneyScoringService.cs` | Edit — add `RecalculateWithSnapshotAsync` |
| `apps/api/src/PersonalFinance.Application/Dtos/JourneyStateDto.cs` | Edit — `IndicatorScoreDto` gains `Stars` |
| `apps/api/src/PersonalFinance.Application/Dtos/QuestBoardDto.cs` | Create — board contract (no point fields) |
| `apps/api/src/PersonalFinance.Application/Commands/RecalculateJourneyCommandHandler.cs` | Edit — run the engine after scoring, isolated from failure |
| `apps/api/src/PersonalFinance.Application/Commands/Quests/*` | Create — `GetQuestBoardQuery`, `SetQuestFocusCommand`, `SnoozeQuestCommand`, `MarkQuestsSeenCommand` + handlers |
| `apps/api/src/PersonalFinance.Api/Controllers/JourneyController.cs` | Edit — four quest endpoints via MediatR; drop `IJourneyAdvisorClient` |
| `apps/api/src/PersonalFinance.Api/Program.cs` | Edit — `TimeProvider`, store/engine/board registrations, open behavior; remove the advisor HTTP client |
| `apps/api/src/PersonalFinance.Application/Interfaces/IJourneyAdvisorClient.cs`, `Infrastructure/External/JourneyAdvisorClient.cs`, `Application/Dtos/JourneyQuestDto.cs` | Delete — LLM quest path |
| `apps/api/tests/PersonalFinance.Tests/Quests/*`, `Authentication/`, `Controllers/`, `Services/` | Create / Edit — tests for every piece; delete `Infrastructure/JourneyAdvisorClientTests.cs` |
| `services/ai-service/app/{main.py,models.py}`, `app/services/journey_advisor.py`, `app/prompts/journey_advisor_v1.py`, `tests/test_journey_advisor.py`, `tests/test_pilot_gate.py` | Delete / Edit — remove `/journey/advise` |
| `apps/frontend/src/{types/Journey.ts,api/journeyApi.ts}` | Edit — board contract, `stars`, seen/focus/snooze calls |
| `apps/frontend/src/lib/journey/questToasts.ts` + `__tests__/questToasts.test.ts` | Create — pure toast planner and its Vitest tests |
| `apps/frontend/src/pages/journey/JourneyPage.tsx`, `components/journey/{QuestCard,LivingGardenHero,IndicatorScoreBar}.tsx` | Edit — board, toast effect, hero link, stars |
| `apps/frontend/package.json`, `.github/workflows/ci.yml` | Edit — `test:journey` script and CI step |
| `apps/frontend/e2e/journey.spec.ts` | Edit — mocked-board toast-once test |
| `scripts/pf_s08_module_isolation.py` (and `pf_s08_local_http_smoke.py` if it owns the table list) | Edit — quest isolation and idempotency checks |
| `CLAUDE.md`, `docs/architecture/API-endpoints.md`, `docs/architecture/diagram-system-design.html`, `docs/STATUS.md`, `services/ai-service/README.md`, `services/ai-service/docs/*`, `plans/brainstorms/quest-engine-v1-design.md` | Edit — docs that become true or stale |

---

## TODO

## Phase 1 — Trigger, snapshot and engine (backend, no existing contract changes)

### [x] STEP 1 — Reconcile with PF-151 and take the baseline
```bash
# Is PF-151 executed? (its plan should be in plans/done/ and its migration applied)
ls plans/done | grep -i "PF-151"
ls supabase/migrations | tail -5          # expect 20261025000000_pf_151_no_debts_confirmation.sql
grep -rn "no_debts_confirmed_at" apps/api/src supabase/migrations | grep -v "/obj/"
grep -n "class JourneyScoringRules\|IsConsumption\|LiveScoreMap\|Definitions" apps/api/src/PersonalFinance.Application/Services/JourneyScoringRules.cs
grep -n "account_type" apps/api/src/PersonalFinance.Application/Services/JourneyScoringService.cs
docker exec supabase_db_personal-finance psql -U postgres -d postgres -At -c "select account_type, count(*) from accounts group by 1;"

# Baseline gates, from the repo root
cd apps/api && dotnet test ../../apps/api/PersonalFinance.slnx && cd ../..
cd services/ai-service && pytest -q && cd ../..
cd apps/frontend && npm run lint && npx tsc --noEmit -p tsconfig.app.json && cd ../..
```
Confirm each of these exists as PF-151 describes (they are the names the rest of this plan uses), and write down any difference in Notes before continuing:

1. The no-debts flag: column `user_journey_state.no_debts_confirmed_at`, read through `IJourneyConfirmationService.GetNoDebtsConfirmedAtAsync(userId, ct)`; a recorded liability always overrides it (`JourneyScoringRules.EvaluateDti`). `JourneyScoringService` now takes `(Supabase.Client, IJourneyConfirmationService, ILogger<...>)` and `ComputeDtiAsync(Guid userId, ct)` reads the flag inside its try block so a failed read fails closed.
2. G3: `JourneyScoringRules.IsConsumption(Transaction)` and `IsSavingsOutflow(Transaction)` (internal static, `Application/Services`). STEP 11 calls `IsConsumption` for the month expense, so quests and `spend_lt_income` can never disagree.
3. G4 survives a reload: `PersistStateAsync` stores `JourneyScoringRules.LiveScoreMap(indicators)` (evaluated indicators only) and `BuildIndicatorDtos(liveScores)` rebuilds the rest as `no_data` from `JourneyScoringRules.Definitions`. So "live" means "present in the stored score map". STEP 9 builds on this; `indicator_raw` stays raw-only.
4. PF-151 executed and its post-deploy recalculation done (its STEP 12): the owner's `user_journey_state.last_computed_at` is on or after that date, and `ScoreSpendRatio`, `ScoreLiquidSavings`, `ScoreDti`, `ScoreSavingsRate`, `ComputeLevelScores`, `DetermineCurrentLevel` and `BuildIndicatorDtos` are `internal static`.
5. **The savings-account casing bug (STEP 8).** Today `ComputeLiquidSavingsAsync` filters `account_type = "Savings"`, but the CHECK constraint on `accounts.account_type` only allows lowercase (`'checking','savings','credit_card','brokerage','wallet','loan'`), and on 2026-10-25 the owner's database had 4 `savings` rows and 0 `Savings` rows. The indicator has therefore never been evaluated. PF-151's own check (`where account_type = 'Savings'`) trips over the same casing, which is why it concludes "the owner has no Savings account" and that DTI is the only live L2 indicator. PF-151 now carries the fix (its STEP 3b item 5, `JourneyScoringRules.SavingsAccountType`) and corrected queries; check that it was executed that way. If it was executed without it, STEP 8 applies it here.
6. Also record two facts found while planning (2026-10-25, local database): `journey_indicator_snapshots` has **0 rows** although `user_journey_state` has one, so `PersistSnapshotsAsync` is probably swallowing a write error (PF-151 saw the same empty table); and `level_scores` and `indicator_scores` are stored as jsonb **strings** (double-encoded), not objects. Do not copy either pattern in new code; STEP 14 verifies the new columns are real jsonb objects.
7. Before touching scoring, write down the owner's current Journey numbers (level scores, total score, each indicator's score) from `/journey` or `GET /api/journey/state`. STEP 7 must reproduce them exactly. Keep the numbers in Notes; do not save raw API responses or transactions into the repo.

> **Why:** This plan builds on PF-151's schema and scoring code, so it must start from what PF-151 actually shipped, not from what its plan said it would ship. The baseline numbers are the only way to prove the STEP 7 refactor changed nothing, because `JourneyScoringService` takes a concrete `Supabase.Client` and cannot be exercised end to end in a unit test. Do not continue if PF-151 is not executed.

---

### [!] STEP 2 — Migration: `quest_completions` and the new `user_journey_state` columns
> **Blocked:** Migration file `supabase/migrations/20261026000000_pf_152_quest_completions.sql` is written correctly, but applying it is denied by this run's policy (same deny as `supabase db push`; direct `docker exec psql` was also classifier-denied). The owner must apply it to the local stack (`npx supabase db push`, or run the file via psql). All later live/round-trip/parity checks (STEP 7 parity, 14, 17, 24) depend on this.
Use `/db-migrate`. Create `supabase/migrations/20261026000000_pf_152_quest_completions.sql`. The timestamp must be **later than the newest file in `supabase/migrations/`**; PF-151's migration is `20261025000000`, so if anything newer exists by then, use a later one:

```sql
-- PF-152: Quest Engine v1. Append-only completions, plus focus, snoozes and raw
-- indicator values on user_journey_state. Owner-only, same pattern as PF-S08.
BEGIN;

CREATE TABLE public.quest_completions (
  id              bigserial PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES auth.users(id),
  quest_code      text NOT NULL,
  rung            smallint NOT NULL DEFAULT 0 CHECK (rung >= 0),
  catalog_version smallint NOT NULL,
  evidence        jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_at    timestamptz NOT NULL DEFAULT now(),
  seen_at         timestamptz,
  UNIQUE (user_id, quest_code, rung)
);

CREATE INDEX quest_completions_unseen
  ON public.quest_completions (user_id) WHERE seen_at IS NULL;

ALTER TABLE public.quest_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY quest_completions_owner ON public.quest_completions
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- Append-only at the database level: no DELETE, and only seen_at can be updated.
GRANT SELECT, INSERT ON public.quest_completions TO authenticated;
GRANT UPDATE (seen_at) ON public.quest_completions TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.quest_completions_id_seq TO authenticated;

ALTER TABLE public.user_journey_state
  ADD COLUMN indicator_raw    jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN focus_quest_code text,
  ADD COLUMN quest_snoozes    jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMIT;
```
Apply to the **local** stack only, then check:
```bash
npx supabase db push
docker exec supabase_db_personal-finance psql -U postgres -d postgres -c "\d public.quest_completions"
docker exec supabase_db_personal-finance psql -U postgres -d postgres -At -c "select column_name, data_type from information_schema.columns where table_name='user_journey_state' and column_name in ('indicator_raw','focus_quest_code','quest_snoozes');"
```
Rollback (dev only, destroys quest history): `DROP TABLE public.quest_completions; ALTER TABLE public.user_journey_state DROP COLUMN indicator_raw, DROP COLUMN focus_quest_code, DROP COLUMN quest_snoozes;`

> **Why:** The spec gives the table and the owner policy; the two grants make "never updated except `seen_at`, never deleted" true in the database rather than only in code, which is the cheapest way to keep the completion record permanent. The unique key makes the engine idempotent and race-safe. `FOR ALL` with `auth.uid()` mirrors `20261014010000_pf_s08_owner_scope_deferred_modules.sql`, so the API's per-request token is the isolation boundary. Never edit this file after it is applied; add a new migration. Applying remotely is not part of this plan.

---

### [x] STEP 3 — Entities: `QuestCompletion`, `UserJourneyFocus`, `UserJourneySnoozes`, `IndicatorRaw`
Create `apps/api/src/PersonalFinance.Domain/Entities/QuestCompletion.cs`:
```csharp
using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;

namespace PersonalFinance.Domain.Entities;

[Table("quest_completions")]
public class QuestCompletion : BaseModel
{
    [PrimaryKey("id", shouldInsert: false)]
    public long Id { get; set; }

    [Column("user_id")]
    public Guid UserId { get; set; }

    [Column("quest_code")]
    public string QuestCode { get; set; } = string.Empty;

    [Column("rung")]
    public short Rung { get; set; }

    [Column("catalog_version")]
    public short CatalogVersion { get; set; }

    // A typed dictionary, not a JSON string: the existing *_json string columns are stored as
    // jsonb strings (double-encoded). This one must reach Postgres as a real jsonb object.
    [Column("evidence")]
    public Dictionary<string, object?> Evidence { get; set; } = new();

    [Column("completed_at", ignoreOnInsert: true)]
    public DateTime CompletedAt { get; set; }

    [Column("seen_at")]
    public DateTime? SeenAt { get; set; }
}
```
Create two narrow entities over the same table, **one column each** (the `JourneyDebtConfirmation` pattern from PF-151). A merge-upsert sends every mapped column, so an entity holding both focus and snoozes would send `quest_snoozes: {}` on every focus change and a null focus on every snooze, erasing the other choice.

`UserJourneyFocus.cs`:
```csharp
using Newtonsoft.Json;
using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;

namespace PersonalFinance.Domain.Entities;

/// <summary>Focus quest on user_journey_state. Maps only this column, so writing the focus never
/// carries the snoozes or any score column, and neither the scoring upsert nor a snooze write carries it.</summary>
[Table("user_journey_state")]
public class UserJourneyFocus : BaseModel
{
    [PrimaryKey("user_id", shouldInsert: true)]
    public Guid UserId { get; set; }

    // Include nulls: clearing the focus must send null instead of leaving the old value.
    [Column("focus_quest_code", NullValueHandling.Include)]
    public string? FocusQuestCode { get; set; }
}
```
`UserJourneySnoozes.cs`:
```csharp
using Supabase.Postgrest.Attributes;
using Supabase.Postgrest.Models;

namespace PersonalFinance.Domain.Entities;

/// <summary>Snoozed quests on user_journey_state ({"l1.sort_the_pile": "2026-11-25"}). One column only.</summary>
[Table("user_journey_state")]
public class UserJourneySnoozes : BaseModel
{
    [PrimaryKey("user_id", shouldInsert: true)]
    public Guid UserId { get; set; }

    [Column("quest_snoozes")]
    public Dictionary<string, string> QuestSnoozes { get; set; } = new();
}
```
Edit `UserJourneyState.cs`, add:
```csharp
    // Raw value per LIVE indicator (months of cover, spend ratio...). A real jsonb object.
    [Column("indicator_raw")]
    public Dictionary<string, decimal> IndicatorRaw { get; set; } = new();
```
`dotnet build` from `apps/api`.

> **Why:** The scoring service upserts a whole `UserJourneyState` on every recalculation (`PersistStateAsync`). If the focus and snooze columns lived on that entity, every recalculation would send their defaults and silently reset the user's choices. Three thin entities over one table (scores, focus, snoozes) keep each writer to its own columns; the first draft of this step put focus and snoozes on one entity, which would have let each write erase the other (found in review). Typed dictionaries avoid the double-encoded jsonb strings the old columns have.

---

### [x] STEP 4 — Event and handler: `TransactionsSubmittedEvent`
Create `apps/api/src/PersonalFinance.Domain/Events/TransactionsSubmittedEvent.cs` (existing events sit in the global namespace; match `AssetUpdatedEvent.cs`):
```csharp
using MediatR;

/// <summary>Published once per successful import batch, after the rows are committed.</summary>
public sealed record TransactionsSubmittedEvent(Guid UserId, int InsertedCount) : INotification;
```
Create `apps/api/src/PersonalFinance.Application/EventHandlers/JourneyRecalcOnTransactionsSubmittedHandler.cs`, a copy of `JourneyRecalcOnAssetHandler` for the new event (guard `UserId == Guid.Empty` with a warning and return; `try { await mediator.Send(new RecalculateJourneyCommand(notification.UserId), ct); } catch (Exception ex) { logger.LogError(ex, "Journey recalc failed after transactions submitted"); }`).

Tests: add to `tests/PersonalFinance.Tests/Authentication/JourneyRecalcOwnerTests.cs`, same style:
- `TransactionsSubmittedHandler_OwnedBatch_RecalculatesForThatOwner`
- `TransactionsSubmittedHandler_OwnerlessBatch_SkipsRecalc`
- `TransactionsSubmittedHandler_RecalcThrows_DoesNotThrow` (mediator `Send` throws; `Handle` completes)

> **Why:** A failed recalculation must never fail an import that is already committed, exactly like the two handlers that exist. Owner-less events are skipped because recalculation runs with the caller's token and must never run for a placeholder id (the PF-S08 rule behind those guards).

---

### [x] STEP 5 — Asset-side trigger: one pipeline behavior on a marker interface
Create `Application/Interfaces/IAffectsJourney.cs`:
```csharp
namespace PersonalFinance.Application.Interfaces;

/// <summary>Marks a command whose success changes data the Journey scores or quests read.</summary>
public interface IAffectsJourney { }
```
Create `Application/Behaviors/PublishAssetUpdatedBehavior.cs`:
```csharp
using MediatR;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Application.Behaviors;

public sealed class PublishAssetUpdatedBehavior<TRequest, TResponse>(IPublisher publisher, ICurrentUser caller)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull, IAffectsJourney
{
    public async Task<TResponse> Handle(
        TRequest request, RequestHandlerDelegate<TResponse> next, CancellationToken ct)
    {
        var response = await next();
        // The write is committed. CancellationToken.None so a closed tab cannot leave scores stale.
        await publisher.Publish(new AssetUpdatedEvent(caller.UserId), CancellationToken.None);
        return response;
    }
}
```
(MediatR 12.5: `next()` takes no token; if the compiler asks for one, pass `ct`.)

Tag these 11 records with `, IAffectsJourney` (add `using PersonalFinance.Application.Interfaces;` where needed): `CreateAccountCommand`, `UpdateAccountCommand`, `DeleteAccountCommand`, `CreateValuationCommand`, `DeleteValuationCommand`, `CreateLiabilityCommand`, `UpdateLiabilityCommand`, `DeleteLiabilityCommand`, `CreateAssetCommand`, `UpdateAssetCommand`, `DeleteAssetCommand`. Example: `public record DeleteAssetCommand(Guid Id) : IRequest<bool>, IAffectsJourney;`.

Register in `Program.cs`:
```csharp
builder.Services.AddMediatR(cfg =>
{
    cfg.RegisterServicesFromAssemblyContaining<Program>();
    cfg.RegisterServicesFromAssemblyContaining<CreateTransactionCommandHandler>();
    cfg.AddOpenBehavior(typeof(PublishAssetUpdatedBehavior<,>));
});
```
Tests (`tests/PersonalFinance.Tests/Behaviors/PublishAssetUpdatedBehaviorTests.cs`), using a real `ServiceCollection` + MediatR with a dummy tagged command, a stub handler and a recording `INotificationHandler<AssetUpdatedEvent>`:
- `Handle_TaggedCommandSucceeds_PublishesAssetUpdatedOnceForCaller`
- `Handle_TaggedCommandThrows_PublishesNothing`
- `Handle_UntaggedCommand_PublishesNothing`
- `TaggedCommands_AreExactlyTheElevenJourneyCommands` (reflection over the 11 types asserts each implements `IAffectsJourney`, so a refactor cannot silently drop one)

> **Why:** Nine handlers edited by hand would be nine places to forget, and the existing handlers use the concrete `Supabase.Client`, so publishing from them is hard to test. One behavior is tested once and covers every tagged command, including future ones. `AssetUpdatedEvent` already has a handler (`JourneyRecalcOnAssetHandler`) with an owner guard, so nothing else is needed. Holdings, investments and institutions are deliberately not tagged: no scored indicator reads them in v1.

---

### [x] STEP 6 — Controller publishers: `SubmitTransactions` and `SetCashflowFlag`
> **Done (segment 2):** Production code done and verified (SubmitTransactions folds post-commit work into `AfterImportAsync`, publishes `TransactionsSubmittedEvent` when `InsertedCount > 0`; `SetCashflowFlag` publishes `AssetUpdatedEvent`). 4 of the 5 listed tests written and passing: the SubmitTransactions trio in `TransactionsUploadErrorTests` and `SetCashflowFlag_NotFound_PublishesNothing` in the new `AccountsControllerJourneyTriggerTests`. The 5th, `SetCashflowFlag_Succeeds_PublishesAssetUpdated`, is **not unit-testable** — the success path reads the account back through the concrete `Supabase.Client` (no interface to mock, same limitation as `JourneyScoringService`), so it is a live check (Owner Review Checklist section E). The publish happens before the readback in `SetCashflowFlag`, so a live PATCH proves it.
In `TransactionsController.SubmitTransactions`, after `QueueEmbeddingAsync` and before `return Ok(result)`:
```csharp
            await QueueEmbeddingAsync(result.InsertedIds);
            if (result.InsertedCount > 0)
                await _mediator.Publish(new TransactionsSubmittedEvent(_caller.UserId, result.InsertedCount),
                    CancellationToken.None);
            return Ok(result);
```
In `AccountsController.SetCashflowFlag`, publish after the `NotFound` guard and before reading the account back: `await mediator.Publish(new AssetUpdatedEvent(caller.UserId), CancellationToken.None);`.

Keep the action body at 15 lines or fewer (ARCH-04). If `SubmitTransactions` goes over, fold the two post-commit steps into one private `AfterImportAsync(result)`.

Tests, extending `TransactionsUploadErrorTests`' `Harness` with a `Mock<IMediator>` and a `Mock<ICashflowMutationService>` (read how `Build()` wires them first):
- `SubmitTransactions_InsertsRows_PublishesOneEventWithCount`
- `SubmitTransactions_AllDuplicates_PublishesNothing` (`InsertedCount` 0)
- `SubmitTransactions_MutationFails_PublishesNothing` (`CashflowMutationException`)
- `SetCashflowFlag_Succeeds_PublishesAssetUpdated` and `SetCashflowFlag_NotFound_PublishesNothing` in a new small `AccountsControllerJourneyTriggerTests`

> **Why:** "Once per batch, not once per row" keeps a 500-row statement to one recalculation. Duplicates inserted nothing, so there is nothing new to score. The include-in-cashflow flag decides which accounts `l1.full_picture` waits for, so it has to trigger a pass; opening balance does not touch any scored value and is left alone. PF-130 (in the backlog) describes an older shape of this action; when it is executed it must keep this publish.

---

### [x] STEP 7 — Scoring: load once, compute from the snapshot (a pure refactor, scores must not change)
> **Done (segment 3):** The full refactor landed as one build-safe unit. `Application/Quests/ScoringSnapshot.cs` (with `SavingsAccountFact` and `JourneyRecalculation`) created; `JourneyScoringService` now takes `TimeProvider` as its 4th ctor param, loads everything once in `LoadInputsAsync` (transactions, savings+valuations via one `Operator.In` query with in-memory latest-per-account, liabilities, PF-151 confirmation — each in its own try/catch, null on failure), and the four compute methods are now synchronous `internal` methods over the snapshot (`ComputeSpendLtIncome/LiquidSavings/Dti/SavingsRate`) with every formula, threshold and `JourneyScoringRules` call untouched. `RecalculateWithSnapshotAsync` records `startedAt`, pins `today` to Jakarta (`time.GetLocalNow()`), and returns `JourneyRecalculation(state, snapshot)`; `RecalculateAsync` delegates to it. `IJourneyScoringService` gains `RecalculateWithSnapshotAsync`; `Program.cs` registers `AddSingleton<TimeProvider>(AppTimeProvider.Jakarta())`. `PersistStateAsync`/`PersistSnapshotsAsync` left as-is (STEP 9 adds raw/stars/ShouldPersist). Groundwork from segment 2 (`AppTimeProvider` + 3 clock tests) remains. **Build:** full `dotnet build PersonalFinance.slnx` clean (0 errors, 0 warnings). **Tests:** `JourneyScoringSnapshotTests.cs` (12 new tests) added; Journey test filter = 87 passed / 0 failed (new snapshot tests + unchanged reflection/parity tests both green). **Gated:** the live before/after parity check against the STEP 1 owner numbers needs the STEP 2 migration applied + the stack running (same STEP 2 blocker as STEP 9/14/17/24) — carried to Owner Review.
Edit `JourneyScoringService.cs`. Create `Application/Quests/ScoringSnapshot.cs`:
```csharp
using PersonalFinance.Application.Dtos;
using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Application.Quests;

/// <summary>Everything one scoring pass loaded, plus the indicators computed from it.
/// A null list means that load failed; dependent indicators report "Computation error".</summary>
public sealed record ScoringSnapshot(
    DateOnly Today,
    IReadOnlyList<Transaction>? Transactions,        // 3 months back to the first of the month, through today
    IReadOnlyList<SavingsAccountFact>? SavingsAccounts,
    IReadOnlyList<Liability>? Liabilities,
    DateTime? NoDebtsConfirmedAt,                    // PF-151's confirmation; null = not confirmed
    bool ConfirmationLoaded,                         // false = the read failed, so DTI must fail closed
    IReadOnlyList<IndicatorScoreDto> Indicators);

public sealed record SavingsAccountFact(Guid AccountId, string Name, decimal? LatestValueIdr, DateTime? LatestValuedAt);

public sealed record JourneyRecalculation(JourneyStateDto State, ScoringSnapshot Snapshot);
```
Then:
1. Add `TimeProvider time` as the fourth constructor parameter, after PF-151's `IJourneyConfirmationService confirmation`: `(Supabase.Client supabase, IJourneyConfirmationService confirmation, ILogger<JourneyScoringService> logger, TimeProvider time)`. **Pin the clock to the user's calendar.** The old code used the host's `DateTime.Today`; `TimeProvider.System` is UTC, so on a UTC host the month windows and the G6 "current or previous calendar month" rule would flip seven hours late for Jakarta. Create `Application/Services/AppTimeProvider.cs`:
```csharp
namespace PersonalFinance.Application.Services;

/// <summary>TimeProvider whose local zone is Asia/Jakarta, so "today" and "this month" are the owner's, on any host.</summary>
public sealed class AppTimeProvider(TimeZoneInfo zone) : TimeProvider
{
    public override TimeZoneInfo LocalTimeZone { get; } = zone;

    public static AppTimeProvider Jakarta() => new(Resolve());

    private static TimeZoneInfo Resolve()
    {
        // IANA id on Linux/macOS (and Windows with ICU); the Windows id as a fallback.
        foreach (var id in new[] { "Asia/Jakarta", "SE Asia Standard Time" })
        {
            try { return TimeZoneInfo.FindSystemTimeZoneById(id); } catch (TimeZoneNotFoundException) { }
        }
        return TimeZoneInfo.CreateCustomTimeZone("WIB", TimeSpan.FromHours(7), "WIB", "WIB");  // Indonesia has no DST
    }
}
```
   Register `builder.Services.AddSingleton<TimeProvider>(AppTimeProvider.Jakarta());` in `Program.cs`. Everything below that needs "today" uses `DateOnly.FromDateTime(time.GetLocalNow().DateTime)`. `QuestBoardService` and `QuestEngine` take the same `TimeProvider`.
2. Add to `IJourneyScoringService`: `Task<JourneyRecalculation> RecalculateWithSnapshotAsync(Guid userId, CancellationToken ct = default);`. Keep `RecalculateAsync` and make it `=> (await RecalculateWithSnapshotAsync(userId, ct)).State`, so existing callers and `GetStateAsync`'s fallback keep compiling.
3. Add `LoadInputsAsync(DateOnly today, CancellationToken ct)`. It runs, once each, in separate try/catch blocks that log at `Error` and leave that list null on failure:
   - `FetchTransactionsAsync(start, end)` with the **same** window as today: `start = new DateTime(today.Year, today.Month, 1).AddMonths(-3)`, `end = today`;
   - the Savings accounts (filtered with `JourneyScoringRules.SavingsAccountType`, the lowercase constant from PF-151 STEP 3b item 5), then **one** valuations query for all of them (`subject_type = Account`, `subject_id in (...)`, ordered by `valued_at` descending) and a group-by in memory taking the first row per account;
   - the liabilities (`supabase.From<Liability>().Get()`);
   - PF-151's confirmation: `await confirmation.GetNoDebtsConfirmedAtAsync(userId, ct)`, in its own try/catch; on failure set `ConfirmationLoaded = false`.
4. Change `ComputeSpendLtIncomeAsync`, `ComputeLiquidSavingsAsync`, `ComputeDtiAsync(Guid userId, ct)` and `ComputeSavingsRateAsync` into synchronous `internal` methods taking the snapshot (`ComputeSpendLtIncome(ScoringSnapshot s)` and so on). **Do not touch a formula, a threshold, a `JourneyScoringRules` call or PF-151's logic.** The only edits are: the `FetchTransactionsAsync(start, today)` line becomes `var transactions = s.Transactions` (return `NotAvailable(..., "Computation error")` when it is null); `DateTime.Today` becomes `s.Today.ToDateTime(TimeOnly.MinValue)`; the liquid-savings account and valuation loops read `s.SavingsAccounts`; in `ComputeDti`, `liabilities.Models` becomes `s.Liabilities`, the confirmation read becomes `s.NoDebtsConfirmedAt`, and the method returns `NotAvailable(..., "Computation error")` when `s.Liabilities is null` or `!s.ConfirmationLoaded`, preserving PF-151's fail-closed rule.
5. `RecalculateWithSnapshotAsync` records `var startedAt = time.GetUtcNow().UtcDateTime;` first, builds the inputs snapshot (empty `Indicators`), computes the indicators from it, runs the unchanged level/total/achievement/persist code, then returns `new JourneyRecalculation(state, inputs with { Indicators = indicators })`.
6. Leave `PersistSnapshotsAsync` as it is for now (see Notes, the empty-table finding).

Clock test (`tests/PersonalFinance.Tests/Services/AppTimeProviderTests.cs`): with a small test subclass of `AppTimeProvider` that overrides `GetUtcNow()` (no extra package needed) and UTC time 2026-10-31 18:00, today is 2026-11-01; at 2026-10-31 16:59 UTC it is still 2026-10-31.

Tests (`tests/PersonalFinance.Tests/Services/JourneyScoringSnapshotTests.cs`; `InternalsVisibleTo` for the Tests project already exists). Build the service with `new JourneyScoringService(null!, null!, NullLogger<JourneyScoringService>.Instance, TimeProvider.System)`: the compute methods never touch the client or the confirmation service.
- `ComputeSpendLtIncome_ThreeFullMonths_AveragesTheMonthlyRatios`
- `ComputeSpendLtIncome_InvestingOutflow_IsNotSpending` (PF-151's 10 jt / 8 jt / 1.5 jt example, through the snapshot path)
- `ComputeSpendLtIncome_TransactionsLoadFailed_ReturnsNoDataComputationError`
- `ComputeLiquidSavings_UsesLatestValuationPerAccount`
- `ComputeLiquidSavings_NoSavingsAccounts_ReturnsNoData`
- `ComputeDti_NoLiabilitiesNoConfirmation_ReturnsNoData`; `ComputeDti_NoLiabilitiesConfirmed_ScoresZeroDti`; `ComputeDti_LiabilityOverridesConfirmation`
- `ComputeDti_ConfirmationReadFailed_FailsClosedAsNoData`
- `ComputeSavingsRate_CountsOnlySavingsOutflows`

Parity check: with the stack running, press Recalculate on `/journey` (or `POST /api/journey/recalculate`) and compare to the STEP 1 numbers. **They must be identical.** Keep the existing reflection tests in `JourneyScoringServiceTests.cs` untouched; they must still pass.

> **Why:** Raw values exist only during a pass, so the engine needs the data the pass already loaded, and today four indicators fetch the same three months of transactions separately while the savings indicator queries valuations once per account. Loading once is the spec's snapshot and a free performance win (PERF-01 in spirit). It is deliberately a minimal-diff refactor, because PF-151 has just edited these formulas and a bigger rewrite would make the two plans collide. The before/after comparison is the proof, since the formulas cannot be unit-tested end to end against a concrete Supabase client. If the numbers differ, stop (see Execution Notes).

---

### [x] STEP 8 — Verify the savings-account casing fix (it now lives in PF-151)
> **Verified (segment 3):** `grep -rn "SavingsAccountType\|\"Savings\"" apps/api/src` shows `JourneyScoringRules.SavingsAccountType = "savings"` (PF-151) and its use in the STEP 7 savings load (`JourneyScoringService.cs` line 128). No capitalised `"Savings"` `account_type` filter remains — the only `"Savings"` hit is an `InsightService` *category* name set, not an account filter. PF-151 shipped the fix (item 5); no re-apply needed. Owner's live L2 before/after numbers are gated on the STEP 2 migration + stack.
The fix itself moved into PF-151 (STEP 3b item 5: `JourneyScoringRules.SavingsAccountType = "savings"`, used as the filter value), so PF-151's before/after record is true. This step only verifies it:
```bash
grep -rn "SavingsAccountType\|\"Savings\"" apps/api/src | grep -v "/obj/"
```
Expect the constant and its use in the savings load (STEP 7), and no capitalised `"Savings"` filter left. If PF-151 was executed without item 5, apply it now exactly as PF-151 describes (constant, filter, the constant test), and record the owner's L2 numbers before and after in Notes: `liquid_savings_ratio` goes from "not evaluated" to a computed score, the L2 average changes, and graduation can change (`graduated_l2` then depends on cover as well as DTI). Check each savings account's latest valuation date and say which are stale. The score itself still uses the latest valuation regardless of date; quests and stars apply G6 on top (STEPS 11 and 13).

> **Why:** The bug silently blocks half of this plan: `l2.count_your_cushion`, every fence post and the liquid-savings stars can never complete if the indicator is never evaluated, and the stale-valuation criterion could not even be exercised. It is a score change, so it belongs in PF-151, where it changes PF-151's own before/after story, instead of hiding inside this plan's refactor.

---

### [ ] STEP 9 — Persist raw values, add stars, and make `GetStateAsync` honest
1. Create `Application/Quests/StarRungs.cs` (this is the single place star thresholds live):
```csharp
using System.Globalization;

namespace PersonalFinance.Application.Quests;

public static class StarRungs
{
    // Source: docs/ideas/scoring-rubric.md. 70 is the level-graduation bar ("cleared"); 50 and 100
    // are the rubric's mid and full breakpoint scores. Stars are recognition, not points.
    public static readonly IReadOnlyList<decimal> Scores = [50m, 70m, 100m];

    public sealed record StarIndicator(string Code, string Level, decimal[] RawAtRung, Func<decimal, string> Copy);

    // RawAtRung is the raw value that earns score 50/70/100, from the same breakpoints as the
    // Score* formulas in JourneyScoringService. StarRungsTests proves the two cannot drift.
    public static readonly IReadOnlyList<StarIndicator> Indicators =
    [
        new("spend_lt_income",      "L1", [0.95m, 0.89m, 0.80m], r => $"Spending under {Pct(r)} of income"),
        new("liquid_savings_ratio", "L2", [1.5m, 2.1m, 3.0m],    r => $"{r.ToString("0.0", CultureInfo.InvariantCulture)} months of expenses saved"),
        new("manageable_dti",       "L2", [0.36m, 0.296m, 0.20m], r => $"Debt payments under {Pct(r)} of income"),
        new("savings_rate",         "L3", [0.05m, 0.09m, 0.15m], r => $"Setting aside {Pct(r)} of income"),
    ];

    public static int StarsFor(string code, decimal score, string status)
    {
        if (status == "no_data" || Indicators.All(i => i.Code != code)) return 0;
        return Scores.Count(threshold => score >= threshold);
    }

    public static string RungCopy(string code, int rung)
    {
        var indicator = Indicators.First(i => i.Code == code);
        return indicator.Copy(indicator.RawAtRung[rung - 1]);
    }

    private static string Pct(decimal ratio) =>
        (ratio * 100m).ToString("0.#", CultureInfo.InvariantCulture) + "%";
}
```
2. `IndicatorScoreDto`: append `int Stars = 0` as the last positional parameter (default keeps every existing constructor call compiling). After indicators are computed (in `RecalculateWithSnapshotAsync`) and when rebuilding in `GetStateAsync`, set it with `dto with { Stars = StarRungs.StarsFor(dto.Code, dto.Score, dto.Status) }`.
3. `PersistStateAsync`: add `IndicatorRaw = indicators.Where(i => i.Status != "no_data" && i.RawValue.HasValue).ToDictionary(i => i.Code, i => i.RawValue!.Value)` to the upserted `UserJourneyState`.
4. `BuildIndicatorDtos` (PF-151's `internal static`, `(Dictionary<string, decimal> liveScores)`): add an optional second parameter `IReadOnlyDictionary<string, decimal>? rawValues = null` and set `RawValue` from it. Liveness stays exactly as PF-151 defined it: an indicator is live only if its code is in `liveScores` (the stored score map holds evaluated indicators only). `indicator_raw` therefore carries values, never liveness.
5. Add one shared reader, `internal static List<IndicatorScoreDto> IndicatorsFromRow(UserJourneyState? row)`, to `JourneyScoringService`: parse `row.IndicatorScoresJson` with the existing `ParseJsonDecimalMap`, call `BuildIndicatorDtos(live, row.IndicatorRaw)`, and apply `Stars`. Use it in `GetStateAsync` and, in STEP 11, for the board. A row written before PF-151 shipped may still hold 0 for unevaluated indicators; PF-151's post-deploy recalculation fixes that, which is why STEP 1 checks that it ran.

6. **Never let an older pass overwrite a newer one.** Recalculation now fires on every import and asset write, so two passes can overlap (two tabs, an upload followed at once by an account edit). `PersistStateAsync` upserts the whole row, so the slower pass would win with older data. Set `LastComputedAt` to the pass's `startedAt` (STEP 7 item 5; it is the moment the data was read, which is the honest meaning of "computed at"), and before the upsert read the stored `last_computed_at`: if it is later than this pass's `startedAt`, log at `Information` ("skipped, a newer pass already saved") and do not write. Put the decision in a pure helper, `internal static bool ShouldPersist(DateTime? storedLastComputedAt, DateTime passStartedAt) => storedLastComputedAt is null || storedLastComputedAt <= passStartedAt;`. The pass still returns its own state to its caller. Completions need no guard: they only grow and are idempotent.

Tests (`tests/PersonalFinance.Tests/Quests/StarRungsTests.cs`, plus `ShouldPersist` cases in `JourneyScoringSnapshotTests.cs`):
- `StarsFor_BoundaryScores_49_50_69_70_99_100` (0,1,1,2,2,3)
- `StarsFor_NoData_ReturnsZero`
- `RawAtRung_ScoresExactlyTheRungScore_ForEveryIndicator`: for each indicator, call `JourneyScoringService.ScoreSpendRatio`, `ScoreLiquidSavings`, `ScoreDti`, `ScoreSavingsRate` (internal static after PF-151) with `RawAtRung[k]` and assert the result is within 0.05 of `Scores[k]`
- `RungCopy_RendersEveryRungFromTheRawValues` (for example `Spending under 89% of income`, `2.1 months of expenses saved`, `Debt payments under 29.6% of income`)
- `BuildIndicatorDtos_RawValuesGiven_SetsRawValueOnLiveIndicators` and `..._NoRawForCode_RawIsNull`
- `IndicatorsFromRow_UnevaluatedDti_StaysNoDataWithZeroStars`
- `IndicatorsFromRow_NullRow_ReturnsAllNoData`
- `ShouldPersist_NoStoredRow_True`; `ShouldPersist_StoredIsOlder_True`; `ShouldPersist_StoredIsNewer_False`; `ShouldPersist_SameInstant_True`

> **Why:** Detectors and the board need raw values (fence posts count months of cover, not a score) and `GetStateAsync` has always rebuilt them as null. Stars are derived from the same rubric breakpoints as the scores, so the invariant test makes "every star is exactly true" a CI fact instead of a hope (FIN-02: each constant cites the rubric). The numbers shown in copy come from these constants, never from an LLM (G2). The `Stars` default avoids touching the many places that build `IndicatorScoreDto`.

---

### [ ] STEP 10 — Quest catalog, value types and the lint tests
Create `Application/Quests/QuestDefinition.cs`:
```csharp
namespace PersonalFinance.Application.Quests;

public enum QuestKind { Discovery, Ladder, Recognition, Boss }

public sealed record QuestDefinition(
    string Code,                    // "l2.fence_posts"
    string Level,                   // "L1".."L5"
    QuestKind Kind,
    QuestRule Rule,
    IReadOnlyList<decimal> Rungs,   // thresholds, ascending; empty = single step (rung 0)
    bool MovesMoney,                // G7: offered only at the working level
    string Title,
    string Why,
    string? Deeplink);
```
Create `Application/Quests/QuestCatalog.cs` (rule classes arrive in STEPS 12 and 13; this file compiles after them, so write it now and let STEP 12 make it build, or add the rule files first in the same commit):
```csharp
namespace PersonalFinance.Application.Quests;

public static class QuestCatalog
{
    public const int Version = 1;

    public static readonly IReadOnlyList<QuestDefinition> V1 = Build();

    public static QuestDefinition? Find(string code) => V1.FirstOrDefault(q => q.Code == code);

    private static IReadOnlyList<QuestDefinition> Build()
    {
        var quests = new List<QuestDefinition>
        {
            new("l1.meet_your_money", "L1", QuestKind.Discovery, new TransactionsExist(), [], false,
                "Meet your money", "Upload one statement and see where your money really goes.", "/cashflow/upload"),
            new("l1.sort_the_pile", "L1", QuestKind.Discovery, new TopExpensesCategorized(5), [], false,
                "Sort the mystery pile", "Give last month's biggest expenses a category so your spending picture is true.", "/cashflow/transactions"),
            // One rung per account: rung k means "k accounts covered". The count grows when an account is added.
            new("l1.full_picture", "L1", QuestKind.Discovery, new AccountsCovered(), [], false,
                "Full picture", "Upload a statement from every account you spend from.", "/cashflow/upload"),
            // Source: scoring-rubric.md spend_lt_income, ratio 1.00 is the 0-point breakpoint.
            new("l1.in_the_green", "L1", QuestKind.Ladder, new GreenMonth(), [], false,
                "In the green", "Spend less than you earn in a single month.", "/cashflow/overview"),
            new("l1.boss", "L1", QuestKind.Boss, new LevelGraduated("L1"), [], false,
                "Foundations cleared", "Every Foundations indicator has reached the clearing bar.", null),

            new("l2.count_your_cushion", "L2", QuestKind.Discovery, new ValuationExists("savings"), [], false,
                "Count your cushion", "Record what is in your savings so we can tell you how many months it covers.", "/assets/accounts"),
            new("l2.map_your_debts", "L2", QuestKind.Discovery, new DebtsMapped(), [], false,
                "Map your debts", "Add each loan or paylater you have, or confirm you have none.", "/assets/liabilities"),
            // Source: scoring-rubric.md liquid_savings_ratio, 0.5 months is the 0-point and 3 months the
            // 100-point breakpoint. Half-month posts are celebration points only; they never change a score.
            // G6 (stale balances) is applied once, in QuestContextFactory, by marking the cover indicator untrusted.
            new("l2.fence_posts", "L2", QuestKind.Ladder,
                new RawValueAtLeast("liquid_savings_ratio", StepNoun: "posts", ValueUnit: "months"),
                [0.5m, 1m, 1.5m, 2m, 2.5m, 3m], MovesMoney: true,
                "Build the fence", "Each post is half a month of expenses in savings, up to three months.", "/assets/accounts"),
            new("l2.boss", "L2", QuestKind.Boss, new LevelGraduated("L2"), [], false,
                "The fence holds", "Every Defense indicator has reached the clearing bar.", null),
        };

        // Stars: recognition only. Rung k (1..3) = score 50 / 70 / 100. Never offered, they just happen.
        foreach (var star in StarRungs.Indicators)
            quests.Add(new($"stars.{star.Code}", star.Level, QuestKind.Recognition,
                new IndicatorScoreAtLeast(star.Code), StarRungs.Scores, false, star.Code, string.Empty, null));

        return quests;
    }
}
```
Create `Application/Quests/QuestCopy.cs` with `CompletionTitle(QuestDefinition q, int rung, IReadOnlyDictionary<string, object?> evidence)`: stars give `new string('⭐', rung) + " " + StarRungs.RungCopy(code, rung)`; fence posts give `$"Fence post {rung} of {q.Rungs.Count}"`; `l1.full_picture` gives `$"{rung} of {total} accounts covered"` with `total` read from the stored evidence; everything else returns `q.Title`.

Tests (`tests/PersonalFinance.Tests/Quests/QuestCatalogTests.cs`):
- `Catalog_Codes_AreUnique`
- `Catalog_Rungs_AscendStrictly`
- `Catalog_StarsExistOnlyForTheFourLiveIndicators`
- `Catalog_OnlyLadderQuestsMoveMoney` and `Catalog_MovesMoney_OnlyFencePosts`
- `Catalog_AllCopy_PassesTheG8Lint`: for every `Title`, `Why` and every generated star title (`StarRungs.RungCopy` for each rung), fail on a case-insensitive match of any of: `stock|saham|equity|bond|obligasi|sbn|\bori\b|sukuk|reksa|mutual fund|\betf\b|crypto|bitcoin|gold|emas|p2p|deposit|deposito|property|properti|bibit|ajaib|stockbit|bareksa|gopay|ovo|kredivo|akulaku|return|yield|imbal|profit|cuan|trading|\btrade\b|allocat|alokasi|diversif`, and on any `\d+(\.\d+)?\s*%` that is not followed by ` of income`
- `Lint_CatchesABadSample` (the lint helper rejects "Put 60% in stocks", "Buy gold", "Earn 8% return"). This proves the lint is not vacuous.
- `QuestDefinition_HasNoPointsLikeMember`: reflection asserts no property named like `point|gain|xp|reward` (G2). The same check for the board DTOs is added in STEP 18.

> **Why:** The catalog lives in code because the detectors are code and a table would only add a sync problem. Every number in copy comes from a rung constant (G2). The G8 lint is a hard CI failure rather than a review comment, because an allocation or product nudge slipping into quest copy is a compliance problem (FIN-05), not a style problem, and a lint that cannot fail proves nothing, hence the bad-sample test. Rung numbers are 1-based indexes into `Rungs` (0 for single-step quests); the thresholds themselves are stored in `evidence`, so the unique key stays integer-only.

---

### [ ] STEP 11 — `QuestContext`, working level and the two factories
Create `Application/Quests/QuestContext.cs`:
```csharp
namespace PersonalFinance.Application.Quests;

/// <summary>Trusted = the indicator's input is fresh enough to celebrate (G6). A stale savings balance still
/// feeds the score, but quests and stars must not treat the resulting cover as an achievement.</summary>
public sealed record IndicatorFact(string Code, string Level, decimal Score, decimal? Raw, string Status, bool Trusted = true);
public sealed record ExpenseFact(decimal AmountIdr, string Category);
public sealed record MonthFacts(int Year, int Month, decimal Income, decimal Expense, IReadOnlyList<ExpenseFact> TopExpenses);
public sealed record AccountFact(Guid Id, string Name, bool HasTransactionInWindow);

/// <summary>Read-only facts the rules look at. The write path fills everything; the read path
/// (board) fills only what progress and offers need: indicators, working level, completed, accounts.</summary>
public sealed record QuestContext(
    DateOnly Today,
    IReadOnlyDictionary<string, IndicatorFact> Indicators,
    string WorkingLevel,
    IReadOnlySet<string> GraduatedLevels,
    IReadOnlyList<MonthFacts> Months,               // last 3 full calendar months, newest first
    bool AnyTransaction,
    IReadOnlyList<AccountFact> CashflowAccounts,
    IReadOnlyList<SavingsAccountFact> SavingsAccounts,
    int LiabilityCount,
    bool NoDebtsConfirmed,
    bool TransactionsLoaded,
    bool SavingsLoaded,
    IReadOnlySet<(string Code, int Rung)> Completed);
```
Create `Application/Quests/WorkingLevel.cs`:
```csharp
namespace PersonalFinance.Application.Quests;

public static class WorkingLevel
{
    private static readonly string[] Levels = ["L1", "L2", "L3", "L4", "L5"];

    /// <summary>A level is cleared when it has at least one live indicator and every live one scores 70 or more
    /// (scoring-rubric.md, Level Graduation Rules). The working level is the first level not cleared.
    /// This is NOT currentLevel, which reads 1 both before and after L1 clears (CIO guardrail G7).</summary>
    public static (string Working, IReadOnlySet<string> Cleared) Compute(IEnumerable<IndicatorFact> indicators)
    {
        var list = indicators.ToList();
        var cleared = new HashSet<string>();
        foreach (var level in Levels)
        {
            var live = list.Where(i => i.Level == level && i.Status != "no_data").ToList();
            if (live.Count > 0 && live.All(i => i.Score >= 70m)) cleared.Add(level); else break;
        }
        var working = Levels.FirstOrDefault(l => !cleared.Contains(l)) ?? "L5";
        return (working, cleared);
    }
}
```
Create `QuestContextFactory` with two methods:
- `FromSnapshot(ScoringSnapshot s, IReadOnlyList<Account> cashflowAccounts, bool anyTransaction, IReadOnlySet<(string, int)> completed)` for the write path. Months: for `i` in 1..3, `var m = s.Today.AddMonths(-i)`; `Income` = `JourneyScoringRules.MonthTotal(transactions, month, JourneyScoringRules.IsIncome)`; `Expense` = `MonthTotal(..., JourneyScoringRules.IsConsumption)`, the very predicate `spend_lt_income` uses (PF-151), so "in the green" and the score can never disagree; `TopExpenses` = the 5 largest rows with `JourneyScoringRules.IsExpense` (all expenses, savings categories included, since an uncategorized large transfer matters for "sort the pile"). `AccountFact.HasTransactionInWindow` = any transaction in those three full months with that `AccountId`. `LiabilityCount` from `s.Liabilities?.Count ?? 0`; `NoDebtsConfirmed = s.NoDebtsConfirmedAt is not null`. **G6 lives here, once.** When building the indicator facts, set `Trusted = ValuationFreshness.AllFresh(s.SavingsAccounts ?? [], s.Today)` for `liquid_savings_ratio` (a null list, meaning the savings load failed, counts as not fresh) and `Trusted = true` for every other indicator. Every rule that reads an indicator treats an untrusted one as not live, so fence posts, the cover stars and any future cover quest inherit the rule without remembering it. `JourneyScoringRules` is `internal` to the Application assembly, which is where this factory lives. Null lists from a failed load become empty collections **and** the rules must treat a failed load as "not evaluated", never as "nothing there": add `bool TransactionsLoaded` and `bool SavingsLoaded` to `QuestContext`; the month-based rules (`TopExpensesCategorized`, `AccountsCovered`, `GreenMonth`) return not-met when `TransactionsLoaded` is false, and `ValuationExists`/`RawValueAtLeast` when `SavingsLoaded` is false (`TransactionsExist` uses `AnyTransaction` from the store).
- `FromStoredState(IReadOnlyList<IndicatorScoreDto> indicators, IReadOnlyList<Account> cashflowAccounts, IReadOnlySet<(string, int)> completed, DateOnly today)` for the read path. The indicators come from `JourneyScoringService.IndicatorsFromRow(row)` (STEP 9), so live, `no_data`, raw values and stars are exactly what `GET /state` shows. It fills indicators, working level, cleared levels, accounts and completed; everything else stays empty.

Tests (`tests/PersonalFinance.Tests/Quests/WorkingLevelTests.cs`, `QuestContextFactoryTests.cs`):
- `WorkingLevel_L1BelowBar_IsL1`; `WorkingLevel_L1Cleared_IsL2` (the case where `currentLevel` would read 1 for both); `WorkingLevel_LevelWithNoLiveIndicator_IsNotCleared`; `WorkingLevel_L1And2Cleared_IsL3`
- `FromSnapshot_Months_AreTheThreePreviousFullMonths_NewestFirst` (pin `Today` to 2026-10-25: Sep, Aug, Jul)
- `FromSnapshot_ExpenseExcludesSavingsCategories_MatchingTheScoringHelper`
- `FromSnapshot_TopExpenses_AreTheFiveLargest`
- `FromSnapshot_AccountCoverage_UsesOnlyTheThreeFullMonths`
- `FromSnapshot_TransactionsLoadFailed_FlagsTransactionsNotLoaded`
- `FromSnapshot_StaleSavingsValuation_MarksCoverUntrusted` (valued two calendar months ago); `FromSnapshot_FreshValuation_CoverTrusted`; `FromSnapshot_SavingsLoadFailed_CoverUntrusted`; `FromSnapshot_OtherIndicators_AlwaysTrusted`
- `FromStoredState_UnevaluatedIndicator_IsNotLiveAndNotCleared`

> **Why:** The working level (first level not cleared) is the only correct gate for money-moving quests; `DetermineCurrentLevel` returns 1 both before and after L1 clears, so using it would offer "build the fence" to someone who has not cleared L1, or hide L2 from someone who has (G7). Sharing the consumption helper with scoring is what keeps "in the green" and the score from ever disagreeing. Two factories exist because the read path must not reload three months of transactions just to draw a board.

---

### [ ] STEP 12 — Rules, part 1: the four L1 detectors
Create `Application/Quests/QuestRule.cs`:
```csharp
namespace PersonalFinance.Application.Quests;

public sealed record RungResult(int Rung, bool Met, IReadOnlyDictionary<string, object?> Evidence);
public sealed record QuestProgress(int Done, int Total, string Label, decimal Fraction);

/// <summary>A detector: a pure function of the context. No database, no clock, no randomness.</summary>
public abstract record QuestRule
{
    protected static readonly IReadOnlyDictionary<string, object?> NoEvidence = new Dictionary<string, object?>();

    public abstract IReadOnlyList<RungResult> Evaluate(QuestContext ctx, QuestDefinition quest);

    /// <summary>False when the quest cannot be pursued yet (for example, there are no accounts to cover).</summary>
    public virtual bool Applies(QuestContext ctx) => true;

    /// <summary>Board progress from stored values only. Null for single-step quests.</summary>
    public virtual QuestProgress? Progress(QuestContext ctx, QuestDefinition quest) => null;

    protected static int DoneRungs(QuestContext ctx, string code) =>
        ctx.Completed.Where(c => c.Code == code).Select(c => c.Rung).DefaultIfEmpty(0).Max();
}
```
Create the four rules (one file `Application/Quests/Rules/L1Rules.cs`):
- `TransactionsExist`: one result, rung 0, `Met = ctx.AnyTransaction`.
- `TopExpensesCategorized(int Count)`: takes `ctx.Months[0].TopExpenses.Take(Count)`; met when there is at least one and none is uncategorized. Evidence: the month (`yyyy-MM`) and how many were checked. Uses
```csharp
public static class QuestCategories
{
    // The pipeline sets "Uncategorized"; CategoryRuleService returns "Untracked Category"; imports can leave it empty.
    public static bool IsUncategorized(string? category) =>
        string.IsNullOrWhiteSpace(category)
        || category.Equals("Uncategorized", StringComparison.OrdinalIgnoreCase)
        || category.Equals("Untracked Category", StringComparison.OrdinalIgnoreCase);
}
```
- `AccountsCovered`: `Applies` only when there is at least one cash-flow account; `Evaluate` returns rungs `1..total`, rung `k` met when `covered >= k`, evidence `{ covered, total }` (counts only, no account names); `Progress` returns `new(DoneRungs, total, $"{done} of {total} accounts", done/total)`.
- `GreenMonth`: met when any of the three months has `Income > 0 && Expense < Income`; evidence `{ month, ratio }` with `ratio = Math.Round(Expense / Income, 4)` (a ratio, not amounts).

Tests (`tests/PersonalFinance.Tests/Quests/L1RuleTests.cs`) with plain objects and a small `ContextBuilder` test helper:
- `TransactionsExist_AnyTransaction_Met` / `..._None_NotMet`
- `TopExpensesCategorized_AllFiveCategorized_Met`; `..._OneUncategorized_NotMet`; `..._UntrackedCategory_CountsAsUncategorized`; `..._NoExpensesLastMonth_NotMet`; `..._FewerThanFive_ChecksWhatExists`
- `AccountsCovered_ThreeOfFive_RungsOneToThreeMet`; `..._NoAccounts_DoesNotApply`; `..._AddedAccount_AddsARung`
- `GreenMonth_ExpenseBelowIncome_Met`; `..._ExpenseEqualsIncome_NotMet`; `..._ZeroIncomeMonth_NotMet`; `..._OnlyOneOfThreeMonthsGreen_Met`

> **Why:** Rules are pure functions so every boundary is a plain unit test with no Supabase (TEST-03). "Uncategorized" has three spellings in this codebase, and missing one would let "Sort the mystery pile" complete while the pile is still there. Account rungs are counts rather than account ids so the unique key stays small and an added account simply creates one more rung to chase; no account names are stored in evidence.

---

### [ ] STEP 13 — Rules, part 2: the L2 and indicator detectors
Create `Application/Quests/Rules/L2Rules.cs`, `IndicatorRules.cs`:
- `DebtsMapped`: met when `ctx.LiabilityCount >= 1 || ctx.NoDebtsConfirmed`. Evidence `{ liabilities, confirmedNoDebts }`.
- `ValuationExists(string AccountType)`: v1 supports `"savings"` only; met when any `ctx.SavingsAccounts` has `LatestValuedAt != null`.
- `RawValueAtLeast(string IndicatorCode, string StepNoun, string ValueUnit)`: the raw value is `ind.Raw` when the indicator exists, is not `no_data` and is `Trusted`, else null. A rung `k` (1-based over `quest.Rungs`) is met when `raw >= quest.Rungs[k-1]`. Freshness is not a parameter: the factory already folded it into `Trusted` (STEP 11). Evidence `{ months: raw, valuedAt: newest valuation date as yyyy-MM-dd }`. `Progress`: `Done = DoneRungs`, `Total = quest.Rungs.Count`, `Label = $"{done} of {total} {StepNoun} · {raw:0.0} {ValueUnit}"` (invariant culture), `Fraction` = progress between the previous and next threshold, clamped 0..1 (1 when all rungs are done, 0 when raw is null).
- `IndicatorScoreAtLeast(string IndicatorCode)`: rung `k` met when the indicator is live (`Status != "no_data"`), `Trusted`, and `Score >= quest.Rungs[k-1]`. A star for cover on a six-month-old balance is the same lie as a stale fence post, so it is blocked the same way. Evidence `{ score, raw }`.
- `LevelGraduated(string Level)`: met when `ctx.GraduatedLevels` contains it. Evidence `{ level }`.

Create `Application/Quests/ValuationFreshness.cs`:
```csharp
namespace PersonalFinance.Application.Quests;

public static class ValuationFreshness
{
    /// <summary>G6: a fence post needs every savings balance that counts to be dated in the current or the
    /// previous calendar month. Accounts with no valuation contribute nothing to cover, so they do not block.
    /// At least one valuation must exist.</summary>
    public static bool AllFresh(IReadOnlyList<SavingsAccountFact> savings, DateOnly today)
    {
        var dated = savings.Where(a => a.LatestValuedAt.HasValue).ToList();
        if (dated.Count == 0) return false;
        var oldestAllowed = new DateTime(today.Year, today.Month, 1).AddMonths(-1);
        return dated.All(a => a.LatestValuedAt!.Value >= oldestAllowed);
    }
}
```
Tests (`tests/PersonalFinance.Tests/Quests/L2RuleTests.cs`, `ValuationFreshnessTests.cs`):
- `RawValueAtLeast_149Months_RungOnePointFiveNotMet` and `..._150Months_Met` (1.49 versus 1.5)
- `RawValueAtLeast_FreshValuation_CompletesRungsOneToThree_At160`
- `RawValueAtLeast_UntrustedCover_CompletesNothing` (cover 1.6, `Trusted = false`)
- `IndicatorScoreAtLeast_UntrustedCover_EarnsNoStar` (score 80, `Trusted = false`)
- `ValuationFreshness_OneStaleOfTwoAccounts_IsFalse`
- `RawValueAtLeast_IndicatorNoData_CompletesNothing`
- `ValuationFreshness_FirstDayOfPreviousMonth_IsFresh` / `..._LastDayOfTwoMonthsAgo_IsStale` / `..._NoValuations_IsFalse`
- `RawValueAtLeast_Progress_ReportsPostsAndMonths` (for example `2 of 6 posts · 1.1 months`, fraction between 1.0 and 1.5)
- `IndicatorScoreAtLeast_NoData_EarnsNoStar`; `..._Score70_EarnsTwoStars`; `..._ScoreDropsLater_StillReportsCurrentRungsOnly` (the rule is live; permanence is the engine's job)
- `DebtsMapped_OneLiability_Met`; `..._NoDebtsConfirmedWithNoLiabilities_Met`; `..._NothingRecorded_NotMet`
- `LevelGraduated_*`

> **Why:** G6 is the rule most likely to fail silently (the first draft applied it to fence posts only, so a stale balance would still have earned a cover star): a celebration built on a six-month-old balance looks exactly like a true one. Freshness is a calendar-month rule, not "30 days", so it cannot flicker on the 1st. The cover value is compared as the user sees it (the stored, rounded raw), so what is on screen is what counts. Stars are recognition and `no_data` never earns one, which matters for PF-151's "not evaluated" DTI.

---

### [ ] STEP 14 — `IQuestStore` and `SupabaseQuestStore`, with a round-trip check
Create `Application/Interfaces/IQuestStore.cs`:
```csharp
using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Application.Interfaces;

/// <summary>Every database read and write the quest engine and board need. The write surface is
/// deliberately tiny: completions, focus, snoozes, seen. Nothing here can write a score (G1).</summary>
public interface IQuestStore
{
    Task<IReadOnlyList<QuestCompletion>> LoadCompletionsAsync(Guid userId, CancellationToken ct = default);
    Task<IReadOnlyList<Account>> LoadCashflowAccountsAsync(Guid userId, CancellationToken ct = default);
    Task<bool> AnyTransactionAsync(Guid userId, CancellationToken ct = default);
    Task<QuestStateRow> LoadStateAsync(Guid userId, CancellationToken ct = default);

    /// <summary>Inserts new rungs; a row that already exists is ignored, never overwritten.</summary>
    Task InsertCompletionsAsync(IReadOnlyList<QuestCompletion> rows, CancellationToken ct = default);
    Task SetFocusAsync(Guid userId, string? questCode, CancellationToken ct = default);
    Task SetSnoozesAsync(Guid userId, IReadOnlyDictionary<string, string> snoozes, CancellationToken ct = default);
    Task MarkSeenAsync(Guid userId, IReadOnlyList<long> ids, DateTime seenAtUtc, CancellationToken ct = default);
}

public sealed record QuestStateRow(
    UserJourneyState? Scores,                       // scores + IndicatorRaw, null if no pass has ever run
    string? FocusQuestCode,
    IReadOnlyDictionary<string, string> Snoozes);
```
Implement `Infrastructure/Supabase/SupabaseQuestStore.cs` (inject `Supabase.Client`, `ILogger<SupabaseQuestStore>`; register `AddScoped<IQuestStore, SupabaseQuestStore>()`):
- reads filter by `user_id` explicitly as well as relying on RLS (defense in depth, as `AccountsController` does);
- `LoadCashflowAccountsAsync`: `is_active = true` and `include_in_cashflow = true`;
- `AnyTransactionAsync`: select `id`, `Limit(1)`, no date filter (**not** the 3-month window: a user whose only data is older than the window must still complete "Meet your money");
- `InsertCompletionsAsync`:
```csharp
await supabase.From<QuestCompletion>().Insert(rows, new QueryOptions
{
    Upsert = true,
    OnConflict = "user_id,quest_code,rung",
    DuplicateResolution = QueryOptions.DuplicateResolutionType.IgnoreDuplicates,
    Returning = QueryOptions.ReturnType.Minimal,
});
```
  Wrap in `try/catch`, log at **Error** with the exception, and rethrow (the engine's caller isolates it). Never swallow silently.
- `LoadStateAsync`: reads the one row through its three entities (`UserJourneyState` for scores and `IndicatorRaw`, `UserJourneyFocus`, `UserJourneySnoozes`), each a primary-key lookup, and returns a `QuestStateRow`; a missing row gives nulls and an empty snooze map;
- `SetFocusAsync`: `Upsert(new UserJourneyFocus { UserId, FocusQuestCode })`; `SetSnoozesAsync`: `Upsert(new UserJourneySnoozes { UserId, QuestSnoozes })`. Each entity maps one column (STEP 3), so the PK-conflict merge updates only that column and the other choice is untouched. The caller passes the **complete** snooze map it wants stored (the board service loads the current map, edits it, writes it back), because the column is replaced as a whole;
- `MarkSeenAsync`: `Update` on `quest_completions` where `id in (...)` and `seen_at is null`, setting only `SeenAt`.

**Pre-flight (do this before writing the rest):** these `QueryOptions` member names exist in the installed `Supabase.Postgrest` 4.1.0 binary but were not compiled here. Build first. If `DuplicateResolution` or `IgnoreDuplicates` does not compile, fall back to inserting rows one at a time and treating HTTP 409 on the unique key as "already stored" (the result is the same; do **not** fall back to a merging upsert, which would overwrite `seen_at`).

**Second round-trip (focus and snoozes do not erase each other):** through the store, set a snooze, then set a focus, then read the row back and expect both; clear the focus and expect the snooze to remain. Also run a scoring upsert (a recalculation) between them and expect both to survive.

**Round-trip check against the local database** (a throwaway test or `dotnet run` snippet, not committed): insert one row through the store, insert the same key again, then:
```bash
docker exec supabase_db_personal-finance psql -U postgres -d postgres -At -c "select count(*), min(jsonb_typeof(evidence)), max(jsonb_typeof(evidence)) from quest_completions where quest_code like 'preflight.%';"
```
Expect `1`, `object`, `object`. If `jsonb_typeof` is `string`, the property is being double-encoded like the old columns: fix the property type before going on. Delete the throwaway row afterwards (you cannot with the app role, as intended: use `docker exec ... psql -U postgres`, which is the local superuser, and only for `preflight.*` rows).

> **Why:** Putting persistence behind `IQuestStore` lets the engine and board be tested with an in-memory fake, and keeps the one PostgREST subtlety (insert-or-ignore) in one place. Ignoring a duplicate key instead of merging is what makes two concurrent recalculations safe and keeps `seen_at` intact. Reading "any transaction" without the date window avoids a real failure: the owner's transactions end in early August. The earlier scoring code swallows write errors with a bare `catch` and logs, which is how `journey_indicator_snapshots` ended up empty without anyone noticing; this store logs at Error and rethrows. The `jsonb_typeof` check is the same kind of silent-failure guard FIN rules ask for: a double-encoded column compiles, saves and looks fine.

---

### [ ] STEP 15 — `QuestEngine`
Create `Application/Interfaces/IQuestEngine.cs`:
```csharp
using PersonalFinance.Application.Quests;
using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Application.Interfaces;

public interface IQuestEngine
{
    /// <summary>Runs every detector on the snapshot and stores the rungs that are newly met.
    /// Returns what was stored. Never changes a score.</summary>
    Task<IReadOnlyList<QuestCompletion>> EvaluateAsync(Guid userId, ScoringSnapshot snapshot, CancellationToken ct = default);
}
```
Create `Application/Services/QuestEngine.cs`:
```csharp
public sealed class QuestEngine(IQuestStore store, ILogger<QuestEngine> logger) : IQuestEngine
{
    public async Task<IReadOnlyList<QuestCompletion>> EvaluateAsync(
        Guid userId, ScoringSnapshot snapshot, CancellationToken ct = default)
    {
        var existing = await store.LoadCompletionsAsync(userId, ct);
        var accounts = await store.LoadCashflowAccountsAsync(userId, ct);
        var any = await store.AnyTransactionAsync(userId, ct);

        var completed = existing.Select(c => (c.QuestCode, (int)c.Rung)).ToHashSet();
        var ctx = QuestContextFactory.FromSnapshot(snapshot, accounts, any, completed);

        var fresh = new List<QuestCompletion>();
        foreach (var quest in QuestCatalog.V1)
        {
            foreach (var result in quest.Rule.Evaluate(ctx, quest))
            {
                if (!result.Met || completed.Contains((quest.Code, result.Rung))) continue;
                fresh.Add(new QuestCompletion
                {
                    UserId = userId,
                    QuestCode = quest.Code,
                    Rung = (short)result.Rung,
                    CatalogVersion = QuestCatalog.Version,
                    Evidence = new Dictionary<string, object?>(result.Evidence),
                });
            }
        }

        // First pass for a user with no earlier completions: several quests can land at once.
        // Flag the batch so the board folds it into one item instead of a burst of toasts.
        if (existing.Count == 0 && fresh.Count > 1)
            foreach (var row in fresh) row.Evidence["backfill"] = true;

        if (fresh.Count > 0) await store.InsertCompletionsAsync(fresh, ct);
        logger.LogInformation("Quest pass for {UserId}: {New} new completions", userId, fresh.Count);
        return fresh;
    }
}
```
Register `AddScoped<IQuestEngine, QuestEngine>()`.

Tests (`tests/PersonalFinance.Tests/Quests/QuestEngineTests.cs`) with `FakeQuestStore` (in-memory `IQuestStore`, in `tests/.../Quests/FakeQuestStore.cs`, enforcing the unique key like the real table):
- `Evaluate_FirstUpload_CompletesMeetYourMoney`
- `Evaluate_TwiceOnSameSnapshot_StoresOneRowPerRung` (second call returns empty, store count unchanged)
- `Evaluate_OnlyNewRungsAreInserted` (fence posts 1 and 2 stored, cover rises to 2.6: only rungs 3 to 5 inserted)
- `Evaluate_ScoreDropsLater_KeepsEarnedStarsAndDoesNotCelebrateAgain`
- `Evaluate_FirstPassWithManyCompletions_FlagsBackfill`; `Evaluate_FirstPassWithOneCompletion_IsNotBackfill`; `Evaluate_LaterPass_IsNeverBackfill`
- `Evaluate_StaleSavingsValuation_BlocksFencePostsAndCoverStars` (end to end through the engine: cover 2.1, valuation two months old, no fence post and no `stars.liquid_savings_ratio` row; then a fresh valuation and both appear)
- `Evaluate_TransactionsLoadFailed_CompletesNoMonthBasedQuest`
- `IQuestStore_WriteSurface_IsOnlyCompletionsFocusSnoozesSeen` (reflection: every method on `IQuestStore` whose name starts with `Insert`, `Set`, `Mark` or `Delete` or `Update` is in the allow-list `InsertCompletionsAsync, SetFocusAsync, SetSnoozesAsync, MarkSeenAsync`)

> **Why:** The engine is a loop over the catalog; all the judgment is in the pure rules, so the engine tests are about idempotence, permanence and not writing scores. Permanence is simple here: a completion row is never deleted, and rungs already in `completed` are skipped, so a later drop in score changes the live star count (read from the score) but never the record. `backfill` follows the spec's rule (no earlier completions) with one refinement: a lone completion is celebrated normally, because "You'd already completed 1 quest" would be silly.

---

### [ ] STEP 16 — Wire the engine into recalculation (G1)
Edit `Application/Commands/RecalculateJourneyCommandHandler.cs`:
```csharp
using MediatR;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;

public class RecalculateJourneyCommandHandler(
    IJourneyScoringService service,
    IQuestEngine engine,
    ILogger<RecalculateJourneyCommandHandler> logger)
    : IRequestHandler<RecalculateJourneyCommand, JourneyStateDto>
{
    public async Task<JourneyStateDto> Handle(RecalculateJourneyCommand request, CancellationToken ct)
    {
        var result = await service.RecalculateWithSnapshotAsync(request.UserId, ct);
        try
        {
            await engine.EvaluateAsync(request.UserId, result.Snapshot, ct);
        }
        catch (Exception ex)
        {
            // Scores are the product's truth and are already saved; a quest failure must not hide them.
            logger.LogError(ex, "Quest evaluation failed for user {UserId}", request.UserId);
        }
        return result.State;
    }
}
```
Tests (`tests/PersonalFinance.Tests/Commands/RecalculateJourneyCommandHandlerTests.cs`):
- `Handle_EngineSucceeds_ReturnsTheScoringState`
- `Handle_EngineThrows_StillReturnsTheSameState_AndLogsError`
- `Handle_ScoresIdenticalWithAndWithoutEngine` (same `JourneyStateDto` instance from the scoring mock whichever way the engine behaves; the engine mock is verified to receive the snapshot)
- `Handle_CallsScoringExactlyOnce`

> **Why:** This is acceptance criterion "scores are identical with and without the engine" (G1) made structural: the handler returns the scoring result untouched, and the engine only ever receives a read-only snapshot and a store that cannot write scores (STEP 15's reflection test). A failing quest pass is logged, not thrown, for the same reason an import survives a failed recalculation. Note `GetStateAsync`'s "no row yet, recalculate" fallback calls the scoring service directly and therefore skips the engine; that only affects a brand-new user's very first `GET /state` (single-owner app, signup is off). See Notes.

---

### [ ] STEP 17 — Phase 1 live check (local stack, no UI yet)
With the stack up (`npm start`, or the `docker-up` skill), use a **throwaway Auth user or the disposable harness user**, not the owner's real data:
1. `POST /api/transactions/submit` with a small synthetic batch (a few income and expense rows dated last month, one `requestId`, `accountName` set). Do **not** press Recalculate.
2. `select quest_code, rung, evidence from quest_completions where user_id = '<throwaway>' order by quest_code, rung;` shows `l1.meet_your_money` (and whatever else the batch earns).
3. `POST /api/journey/recalculate` twice. The row count does not change. (That recalculation keeps a chosen focus is checked in STEP 24, once the focus endpoint exists.)
4. `GET /api/journey/state` for that user returns `stars` and non-null `rawValue` for live indicators.
5. Create a Savings account with a valuation dated two months ago and cover above 1.5: no `l2.fence_posts` row. Add a valuation dated today: rows for rungs up to the cover appear.
6. Read the API log for `Quest pass for ... new completions` and for any `Error` lines.
7. Expect the first upload of this throwaway user to arrive as one folded "You'd already completed N quests" item, because it completes several quests at once (meet your money, stars, in the green). That is the designed behavior for any first pass, not a bug; the plain single toast is checked with a second, later completion.

Run all gates for Phase 1: `dotnet build`, `dotnet test`. Commit-ready here. This is the cut line.

> **Why:** Unit tests with a fake store prove the logic; only the live check proves the real PostgREST insert, the RLS policy with the caller's token, and the trigger from a real request. Using a throwaway user also keeps synthetic rows out of the owner's data and gives the first-run backfill a genuine "no earlier completions" start.

---

## Phase 2 — Board, endpoints, frontend, removal and docs

### [ ] STEP 18 — Board DTOs and `QuestBoardService` (offers, focus, snooze, seen)
Create `Application/Dtos/QuestBoardDto.cs`:
```csharp
namespace PersonalFinance.Application.Dtos;

public sealed record QuestBoardDto(
    int CatalogVersion,
    string WorkingLevel,
    QuestCardDto? Focus,
    IReadOnlyList<QuestCardDto> Offers,          // Focus + Offers is at most 3 in total
    IReadOnlyList<UnseenCompletionDto> Unseen,
    LevelGoalDto? LevelGoal);                    // what is left to clear the working level; null when it is cleared or nothing is known

/// <summary>The working level's clearing goal, so the board is never silent while a level is open.
/// Gaps name the live indicators below the clearing bar in the rung wording (no scores, no points).</summary>
public sealed record LevelGoalDto(
    string Level, string Title, bool NotEvaluated, IReadOnlyList<LevelGoalGapDto> Gaps);

public sealed record LevelGoalGapDto(string IndicatorCode, string Label, int Stars);

public sealed record QuestCardDto(
    string Code, string Kind, string Title, string Why, QuestProgressDto? Progress, string? Deeplink);

public sealed record QuestProgressDto(int Done, int Total, string Label);

/// <summary>One toast. A normal completion has one id; a first-run backfill folds many ids into one item.</summary>
public sealed record UnseenCompletionDto(
    IReadOnlyList<long> Ids, string? Code, int Rung, string Title, DateTime CompletedAt, bool IsBackfill, int Count);
```
(No member named like points, gain or XP: G2.) Create `Application/Interfaces/IQuestBoardService.cs`:
```csharp
public interface IQuestBoardService
{
    Task<QuestBoardDto> GetBoardAsync(Guid userId, CancellationToken ct = default);
    Task<QuestBoardDto> SetFocusAsync(Guid userId, string code, CancellationToken ct = default);
    Task<QuestBoardDto> SnoozeAsync(Guid userId, string code, CancellationToken ct = default);
    Task MarkSeenAsync(Guid userId, IReadOnlyList<long> ids, CancellationToken ct = default);
}
```
Implement `Application/Services/QuestBoardService.cs` (inject `IQuestStore`, `TimeProvider`). It **reads only** (completions, state row, accounts: four small reads, no scoring, no AI) and builds the partial context with `QuestContextFactory.FromStoredState(JourneyScoringService.IndicatorsFromRow(state.Scores), accounts, completed, today)`. Offer algorithm, exactly:
1. Candidates: catalog quests of kind `Discovery` or `Ladder` where `Rule.Applies(ctx)`, not fully complete (`Rungs` all in `Completed`; for `AccountsCovered`, done rung < account count; single-step: rung 0 not complete), and not snoozed (`Snoozes[code]` is a date later than today).
2. Level gate (G7), by index of `ctx.WorkingLevel`: quests with `MovesMoney` only from the working level; others from the working level and the one above it.
3. Order: the focus quest if it is still a candidate; then the one remaining `Discovery` candidate with the highest `Progress.Fraction` (a quick win); then the rest by `Fraction` descending, ties by catalog order.
4. Take the first 3. The first item is the focus card when a focus is set; `Offers` is the rest.
5. `LevelGoal`: built from the same context, no extra reads. For the working level: the live indicators (`Status != "no_data"`) with `Score < 70` become gaps, each labelled with the clearing-bar wording `StarRungs.RungCopy(code, 2)` when the indicator is one of the four star indicators (so the number comes from the rubric constants, G2) and with its display name otherwise, plus its current `Stars`. `Title` is `$"Clear {Level}"`. If the working level has no live indicator at all, return `NotEvaluated = true`, no gaps, and `Title = $"{Level} is not scored yet"`. Return null only when every level is cleared. The page uses it as the fallback when there is nothing to offer (STEP 21); it is never an offer, so the three-card cap is unaffected.
6. `Unseen`: completions with `SeenAt == null` ordered by `CompletedAt`; rows whose evidence has `backfill == true` fold into one item (`IsBackfill`, `Count`, all ids, title `You'd already completed {n} quests`); others one item each with `QuestCopy.CompletionTitle`.

`SetFocusAsync`: the code must be a current candidate (unknown code → `KeyNotFoundException`; not a candidate → `ValidationException`). `SnoozeAsync`: loads the current snooze map, adds this quest with today plus one month (`yyyy-MM-dd`), writes the whole map back with `SetSnoozesAsync`, and clears the focus (`SetFocusAsync(null)`) only if it was that quest. `SetFocusAsync` writes only the focus. `MarkSeenAsync`: ignores an empty list; the store only touches the caller's unseen rows.

Tests (`tests/PersonalFinance.Tests/Quests/QuestBoardServiceTests.cs`, with `FakeQuestStore`):
- `Board_NeverOffersMoreThanThree_FocusIncluded`
- `Board_WorkingLevelL1_DoesNotOfferFencePosts_ButOffersL2Discovery` (G7)
- `Board_L1Cleared_OffersFencePosts_AndDropsL1Discovery`
- `Board_CurrentLevelOneAfterClearing_StillGatesOnWorkingLevel` (the `currentLevel` trap)
- `Board_FocusFirst_ThenQuickDiscovery_ThenClosest`
- `Board_SnoozedQuest_IsHiddenUntilTheDate_ThenReturns`
- `Board_CompletedQuest_IsNotOffered`; `Board_RecognitionAndBoss_AreNeverOffered`
- `Board_Unseen_BackfillFoldsIntoOneItem`; `Board_Unseen_NormalCompletionsAreSeparate`
- `Board_FullPicture_NoAccounts_IsNotOffered`
- `SetFocus_NotACandidate_Throws400`; `SetFocus_UnknownCode_Throws404`; `Snooze_ClearsFocusOfThatQuest`; `Snooze_OtherQuestFocused_KeepsThatFocus`; `SetFocus_KeepsExistingSnoozes`; `Snooze_KeepsExistingSnoozes`
- `Board_NothingToOffer_ReturnsLevelGoalListingTheGaps` (L1 uncleared, all discovery done: gaps name `spend_lt_income` with the 89% wording and no score)
- `Board_WorkingLevelHasNoLiveIndicator_LevelGoalSaysNotScoredYet`; `Board_AllLevelsCleared_LevelGoalIsNull`
- `Board_NeverCallsAnythingThatWritesScores` (the fake store records calls; a board read performs no write)
- `BoardDtos_HaveNoPointsLikeMember` (reflection over `QuestBoardDto`, `QuestCardDto`, `QuestProgressDto`, `UnseenCompletionDto`, `LevelGoalDto`, `LevelGoalGapDto`; the G2 lint)

> **Why:** The board is a pure read of stored state, so opening Journey is cheap and calls no AI service. The level gate lives in this one method and is tested against the `currentLevel` trap. The spec's JSON has `focus` and `offers` side by side; this plan counts the focus inside the three-quest cap so the page can never show four cards, and uses `ids` (a list) on unseen items, instead of a single `id`, so a folded backfill can be marked seen with one call. `LevelGoal` implements the design's "boss shown as the level goal" (the first draft had no field for it, so the board went blank exactly when a user was stuck on an open level). These are small interpretations of the spec's example; note them in the design doc in STEP 25.

---

### [ ] STEP 19 — MediatR requests, validators and the four endpoints
Create in `Application/Commands/Quests/` (records follow the existing `record ... : IRequest<T>` pattern, handlers call `IQuestBoardService`, `userId` always comes from the controller's `ICurrentUser`, never from a body):
- `GetQuestBoardQuery(Guid UserId) : IRequest<QuestBoardDto>` and its handler
- `SetQuestFocusCommand(Guid UserId, string Code) : IRequest<QuestBoardDto>`
- `SnoozeQuestCommand(Guid UserId, string Code) : IRequest<QuestBoardDto>`
- `MarkQuestsSeenCommand(Guid UserId, IReadOnlyList<long> Ids) : IRequest`
- `MarkQuestsSeenCommandValidator` in `Application/Validation/`: `Ids` not empty, at most 100, each greater than 0

Edit `JourneyController.cs`: remove the `IJourneyAdvisorClient` constructor parameter and replace `GetQuests`:
```csharp
[HttpGet("quests")]
public async Task<ActionResult<QuestBoardDto>> GetQuests(CancellationToken ct)
    => Ok(await mediator.Send(new GetQuestBoardQuery(caller.UserId), ct));

[HttpPost("quests/{code}/focus")]
public async Task<ActionResult<QuestBoardDto>> SetFocus(string code, CancellationToken ct)
    => Ok(await mediator.Send(new SetQuestFocusCommand(caller.UserId, code), ct));

[HttpPost("quests/{code}/snooze")]
public async Task<ActionResult<QuestBoardDto>> Snooze(string code, CancellationToken ct)
    => Ok(await mediator.Send(new SnoozeQuestCommand(caller.UserId, code), ct));

[HttpPost("quests/seen")]
public async Task<IActionResult> MarkSeen([FromBody] MarkQuestsSeenRequest body, CancellationToken ct)
{
    await mediator.Send(new MarkQuestsSeenCommand(caller.UserId, body.Ids), ct);
    return NoContent();
}

public sealed record MarkQuestsSeenRequest(IReadOnlyList<long> Ids);
```
Register `AddScoped<IQuestBoardService, QuestBoardService>()`. `ValidationException` maps to 400 and `KeyNotFoundException` to 404 through the existing exception middleware (ERR-03); do not add new mapping.

Tests (`tests/PersonalFinance.Tests/Controllers/JourneyControllerQuestTests.cs`, TEST-01):
- each action sends the right request with `caller.UserId`, and none touches `IJourneyScoringService` or any AI client
- `GetQuests_DoesNotDependOnAnyAiClient` (constructor reflection: `JourneyController` has no parameter whose type name contains `Advisor` or `Ai`)
- `MarkSeenValidator_EmptyOrOversizedOrNonPositive_Fails`
- action bodies are within ARCH-04 (the arrow bodies above are one line; `MarkSeen` is three)

> **Why:** ARCH-04 keeps actions at 15 lines or fewer, so the controller only forwards. The owner always comes from `ICurrentUser`, never the request (the PF-S08 rule). From this step the old `GET /api/journey/quests` contract (`List<JourneyQuestDto>`) is gone, so **commit this step and STEP 20 together**; the running page breaks between them.

---

### [ ] STEP 20 — Frontend contract, API client and the pure toast planner
Edit `apps/frontend/src/types/Journey.ts`: add `stars: 0 | 1 | 2 | 3` to `IndicatorScore`; delete `Quest`; add:
```ts
export interface QuestProgress { done: number; total: number; label: string }

export interface QuestCard {
  code: string;
  kind: 'discovery' | 'ladder';
  title: string;
  why: string;
  progress: QuestProgress | null;
  deeplink: string | null;
}

export interface UnseenCompletion {
  ids: number[];
  code: string | null;
  rung: number;
  title: string;
  completedAt: string;
  isBackfill: boolean;
  count: number;
}

export interface QuestBoard {
  catalogVersion: number;
  workingLevel: string;
  focus: QuestCard | null;
  offers: QuestCard[];
  unseen: UnseenCompletion[];
  levelGoal: LevelGoal | null;
}

export interface LevelGoalGap { indicatorCode: string; label: string; stars: number }

export interface LevelGoal {
  level: string;
  title: string;
  notEvaluated: boolean;
  gaps: LevelGoalGap[];
}
```
Edit `journeyApi.ts`: `getJourneyQuests(): Promise<QuestBoard>` (same URL), plus `setQuestFocus(code)`, `snoozeQuest(code)` (both `POST`, return `QuestBoard`) and `markQuestsSeen(ids: number[])` (`POST /api/journey/quests/seen`, body `{ ids }`, resolves on 204). Use `authenticatedFetch` like the existing calls and encode the code in the path.

Create `apps/frontend/src/lib/journey/questToasts.ts`:
```ts
import type { UnseenCompletion } from '@/types/Journey';

export interface ToastPlan {
  messages: string[];   // at most `max` titles, plus one "+N more" line
  ids: number[];        // every pending id, including the ones summarised as "+N more"
}

export const planCompletionToasts = (
  unseen: UnseenCompletion[],
  announced: ReadonlySet<number>,
  max = 2,
): ToastPlan => {
  const pending = unseen.filter((u) => u.ids.some((id) => !announced.has(id)));
  const messages = pending.slice(0, max).map((u) => u.title);
  if (pending.length > max) messages.push(`+${pending.length - max} more`);
  return { messages, ids: pending.flatMap((u) => u.ids.filter((id) => !announced.has(id))) };
};
```
Create `lib/journey/__tests__/questToasts.test.ts` (Vitest, node environment):
- empty unseen → no messages, no ids
- one completion → one message, its id
- three completions → two titles and `+1 more`, all three ids
- ids already announced are skipped (React StrictMode runs effects twice)
- a folded backfill item contributes all its ids and one message

Add `"test:journey": "vitest run src/lib/journey"` to `package.json` scripts and `- run: npm run test:journey` after `test:macro` in `.github/workflows/ci.yml`.

> **Why:** Toast planning is the one piece of frontend logic with a real "once" requirement, so it is a pure function with tests rather than logic buried in an effect. The repo's Vitest config is deliberately scoped per folder (PF-038), so this follows the `test:desk` and `test:macro` pattern instead of widening it. The old `Quest` type carried `estimatedScoreGain`; deleting it removes the invented-number field from the frontend too (G2).

---

### [ ] STEP 21 — Frontend UI: board, cards, toast effect, hero link and stars
Read `ai/design/ui-rules.md` first: no dividers (use spacing), never show a bare percentage (anchor it with a bar or a label), size any emoji to its text block.

1. **`QuestCard.tsx`**: props `{ quest: QuestCard; isFocus: boolean; onFocus(): void; onSnooze(): void; busy: boolean }`. Show title, the `why` line, and, when `progress` exists, a thin bar (same pattern as `IndicatorScoreBar`) with `progress.label` beneath it (for example `2 of 6 posts · 1.1 months`). Buttons: **Start** (a `Link` to `deeplink`, hidden when null), **Focus** (shows "Focused" and is disabled when `isFocus`), **Not now** (replaces "Remind me"). Remove the difficulty badge and the `+N pts` badge entirely. Do not edit `components/ui/*`.
2. **`JourneyPage.tsx`**:
   - `useQuery(['journey-quests'], getJourneyQuests, { refetchOnMount: 'always' })` and the same `refetchOnMount: 'always'` on `journey-state` (it now changes after uploads and asset edits, so the old five-minute cache would show stale numbers).
   - Section heading stays "Active Quests" (the existing e2e test looks for it). Render `board.focus` first, then `board.offers`, in the existing three-column grid. When `focus` and `offers` are both empty, show the `levelGoal` instead of a blank: its title, then one line per gap (the label with its stars, for example `Spending under 89% of income`), or "Not scored yet, add data to start" when `notEvaluated`. Only when `levelGoal` is also null (every level cleared) show "Nothing to suggest right now."
   - `onFocus` / `onSnooze` mutations call the API and `setQueryData(['journey-quests'], board)` with the returned board.
   - Toast effect:
```tsx
const announced = useRef<Set<number>>(new Set());
useEffect(() => {
  if (!board || board.unseen.length === 0) return;
  const plan = planCompletionToasts(board.unseen, announced.current);
  if (plan.ids.length === 0) return;
  plan.ids.forEach((id) => announced.current.add(id));
  plan.messages.forEach((m) => toast(m));
  markQuestsSeen(plan.ids)
    .then(() => queryClient.invalidateQueries({ queryKey: ['journey-quests'] }))
    .catch(() => { /* not marked seen: it will be announced once more next visit */ });
}, [board, queryClient]);
```
     with `import { toast } from 'sonner'` (already mounted in `App.tsx`).
   - After the Recalculate mutation succeeds, also invalidate `['journey-quests']`.
3. **`LivingGardenHero.tsx`**: change `topQuest?: Quest` to `topQuest?: { title: string; deeplink: string | null }` and use `topQuest.deeplink`; `JourneyPage` passes `board?.focus ?? board?.offers[0]`.
4. **`IndicatorScoreBar.tsx`**: next to the score show up to three lucide `Star` icons (filled for earned stars, muted outline for the rest) with `aria-label={`${indicator.stars} of 3 stars`}`; render nothing for `no_data`. Keep it small (`w-3 h-3`).
5. **E2E** (`e2e/journey.spec.ts`): with `page.route('**/api/journey/quests', ...)` return a board whose `unseen` has one item, expect the toast text once and exactly one `POST /api/journey/quests/seen`; fulfil the route with an empty `unseen` on reload and expect no toast. Follow the existing auth setup in that spec. Optional and needing the full stack: a real upload-fixture test (`e2e/fixtures/bca-sample.csv`).

Run `npm run lint`, `npx tsc --noEmit -p tsconfig.app.json`, `npm run test:journey`, `npm run build`. Open `/journey` in the browser and check it by eye (Docker or `npm start`).

> **Why:** The page must show only numbers that came from the catalog or stored raw values, so cards lose the difficulty and points badges and gain a progress label. Toast then mark-seen (not the reverse) means a failed network call repeats a celebration next time instead of losing it; the `announced` ref stops React StrictMode's double effect from toasting twice. Completions made while the app is closed simply queue as unseen and play at the next visit, the behavior `reward-loop-closure.md` asked for. The Cashflow `CashflowQuestStrip` is hard-coded and unrelated to this board: it is left as it is.

---

### [ ] STEP 22 — Remove the LLM quest path, .NET side
Confirm nothing else calls it first and record the result in Notes:
```bash
grep -rn "IJourneyAdvisorClient\|JourneyAdvisorClient\|GenerateQuestsAsync\|JourneyQuestDto" apps services scripts docs --include=*.cs --include=*.py --include=*.ts --include=*.tsx | grep -v "/obj/\|/bin/\|node_modules"
```
Expected callers before this step: `JourneyController` (removed in STEP 19), `Program.cs`, the two interface and client files, `JourneyAdvisorClientTests.cs`. Planning-time finding: the advisor agent (`advisor_tools.py`) and the MCP server call `GET /api/journey/state`, not the quest path, and stay as they are (the `stars` and `rawValue` they now receive are additive); `mcp_server.py` also calls `/api/journey/scores`, an endpoint that does not exist, which is already broken and out of scope.

Delete `Application/Interfaces/IJourneyAdvisorClient.cs`, `Infrastructure/External/JourneyAdvisorClient.cs`, `Application/Dtos/JourneyQuestDto.cs`, `tests/.../Infrastructure/JourneyAdvisorClientTests.cs`. In `Program.cs` remove the `AddHttpClient<IJourneyAdvisorClient, JourneyAdvisorClient>(...)` block (the other `AiService:BaseUrl` clients stay). `dotnet build` with zero warnings, `dotnet test`.

> **Why:** Once nothing calls it, the client is dead code that invites someone to wire LLM-invented numbers back in (design decision 3). Deleting `JourneyQuestDto` also deletes `EstimatedScoreGain`, the field that made "+12 pts" promises.

---

### [ ] STEP 23 — Remove the LLM quest path, AI service side
```bash
grep -rn "IndicatorSnapshot\|JourneyAdvise\|journey_advis\|journey/advise\|\bQuest\b" services/ai-service --include=*.py | grep -v ".venv\|__pycache__"
```
Make sure `IndicatorSnapshot` and `Quest` have no other users, then:
- delete `app/services/journey_advisor.py`, `app/prompts/journey_advisor_v1.py`, `tests/test_journey_advisor.py`;
- `app/models.py`: delete the "Journey Advisor" section (`IndicatorSnapshot`, `JourneyAdviseRequest`, `Quest`, `JourneyAdviseResponse`);
- `app/main.py`: remove the `JourneyAdviseRequest, JourneyAdviseResponse` names from the models import, the `JourneyAdvisor` import, `app.state.journey_advisor = ...` in the lifespan, the `/journey/advise` route, `"/journey/advise"` from `_PILOT_INTERNAL_ROUTES`, and fix the comment above it so it mentions only `/portfolio-review`;
- `tests/test_pilot_gate.py`: the loop over `("/journey/advise", "/portfolio-review")` becomes a single `/portfolio-review` case;
- `services/ai-service/README.md` (line 63), `docs/LLM-endpoint-test.md` (test table and the `/journey/advise` section), `docs/provider-parser-class-diagram.md`: remove or mark as removed in PF-152.

`cd services/ai-service && pytest -q`: all pass; the count drops by the deleted test file.

> **Why:** The Python side has no other callers (`advisor_tools.py` and `mcp_server.py` talk to the .NET API). Leaving `/journey/advise` in the internal-route allow-list would keep an unused LLM endpoint reachable behind the internal key. Error codes and the allow-list live next to each other in `main.py`, so they change in the same commit as the route.

---

### [ ] STEP 24 — Isolation and acceptance checks on the disposable harness
Read `scripts/pf_s08_module_isolation.py` and `scripts/pf_s08_local_http_smoke.py` first. They provision users A and B on a disposable Supabase stack and start the API with real tokens. Add a quests section:
1. A submits a small synthetic batch (as in STEP 17). Expect, without calling recalculate: A's `GET /api/journey/quests` has an `unseen` item for `l1.meet_your_money` (or a folded backfill if the batch earned several).
2. A calls `POST /api/journey/recalculate` twice; A's row count in `quest_completions` (read through PostgREST with A's token) is unchanged by the second call.
3. A sets a focus (`POST /quests/{code}/focus` on a current offer), recalculates, and the focus is still set (recalculation does not reset it). A then snoozes a different quest: the focus is still set. A sets another focus: the snooze is still there (read both from `user_journey_state` through A's token).
4. B's board has no unseen items and no completions from A; B's direct `GET /rest/v1/quest_completions` returns `[]`; B's direct `POST` of a row with A's `user_id` is rejected; B's `POST /quests/seen` with A's ids leaves A's rows unseen.
5. A marks the ids seen; a second `GET /quests` has an empty `unseen`.
6. Add `quest_completions` to `OWNED_TABLES` in `pf_s08_local_http_smoke.py` if that list drives its direct-REST probes.
7. Capture the AI service request count (or run with the AI service stopped): `GET /api/journey/quests` and `GET /api/journey/state` succeed with no AI service running.

If the harness cannot run, do the same checks by hand against the local stack with a second Auth user and record them as manual, not as passed by script.

> **Why:** This is the only place the criteria that depend on real RLS and the real trigger are proven end to end: owner isolation, idempotence, focus surviving recalculation (the upsert clobber risk from STEP 3) and "no AI call". The harness exists precisely for this kind of two-user check (PF-S08).

---

### [ ] STEP 25 — Docs that become true or stale
- **`CLAUDE.md`**: (a) the sentence in the Background Problem about recalculation (line ~34) now reads as true: say that `TransactionsSubmittedEvent` (once per import batch) and `AssetUpdatedEvent` (account, valuation, liability and asset writes) trigger recalculation, and that the quest engine runs inside the same pass; (b) Project Layout: remove `JourneyAdvisorClient.cs` and `journey_advisor.py`, change "8 endpoints" to 7; (c) AI Service Endpoints list: remove `POST /journey/advise` (journey advisor); (d) add one Key Patterns bullet for quests: catalog in code, rules are pure, completions are append-only, no LLM, no points, board reads only.
- **`docs/architecture/API-endpoints.md`**: the Journey rows become `GET /api/journey/state` (stars, raw values), `POST /api/journey/recalculate`, `GET /api/journey/quests` (board), `POST /api/journey/quests/{code}/focus`, `POST /api/journey/quests/{code}/snooze`, `POST /api/journey/quests/seen`; remove the AI service row `POST /journey/advise`.
- **`docs/architecture/diagram-system-design.html`**, the Journey scoring card and its edges: node `scoring` desc says domain events (`TransactionsSubmittedEvent` after an upload, `AssetUpdatedEvent` after account, valuation, liability and asset writes) trigger recalculation and the quest engine evaluates in the same pass; tags add `QuestEngine`; chips keep "quests" and add "stars"; the `ai` node loses the `/journey/advise` chip and "journey quests" from its description; the `api → scoring` and `api → ai` edge descriptions are corrected; the `postgres` node chips gain "quest completions".
- **`docs/STATUS.md`**: one dated line for PF-152.
- **`plans/brainstorms/quest-engine-v1-design.md`**: set the status to built in PF-152 and list the small interpretations from STEP 18 (focus counted in the three-card cap, `ids` on unseen items, lone completions not folded, the any-transaction read, `levelGoal` as the board's fallback, G6 applied through `IndicatorFact.Trusted` so cover stars are covered too, focus and snoozes as separate one-column writes, the Asia/Jakarta clock). The design diagram stays unchanged unless one of these changes a box.
- **Retired advisor write-ups** that describe the removed path as current: `docs/ai-features/diagram-ai-journey-advisor.html` and `docs/architecture/sequences/diagram-journey-advisor-sequence.html` get a one-line "Retired in PF-152: quests are now deterministic" note near the top rather than deletion. Sweep with `grep -rn "journey/advise\|JourneyAdvisorClient" docs README.md services --include=*.md --include=*.html` and fix any file that presents it as current. Leave historical learning material alone (`docs/mentor/`, `docs/ideas/`, `plans/done/`, `docs/codex/`, `archreview-*`).

> **Why:** CLAUDE.md is loaded into every session, and today it claims recalculation after asset changes happens when it does not; after this plan it is true, and the endpoint list would otherwise still advertise an endpoint that is gone. The system-design diagram is the page people read to learn how the pieces connect.

---

### [ ] STEP 26 — Final gates, board, and the rollout record
1. Run the `ci-check` skill (all gates): `dotnet build`, `dotnet test`, `npm run lint`, `npx tsc --noEmit -p tsconfig.app.json`, `npm run test:desk`, `npm run test:macro`, `npm run test:journey`, `npm run build`, `pytest`, `gitleaks detect`.
2. `node "$HOME/.claude/skills/loop-lib/scripts/board.mjs" --root . --write` (never hand-edit the generated block).
3. **Rollout (owner's local stack, after the work is merged and the migration applied):** press Recalculate once. That first pass is the owner's backfill: record in Notes the codes completed (only codes and rung numbers, no amounts), that the board shows them as one folded item, and the before and after L1/L2 numbers (with the STEP 8 change called out separately). Open `/journey` and confirm exactly one toast, then reload and confirm none.
4. Fill the Execution Notes record below.

> **Why:** Until that first pass runs, `user_journey_state.indicator_raw` is empty and the board has nothing to show for data that already exists. PF-151's own rollout also records before and after scores from a recalculation; if both plans are rolled out together, record one combined before and after so the score story stays in one place.

---

## Notes

- **Ticket id collision (2026-10-25).** Two backlog files are numbered PF-151: the score fixes (`PF-151-journey-score-fixes-before-quests-todo.md`) and the Monthly Harvest plan (`PF-151-monthly-harvest-reveal-todo.md`), because the three plans were drafted in parallel. In this plan, "PF-151" always means the **score fixes**. The Harvest plan needs a new id (the next free one is PF-153) before either is executed; this plan is PF-152 and does not collide.
- **Names the Harvest plan (plan 3) should reuse from this plan.** It assumed names from the design doc; this plan's actual ones are: table `quest_completions(id, user_id, quest_code, rung, catalog_version, evidence jsonb, completed_at, seen_at)` with rung 1-based (0 for single-step quests); `GET /api/journey/quests` returns `QuestBoardDto { catalogVersion, workingLevel, focus, offers, unseen, levelGoal }` where `focus` plus `offers` is at most 3 cards; `unseen` items are `UnseenCompletionDto { ids[], code, rung, title, completedAt, isBackfill, count }` (a first-run backfill is one folded item with several `ids`); the endpoints are `POST /api/journey/quests/{code}/focus`, `/snooze` and `POST /api/journey/quests/seen` with `{ ids }`; evidence keys are `months` and `valuedAt` for fence posts, `covered` and `total` for `l1.full_picture`, `month` and `ratio` for `l1.in_the_green`, `score` and `raw` for stars, `backfill: true` on folded rows.
- **Dependency, PF-151.** Written the same day (2026-10-25) and not executed yet when this plan was drafted. This plan was reconciled to PF-151's plan text; STEP 1 re-checks it against the code as it actually shipped. PF-151 and this plan both edit `JourneyScoringService.cs` (PF-151 moves the rules into `JourneyScoringRules`, this plan moves data loading into a snapshot), `JourneyController.cs` (PF-151 adds three `no-debts` actions, this plan four quest actions), `Program.cs`, `API-endpoints.md` and `CLAUDE.md`; that is why PF-151 goes first and this plan's refactor is minimal-diff. Edit CLAUDE.md and the other shared files surgically: the working tree already has uncommitted changes in several of them, so commit only this plan's files.
- **Finding: savings-account casing (STEP 8), which also affects PF-151.** `account_type` is lowercase by CHECK constraint; scoring filters on `"Savings"`. The liquid-savings indicator has never evaluated for the owner (4 `savings` rows, 0 `Savings`). PF-151's "before" query and its blast-radius reasoning (the owner has no Savings account, so DTI is the only live L2 indicator, so `graduated_l2` unlocks) rest on the same case-sensitive match. The fix now lives in PF-151 (STEP 3b item 5), so its before/after record is true; STEP 8 here only verifies it, and applies it if PF-151 was executed without it.
- **Finding: `journey_indicator_snapshots` is empty** on the owner's local database although `user_journey_state` has a row. `PersistSnapshotsAsync` swallows exceptions, so a write error is likely hidden (perhaps `DateOnly` serialization). Out of scope; log it as a follow-up and check the API log in STEP 17. The quest store logs and rethrows instead.
- **Finding: double-encoded jsonb.** `level_scores` and `indicator_scores` are jsonb strings. Do not read them with SQL JSON operators without `#>> '{}'`. The new columns are real objects (STEP 14 verifies).
- **Review fixes (2026-10-25, `/consult review`).** (1) G6 now lives in the quest context (`IndicatorFact.Trusted`), so cover stars are blocked on a stale balance as well as fence posts. (2) Focus and snoozes are two one-column entities, so neither write erases the other. (3) The savings casing fix moved into PF-151 and STEP 8 only verifies it. (4) `levelGoal` on the board, so it is never blank while a level is open. (5) The clock is pinned to Asia/Jakarta (`AppTimeProvider`). (6) `PersistStateAsync` skips a write when a newer pass already saved (`ShouldPersist`, `LastComputedAt` = pass start). Left as designed: the first-pass fold also swallows a new user's first real upload; it only matters for a new account, and signup is off.
- **Rungs.** Rung numbers are 1-based indexes into `Rungs` (0 for single-step quests); thresholds are kept in `evidence`. Fence posts and stars compare against the stored, rounded raw value, so the number the user sees is the number that counts.
- **`l1.in_the_green` is a `Ladder` with no rungs** in the spec's table. It is treated as a single-step quest (rung 0); the type only matters because it is offered.
- **Reset.** The Settings "data reset" deletes transactions but leaves `quest_completions` (permanent by design; delete is not even granted). Whether a reset should also clear completions is an owner decision; not changed here.
- **Fresh recalculation cost.** Every upload and every account, valuation, liability or asset write now runs a synchronous recalculation (about 4 reads for scoring, 3 for the engine, 1 insert). The design accepts this and says to revisit only if latency becomes noticeable; the pass logs its work.
- **Brand-new user.** `GetStateAsync`'s "no row yet" fallback calls scoring without the engine. Irrelevant for the single-owner app (signup is off); if that changes, route the fallback through `RecalculateJourneyCommand`.
- **Level gate reading.** Non-money quests come from the working level and the one above it, per the spec. A lower-level unfinished quest (for example a new account's `l1.full_picture` once L3 is the working level) is therefore not offered; loosening that is a one-line change to the gate if the owner wants it.
- **PF-130** (backlog) predates PF-S08 and describes an older `SubmitTransactions`; keep the STEP 6 publish if it is executed.
- **Out of scope, noted:** the Harvest reveal and monthly ritual (plan 3), challenges, hidden quests and L3 action quests (plan 4), garden items (plan 5), seasonal events (plan 6), the hard-coded `CashflowQuestStrip`, the broken `mcp_server.py` call to `/api/journey/scores`, and `PersistSnapshotsAsync`.

## Execution Notes

### Phase 1 — Trigger, snapshot and engine (STEPS 1 to 17)

Model: **Opus 5.5** · Effort: **high**. It adds a table with RLS, refactors the scoring code behind every number on the home page, and a wrong guess in either is silent (a score that moves, or a double-encoded column that looks fine).
Before you start: [PF-151](../done/PF-151-journey-score-fixes-before-quests-todo.md) (score fixes) is executed, accepted and its post-deploy recalculation is done; the local Supabase stack is up; write down the owner's current Journey numbers (STEP 1).

```
/execute plans/in-progress/PF-152-quest-engine-v1-todo.md phase 1
```

### Phase 2 — Board, endpoints, frontend, removal and docs (STEPS 18 to 26)

Model: **Sonnet 5.5** · Effort: **high**. Multi-layer (.NET, React, Python) with exact code and tests in the steps; the schema is already done.
Before you start: Phase 1 is committed and its live check (STEP 17) passed.

```
/execute plans/in-progress/PF-152-quest-engine-v1-todo.md phase 2
```

Size: about 6 to 7 working days in total (Phase 1 about 3.5, Phase 2 about 3). If Phase 1 passes four days, ship it and cut Phase 2 into its own ticket at the STEP 17 boundary; nothing user-visible depends on Phase 2 until the board lands.

### Record to fill in during execution

- PF-151 as shipped (STEP 1): matches the plan text **yes** (JourneyScoringRules has IsConsumption, IsSavingsOutflow, LiveScoreMap, Definitions, EvaluateDti, MonthTotal, IsIncome, IsExpense; Score* / ComputeLevelScores / DetermineCurrentLevel / BuildIndicatorDtos are internal static; JourneyDebtConfirmation + no_debts_confirmed_at column present; migration 20261025000000 applied; last_computed_at 2026-10-25 14:59Z so PF-151 post-deploy recalc ran). · casing bug fixed there **yes** — `JourneyScoringRules.SavingsAccountType = "savings"` and the savings query filters on it. **Difference from plan's STEP 1 item 5 assumption:** with the casing fixed, `liquid_savings_ratio` IS now a live indicator (stored score map has it at 0), not "never evaluated"; so L2 has two live indicators conceptually, though DTI is still not evaluated (not in the map). accounts table: checking 1, wallet 4, savings 4, brokerage 4.
- Owner Journey numbers before STEP 7 (baseline, must be reproduced after STEP 7): total_score **33.33**, current_level **1**, level_scores **{L1:100, L2:0, L3:0}**, indicator_scores **{spend_lt_income:100, liquid_savings_ratio:0, savings_rate:0}** (manageable_dti not evaluated). after STEP 7 / after STEP 8: ___ (not reached this segment).
- Baseline test counts: **dotnet 511 passed, 9 skipped, 520 total** (before). pytest / npm: not run this segment. after: ___
- Facts found (confirm plan Notes): `level_scores`/`indicator_scores` are jsonb **strings** (double-encoded) — do not copy. `journey_indicator_snapshots` now has **3 rows** (plan saw 0 at planning time; PF-151's recalc populated it).
- STEP 14 round trip: ___ (not reached; blocked on STEP 2 apply)
- STEP 22 caller check (grep result): ___
- Rollout (STEP 26): ___
- **Environment actions this segment:** stopped the running local API process (PID 52112) because it locked the .NET build output DLLs (`Api\bin`), blocking all compile/test. **Owner must restart the local stack (`npm start` / API) and apply the STEP 2 migration before the next segment can do DB-dependent work.**

### Stop and ask if

- PF-151 is not executed, or what it shipped differs from the names in STEP 1 enough that the STEP 7 "do not touch a formula" instruction is impossible.
- The STEP 7 parity check shows any difference in a score, a level score or the total.
- The STEP 14 round trip shows `jsonb_typeof` is `string`, or the insert-or-ignore cannot be done without a merging upsert.
- Any step would need the service-role key, a background job, or an AI call in the quest path.
- A migration would alter existing rows, or applying it anywhere other than the local stack.

## Loop Notes
- 2026-10-26 00:45 Asia/Makassar Loop-Failed: stuck: no new step completed in segment 2. Worktree and branch kept (.worktrees/pf-152).
