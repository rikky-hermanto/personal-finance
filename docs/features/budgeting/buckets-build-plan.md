# Buckets (3-Bucket Budgeting) — Implementation Plan

Reference prototype: `Buckets Budgeting.html` + `pf-buckets.jsx` + `pf-buckets-app.jsx` + `pf-buckets-data.js` (project "Personal Finance"). Indonesian v1 kept at `Kantong Budgeting.html` for copy comparison. Source review: `docs/features/budgeting/budgeting-3-kantong-review.md`.

Feature is **Buckets** — an allocation plan plus monthly reconciliation over cash flow the app already ingests. It is not an execution system: we do not move money. Everything the card claims is measurement of transactions across BCA, Superbank, NeoBank, Wise and Jago.

---

## Phase 0 — Go/no-go gate (blocks everything below)

**Validate Committed-vs-Free categorization accuracy** against 3 months of real transactions. Take the 106 category rules, classify into Committed/Free, hand-label the same window, measure the miss rate.

Pass condition to define before running (proposal): ≥90% of Committed *rupiah* correctly classified, and no single misclassified item exceeding 10% of the Committed total. If the split misfires, every number the card shows is wrong and the feature becomes an inaccurate nag — stop and fix categorization first.

Deliverable: a short accuracy note in `docs/features/budgeting/`, with the confusion cases listed by category.

---

## Ticket 1 — Correctness fixes (small, ships independently, no UI work)

Can go out before any bucket UI exists. All three are bugs in already-shipped behaviour.

1. **`savingsGoal = 0m` in `SpendingAnalysisService.cs:48`.** Every Safe-to-Spend figure ever displayed assumes the user saves nothing. Prerequisite, not follow-up.
2. **Reword the shipped "Safe to Spend" label** → "Daily remaining after Committed & Future". Measurement framing, not permission. Compliance-required.
3. **`spendingAnalysisApi.ts` never checks `r.ok`.** The error state is unreachable; a 500 surfaces as `NaN`. Add the check so the existing error UI can render.

Test: assert the daily figure changes when a savings goal is set, and that a mocked 500 renders the error state rather than `NaN`.

---

## Ticket 2 — Derivation engine + the daily card

### Server: derivation

- `deriveBuckets(userId, asOf)` → `{ committed, future, free, income, monthsAvailable, itemsCommitted[] }`.
- **Median, not mean**, over the trailing 3 complete months, per bucket. One Ramadan month must not set the year's budget. Return the source months so the UI can show them.
- Flag any category whose month-to-month variation exceeds ±30% as `watch: true` — surfaces as the `inferred` badge.
- `decimal` end to end (FIN-01). No float money anywhere.
- **Liquidity sums across buckets** — the emergency-fund denominator must not shrink because the balance is split. Add a test asserting `sum(buckets) == totalLiquid`.
- Committed/Free is the essential/discretionary split that feeds the L2 emergency-fund denominator — expose it as such rather than recomputing elsewhere.

### Server: waterfall

`allocate(income, buckets)` — ordered cascade **Committed → Future → Free**. Each tier fills completely before the next receives anything. A shortfall stops at one named tier and reports `{ tier, requested, funded, short }`. Never pro-rata, never silent. Pattern exists in `CapitalWaterfall.tsx`.

Trigger on **detected income arrival**, not a calendar date — payday drifts across weekends and Lebaran. Calendar date is fallback only.

### Client: the card

One component with six states, living on the dashboard — not its own tab, not a one-time onboarding flow. Copy, thresholds and layout come from `pf-buckets.jsx` verbatim.

| State | Trigger | Hero |
|---|---|---|
| `learning` | `monthsAvailable < 2` | "Still learning" + count/total of confirmed fixed bills + the date the number arrives |
| `daily` | days 1–25, stable income | Daily remaining |
| `daily` + variable income | income variance >25% across 3 months | "Committed covered through <date>" — runway, daily allowance switched off |
| `forecast` | day ≥ 26 and 7-day pace projects over | "Free is heading ±X over" + one concrete correction. Amber |
| `exhausted` | `freeSpent >= freeBudget` | Neutral fact, never a negative number as hero. Then the two things still safe, then one biggest driver |
| `shortfall` | detected income below the funding requirement | Ordered cascade with the stop point named |
| `close` | month boundary | Reconciliation — see Ticket 3 |

