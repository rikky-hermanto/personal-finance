# Budgeting — 3 Buckets · Full Review

> Compiled from three gates on a budgeting feature inspired by Bank Jago Pockets:
> `/cio` (financial soundness) → `/compliance` (regulatory gate) → `/ux-review` (design).
> Source material: 21 screenshots + 2 FAQ pages in `docs/features/budgeting/`.
> Date: 2026-08-03

---

## Executive Summary

| Gate | Verdict |
|---|---|
| CIO | **BUILD WITH GUARDRAILS** (buckets) · **DON'T BUILD** (personality quiz) |
| Compliance | **SHIP WITH CHANGES** — 4 copy/logic changes, no licensing exposure |
| UX | **REFINE** — structure is right, 4 blocking findings before build |

**Agreed shape:** 3 Buckets (🔒 Committed · 🛡️ Future · 😌 Free), derived from the median of the user's last 3 months of transactions. One slider at setup, one number daily, one reconciliation monthly. Not 8 per-category envelopes, not a quiz, not a 50/30/20 rule of thumb.

**Non-negotiable prerequisite:** fix `savingsGoal = 0m` in `SpendingAnalysisService.cs:48` — every Safe-to-Spend figure ever shown assumes the user saves nothing.

---

## Naming

**Container noun: Buckets.** Goal-based bucketing with horizons is the standard institutional term (Evensky's cash-flow reserve strategy is the canonical version). Deliberately not "Pockets" — that is Jago's noun, and adopting it inherits their framing along with their vocabulary.

| Bucket | Meaning | Mental model |
|---|---|---|
| 🔒 **Committed** | Already claimed by someone else — bills, installments, rent, commuting | "This isn't my money" |
| 🛡️ **Future** | Claimed by future you — emergency fund, targets | "This is my money tomorrow" |
| 😌 **Free** | Unclaimed | "This is my money today" |

Naming by **when the money is claimed** rather than by obligation-vs-freedom teaches the liquidity ladder — the institutional construct L2 needs anyway. Jago's Wajib/Bebas split is a moral frame; horizon is a structural one.

### Rejected candidates

| Candidate | Why not |
|---|---|
| Pockets | Jago's noun — reads as a clone, inherits their framing |
| Envelopes | Correct lineage (YNAB/Kakeibo) but signals "budgeting app," not wealth platform |
| Sleeves | Taken by the Desk — `desk.ts:171` |
| Reserved | Taken by the Desk **and user-facing** — renders as a labelled row in `CapitalWaterfall.tsx:13` |
| Bills / Savings / Spending | "Savings" collides with Assets' savings accounts; "Bills" is narrower than the bucket |
| Locked / Growing / Free | "Growing" implies return on a cash bucket — FIN-05 territory for no benefit |
| Must / Should / Can | Moralizing, and wrong: a bucket is a claim, not a virtue |

**Collision check:** `bucket` appears only as a local variable in `CapitalWaterfall.tsx:9`, never user-facing — safe to claim.

**One open risk:** "Free" sits near the permission-framing line compliance moved us off. Acceptable as a *bucket name* (a noun label, not a directive) **provided** the daily hero number stays a measurement. If the hero label ever becomes "Free today: Rp 138.000," the removed problem is back. Safe swap if desired: **Everyday**.

> **Note on language:** UI copy below is written in English for this document. Final Indonesian
> copy needs its own pass — the compliance requirements are about *framing* (measurement, not
> permission), not about the specific wording.

---

## 1 · CIO Review

### What was actually reviewed

The Jago Pockets flow bundles three different things:

1. **Envelopes with genuinely segregated accounts** — each Pocket has its own account number; spending debits the envelope directly via card/QRIS.
2. **A commitment device** — Lock Pocket, Set Target, Auto-Budgeting.
3. **A personality quiz that ends in a sales funnel** — 4 questions → archetype → Bibit referral.

**The real user need:** not "categorize my spending" (106 category rules already do that), but *"stop me from spending money I've already allocated to something else."*

### Pyramid placement

Serves **L1 Foundations** plus the **L2** emergency-fund build. No level prerequisite — envelopes are the correct tool for a user starting from zero. A rare feature with no sequencing hazard.

### The mechanism is real

Mental accounting made physical (Thaler). Labelled, segregated money is spent differently even though it is fungible. This is behavioural alpha with no forecast inside — nothing about it can be invalidated by a market. Consistent with Vanguard's *Advisor's Alpha* thesis: the value a professional adds is overwhelmingly behavioural, not predictive.

### The quiz is rejected

Jago's 4 questions (what you set aside first, how much is left [self-reported feel], what you'd do with a bonus, hobbies) **never ask about debt, emergency fund, or dependents** — then conclude "you're financially stable, time to invest" with a Bibit link. A user carrying a 24% KTA balance with no buffer passes. This is precisely the L3-before-L2 trap the pyramid exists to prevent.

