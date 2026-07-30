# Trading Risk OS — Prototype Build Spec

**Status:** locked, ready to build. Do not re-litigate the direction.
**Deliverable:** one clickable HTML prototype in this project (not the production app).
**Source spec (features only, UX discarded):** `docs/ideas/trading-plan/CLAUDE_CODE_LOCAL_TRADING_RISK_OS_PROMPT.md`
**Seed data (authoritative numbers):** `docs/ideas/trading-plan/CURRENT_INVESTMENT_RECAP_2026-07-30.md`
**Design rationale (why these choices):** `docs/trading-risk-os-design-plan.md`

---

## 0. Locked decisions

| # | Decision | Value |
|---|---|---|
| D1 | Direction | Hybrid — Capital Waterfall as concept, desk chrome as shell, rule ledger as gate output |
| D2 | Theme | Follow app theme (zen light + Toloshi dark). **No separate dark desk theme.** Density is scoped tighter inside the feature only |
| D3 | IA | New tabs inside existing `/investment`, not a new nav item |
| D4 | First run | Triage checklist, persistent, dismissible overlay — not a modal wizard. Gate stays `BLOCKED` until step 4 |
| D5 | Command Center hero | Capital waterfall, metric tiles as second row |
| D6 | Gate output | Full rule ledger always rendered; blocking reasons pinned above, passing rules listed in grey below |
| D7 | AI | Read-only explanation of a gate result. No sizing suggestions, no trade ideas, no "should I" |
| D8 | Density | Scoped compact: `--radius: 6px`, 12/13px body, hairline rules, tabular numerals |
| D9 | Language | Full English UI. Two Indonesian disclaimer strings are kept verbatim (§11) |
| D10 | Drawdown basis | Regime is measured on the **Active Trading NAV equity curve**, not consolidated NAV. Legacy unrealized loss (−33%) does not put the desk into Risk Freeze on day one |

---

## 1. The one job

Stop the user from taking a trade that violates the mandate. Everything else is supporting evidence.

Three ideas must be visually unmissable in the prototype:

1. **Buying power ≠ capital.** Mandiri shows Rp1.404.710.882 trade limit against Rp784.938.962 equity.
2. **Active Trading NAV is a separate, approved number.** Risk budget derives only from it.
3. **The gate is global.** A daily loss limit hit on Stockbit blocks Binance, Mandiri and IBKR.

The current portfolio makes first run a triage screen, not a happy path: **−33.00% unrealized, BBRI at 52.12% of listed value, zero stops on anything.**

---

## 2. Information architecture

Feature lives as a tab group inside `/investment`. Existing tabs stay untouched.

```
/investment
  Overview | Holdings | Snapshots | AI Review        ← existing, unchanged
  ──────────────────────────────────────────────
  Desk › Command | Portfolio | Mandate | Pre-Trade | Journal | Reconcile
```

- The `Desk ›` group is visually separated from the existing tabs by a divider and a small `Desk` label.
- **Accounts & Portfolio does not duplicate Holdings.** It reads the same positions and adds only desk columns: sleeve, stop, risk status, legacy flag.
- Entering any Desk tab collapses the left sidebar to a 48px icon rail (this is the only "desk chrome" concession) and pins the global gate bar. Leaving restores the sidebar.

---

## 3. Design system contract

### 3.1 Tokens — inherit, do not invent

Copy the `<style>` token block and `tailwind.config` verbatim from `Journey & Cashflow.html`. Reuse `pf-icons.jsx`.

Relevant existing tokens:

| Token | Light | Dark | Use in desk |
|---|---|---|---|
| `--background` | `42 17% 94%` | `240 10% 3%` | canvas |
| `--card` | `0 0% 100%` | `240 6% 8%` | panels |
| `--border` | `39 18% 88%` | `240 6% 12%` | hairlines |
| `--muted-foreground` | `0 0% 42%` | `210 8% 50%` | secondary/labels |
| `--success` | `170 90% 32%` | same | PASS / normal / headroom remaining |
| `--warning` | existing | existing | WARNING / caution regime |
| `--destructive` | `354 91% 65%` | same | BLOCKED / loss / breach |