Rules that are not negotiable:

- **Over-budget never renders green** (FIN-04). Amber for Free over; `destructive` red reserved for Committed at risk.
- **Future gets the only progress bar** in the feature. Committed gets a binary streak, Free gets a depleting bar. Three bars = three things to feel bad about.
- **Committed is expandable and correctable.** Sheet lists every commitment with amount, due date, source account, an `inferred` badge where the classification is a guess, and a per-item "Not committed" demote that recomputes Free live and feeds the correction back as a labelling signal. A caveat with no affordance is anxiety without agency.
- **Every count and total derives from the item list.** No hardcoded "6 commitments" anywhere — the prototype had this bug twice and it is the one defect a reviewer fixates on.
- Derivation caveat on any screen showing a derived figure: "Estimated from your transaction categories — check anything that looks wrong," linking into the sheet.
- Full number format for anything acted on today; `M`/`K` abbreviations only in summaries.
- **Do not add a Desk-style "not investment advice" disclaimer.** Bolting it onto a cash-flow calculator is theatre and trains users to ignore disclaimers where they matter.

### Setup

The setup screen is the `learning` → first `daily` transition of the same card, not a separate flow. One slider, once: Future per month, with the counterweight (Free) visible as it moves.

**Soft floor:** when the proposed Free drops below 80% of the user's Free median, show inline "You usually spend Rp X a month. Sure Rp Y is enough?" — allow it, but make the history visible at the moment of the promise. Amber, non-blocking.

---

## Ticket 3 — Month close (reconciliation)

The differentiator. Jago executes allocations but can only see Jago; we execute nothing but see every account, so we can produce the sentence they cannot.

- Match **planned vs actual** per bucket across all ingested accounts, and list the transfers that were found: date, from, to, amount.
- **Open with the strongest true positive** ("Everything committed was paid. Three months running."). Users who feel judged do not come back next month.
- A shortfall always renders **on the same line as its cause** — cause-attached reads as explanation, bare reads as verdict. Name one driver, not five.
- **Fresh-start nudge**: pre-filled next-month Future slider at the suggested value, one tap to accept. Peak motivation is the month boundary.
- Detection of "planned Rp 1M, Rp 600K arrived" needs a transfer-matching rule: outbound from a funding account to any account or platform tagged as a Future destination, within the month, tagged to the plan.

---

## Ticket 4 — Retire the old vocabulary (same release as Ticket 2)

`SafeToSpendCard` **retires or is rewritten in bucket vocabulary in the same release**. Two vocabularies for the same numbers ("Income baseline / Committed bills" vs Committed/Future/Free) is two mental models, and the older one is the one with the broken savings assumption. Replace, do not add.

---

## Naming (locked)