**Replacement: Budget Starter** — read 3 months of transactions, propose buckets with their medians shown, flag categories varying more than ±30% as "watch first," accept in one tap. Jago needs a quiz because it lacks transaction history. We have it.

### Auto-Budgeting design flaws (from the FAQ)

| Mechanic | Jago's design | Problem |
|---|---|---|
| Amount | Fixed nominal per destination | Pro-cyclical against variable income |
| Schedule | Calendar date | Payday drifts — weekends, Lebaran |
| Insufficient balance | Only "tip: make sure it's enough" | **Failure path undefined** — fails precisely in the month that matters most |
| Priority | None | Emergency Fund and Travel compete as equals |

**The missing construct: a waterfall** — an ordered cascade where each tier fills before the next receives anything, and a shortfall stops at a known, named point. Never pro-rata, never silent. The pattern already exists in `CapitalWaterfall.tsx`.

### Our structural advantage: reconciliation

Jago executes the allocation but can only see Jago. We can't execute, but we ingest **BCA, Superbank, NeoBank, Wise, and Jago** — so we can do what Jago structurally cannot:

> "You planned Rp 3M to Emergency Fund on the 25th; Rp 1.2M arrived."

A sentence their product can never produce. Our feature is therefore **an allocation plan plus monthly reconciliation** — closer to an Investment Policy Statement for household cash than to a budgeting app: pre-commit the rule while calm, then measure adherence.

### The layperson-friendly revision

Governing principle: **simplify what the user does, not what the math does.**

50/30/20 was rejected — it originates in *All Your Worth* (Warren, 2005), a US cost structure. In Jakarta, rent/mortgage plus commuting frequently exceeds 50% on its own. Hardcoding it would violate the spirit of FIN-02. The solution is to use no rule of thumb at all: derive from the user's own 3-month median. The most honest approach happens to also be the one requiring the least input.

**Remaining user input: one slider, once.**

### Three screens

**Screen 1 — Setup (once, ~20 seconds)**

```
Here's what your last 3 months look like:

  🔒 Committed   Rp 4,200,000   (your average bills)
  😌 Free        Rp 3,100,000   (your average day-to-day)
  🛡️ Future      Rp   700,000   (what's left)

  Want to save more?  [ ─────●──── ]  Rp 1,000,000

              [ Use this ]
```

**Screen 2 — Daily (primary screen)**

```
        Daily remaining
        Rp 138,000

  😌 Free  ████████░░  Rp 1.9M left · 14 days to go
  after Committed & Future
```

**Screen 3 — Month end (reconciliation)**

```
  This month

  🔒 Committed   ✓ all paid — 3 months running
  🛡️ Future      ████████░░  Rp 600K of Rp 1M
  😌 Free        over by Rp 240K — biggest: Eating out
                 (Rp 1.1M, usually Rp 700K)

  Start next month at Rp 1.2M Future?  [Yes] [Later]
```

### 10 Guardrails (acceptance criteria)

Invisible to the user (cost: zero):