### 3.2 Scoped density

Wrap every desk screen in `.desk-scope` and override inside it only:

```css
.desk-scope{--radius:6px;font-size:13px;line-height:1.35}
.desk-scope .num{font-variant-numeric:tabular-nums;font-feature-settings:'tnum';text-align:right}
.desk-scope .rule{border-bottom:1px solid hsl(var(--border))}
```

- Type scale: `11` (labels/uppercase eyebrow) · `12` (table body) · `13` (body) · `15` (panel titles) · `20` (metric value) · `28` (hero waterfall terminal value).
- Panels are hairline-bordered surfaces, not shadowed cards. Drop `.pf-card` shadow inside the desk.
- Spacing scale inside desk: 4 / 8 / 12 / 16 / 24 only.
- Content max-width 1440px, 12-column grid, 16px gutters.

### 3.3 Status encoding — never colour alone

Every state chip = glyph + word + colour.

| State | Glyph | Word | Colour |
|---|---|---|---|
| Pass | `check` | PASS | success |
| Warning | `triangle-alert` | WARNING | warning |
| Blocked | `octagon-x` | BLOCKED | destructive |
| Unresolved | `circle-dashed` | UNRESOLVED | muted |
| Not capital | `slash` | NOT CAPITAL | muted, struck-through value |

### 3.4 Number formatting

| Kind | Format | Example |
|---|---|---|
| IDR | `id-ID` grouping, no decimals in tables | `Rp784.938.962` |
| IDR precise (tooltip/detail) | 2 decimals | `Rp784.938.961,72` |
| USD | `en-US` | `$7,793.85` |
| SGD | `en-US` | `S$12.38` |
| Percent | 2 decimals, signed | `−31.39%` |
| R multiple | 2 decimals + R | `2.43R` |
| Lots | integer + unit | `15 lots (1.500 shares)` |

All currency columns right-aligned, tabular, decimal-aligned. Negative values use a real minus `−`, not a hyphen, and destructive colour **plus** parentheses is not used — sign is enough given tabular alignment.

---

## 4. Global components

### 4.1 Gate bar (sticky, 44px, every Desk tab)

Single row, never scrolls away, left → right:

`[STATE chip] · Regime: Normal 1.00× · Heat 0.83% / 2.00% · Daily headroom Rp1.000.000 · Risk budget Rp500.000 · Active NAV Rp100.000.000 [pencil]`

- Clicking the state chip opens the rule ledger drawer from the right.
- When `BLOCKED`, the bar takes a 2px destructive top border and the reason count: `BLOCKED · 3 reasons`.
- Heat and headroom render as thin inline meters (4px tall, 64px wide) behind the number.

### 4.2 Rule ledger

The single source of gate truth. Used inline in Pre-Trade (right column) and in the drawer from the gate bar.

Row anatomy: `state glyph · rule name · your value · limit · headroom · [why]`

- Blocking rows pinned top, warning rows next, passing rows below in `--muted-foreground` — **never collapsed away by default**. A `Show passing (9)` toggle is allowed but defaults to open.
- `[why]` expands one line of plain-English derivation, e.g. *"Position value Rp10.710.000 ÷ Active NAV Rp100.000.000 = 10.71%, limit 10.00%."*
- Every row always shows a limit and headroom even when passing. This is how the user learns the ruleset.

### 4.3 Capital waterfall

Horizontal, left → right, on Command Center. Each node is a labelled block with value; connectors are hairlines; deductions drop below the baseline.

```
Tentative NAV            Rp1.064.953.064
  − Stockbit cash            −Rp33.178.117   ← UNRESOLVED, clickable
Reconciled NAV           Rp1.031.774.947
  → buckets   Core · Active Trading · Reserve · Legacy
Active Trading NAV         Rp100.000.000   ← APPROVED, the only denominator
  × risk/trade 0.50%
  × drawdown multiplier 1.00×
Risk budget / trade           Rp500.000
  − open risk                 −Rp830.000  (heat 0.83%)
Daily headroom left         Rp1.000.000
```

