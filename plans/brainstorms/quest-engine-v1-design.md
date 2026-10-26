# Quest Engine v1: How It Works

> **Status:** Built in PF-152 (implementation awaiting owner review). Designed 2026-10-25.
> **Interpretations made while building (small, all in the board service):** focus counts inside the three-card cap; unseen items carry `ids` (a list) so a folded backfill is marked seen with one call; a lone first completion is not folded; "any transaction" is read without the three-month window; `levelGoal` is the board's fallback when nothing can be offered; G6 (stale balances) is applied through `IndicatorFact.Trusted`, so cover stars are blocked as well as fence posts; focus and snoozes are two separate one-column writes; "today" is the Asia/Jakarta calendar day; completions are inserted row by row (an upsert serialises the primary key and collides with itself).
> **Scope:** plan 2 of the 3 MVP plans in [pm-journey-quests-analysis.md](pm-journey-quests-analysis.md). Plan 1 (score fixes G3 and G4) must land first. Plan 3 (Monthly Harvest) builds on this.
> **Diagram:** [diagram-quest-engine-v1.html](diagram-quest-engine-v1.html), high-level design (open in a browser).

---

## In one paragraph

Quest Engine v1 is a small rules engine inside the .NET API, with no LLM in it. Each time the Journey scores are recalculated, it checks a fixed catalog of L1 and L2 quests against the data that was just scored. Any quest that is newly complete gets one stored row. Completion is permanent. When you open Journey, the API reads those rows, picks up to three quests to offer, and returns the completions you have not seen yet, which the page shows as a toast. Nothing the engine does can change the pyramid score.

---

## What v1 includes, and what waits

| In v1 | Later |
|---|---|
| Recalculation after a statement submit and after asset, valuation or liability changes | |
| A quest catalog in code (version 1): L1 and L2 quests plus stars on every live indicator | Challenges and hidden quests (plan 4) |
| Detectors that run inside the recalculation pass | L3 action quests (plan 4, after G3); L4 and L5 (plan 7) |
| A `quest_completions` table; focus and snooze stored on `user_journey_state` | Garden items for each quest (plan 5) |
| `GET /api/journey/quests` returns a quest board; endpoints for focus, snooze and seen | The full Harvest reveal sequence and the monthly ritual with a free skip (plan 3) |
| A plain toast for each completion (sonner is already mounted in `App.tsx`) | Seasonal events (plan 6) |
| LLM quest generation removed from the Journey path | |

---

## Two facts from the code that shape the design

**1. Uploading a statement does not recalculate the Journey today.** `POST /api/transactions/submit` inserts rows through an RPC in [SupabaseCashflowMutationService.cs](../../apps/api/src/PersonalFinance.Infrastructure/Supabase/SupabaseCashflowMutationService.cs) and publishes no event. `TransactionCreatedEvent` is published only by [CreateTransactionCommandHandler.cs](../../apps/api/src/PersonalFinance.Application/Commands/CreateTransactionCommandHandler.cs), which handles a single manually entered transaction. `AssetUpdatedEvent` has a handler ([JourneyRecalcOnAssetHandler.cs](../../apps/api/src/PersonalFinance.Application/EventHandlers/JourneyRecalcOnAssetHandler.cs)) but nothing publishes it. So scores refresh only when you press Recalculate, enter one transaction by hand, or open Journey for the first time. Quests that complete by themselves need a trigger, so v1 adds one. CLAUDE.md says asset changes trigger recalculation automatically. That claim is out of date.

**2. Raw values only exist during recalculation.** `user_journey_state` stores each indicator's score but not its raw value, so `GetStateAsync` rebuilds indicators with `RawValue = null` ([JourneyScoringService.cs:26-42](../../apps/api/src/PersonalFinance.Application/Services/JourneyScoringService.cs#L26-L42)). Detectors need raw values: fence posts count months of cover, not a score. So the engine runs inside the recalculation pass, where those values are already in memory. v1 also stores raw values on `user_journey_state`, so the quest board can show progress such as "1.4 of 1.5 months" without recomputing anything.

Recalculation runs inside the HTTP request with the caller's token, so every read and write is owner-scoped by RLS. The engine writes as the user and never needs the service-role key.

---

## The pieces