1. Buckets derived from the **median** of 3 months — not the mean; one Ramadan month must not set the grocery budget. Show where the number came from.
2. *(see prerequisite)*
3. Liquidity sums **across** buckets — the emergency fund must not appear smaller because it is split. Add a test asserting this.
4. Committed/Free becomes the essential/discretionary split feeding the L2 emergency-fund denominator.
7. `decimal` end to end (FIN-01).
8. Percentage-of-income with a floor, not a fixed nominal.
9. Internal waterfall, fixed order: Committed → Future → Free. A shortfall stops at a named point — never pro-rata, never silent.
10. Trigger on detected income arrival; calendar date is fallback only.

Must be visible (this is honesty, not complexity):

2. **Fix `savingsGoal = 0m`** — prerequisite, not follow-up.
5. Over-budget renders as over-budget, never green (FIN-04).
6. No archetype, no "you're ready to invest" claim.

> **Go/no-go:** validate categorization accuracy for Committed vs Free against 3 months of real
> transactions first. If it misfires, the whole feature becomes an inaccurate nag.

---

## 2 · Compliance Gate — SHIP WITH CHANGES

Sits at **level 2–3** on the advice gradient (personalized measurement) — no instrument, no projection, no return. Does not approach OJK's *Penasihat Investasi* boundary. Zero tax figures appear on any of the three screens.

### Required changes

1. **Reword the daily label:** "Safe to spend today" → **"Daily remaining after Committed & Future"** — measurement framing, not permission. Applies to the already-shipped "Safe to Spend" label too.
2. **Derivation caveat on Screen 1:** *"Estimated from your transaction categories — check and adjust anything that looks wrong."* A categorization guess must not present as settled fact (same failure class as FIN-04).
3. **Fix `savingsGoal = 0m`** — a correctness bug, not merely quality debt.
4. **Screen 3 visual check:** "over by Rp 240K" must not share treatment with "✓ all paid."
5. **Do not** add a Desk-style disclaimer — bolting "not investment advice" onto a cash-flow calculator is theatre, and it trains users to ignore disclaimers where they do matter.

### Privacy

⚠️ The Jago screenshots in `docs/features/budgeting/` contain **real account numbers**. This repo is heading open-source (PF-122) and has already had one PII purge (PF-126/127). **Redact or remove before publishing.**

Once the Future bucket is ever attached to an instrument (deposit, SBN), the `/compliance tax` gate reopens — 20% vs 10% final tax inverts the ranking.

---

## 3 · UX Review — REFINE

Emotional context: mild money anxiety. The user opens this hoping for reassurance and fearing a guilt trip. Anything that feels like homework or scolding gets abandoned.

### What works