**Side rail, off the waterfall:** `Broker trade limit Rp1.404.710.882` — struck through, `NOT CAPITAL` chip, one-line note: *Buying power is not your money. Risk limits derive from Active Trading NAV.* This rail must be visually detached (dashed border, muted, offset to the right) so it reads as excluded, never as a step.

Interactive nodes: any node with `UNRESOLVED` or `UNAPPROVED` state is clickable and recomputes the whole chain downstream with a 300ms number transition.

### 4.4 Triage checklist (first run)

Four steps, shown as a right-hand rail on Command Center plus a dismissible overlay on very first load:

1. **Reconcile** — 4 open issues
2. **Classify** — 11 positions in Legacy / Unclassified
3. **Set mandate** — Conservative Personal Trader preset, unapproved
4. **Approve Active Trading NAV** — required to unblock the gate

Rules: steps can be done in any order; overlay is dismissible; the rail persists until all four are done; gate stays `BLOCKED` with reason *"Active Trading NAV has not been approved"* until step 4.

---

## 5. Screens

### A. Command Center

```
┌ gate bar ─────────────────────────────────────────────────────────┐
├ HERO: capital waterfall ──────────────────────┬ trade-limit rail ─┤
├ tiles (7, one row) ───────────────────────────────────────────────┤
├ concentration ──────┬ unbounded risk ─────┬ reconciliation alerts ┤
├ capital buckets ────┴ broker / asset-class / currency split ──────┤
```

Tiles row (compact, label 11px + value 20px + delta 12px): Tentative NAV · Reconciled NAV · Active Trading NAV · Total cash · Open risk · Portfolio heat · Today's global P&L.

- **Concentration panel:** horizontal bars, BBRI 52.12% flagged against the 10.00% single-name limit — label it `LEGACY — exempt from new-trade limits, blocks additions`. This is the emotional centre of the screen; do not bury it.
- **Unbounded risk panel:** count `11 of 11 positions have no stop`, listed compactly.
- **Reconciliation alerts:** 4 items, each linking to Reconcile tab.
- Charts only where a relationship beats a table: allocation splits = stacked single bars, not donuts. No sparkline decoration.

### B. Portfolio

Consolidated table, one row per position. Columns:

`Broker · Symbol · Class · Qty (lots) · Avg · Last · Cost IDR · MV IDR · P&L IDR · P&L % · Weight · Sleeve · Stop · Risk status · Flags`

- Group-by control: Broker / Sleeve / Asset class / Currency / Sector.
- Foreign rows show native and IDR on two lines in the same cell (native muted, 11px above IDR).
- Sleeve is an inline editable select — this is how step 2 of triage gets done.
- `Risk status` = `UNBOUNDED` when `stop == null`.
- No buy/sell suggestions anywhere. No target-price column.

### C. Mandate

Two columns: parameter form left, version history right.

- All 17 parameters from the source spec §7, preset `Conservative Personal Trader`.
- Editing an approved mandate creates **v(n+1) draft**; historic versions are read-only.
- Version card: number, status chip, effective date, change reason, approved-at.
- **Diff view:** selecting two versions shows changed parameters only, old → new, with an arrow and a colour for tighter/looser.
- Approval requires a checkbox + reason text; the button stays disabled until both are filled.

### D. Pre-Trade

Three columns, fluid: **inputs 380px · sizing centre · gate ledger 420px.** Recalculates every keystroke, no submit button for the calculation.

Inputs: account · sleeve · symbol · asset class · currency · side · strategy · setup · entry · stop · target · buy fee % · sell fee % · slippage % · available cash · quantity step · correlation group · thesis · invalidation.

Centre — "Why this quantity?" is a **permanent panel, not a tooltip**, rendered as a constraint race:

```
Risk budget           Rp500.000
Stop distance         Rp250 (3.97%)
Fee + slippage        Rp30,88 per share
Unit risk             Rp280,88
─────────────────────────────────────
Risk-sized            1.780 sh   →  17 lots
Exposure cap (10%)    1.587 sh   →  15 lots   ← BINDING
Cash cap              5.930 sh   →  59 lots
─────────────────────────────────────
Final                 1.500 sh   =  15 lots
```