| Piece | Layer | What it does | New or changed |
|---|---|---|---|
| **Recalc trigger** | Api + Application | `TransactionsController.SubmitTransactions` publishes `TransactionsSubmittedEvent` once per successful batch. Account, valuation, liability and asset commands publish the existing `AssetUpdatedEvent`. Handlers send `RecalculateJourneyCommand`. A failure is logged and never fails the import, the same way the existing handler behaves | New publishers, plus one new event and handler |
| **Journey scoring** | Application | Unchanged scoring. Now returns a `ScoringSnapshot` (indicators with raw values, plus the data it already loaded) and persists raw values | Changed |
| **Quest catalog** | Application (static) | The list of `QuestDefinition` records: code, level, kind, rule, rungs, copy, deeplink. Carries a version number | New |
| **Quest context** | Application | A read-only bag the detectors read from: indicators, the last 3 full months, account and valuation facts, flags, and what is already complete | New |
| **Detectors** | Application (pure functions) | One per rule type. Each says which rungs are met and why (the evidence) | New |
| **Quest engine** (`IQuestEngine`) | Application/Services | Builds the context, runs every detector, inserts new completions | New |
| **Quest board** (`IQuestBoardService`) | Application/Services | Answers `GET /quests`: focus, up to 3 offers, unseen completions, progress. Handles focus, snooze and seen | New |
| **`quest_completions`** | Supabase | Append-only. One row per quest rung completed. Unique on `(user_id, quest_code, rung)` | New table |
| **`user_journey_state`** | Supabase | New columns: `indicator_raw`, `focus_quest_code`, `quest_snoozes` | Changed |
| **Journey API** | Api | `GET /quests` returns the board; new focus, snooze and seen endpoints; `GET /state` adds stars | Changed |
| **Frontend** | React | `QuestCard` shows progress instead of "+pts"; indicator bars show stars; a toast for each unseen completion | Changed |
| **LLM quest path** | AI service | `JourneyAdvisorClient.GenerateQuestsAsync` and `/journey/advise` are no longer called | Removed |

All new interfaces live in `Application/Interfaces/` (ARCH-02). Detectors and the catalog live in Application because they are business rules with no infrastructure dependency (ARCH-01).

---

## The write path: how one pass runs

1. You submit a statement. After the RPC succeeds, `SubmitTransactions` publishes `TransactionsSubmittedEvent(userId)` once for the whole batch, not once per row.
2. The handler sends `RecalculateJourneyCommand(userId)`.
3. `RecalculateJourneyCommandHandler` calls `JourneyScoringService.RecalculateAsync`. It scores the indicators as today, persists scores and raw values, and returns the state plus the `ScoringSnapshot`.
4. The handler then calls `IQuestEngine.EvaluateAsync(userId, snapshot)`. The engine:
   - reads the user's existing completions (one query);
   - reads active accounts that count toward cash flow (one query; scoring does not load these today);
   - builds the `QuestContext`;
   - runs every detector in the catalog;
   - keeps only the rungs that are met and not yet stored;
   - inserts them in one batch, ignoring duplicates on `(user_id, quest_code, rung)`.
5. The state goes back to the caller as before.

Cost per pass: two extra reads and at most one insert. There is no LLM call.

Running it twice changes nothing, because the unique key makes it idempotent. If two recalculations race, the database keeps one row.

**Free performance fix along the way.** Today each of the four live indicators fetches the same three months of transactions separately, and the liquid-savings indicator queries valuations once per savings account. Building the snapshot means loading that data once and sharing it, which removes three of the four transaction fetches (the PERF-01 spirit).

---

## The read path: what opening Journey does

1. The Journey page calls `GET /api/journey/state` (scores, now with stars) and `GET /api/journey/quests`.
2. `QuestBoardService` reads the completions and the focus, snooze and raw-value columns, then uses the catalog to work out progress and offers. It reads only; it never recalculates.
3. It returns the board:

```json
{
  "catalogVersion": 1,
  "workingLevel": "L2",
  "focus": { "code": "l2.fence_posts", "title": "Build the fence", "progress": { "done": 2, "total": 6, "label": "2 of 6 posts · 1.1 months" }, "deeplink": "/assets/accounts" },
  "offers": [ { "code": "l2.map_your_debts", "kind": "discovery", "title": "Map your debts", "why": "…", "progress": null, "deeplink": "/assets/liabilities" } ],
  "unseen": [ { "id": 41, "code": "stars.spend_lt_income", "rung": 2, "title": "⭐⭐ Spending under 89% of income", "completedAt": "2026-11-03T09:12:00Z" } ]
}
```

4. The page shows one toast per unseen completion (at most two, then "+N more"). It then calls `POST /api/journey/quests/seen` with those ids.

No field carries a point value (guardrail G2). Every number shown comes from a catalog rung or a stored raw value.

---

## The catalog (version 1)

Each quest is a record in code:

```csharp
public sealed record QuestDefinition(
    string Code,                    // "l2.fence_posts"
    string Level,                   // "L1".."L5"
    QuestKind Kind,                 // Discovery | Ladder | Recognition | Boss
    QuestRule Rule,                 // which detector, with its parameters
    IReadOnlyList<decimal> Rungs,   // empty for single-step quests
    bool MovesMoney,                // gate G7: offered only at the working level
    string Title, string Why, string? Deeplink);
```

