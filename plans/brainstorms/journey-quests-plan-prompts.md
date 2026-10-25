# Journey Quests MVP: Prompts for the Three Plans

> Paste each block into a **new chat**, in order. Each one runs `/plan` and produces a plan file in `plans/backlog/`.
> Execute the plans in the same order: plan 2 needs plan 1's score fixes, and plan 3 needs plan 2's engine.
> Source: [pm-journey-quests-analysis.md](pm-journey-quests-analysis.md) · [quest-engine-v1-design.md](quest-engine-v1-design.md) · 2026-10-25

---

## Plan 1: Score fixes

```text
/plan Journey score fixes before quests: count investing as saving (G3), stop scoring DTI without debt data (G4), move insurance to L2 (G11)

Context: this is plan 1 of 3 for the Journey quests MVP. Quests (plan 2) will celebrate these scores, so the scores must be true first. Read before forming approaches:
- plans/brainstorms/pm-journey-quests-analysis.md, the "CIO Review" section (findings, guardrails G3, G4 and G11, blast radius)
- apps/api/src/PersonalFinance.Application/Services/JourneyScoringService.cs
- supabase/migrations/20260510000002_seed_category_presets.sql (investment presets typed Expense, lines 100-107)
- docs/ideas/scoring-rubric.md and docs/reference/finance-domain/formulas.md (sections 1 and 2)

What must change:
1. G3: spend_lt_income excludes the savings-rate categories (Investment, Savings Transfer, Investasi, Tabungan) from the expense side. Dividends stay income. Ask /cio (methodology mode) whether the same exclusion applies to the monthly-expense denominator of liquid_savings_ratio, and record the answer in the plan.
2. G4: manageable_dti returns no_data ("not evaluated") when the owner has no liabilities and has not confirmed "I have no debts". Add a persisted confirmation flag (suggestion: a timestamp column on user_journey_state; a recorded liability always overrides it), an endpoint to set and clear it, and a minimal UI to confirm it (the empty state of Assets > Liabilities). The debt_free ("Light Footprint") achievement must not unlock from an empty liabilities table. "Not evaluated" renders neutral, never green (FIN-04).
3. G11: move appropriate_insurance from L3 to L2 in code and in the rubric. It is no_data today, so no score changes.
4. Docs:
   - bump the rubric version with a changelog entry (its Audit Trail section requires one);
   - update the formulas.md breakpoint table;
   - state in the rubric that DTI uses take-home income from bank statements;
   - fix the CLAUDE.md pyramid headlines so each level shows the clearing bar at score 70 (spending at most 89% of income; cover of at least 2.1 months and DTI at most 29.6%; savings rate of at least 9%) and the mastery bar at score 100 (80%; 3 months and 20%; 15%).

Acceptance criteria to include:
- Income 10 jt, consumption 8 jt and investing 1.5 jt (category Investment) give a spend ratio of 0.80 and a spend_lt_income score of 100.
- With no liabilities and no confirmation, manageable_dti is no_data, it is left out of the L2 average and of graduation, and debt_free does not unlock.
- With the confirmation set and no liabilities, DTI is 0 and scores 100. A liability added afterwards makes DTI compute from that liability.
- appropriate_insurance reports level L2.
- Existing tests pass, and new tests cover each case (TEST-01, with names following TEST-02).

Blast radius (must appear in the plan):
- L1 scores only rise for anyone with investment outflows, so nobody loses an L1 clearance.
- Removing a fake DTI of 100 can lower the L2 average, but cannot flip L2 clearance on its own.
- Do not rewrite journey_indicator_snapshots history.
- Check whether the owner's existing debt_free achievement was earned on empty data. Report it; do not delete it.
- Recalculate after deploy and record the before and after scores in the plan's execution notes.

Out of scope: quests; the recalculation trigger after uploads (plan 2); any other breakpoint change; liabilities with no monthly_payment (note it if you find it, don't fix it).
The schema change goes through /db-migrate, with the owner RLS pattern unchanged.
Board objective suggestion: "Journey scores stop penalizing you for investing and stop showing a perfect debt score when no debts have been recorded."
```

---

## Plan 2: Quest Engine v1