The binding constraint is marked. Below it: planned position value, planned loss, planned reward, R:R, exposure %, resulting portfolio heat — each with its limit beside it.

Right column: the rule ledger (§4.2), all rules, always.

Bottom bar: `Save trade plan` (disabled when BLOCKED, with the reason inline), `Save as draft`, and the Indonesian planned-loss disclaimer.

### E. Journal

- Table: date · symbol · broker · strategy · planned vs actual qty · entry · exit · net P&L · realized R · compliance chip · mistake tags.
- Create-from-plan action on approved plans.
- Stats strip: closed trades · win rate · avg win R · avg loss R · expectancy R · profit factor · compliance rate.
- With fewer than 30 closed trades, the strip renders values **greyed with a persistent banner**: `Sample size not yet sufficient (8 of 30 closed trades).`
- Mistake tags from the source spec list, as small chips. `Process compliant` is a positive tag, styled success.

### F. Reconcile & Settings

Per-account rows: reported cash · position MV · liabilities · calculated equity · reported equity · difference · buying power · last update · status.

Four seeded issues, each with an explicit resolution UI:

| Issue | Account | Resolution options |
|---|---|---|
| Duplicate cash section Rp33.178.117 | Stockbit | *Distinct wallet — include* / *Duplicate — exclude* |
| Market value difference Rp20.000 | Mandiri | *Accept broker total* / *Accept row sum* / *Leave unresolved* |
| Instrument unconfirmed | Binance Gold | *Confirm symbol* (text) / *Leave unconfirmed* |
| Estimated cost basis $214.07 | IBKR IBM | *Confirm* / *Edit* |

- Resolving the Stockbit item animates the waterfall and every NAV figure app-wide.
- Settings block: editable USD/IDR (default 18.050) and SGD/USD (default 0,77544) with timestamps and a `STALE` flag; JSON export/restore, CSV export, reset to demo data — all stubbed with a toast in the prototype.
- **Never force totals to reconcile.** Unresolved differences stay visible.

---

## 6. Domain model

Entities exactly as source spec §6: `BrokerAccount`, `CashBalance`, `Position`, `FxRate`, `RiskMandate`, `TradePlan`, `JournalEntry`, `ReconciliationIssue`. In the prototype these live as plain objects in `pf-desk-data.js`; state is React `useState` in the shell, persisted to `localStorage` under key `pf-desk-v1`.

Money: whole rupiah integers. Foreign values keep native decimal + IDR integer. Quantities separate from prices. FX rate explicit with `asOf`.

---

## 7. Seed data (authoritative — do not round differently)

**Accounts**

| Account | Reported equity | Cash | Buying power / trade limit | Status |
|---|---:|---:|---:|---|
| Mandiri Sekuritas | Rp784.938.961,72 | Rp37.359.961,72 | Rp1.404.710.882,16 | Needs reconciliation |
| Stockbit — cash only | Rp33.178.117 | Rp33.178.117 | — | Needs reconciliation |
| Stockbit — stocks | Rp104.243.623 | Rp15.812.623 | — | Reconciles |
| Binance | $7.793,85 → Rp140.679.062,69 | $1,26 | — | Instrument unconfirmed |
| IBKR | ≈$106,00 → Rp1.913.300 | S$12,38 ≈ $9,60 | $9,60 | Estimated cost basis |

**Positions** — all seeded as `Legacy / Unclassified`, all with `stopPrice: null` → `UNBOUNDED`.

