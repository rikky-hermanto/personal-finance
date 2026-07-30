# Trading Risk OS — Design Plan

Source spec: `docs/ideas/trading-plan/CLAUDE_CODE_LOCAL_TRADING_RISK_OS_PROMPT.md`
Seed data: `CURRENT_INVESTMENT_RECAP_2026-07-30.md`
Target codebase: `apps/frontend` (React 18 + Vite + TS, Tailwind + shadcn, lucide, recharts)

---

## 1. What the spec actually asks for

Six screens (Command Center, Accounts & Portfolio, Risk Mandate, Pre-Trade, Journal, Reconciliation), but the product only has **one real job**: stop the user from taking a trade that violates the mandate. Everything else is supporting evidence.

Three ideas carry all the weight and must be visually unmissable:

1. **Buying power ≠ capital.** Mandiri shows Rp1.4B trade limit against Rp785M equity. The UI has to make that impossible to confuse.
2. **Active Trading NAV is a separate, approved number.** Not NAV. Not consolidated. Risk budget derives only from it.
3. **The gate is global.** A loss limit hit on Stockbit blocks Binance and IBKR.

Current state of the portfolio makes this emotionally loaded: **-33.00% unrealized, BBRI at 52.12% of listed value, zero stops on anything.** First-run is not a happy path — it's a triage screen.

## 2. Conflicts with the existing app (decide before building)

| # | Conflict | Options |
|---|---|---|
| C1 | Spec wants graphite/navy dark risk-desk. App default is warm zen light (`#F5F3EE`), dark mode is Toloshi near-black. | (a) drop dark, use zen light tokens; (b) feature runs as a dark "desk mode" regardless of app theme; (c) respect app theme, tune Toloshi dark to be denser |
| C2 | `/investment` already owns Overview / Holdings / Snapshots / AI Review. Spec's "Accounts and Portfolio" duplicates Holdings. | (a) new top-level nav under L3 Growth; (b) new tabs inside `/investment`; (c) separate "desk mode" route outside the pyramid nav |
| C3 | App has AI Chat + AI Review. Spec explicitly bans AI trade recommendations. | Keep the AI panel hard-disabled inside this feature, or allow read-only explanation of a gate result only |
| C4 | Existing app radius 12px, card-heavy, generous spacing. Spec wants compact data density + tabular numerals. | Introduce a scoped density scale (`--radius: 4px`, 12/13px type) only inside the feature |

## 3. Three design directions

### Direction A — "Governance Console"
**Idea:** the mandate is a policy document; the gate is an audit report.

- IA: new L3 nav item **Trading Desk**, 6 sub-tabs mirroring the spec 1:1.
- Aesthetic: existing zen light tokens, but compact — 4px radius, hairline rules instead of cards, tabular numerals, currency columns right-aligned on the decimal.
- Gate: **all 13 hard-block rules always rendered as a ledger**, never collapsed. Each row = rule name · your value · limit · headroom · state icon+text. Passing rules stay visible in grey so the user learns the ruleset.
- Mandate screen looks like a versioned policy doc with diff-against-previous-version.

Best at: trust, learnability, review-later legibility. Cheapest to build, blends with the app.
Weakest at: urgency — a light document doesn't *feel* like a circuit breaker.

### Direction B — "Risk Desk mode"
**Idea:** entering the feature switches the app into a cockpit.

- IA: `/desk` route; sidebar collapses to a 48px icon rail, chrome goes graphite/navy per spec §14.
- **Persistent global gate bar** pinned across the top of every screen in the mode: state (PASS / WARNING / BLOCKED), drawdown regime + multiplier, portfolio heat, remaining daily loss headroom, risk budget left. It never scrolls away.
- Command Center is a fixed non-scrolling tile grid — everything above the fold.
- Pre-Trade is a **full-height right drawer over the dashboard**, so heat and headroom stay in view while sizing. Quantity recalculates per keystroke; the "Why this quantity?" breakdown is a permanent panel, not a tooltip.
- Status never encoded by colour alone: state chips carry a glyph + word.

Best at: making the global, always-on nature of the limits felt. Closest to the spec's stated aesthetic.
Weakest at: coherence with the rest of the app; two visual systems to maintain.

### Direction C — "Capital Waterfall"
**Idea:** the home object isn't a dashboard, it's the derivation of the risk budget.

- Home screen is one horizontal waterfall, left to right:
  `Tentative NAV Rp1,064,953,064` → *unresolved Stockbit cash −Rp33,178,117* → `Reconciled NAV` → split into **Core / Active Trading / Reserve / Legacy** buckets → `Active Trading NAV` → × risk % × drawdown multiplier → **`Risk budget per trade`** → − open risk → **`headroom left today`**.
- Buying power / trade limit sits **off the waterfall entirely**, in a struck-through side rail labelled *not capital* — the Rp1.4B is shown but visibly excluded.
- Every unresolved item is an interactive node: click the Stockbit −Rp33M to resolve it and watch the whole chain recompute. Reconciliation stops being a chore screen and becomes the way you unlock capital.
- First run is a forced 4-step triage: Reconcile → Classify every position into a bucket → Set mandate → Approve Active Trading NAV. Gate stays BLOCKED until step 4.
- Pre-Trade opens from the Active bucket, inheriting the same waterfall as its sizing explanation.

Best at: teaching the three ideas from §1; unique; makes the first-run blocked state meaningful instead of annoying.
Weakest at: most design work; the waterfall must degrade gracefully at tablet width; risk of feeling wizard-y on repeat visits.

## 4. Recommendation

**C as the concept, B as the chrome, A as the gate report.**

- Command Center hero = the capital waterfall (C), with spec's metric tiles as a secondary row.
- Feature runs in dark desk mode with the persistent global gate bar (B) — this is the one place the app is allowed to break from zen light, because the content is adversarial by nature.
- Pre-Trade gate output = the full always-visible rule ledger (A), not a badge.
- Nav: new L3 item **Trading Desk** under Growth, sibling to Investments; Accounts & Portfolio reads the same holdings source as `/investment/holdings` rather than duplicating it.

Fallback if you want minimal divergence from the current app: **A alone** — same six screens, zen light, ships fastest.

## 5. Proposed prototype scope (HTML, clickable)

One file, real interaction on the parts that carry risk of being wrong:

1. **First-run triage** — blocked state, Legacy/Unclassified everything, unbounded-risk flags.
2. **Command Center** — waterfall + tiles + concentration (BBRI 52.12%) + reconciliation alerts.
3. **Pre-Trade** — live sizing on a real IDX case (lot rounding), with three switchable outcomes: PASS / WARNING (<2R) / BLOCKED (no stop, or daily limit hit).
4. **Reconciliation** — resolve Stockbit Rp33,178,117 and watch NAV + risk budget change.
5. Journal + Mandate at layout fidelity only (static), unless you want them live.

Tweaks to expose: theme (desk dark / zen light), gate state, drawdown regime, density, waterfall vs tiles as hero.

## 6. Open questions

See the question form.
