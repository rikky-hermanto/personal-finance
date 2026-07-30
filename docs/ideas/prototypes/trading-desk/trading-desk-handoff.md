# Trading Desk — Implementation Handoff

Prototype acuan: `Trading Desk.html` + `pf-desk-*.jsx` + `pf-desk-data.js` (project "Personal Finance"). Fitur ini adalah **Trading Risk OS** — modul terpisah dari Cashflow/Journey, diakses dari icon rail (`ShieldHalf`), bukan bagian dari reward loop Journey.

## Ringkasan fitur
Desk membantu user dengan portfolio legacy (multi-broker, tanpa stop, konsentrasi tinggi) melakukan **trading terkontrol** di atas sebagian kecil NAV ("Active Trading NAV"), lewat:
1. **NAV waterfall**: Tentative NAV → (− duplikat cash) → Reconciled NAV → split Core/Active Trading/Reserve/Legacy → Active Trading NAV × risk% × regime multiplier → Risk budget/trade.
2. **Gate**: ledger aturan hard-block/warning yang menentukan status keseluruhan PASS / WARNING / BLOCKED sebelum trade plan bisa disimpan.
3. **6 screens**: Command Center, Portfolio, Mandate, Pre-Trade, Journal, Reconcile.

Ini **bukan** sistem eksekusi order dan **bukan** penasihat investasi — disclaimer wajib tampil di footer & Pre-Trade (lihat teks persis di prototype).

## File prototype → source mapping
- `pf-desk-data.js` → seed data (accounts, positions, mandate default, regimes, journal) + pure functions: `computeNavChain`, `computeSizing`, `evaluateGate`, `journalStats`. **Port langsung ke TypeScript**, ganti seed dengan data API riil.
- `pf-desk-shell.jsx` → `DeskApp` root: state (localStorage `pf-desk-v1`), tab routing, triage overlay, gate computation wiring, right context panel.
- `pf-desk-ledger.jsx` → `GateBar` (sticky top strip), `GateDrawer` (slide-over rule list), `RuleLedger`/`RuleRow` (dipakai di drawer & Pre-Trade), `StateChip`.
- `pf-desk-command.jsx` → Command Center: concentration panel, unbounded-risk panel, reconciliation alerts, capital buckets, first-run triage rail + overlay.
- `pf-desk-waterfall.jsx` → `CapitalWaterfall` (hero), `TradeLimitRail`, `TilesRow`.
- `pf-desk-portfolio.jsx` → consolidated positions table, grouping, inline sleeve editor.
- `pf-desk-mandate.jsx` → mandate parameter form, version history, diff view, approval flow.
- `pf-desk-pretrade.jsx` → 3-column trade planner (inputs | sizing math | rule ledger) + scenario presets.
- `pf-desk-journal.jsx` → stats strip + filterable journal table.
- `pf-desk-recon.jsx` → accounts table, reconciliation issue cards, FX settings.

## Data model (port these shapes as-is)
- **Account**: id, name, currency, reportedEquity, cash, buyingPower, status.
- **Position**: broker, symbol, class, qty/qtyLots, avg, last, costIDR, mvIDR, pnlIDR, pnlPct, weight, sleeve (`Legacy / Unclassified | Core | Active Trading | Reserve`), stopPrice.
- **MandateVersion**: version, status (`draft|approved`), params (risk%, heat caps, loss limits, minRR, consecutiveLossStop, leverageEnabled, etc.), effectiveDate, changeReason, approvedAt.
- **ReconIssue**: id, label, account, amount, resolution, options (key/label pairs presented as buttons).
- **JournalEntry**: date, symbol, broker, strategy, plannedQty, actualQty, entry, exit, netPnl, realizedR, compliant, tags.