| Broker | Symbol | Qty | Avg | Last | Cost IDR | MV IDR | P&L IDR | P&L % | Weight |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Mandiri | ELTY | 18.000 (180 lots) | 102,78 | 29 | 1.850.040 | 522.000 | −1.328.040 | −71,78% | 0,05% |
| Mandiri | GOTO | 907.500 (9.075) | 99,85 | 50 | 90.613.875 | 45.375.000 | −45.238.875 | −49,92% | 4,64% |
| Mandiri | BBCA | 23.300 (233) | 9.969,85 | 6.300 | 232.297.505 | 146.790.000 | −85.507.505 | −36,81% | 15,01% |
| Mandiri | HMSP | 62.600 (626) | 2.121,51 | 715 | 132.806.526 | 44.759.000 | −88.047.526 | −66,30% | 4,58% |
| Mandiri | BBRI | 174.000 (1.740) | 4.270,78 | 2.930 | 743.115.720 | 509.820.000 | −233.295.720 | −31,39% | **52,12%** |
| Stockbit | AADI | 7.100 (71) | 9.963,86 | 9.100 | 70.743.455 | 64.610.000 | −6.133.455 | −8,67% | 6,61% |
| Stockbit | ANTM | 8.300 (83) | 3.560,51 | 2.870 | 29.552.262 | 23.821.000 | −5.731.262 | −19,39% | 2,44% |
| Binance | USDT | 1,26 | $1,00 | $1,00 | 22.723,82 | 22.723,82 | 0 | 0,00% | <0,01% |
| Binance | BTC/USDT | 0,09449 | $71.069 | $64.281,37 | 121.210.541 | 109.634.737 | −11.575.804 | −9,55% | 11,21% |
| Binance | Gold (unconfirmed) | 0,421 | $4.748 | $4.082,30 | 36.078.802 | 31.021.602 | −5.057.200 | −14,02% | 3,17% |
| IBKR | IBM | 0,4265 | ≈$214,07 | $226,25 | ≈1.647.965 | ≈1.738.215 | ≈+90.250 | ≈+5,48% | 0,18% |
| **Total** | | | | | **≈1.459.939.416** | **≈978.114.278** | **≈−481.825.138** | **≈−33,00%** | 100% |

**NAV**

```
Tentative consolidated NAV                Rp1.064.953.064,41
Excluding possibly duplicated Stockbit    Rp1.031.774.947,41
Listed-instrument market value            Rp  978.114.277,70
Tentative cash total                      Rp   86.546.705,54
```

**FX:** USD/IDR 18.050 · SGD/USD 0,77544 · `asOf` 2026-07-30.

**Demo mandate (post-triage state):** Active Trading NAV **Rp100.000.000** (approved, absolute), risk/trade 0,50%, hard ceiling 1,00%, daily 1,00%, weekly 2,50%, monthly 5,00%, normal heat 2,00%, hard heat 3,00%, cluster heat 1,25%, max single stock 10,00%, max crypto/symbol 7,50%, max altcoin 2,50%, min R:R 2,00R, consecutive-loss stop 3, review at 5, leverage off, averaging down off.

**Demo open trades (for heat):** two open plans with initial risk Rp450.000 and Rp380.000 → open risk Rp830.000 → heat 0,83%.

**Demo closed journal:** 8 entries, realized R: `+2,4 / −1,0 / +1,8 / −1,0 / −0,6 / +3,1 / −1,0 / +0,9`. Compliance: 6 of 8. Enough to prove the "sample size not yet sufficient" state.

---

## 8. Calculations

Drawdown regime — measured on Active Trading NAV equity curve (D10):

| Drawdown | State | Multiplier |
|---|---|---:|
| 0–3% | Normal | 1,00× |
| >3–5% | Caution | 0,50× |
| >5–8% | Defensive | 0,25× |
| >8% | Risk Freeze | 0,00× |
| >10% | Mandate Reset | 0,00× |

```
adjustedRiskBudget = activeTradingNav × riskPerTradePercent × drawdownMultiplier

longUnitRisk  = (entry − stop) + entry×slip% + entry×buyFee% + stop×sellFee%
shortUnitRisk = (stop − entry) + entry×slip% + entry×sellFee% + stop×buyToCoverFee%

riskSizedQty      = adjustedRiskBudget / unitRisk
exposureCappedQty = (maxSingleNamePct × activeTradingNav) / entry
cashCappedQty     = availableCash / estimatedEntryCostPerUnit
finalQty          = floorToStep(min(all three))     // IDX step = 100
```

IDX: 1 lot = 100 shares, round **down** to whole lots. US stocks and crypto: fractional, configurable step.