```text
/plan Quest Engine v1: L1/L2 quests that complete themselves after a statement upload, with stars and a quest board

Context: plan 2 of 3 for the Journey quests MVP. The design is already decided; produce the implementation plan, not a new design. Plan 1 (score fixes G3/G4 and the "I have no debts" flag) must be executed before this plan: find its plan file in plans/ and reuse its names (for example the no-debts flag column), and list it as a blocking dependency. Read before forming approaches:
- plans/brainstorms/quest-engine-v1-design.md, the full design (pieces, write and read paths, catalog v1, state model, API, honesty rules, tests). Treat it as the spec.
- plans/brainstorms/diagram-quest-engine-v1.html, the high-level design (the ZONES/NODES/EDGES arrays at the top of the script are readable)
- plans/brainstorms/pm-journey-quests-analysis.md, for the product rules ("fun, not a burden") and CIO guardrails G1, G2, G6, G7 and G8
- Backend: JourneyScoringService.cs, RecalculateJourneyCommandHandler.cs, EventHandlers/JourneyRecalc*.cs, TransactionsController.cs (SubmitTransactions), JourneyController.cs, JourneyAdvisorClient.cs
- Frontend: JourneyPage.tsx, QuestCard.tsx, LivingGardenHero.tsx (it uses topQuest), IndicatorScoreBar.tsx, journeyApi.ts, types/Journey.ts

Facts already established (verify them, don't rediscover them):
- POST /api/transactions/submit inserts through an RPC and publishes no event. AssetUpdatedEvent has a handler but no publisher. So today nothing recalculates the Journey after an upload. v1 adds TransactionsSubmittedEvent (once per successful batch) and publishes AssetUpdatedEvent from account, valuation, liability and asset writes.
- Raw indicator values exist only during recalculation, so the engine runs inside that pass. v1 persists raw values on user_journey_state.
- Recalculation stays synchronous inside the request, so RLS uses the caller's token. No background job, no service-role key.

Scope: everything in the "In v1" column of the design doc:
- the recalculation trigger;
- ScoringSnapshot, loading the three-month transaction window once;
- catalog v1 (in code), QuestContext, pure detectors, IQuestEngine and IQuestBoardService;
- the migration (quest_completions plus the user_journey_state columns, owner RLS) through /db-migrate;
- the four Journey endpoints, and stars on GET /state;
- the frontend board with progress, a plain sonner toast and mark-seen;
- the first-run backfill folded into one item;
- removal of the LLM quest path (JourneyAdvisorClient.GenerateQuestsAsync, plus the AI service /journey/advise with its prompt, models and tests). Confirm nothing else calls them first.

Constraints:
- No LLM anywhere in the quest path.
- No workflow engine or external orchestrator. Quests are state-based rules evaluated in-process.
- No points on cards (G2). The engine has no write path to scores (G1).
- A fence post needs a fresh valuation (G6).
- Offers are gated on the working level, meaning the first level not yet cleared, not currentLevel (G7).
- A catalog lint test (G8).
- Controller actions stay within 15 lines by delegating to MediatR (ARCH-04). Interfaces live in Application/Interfaces (ARCH-02). Money stays decimal (FIN-01).

Acceptance criteria to include, at minimum:
- Uploading a statement completes "Meet your money" without a Recalculate click.
- Running recalculation twice stores one row.
- A completion toast appears once, and not again after a reload.
- Scores are identical with and without the engine.
- A stale savings valuation blocks a fence post.
- GET /api/journey/quests makes no AI service call.
- The board never offers more than 3 quests.

Also update the docs that become true or go stale: CLAUDE.md (recalculation after uploads and asset changes is now real; the AI service endpoint list drops /journey/advise), docs/architecture/API-endpoints.md, and the Journey scoring card in docs/architecture/diagram-system-design.html.

Out of scope: the Harvest reveal sequence and the monthly ritual (plan 3); challenges, hidden quests and L3 action quests (plan 4); garden items (plan 5); the hard-coded CashflowQuestStrip on the Cashflow overview (note it and leave it).
If the plan grows past about a week of work, split it (for example: engine and trigger first, board UI second) instead of cutting guardrails.
Board objective suggestion: "Journey quests finish by themselves when your uploaded data shows you did them, and you see a short note when they do."
```

---

## Plan 3: Monthly Harvest

```text
/plan Monthly Harvest: after each statement upload, reveal the month's completed quests one by one on Journey

Context: plan 3 of 3 for the Journey quests MVP. Plan 2 (Quest Engine v1) must be executed before this plan: find its plan file in plans/, reuse its names (board DTO, completion table, endpoints), and list it as a blocking dependency. Plan 2 stores completions with seen_at and shows a plain toast. This plan replaces that toast with the Harvest, the main "fun" moment of the design. Read first:
- plans/brainstorms/pm-journey-quests-analysis.md: "The core loop: Monthly Harvest", the design rules, "What we will not do", and guardrail G10
- plans/brainstorms/quest-engine-v1-design.md: the read path, the board DTO, the first-run backfill
- docs/ideas/reward-loop-closure.md: motion and toast behaviour already validated in the HTML prototype
- plans/brainstorms/diagram-journey-quests-new-user.html: step 4 (Monthly Harvest)
- ai/design/ (zen theme rules), and plan 2's board service and Journey page code

Scope:
1. Harvest summary on the quest board:
   - the harvested month;
   - accounts covered, as "N of M": cash-flow accounts with transactions that month, out of all active cash-flow accounts (G10);
   - whether the month was green or red;
   - that month's unseen completions, with their evidence for the copy.
2. Reveal on Journey:
   - it opens on the first visit after new completions and plays them one at a time (the quest, its garden item or star, a count-up), then offers next month's focus pick;
   - calm zen motion with no confetti; skippable; respects prefers-reduced-motion; never blocks the page; never replays (seen_at);
   - the first-run backfill shows as one summary.
3. Red months: the copy says "Harvested. Your garden grew.", with no shame wording. Add the hidden quest "Honest Harvest" (the first time a red month is uploaded). It is the only hidden quest in this plan.
4. Monthly rhythm (the ritual): consecutive months with an upload, with one free skip per quarter. Breaking it restarts quietly with no loss message. Consider showing the longest rhythm too.

Constraints:
- Nothing here changes the pyramid score (G1).
- No daily mechanics, no push notifications, no leaderboard.
- Every number comes from stored data or the catalog (G2).
- Tailwind and shadcn, following .claude/rules/frontend.md.

Acceptance criteria to include:
- After an upload that completes 2 quests, the next Journey visit plays exactly those 2, and never again after a reload.
- The harvest line shows the correct "N of M accounts" for a fixture with a missing account.
- A red-month fixture shows the neutral copy and awards Honest Harvest once.
- With reduced motion on, the reveal shows static cards.
- One skipped month in a quarter keeps the rhythm; a second skipped month restarts it without a loss message.

Out of scope: garden visuals beyond what Living Garden Hero already renders (plan 5); challenges and other hidden quests (plan 4); seasonal events (plan 6); the sidebar garden widget, unless it already exists in the live app.
Board objective suggestion: "After each monthly upload, Journey shows what you achieved that month one step at a time, and an overspent month still counts."
```