## Gate logic (must be preserved exactly)
`evaluateGate` produces ~18 rule rows (nav-approved, entry-stop, stop-direction, risk-per-trade, daily/weekly/monthly loss, hard-heat, cluster-heat, single-symbol exposure, cash, margin, consecutive-loss breaker, drawdown-freeze, add-to-losing-legacy, min-RR, near-concentration, stale-fx, sector-concentration, wide-stop, liquidity). Each row state: `pass|warning|blocked|unresolved`. Overall = `BLOCKED` if any row blocked, else `WARNING` if any warning, else `PASS`. Trade plan save button disables when overall is `BLOCKED`. Port this function to the backend (source of truth) — do not recompute only client-side once real trades are at stake.

## First-run triage (blocks trading until complete)
4 steps, tracked as booleans: reconcile all recon issues → classify all positions out of "Legacy / Unclassified" → set a mandate (any version exists) → approve Active Trading NAV. `TriageOverlay` blocks the Command Center with a modal until dismissed; gate stays BLOCKED on `nav-approved` rule until step 4 completes regardless of dismissal.

## Prompt untuk Claude Code

```
Implement the Trading Desk feature per docs/trading-desk-handoff.md, using the prototype files in ref-prototype/pf-desk-*.jsx and pf-desk-data.js as the exact spec for logic, copy, and layout.

1. Port pf-desk-data.js to src/lib/desk/deskCalculations.ts (or equivalent), keeping computeNavChain, computeSizing, evaluateGate, journalStats as pure functions with identical logic/thresholds. Wire seed data (ACCOUNTS, POSITIONS, MANDATE_DEFAULT, REGIMES, JOURNAL_SEED, RECON_ISSUES) to real API/DB models — do not hardcode demo numbers in the shipped code.
2. Add a new top-level route/module "Trading Desk" (icon ShieldHalf) alongside Cashflow/Investments in the icon rail — NOT nested under Journey, and excluded from the reward-loop/streak system.
3. Build the desk shell (src/features/desk/DeskShell.tsx or similar): tab bar (Command, Portfolio, Mandate, Pre-Trade, Journal, Reconcile), sticky GateBar under the header, GateDrawer slide-over, right-hand read-only context panel (regime/heat/headroom/active NAV + "Explain gate" toggle). Match pf-desk-shell.jsx state machine: mandate versions, recon issues, positions with sleeve, journal entries, fx rates — persisted server-side per user (prototype used localStorage key pf-desk-v1, replace with real persistence/API).
4. Build the 6 screens as separate components mirroring pf-desk-command.jsx, pf-desk-waterfall.jsx, pf-desk-portfolio.jsx, pf-desk-mandate.jsx, pf-desk-pretrade.jsx, pf-desk-journal.jsx, pf-desk-recon.jsx 1:1 (structure, copy, thresholds, disclaimer text in Bahasa Indonesia must be preserved verbatim).
5. Implement the first-run triage overlay + rail exactly per pf-desk-command.jsx (TriageOverlay, TriageRail): overlay blocks Command Center until dismissed, but the gate itself stays BLOCKED on the "Active Trading NAV approved" rule until mandate approval regardless of overlay dismissal.
6. Implement evaluateGate server-side as the source of truth (used to gate actual trade-plan persistence), and reuse the same logic client-side only for live UI feedback while typing inputs in Pre-Trade.
7. Mandate approval must be versioned and immutable once approved: editing creates a new draft version; approving requires a non-empty change reason and an explicit "I have reviewed" checkbox, matching pf-desk-mandate.jsx.
8. Reuse existing design tokens (bg-card, border-border, text-destructive/success/warning, pf-card class) and the shared StateChip/RuleLedger/GateBar/GateDrawer components across screens — do not duplicate rule-rendering logic between Pre-Trade and the GateDrawer.
9. Keep the footer disclaimer and Pre-Trade disclaimer text verbatim (Bahasa Indonesia): "Risk-control and planning tool. Bukan sistem eksekusi order, bukan penasihat investasi, dan tidak menjamin kerugian tidak terjadi." and "Planned loss bukan jaminan maximum loss. Gap, slippage, likuiditas, dan kegagalan eksekusi dapat menghasilkan kerugian lebih besar."
10. Do not add this feature to the Journey/reward/streak system — it is explicitly excluded per the right-panel footer note in pf-desk-shell.jsx.
```