```
plannedLoss   = qty × unitRisk
plannedReward = qty × |target − entry| − estimatedExitCosts
rr            = plannedReward / plannedLoss
exposure%     = (qty × entry) / activeTradingNav
portfolioHeat = Σ openInitialPlannedRisk / activeTradingNav
realizedR     = netRealizedPnl / initialPlannedRisk
expectancyR   = winRate × avgWinR − lossRate × avgLossR
profitFactor  = grossProfit / |grossLoss|
```

**Worked reference case — must reproduce exactly.** BBCA long, entry 6.300, stop 6.050, target 7.000, buy fee 0,15%, sell fee 0,25%, slippage 0,10%, available cash Rp37.359.961.

```
unit risk    = 250 + 6,30 + 9,45 + 15,125 = Rp280,875
risk-sized   = 500.000 / 280,875 = 1.780 sh  → 17 lots
exposure cap = 10.000.000 / 6.300 = 1.587 sh → 15 lots   ← binding
cash cap     = 37.359.961 / 6.309 ≈ 5.921 sh → 59 lots
final        = 1.500 sh = 15 lots
position     = Rp9.450.000 · exposure 9,45%
planned loss = Rp421.313 · reward Rp1.023.750 · R:R 2,43R
heat after   = (830.000 + 421.313) / 100.000.000 = 1,25%
→ PASS
```

Rounding policy to document in-app: quantities floor to step; IDR displays as integers, computes at 2dp; percentages display 2dp.

---

## 9. Gate rules

Hard block (any one → `BLOCKED`): Active Trading NAV unapproved · entry or stop missing · stop invalid for direction · planned risk > permitted risk · daily/weekly/monthly loss limit reached · hard portfolio heat exceeded · correlated-cluster heat exceeded · single-symbol exposure exceeded · insufficient cash · margin required · consecutive-loss breaker active · drawdown risk freeze · adding to a losing legacy position.

Warn: R:R < 2,00R · exposure within 10% of a concentration limit · stale data or FX · sector/correlation group already concentrated · unusually wide stop · low liquidity.

Every rule renders with **input value, applicable limit, and remaining headroom** — including passing rules. A coloured badge alone is a defect.

**Scenario switcher** (a prototype control, not a product feature) must produce these four states on the reference case:

| Scenario | Change | Result |
|---|---|---|
| PASS | reference case | `PASS`, 15 lots, 2,43R |
| WARNING | target 6.600 | `WARNING` — R:R 1,01R below 2,00R minimum |
| BLOCKED — no stop | clear stop | `BLOCKED` — entry or stop missing; quantity renders `—`, never 0 |
| BLOCKED — global limit | today's realized −Rp1.150.000 | `BLOCKED` — daily loss limit Rp1.000.000 reached; banner names all four brokers as blocked |

Add a fifth for teaching: **BLOCKED — add to loser** when symbol = BBRI (legacy, −31,39%).

---

## 10. What must be live vs static

All six screens are built. Live interaction required on:

1. **Triage** — checklist state, sleeve assignment, mandate approval; gate flips `BLOCKED → PASS` on step 4 completion.
2. **Command Center** — waterfall recomputes from state; tiles derive, never hardcoded.
3. **Pre-Trade** — full sizing engine on every keystroke; five scenarios above.
4. **Reconcile** — resolving Stockbit Rp33.178.117 recomputes NAV chain with animated transition. If Active NAV is set to *derive as % of reconciled NAV* (toggle), the risk budget recomputes too; in absolute mode the Active NAV node flags `SOURCE CHANGED — re-approve?` instead. **This distinction is a teaching moment; build both paths.**
5. **Mandate** — edit → new draft version → approve → diff renders.
6. **Journal** — filter by strategy/broker/symbol; stats recompute; create-entry-from-plan.

---

## 11. Copy

Two strings stay in Indonesian, verbatim, non-negotiable:

> Buying power bukan modal sendiri. Batas risiko dihitung dari Active Trading NAV, bukan trade limit broker.

> Planned loss bukan jaminan maximum loss. Gap, slippage, likuiditas, dan kegagalan eksekusi dapat menghasilkan kerugian lebih besar.