- One number, one screen (Hick's Law) — the existing `SafeToSpendCard` pattern is retained.
- Slider with a visible counterweight — the trade-off is taught pre-attentively, no copy needed.
- Derived defaults instead of blank forms.
- Emoji as bucket identity — with 3 items they work as pre-attentive anchors.
- "Biggest driver" names one category, not five.

### Blocking

| # | Finding | Fix |
|---|---|---|
| 1 | **The exhausted-Free state is undesigned.** "−Rp 43,000" in red is a guilt screen, appearing exactly when the design matters most. | Switch the *message*, not just the color: "You've used this month's Free — X days left, spend only as needed." Amber; red is reserved for Committed at risk. A negative number is never the hero. |
| 2 | **The slider permits promises the user's history contradicts.** Free pushed below its median designs in a week-3 failure, which Screen 3 then reports as the user's fault. | Soft floor below ~80% of median: "You usually spend Rp 3.1M — sure that's enough?" Allow it, but make the history visible at the moment of the promise. |
| 3 | **Screen 3 opens with the failure.** Users who feel judged don't come back next month. | Lead with the strongest true positive; always attach a shortfall's cause on the same line — cause-attached reads as explanation, bare reads as verdict. |
| 4 | **Two vocabularies coexist.** The old English accounting breakdown vs Committed/Future/Free — two mental models for the same numbers. | Replace, don't add. `SafeToSpendCard` retires or is rewritten in bucket vocabulary in the same release. |

### Should fix

- Keep the hero label short ("Daily remaining"); push the derivation down to caption weight.
- Make Screen 1's three numbers tappable → bottom sheet with top-5 categories and a "move to another bucket" toggle. A caveat with no affordance is anxiety without agency.
- Cold start under 2 months of data → watch mode: "We're still learning your transactions" (FIN-04: unevaluated renders as unevaluated).
- Full number format for anything acted on today; "M/K" abbreviations only in summaries.
- `spendingAnalysisApi.ts` never checks `r.ok` — the error state is unreachable, and a 500 surfaces as `NaN`.

### Psychology notes

- **Fresh-start effect:** the "raise Future next month?" nudge belongs on Screen 3 — one tap, pre-filled, at peak motivation.
- **Goal-gradient:** Future gets the only progress bar in the feature; "60%" as text triggers nothing.
- **Silent failure:** the existing error UI can never render because the fetch layer swallows the error.

### State coverage

| State | Status |
|---|---|
| Empty (new user) | ❌ needs watch mode |
| Loading | ✅ skeleton exists |
| Error | ⚠️ exists but unreachable |
| Partial data (1–2 months) | ❌ same as cold start |
| Free exhausted | ❌ **most important state — blocking #1** |

---

## Buckets vs Goals

A distinction worth keeping explicit, because conflating them is Jago's actual design flaw.

| | Bucket (Committed/Future/Free) | Goal (House Rp 500M, Hajj 2031) |
|---|---|---|
| Measures | Flow per period | Accumulated balance |
| Cycle | **Resets monthly** | **Accumulates once, then closes** |
| Answers | "Can I spend today?" | "When do I get there?" |
| Horizon | None — always this month | Has a date; that's the definition |
| Appropriate instrument | Cash, always | Depends on horizon |
| Pyramid level | L1–L2 | L2 (emergency fund) through L4 |

**Why this matters structurally:** a bucket must be cash — the money is spent within 30 days, there is no horizon over which to take risk. A 15-year goal held in cash is a certain loss: deposit interest net of 20% final tax, run through `real_return = (1+nominal)/(1+inflation) − 1`, is negative in real terms and compounds that way for 15 years.

**The one exception:** the emergency fund is a goal that **must stay in cash** — not because its horizon is short, but because its draw date is *unknown*. Horizon isn't only "how long," it's "do I know when."

**How they connect:** the Future bucket is the tap; goals are the buckets it fills.

```
Income
   │
   ├─ 🔒 Committed  → leaves this month
   ├─ 😌 Free       → spent this month (resets)
   └─ 🛡️ Future     → flows into goals
                         ├─ Emergency fund (cash, mandatory)
                         ├─ House 2033 (investable)
                         └─ Hajj 2031
```

Jago runs both jobs through identical mechanics — "Daily essentials" (a bucket) and "New House" (a goal) share the same UI, same Set Target, all cash, no horizon anywhere. That is why their Auto-Budgeting treats Emergency Fund and Travel as equal destinations: a system that can't distinguish the two has no basis on which to prioritize.

**Status:** Goals do not exist in the product yet — no `types/Goal.ts`, no goals route. Recommendation is to **build buckets first and keep the two separate** when goals arrive. A goal without a funding tap is a wishlist with a progress bar, which is the pattern that makes users feel like failures. When goals are built, one non-negotiable: **every goal carries a target date**, because that date determines which instruments are permissible. A goal without a horizon is a bucket in disguise.

---

## Next Steps

1. **Validate categorization** — go/no-go for the entire feature.
2. **Ticket 1:** `savingsGoal` fix + label rewording + `r.ok` check (small, ships independently).
3. **Ticket 2:** the 3-bucket model — median derivation, slider with soft floor, internal waterfall, watch mode.
4. **Ticket 3:** Screen 3 reconciliation + fresh-start nudge.
5. **Redact the Jago screenshots** before the repo goes public.