Container noun **Buckets** — goal-based bucketing with horizons, the standard institutional term. Deliberately not "Pockets" (Jago's noun). `bucket` appears only as a local variable in `CapitalWaterfall.tsx:9`, never user-facing — safe to claim. `Sleeves` and `Reserved` are taken by the Desk.

| Bucket | Meaning | Mental model |
|---|---|---|
| Committed | Already claimed by someone else | "This isn't my money" |
| Future | Claimed by future you | "This is my money tomorrow" |
| Free | Unclaimed | "This is my money today" |

**Open risk:** "Free" sits near the permission framing compliance moved us off. Acceptable as a noun label **provided the daily hero stays a measurement**. If the hero ever becomes "Free today: Rp 138,000," the problem is back. Safe swap: **Everyday** — the prototype has this behind a tweak so both can be reviewed.

Indonesian copy needs its own pass. The compliance requirements are about framing, not wording — the Indonesian v1 (`Kantong Budgeting.html`) is the reference for tone, not for the terms.

---

## Buckets are not Goals

Keep them separate structurally; conflating them is Jago's actual design flaw.

| | Bucket | Goal |
|---|---|---|
| Measures | Flow per period | Accumulated balance |
| Cycle | Resets monthly | Accumulates, then closes |
| Horizon | None — always this month | Has a date, by definition |
| Instrument | Cash, always | Depends on horizon |

Future is the tap; goals are what it fills. Goals do not exist in the product yet (no `types/Goal.ts`, no route) — **build buckets first**. When goals arrive, every goal carries a target date, because the date determines which instruments are permissible. A goal without a horizon is a bucket in disguise. The emergency fund is the one goal that must stay in cash: not because the horizon is short, but because the draw date is unknown.

---

## Explicitly not building

- **The personality quiz.** Jago's 4 questions never ask about debt, emergency fund, or dependents, then conclude "you're financially stable, time to invest" with a referral link. A user carrying a 24% KTA balance with no buffer passes. This is the L3-before-L2 trap the pyramid exists to prevent. Replaced by Budget Starter, which reads actual transactions.
- **Per-category envelopes** (8+ pockets). Three buckets, derived.
- **50/30/20 or any rule of thumb.** US cost structure; in Jakarta rent plus commuting frequently exceeds 50% alone. Derive from the user's own median.
- **Fixed-nominal, calendar-date auto-allocation.** Pro-cyclical against variable income, and payday drifts.
- **Archetypes or any "you're ready to invest" claim.**

---

## Housekeeping

**Redact the Jago screenshots in `docs/features/budgeting/` before the repo goes public.** They contain real account numbers (`1005 3675 3169`, `1095 4982 2563`). Repo is heading open-source (PF-122) and has already had one PII purge (PF-126/127).

---

## Prompt for Claude Code

```
Implement the Buckets budgeting feature per docs/features/budgeting/buckets-build-plan.md, using
the prototype files in ref-prototype/pf-buckets*.jsx and pf-buckets-data.js as the exact spec for
logic, copy, states, and layout.

0. Do not start until the Phase 0 categorization accuracy check has passed and is recorded in
   docs/features/budgeting/. If it has not, stop and report.
1. Ticket 1 first, as its own PR: fix savingsGoal = 0m in SpendingAnalysisService.cs:48; reword the
   shipped "Safe to Spend" label to "Daily remaining after Committed & Future"; add the missing r.ok
   check in spendingAnalysisApi.ts so the existing error state can render instead of NaN.
2. Port pf-buckets-data.js's shape to the server as deriveBuckets() + allocate(): median (never mean)
   over 3 trailing complete months per bucket; decimal end to end (FIN-01); ordered waterfall
   Committed -> Future -> Free where a shortfall stops at one named tier and reports
   {tier, requested, funded, short} — never pro-rata, never silent. Trigger on detected income
   arrival, calendar date as fallback only. Add a test asserting liquidity sums across buckets.
3. Build one BucketsCard component with the six states in pf-buckets.jsx (learning, daily,
   daily+variable-income runway, forecast, exhausted, shortfall, close). Preserve copy and thresholds
   verbatim. It mounts on the dashboard — not its own route, not an onboarding flow.
4. Derive every count and total from the commitment item list. No hardcoded counts anywhere.
5. Committed opens a sheet listing each commitment with amount, due date, source account, an
   "inferred" badge where classification is a guess, and a per-item "Not committed" action that
   recomputes Free live and records the correction as a categorization labelling signal.
6. Over-budget never renders green (FIN-04): amber for Free over, destructive red reserved for
   Committed at risk. A negative number is never the hero. Future gets the only progress bar.
7. Setup is the learning -> daily transition of the same card: one Future slider with Free shown as
   the visible counterweight, plus a soft floor warning (non-blocking) when Free falls below 80% of
   the user's Free median.
8. Month close reconciles planned vs actual per bucket across ALL ingested accounts and lists the
   matched transfers. Open with the strongest true positive; render any shortfall on the same line as
   its named cause; end with a pre-filled next-month Future slider (one tap to accept).
9. Retire or rewrite SafeToSpendCard in bucket vocabulary in the same release as step 3. Do not ship
   both vocabularies.
10. Do NOT add a "not investment advice" disclaimer to this feature, do NOT add a personality quiz or
    archetypes, and do NOT hardcode 50/30/20 or any rule of thumb.
11. Reuse existing design tokens (pf-card, bg-card, border-border, text-success/warning/destructive).
    UI copy ships in Indonesian — the framing requirements (measurement, not permission) are
    non-negotiable, the exact wording needs a copy pass.
```