Permanent footer on every Desk screen:

> Risk-control and planning tool. Bukan sistem eksekusi order, bukan penasihat investasi, dan tidak menjamin kerugian tidak terjadi.

Everything else English. Tone: flat, declarative, no exclamation, no encouragement, no gamification language. This feature does not participate in the Journey/garden reward loop.

---

## 12. Tweaks to expose

Use the tweaks panel starter. Controls:

- **Scenario** — PASS / WARNING / BLOCKED no-stop / BLOCKED daily limit / BLOCKED add-to-loser
- **Drawdown regime** — Normal / Caution / Defensive / Risk Freeze (drives the multiplier live)
- **Gate state** — force override, for screenshotting
- **Reconciliation** — Stockbit unresolved / included / excluded
- **Active NAV mode** — absolute / % of reconciled NAV
- **Density** — compact / comfortable
- **Hero** — waterfall / tiles-first
- **Triage** — first run (blocked) / completed
- **Theme** — light / dark (drives the existing `.dark` class, nothing custom)

---

## 13. Files

Follow the existing project pattern: one HTML shell + Babel JSX scripts, each under ~400 lines.

```
Trading Desk.html          shell, tokens copied from Journey & Cashflow.html, script tags in order
pf-desk-data.js            seed data + pure calculation functions (window.DESK)
pf-desk-shell.jsx          icon rail, tab group, gate bar, footer, state + localStorage
pf-desk-waterfall.jsx      capital waterfall + trade-limit rail + tiles
pf-desk-command.jsx        Command Center panels + triage rail
pf-desk-ledger.jsx         rule ledger, state chips, gate drawer  (shared)
pf-desk-pretrade.jsx       inputs, sizing panel, why-this-quantity
pf-desk-portfolio.jsx      positions table + grouping
pf-desk-mandate.jsx        parameters, versions, diff
pf-desk-journal.jsx        entries, stats strip
pf-desk-recon.jsx          accounts table, issue resolution, FX settings
tweaks-panel.jsx           starter
```

Build rules:

- React 18.3.1 + Babel standalone, pinned tags with integrity hashes (project convention).
- Each Babel script has its own scope — end every component file with `Object.assign(window, {...})`.
- **Never** name a style object `styles`. Prefix per file: `deskLedgerStyles`, `deskWaterfallStyles`.
- No calculation logic inside JSX — all of it in `pf-desk-data.js` as pure functions.
- Reuse `pf-icons.jsx` for lucide icons.
- Desktop-first at 1440px, degrade to 1024px (waterfall wraps to two rows; Pre-Trade drops to two columns with the ledger below).

---

## 14. Acceptance checklist

1. First load: gate `BLOCKED`, all 11 positions `Legacy / Unclassified`, all `UNBOUNDED`, Active NAV unapproved.
2. Trade limit Rp1.404.710.882 is visibly excluded from the waterfall and struck through.
3. Completing all four triage steps flips the gate and reveals a usable risk budget.
4. Reference BBCA case produces exactly 15 lots with the exposure cap marked as binding.
5. Clearing the stop blocks the plan and shows quantity as `—`.
6. Target 6.600 warns at 1,01R without blocking.
7. Daily loss limit blocked state names all four brokers.
8. Entering BBRI blocks with *add to losing legacy position*.
9. Resolving the Stockbit item changes reconciled NAV to Rp1.031.774.947 and animates the chain.
10. Changing USD/IDR recomputes every Binance and IBKR IDR value on screen.
11. Journal shows `Sample size not yet sufficient (8 of 30 closed trades)`.
12. Approving an edited mandate creates v2 and leaves v1 readable with a diff.
13. Every gate rule — passing included — shows value, limit, headroom.
14. Light and dark both legible; no colour-only status anywhere.
15. State survives reload.
16. No console errors; nothing overflows at 1440 and 1024.

## 15. Out of scope

Live broker APIs · order placement · real-time quotes · cloud sync · auth · AI trade recommendations · backtesting · options risk · tax · predictive signals · news/social feeds · placeholder nav for any of the above.