| Code | Level | Kind | Completes when | Rungs | Offered? |
|---|---|---|---|---|---|
| `l1.meet_your_money` | L1 | Discovery | At least one transaction exists | — | Yes |
| `l1.sort_the_pile` | L1 | Discovery | The 5 largest expenses of the last full month all have a category other than `Uncategorized` | — | Yes |
| `l1.full_picture` | L1 | Discovery | Each active account with `include_in_cashflow` has a transaction in the last 3 full months. One rung per account | one per account | Yes |
| `l1.in_the_green` | L1 | Ladder | Any of the last 3 full months had income above zero and expense below income | — | Yes |
| `l1.boss` | L1 | Boss | Every live L1 indicator scores 70 or more | — | No (shown as the level goal) |
| `l2.count_your_cushion` | L2 | Discovery | At least one Savings account has a valuation | — | Yes |
| `l2.map_your_debts` | L2 | Discovery | At least one liability is recorded, or "I have no debts" is confirmed | — | Yes |
| `l2.fence_posts` | L2 | Ladder, `MovesMoney` | Months of cover reach the rung **and** every Savings valuation is dated in the current or previous calendar month (G6) | 0.5, 1, 1.5, 2, 2.5, 3 | Only when L2 is the working level |
| `l2.boss` | L2 | Boss | Every live L2 indicator scores 70 or more | — | No |
| `stars.<indicator>` | indicator's level | Recognition | The indicator's score reaches the rung. Skipped while the indicator is `no_data` | 50, 70, 100 | Never; stars just happen |

Stars exist for the four live indicators: `spend_lt_income`, `liquid_savings_ratio`, `manageable_dti` (only once plan 1 makes it honest) and `savings_rate`. Stars are recognition, not a prompt to move money, so CIO allows them at any level.

**Where the numbers come from (FIN-02).** Star rungs are the rubric's score breakpoints, with 70 as the graduation bar ([scoring-rubric.md](../../docs/ideas/scoring-rubric.md), Level Graduation Rules). Fence posts are half-month steps up to the rubric's 3-month breakpoint for liquid savings; they are celebration points with no effect on the score. "In the green" uses the rubric's 0-point breakpoint, a ratio of 1.00.

The "I have no debts" flag belongs to plan 1, because fix G4 needs it too. A recorded liability always overrides the flag.

---

## Detectors and the context

A detector is a pure function: `QuestRule.Evaluate(QuestContext) → list of (rung, met, evidence)`. It reads no database, so every rule can be unit-tested with plain objects.

`QuestContext` holds:

- **Indicators:** code, score, raw value and status, from the pass that just ran.
- **Levels:** which levels are graduated, and the **working level**, meaning the first level not graduated. This is not `currentLevel`, which reads 1 both before and after L1 clears ([JourneyScoringService.cs:348-366](../../apps/api/src/PersonalFinance.Application/Services/JourneyScoringService.cs#L348-L366)); see CIO guardrail G7.
- **Months:** the last 3 full calendar months, each with income, expense (after G3, expense excludes the savings categories) and its 5 largest expenses with their categories.
- **Accounts:** active cash-flow accounts and whether each has a transaction in the window; each Savings account's latest `valued_at`.
- **Debts:** the number of liabilities and the "no debts" flag.
- **Completed:** the set of `(code, rung)` already stored.
- **Today:** an injected clock, so tests can pin dates.

v1 rule types: `TransactionsExist`, `TopExpensesCategorized(n)`, `AccountsCovered`, `GreenMonth`, `IndicatorScoreAtLeast(code)`, `RawValueAtLeast(code, freshness)`, `DebtsMapped`, `ValuationExists(accountType)`, `LevelGraduated(level)`.

Evidence is saved with each completion, for example `{"months": 1.52, "valuedAt": "2026-10-03"}`. Plan 3's Harvest uses it for its copy, and it lets you check later why a quest completed.

---

## Offering: pick 1 of 3

1. **Candidates** are Discovery and Ladder quests that are not fully complete and not snoozed. Recognition and Boss quests are never offered.
2. **Level gate (G7):** Discovery quests come from the working level and the one above it. Quests marked `MovesMoney` come only from the working level.
3. **Order:**
   - your focus quest, if it is still open;
   - one Discovery quest, if any is left, as a quick win;
   - the rest by how close they are to done, with ties broken by catalog order.
4. Take the first three.

Progress for a ladder is how far the raw value has moved between the previous rung and the next one. Progress for a multi-step Discovery quest is steps done over total steps.

Focus is optional. When the focus quest completes, focus clears and the toast says "pick a new focus". "Not now" snoozes a quest until the same date next month. Swapping focus never costs anything.

---

## State model

```sql
create table public.quest_completions (
  id              bigserial primary key,
  user_id         uuid not null,
  quest_code      text not null,
  rung            smallint not null default 0,
  catalog_version smallint not null,
  evidence        jsonb not null default '{}',
  completed_at    timestamptz not null default now(),
  seen_at         timestamptz,
  unique (user_id, quest_code, rung)
);
create index quest_completions_unseen on public.quest_completions (user_id) where seen_at is null;
-- RLS: the same owner policy PF-S08 applies to the journey tables:
-- FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())

alter table public.user_journey_state
  add column indicator_raw    jsonb not null default '{}',
  add column focus_quest_code text,
  add column quest_snoozes    jsonb not null default '{}';  -- {"l1.sort_the_pile": "2026-11-25"}
```

The API sets `user_id` from `ICurrentUser`, never from a request body. Rows are never updated except to set `seen_at`, and never deleted. The migration goes in `supabase/migrations/` through `/db-migrate`.

---

## API

| Method and route | Does | MediatR |
|---|---|---|
| `GET /api/journey/quests` | Returns the quest board. This replaces today's `List<JourneyQuestDto>`; the frontend changes in the same plan | `GetQuestBoardQuery` |
| `POST /api/journey/quests/{code}/focus` | Sets your focus quest | `SetQuestFocusCommand` |
| `POST /api/journey/quests/{code}/snooze` | Hides a quest until next month | `SnoozeQuestCommand` |
| `POST /api/journey/quests/seen` | Marks completions seen. Body: `{ "ids": [41, 42] }` | `MarkQuestsSeenCommand` |
| `GET /api/journey/state` | As today, plus `stars` (0–3) on each indicator, computed from its score | existing |

Each controller action stays under 15 lines (ARCH-04) by delegating to MediatR.

---

## Honesty rules built in

| Rule | How v1 enforces it |
|---|---|
| **G1:** quests never change the score | The engine has no write access to scores, snapshots or achievements. It writes only `quest_completions` and the focus and snooze columns. A test runs the engine and asserts the scores are unchanged |
| **G2:** no invented numbers | `estimatedScoreGain` is deleted along with the LLM path. Card numbers come from rungs and stored raw values |
| **G6:** no fence post from a stale balance | The `RawValueAtLeast` rule for fence posts checks valuation dates |
| **G7:** money-moving quests only at the working level | The offer step uses the working level, not `currentLevel` |
| **G8:** no product or allocation language | A catalog lint test fails on product, issuer, asset-class, allocation-percentage or return wording |
| **Completion is permanent; stars are live** | If a score drops, the indicator shows fewer stars (the truth), but the record "you earned ⭐⭐ on 3 November" stays, and earning it again does not celebrate twice |

---

## First run after deploy

Your data already exists, so the first pass may complete several quests at once. If a user has no completions before a pass, the engine marks that batch as a backfill in `evidence`, and the board folds it into one item: "You'd already completed 6 quests." That avoids a burst of six toasts.

---

## Tests

- **Detectors (xUnit, no Supabase).** Boundary cases for each rule. Examples: 1.49 versus 1.5 months of cover; a stale valuation blocks a fence post; an indicator with `no_data` earns no star.
- **Engine.** Two passes produce one row; only new rungs are inserted; the score is unchanged (G1).
- **Offers.** Working-level gate, snooze, focus first, at most three.
- **Catalog.** Codes are unique, rungs ascend, and the lint test (G8) passes.
- **Trigger.** A successful submit publishes exactly one event; a failed submit publishes none; a failed recalculation does not fail the import.
- **Controllers.** The new endpoints (TEST-01).
- **E2E (optional).** Upload the fixture, open Journey, and see the "Meet your money" toast.

---

## Cost

Opening Journey no longer calls the AI service: today every `GET /api/journey/quests` triggers an LLM call. A recalculation adds two reads and at most one insert.

---

## Decisions, with my recommendation

1. **Catalog in code or in a table?** Code. The detectors are code anyway, and a table would hold only text, adding a sync problem for no gain.
2. **Recalculate synchronously after submit, or in the background?** Synchronously, the way the existing handler works. A background job loses the caller's token that RLS needs (the PF-S15 lesson). Revisit only if submit latency becomes noticeable.
3. **Delete `/journey/advise` and `JourneyAdvisorClient` in this plan?** Yes. Once nothing calls them they are dead code, and keeping them invites someone to wire LLM-invented numbers back in.
4. **Quest copy language?** English, to match the current UI.

Estimated effort: about a week for one developer, as in the analysis.
