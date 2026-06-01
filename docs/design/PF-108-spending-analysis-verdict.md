# PF-108 Spending Analysis — Unified Pick List

## Context

Two teams pitched competing visions for the Spending Analysis feature. Both converged on the same #1 (Safe-to-Spend), but diverged on the spicy stuff. This doc picks the ideas that ship — favoring **decision-shaped, forward-looking, behavior-changing** features over rearview-mirror dashboards.

Filtering criteria:
1. **Drives a next action** (not just a feeling)
2. **Not boring** — something a user would screenshot and share
3. **Leverages what we already have** — AI service (live), Assets Management (just shipped in PF-107), existing transaction spine
4. **Single-user reality** — this is a self-hosted app for one Indonesian user with 5 bank accounts. Anything requiring cohort data is fake.

---

## ✅ IN — Core (build first, in order)

### 1. Safe-to-Spend Number — *Team A's framing*
The killer metric. Both teams led with this, correctly. Math: `(expected income − committed bills − savings goal − discretionary baseline) / days remaining`. Single number at the top, updates live, goes red when crossed.

**Reject Team B's speedometer viz.** Gimmicky. Just show the number with a color and a delta. Speedometers are what banks do when they don't trust their own data.

### 2. Variance Explainer — *Team A only* 🏆
"You spent 1.8M more than your 3-month average, driven by: Grab +600k, Dining +400k, IKEA +800k (one-off)." Decompose variance, separate trend from one-offs. This is the CFO-grade insight nobody builds. Pairs perfectly with Safe-to-Spend: one answers *"am I okay?"*, the other answers *"if not, why?"*

### 3. Subscription & Price-Creep Radar — *Both, Team A's framing is sharper*
Auto-detect recurring patterns. Surface: (a) total monthly sub burden as % of income, (b) price creep alerts (Netflix 186k → 220k), (c) "cancel X, save Y/year" with attribution.

**Indonesian context matters here**: lots of small IDR subs (Spotify, GoPay+, Tokopedia Plus, Netflix Mobile) hide in the noise. This is the screen that produces a *concrete attributable saving* — which is what drives retention past month 2.

---

## 🌶️ IN — Spicy (the "not boring" picks)

### 4. Joy vs Regret Matrix — *Team B only* 🏆
Tinder-style swipe on discretionary transactions: right = joy, left = regret. Over time, build a 2x2 (High Cost / Low Joy is the danger quadrant). This is the **single boldest idea in either deck** — it reframes spending from accounting to emotional value. Nobody else does this. Users will screenshot it.

**Risk:** swipe fatigue. Mitigation: only prompt on discretionary >50k IDR, max 3/day, dismissible.

### 5. Opportunity Cost Visualizer — *Team B only* 🏆
"That 150k/mo unused subscription = ~25M IDR in 10 years at 7%." **This is our unique moat** — we just shipped PF-107 Assets Management with TWRR/IRR. Nobody else can bridge cashflow → wealth this credibly because they don't have the asset side. Reframes deprivation as funding-your-future-self. Ship it.

### 6. Micro-narratives on Home — *Team A's framing > Team B's Stories*
Render insights as sentences, not charts: *"You're on track this week. ☕ Coffee spend 30% above usual — 4 Fore visits vs your usual 2."* LLMs make this trivial and **our AI service is already wired**. Charts go in drill-down.

**Reject Team B's Spotify-Wrapped weekly stories format.** Swipeable confetti slides are a notification-engagement play that works for B2C consumer apps with millions of users. Single-user self-hosted = the slide deck is overkill. Inline sentences on the home screen do the same job with 10% of the work.

---

## ❌ OUT — Cut these

| Idea | Why cut |
|---|---|
| **Peer/Cohort Benchmarking** (both teams) | Single-user app. No cohort data. Synthesizing fake peers = lying to yourself. Skip. |
| **Cashflow Calendar with drag-to-simulate** (Team A) | Nice-to-have but not "not boring." Defer to v2. |
| **Lifestyle Inflation YoY trace** (Team A) | Needs multi-year history we don't have yet. Revisit in 2027. |
| **Money on Autopilot Score** (Team A) | Redundant with Safe-to-Spend. One forward-looking score is enough. |
| **Pie charts of categories** | Team A correct: everyone builds it, nobody acts on it. |
| **Hard-limit budgets** | Team A correct: high abandonment, guilt-driven. |
| **Monthly PDF reports** | Team A correct: email graveyard. |
| **Burndown speedometer** (Team B) | Replace with plain number + delta. |
| **Weekly Stories carousel** (Team B) | Replaced by inline micro-narratives. |

---

## 🏗️ Architectural take (from Team B, adopted)

**Insight Cards as backend events.** Don't compute insights on-the-fly in the UI. The AI service / a backend worker generates `Insight` records (`SubscriptionCreep`, `PositiveTrend`, `VarianceSpike`, `JoyRegretPrompt`, etc.) and writes them to a table. Frontend just fetches a feed of pre-computed cards.

This fits cleanly into our existing event-driven architecture (Storage → Webhook → AI service → Supabase → Realtime → frontend). Insights become first-class records with type, severity, payload, and read-state.

---

## Build order

| Phase | Ships | Why |
|---|---|---|
| **MVP (PF-108)** | Safe-to-Spend + Variance Explainer | Answers "am I okay / why not" — 80% of the value |
| **v1.1** | Subscription & Creep Radar | First feature that produces attributable savings |
| **v1.2** | Micro-narratives + Insight Cards backend | Activates the AI service for ambient insight |
| **v1.3** | Opportunity Cost Visualizer | Bridges to PF-107 Assets, demonstrates the moat |
| **v1.4** | Joy vs Regret Matrix | The screenshot moment. Saved for last because the data model is exploratory. |

---

## Verification

Not applicable — this is a product-strategy decision, not an implementation plan. The next step is to break the MVP (Safe-to-Spend + Variance Explainer) into a separate `PF-108-mvp-implementation.md` plan with concrete file paths, DTOs, and endpoints.
