# Handoff: Net Worth (Assets) zen revamp

## What to build
Replace the current Assets → Overview tab (KPI strip + trend chart + allocation donut) with a zen-mode Net Worth page. Reference design: `Net Worth Revamp.html` (open it in a browser; it holds 3 static frames, all 1440×900).

The three frames become **three views of one page**, switched by a bottom pill:
- **Overview** = Frame A "Quiet number" (the default view)
- **Owned / Owed** = Frame B "Own / Owe" ledger
- **Over time** = Frame C "Horizon" chart

The HTML is a design reference, not production code. Rebuild it in the existing stack (React + TS + Tailwind + react-query) and match the visuals closely.

## Where (repo: personal-finance)
- `apps/frontend/src/pages/assets/OverviewTab.tsx`: rewrite its render. Keep the CSV export/import logic and `ImportModal` unchanged; only move their triggers (see Actions).
- `components/assets/NetWorthHeadline.tsx`, `NetWorthTrendChart.tsx`, `AllocationDonut.tsx`: stop using them on this page. Delete them only if nothing else imports them.
- New components in `components/assets/zen/`: `NetWorthQuiet.tsx`, `OwnOweLedger.tsx`, `NetWorthHorizon.tsx`, `ZenPill.tsx`.
- The Overview/Accounts/Investments/Properties/Liabilities top tabs and the sidebar/recent rail stay hidden on this page (zen). Make the other tabs reachable from the pill's ⋯ menu and from ⌘K, if a command palette exists.

## Data
Use these existing queries: `getNetWorthCurrent`, `getNetWorthHistory`, `getAllocationByClass`, `getAssets`, `getHoldings`, `getAccounts`. Add only what's missing:
- **Total assets and total liabilities** (needed for the own/owe bar and the B column totals). If no endpoint returns them, extend `getNetWorthCurrent` to return `{ netWorthIdr, assetsIdr, liabilitiesIdr, liquidIdr }`.
- **Liabilities list** with principal, rate and monthly payment (B right column). Check whether `assetsApi` already returns liabilities before adding anything.
- **Month-over-month delta**: last 2 points of history. Absolute + %.
- **Projection (C)**: average monthly delta over the history window. Months to the next round milestone (Rp 1 M, then 2 M, …) = (milestone − current) / avgDelta. If avgDelta ≤ 0, hide the dashed line and the "Next marker" block.
- **Debt-to-asset ratio** = liabilities / assets. It sets the A bar width.

## Design tokens (zen)
- Canvas `#F5F3EE` with an 80px grid texture: `linear-gradient(rgba(0,0,0,.018) 1px, transparent 1px)` on both axes. Surface `#FFFFFF`, border `#E8E5DF` / hover `#D4D0C8`.
- Text `#37352F` / `#6B6B6B` / `#9B9B9B`. Warm accent `#E8C5A8` (debt bars, chart fill). Neutral bar `#BDB6A9` on track `#EDE9E2`.
- Functional colours only: green `#16A34A` (positive delta), amber `#B45309` (high-rate debt warning).
- Fonts: Inter for UI; Plus Jakarta Sans with tabular-nums for every number.
- No uppercase labels. Sentence case, 13px, `#9B9B9B`.
- No card shadows. Only the bottom pill gets `0 4px 16px rgba(0,0,0,.05)`.
- Motion: on load, fade in from 8px below, 400ms `cubic-bezier(.16,1,.3,1)`, staggered 60ms per block. View switch: cross-fade 200ms.

## View A: Quiet number
Vertically and horizontally centred column, 760px wide.
1. "Net worth · {date}" label.
2. Big number at 84px, weight 400, letter-spacing −0.035em. "Rp" prefix at half size, muted. ",00" decimals at 0.4em, muted.
3. Delta line: green "+Rp X" then muted "since {prev month} · Y%". Use red if negative.
4. Sparkline 760×110: 1.6px `#37352F` line, no axes or grid, end dot plus a 9px halo at 8% opacity. Under it, muted labels: first month / "N months" / last month.
5. Own/owe block: "You own Rp 1,59 M" (left) and "You owe Rp 778,9 jt" (right). Below, an 8px bar on track `#E6E1D8` with a warm fill = debt ratio. Below that, one plain sentence generated from the ratio:
   - under 30%: "Most of what you own is yours outright."
   - 30–60%: "About half of what you own is still borrowed{, almost all of it the <largest liability's asset>}."
   - over 60%: "Most of what you own is still borrowed."

## View B: Own / Owe
- Centred header: label, net worth at 44px, delta.
- Two columns, 1080px total, split by a 1px border.
- Column header: "What you own" / "What you owe" + total at 26px.
- Rows: name + amount (no "Rp"); a muted meta line + % share; a 4px proportion bar (neutral for assets, warm for debts).
- Asset rows group by class: each property individually; "Stocks & ETF" (meta = top 3 tickers · broker); "Cash" (meta = N accounts); gold; mutual funds. Sort by value, descending.
- Debt rows: meta = "rate · Rp X / month". Show the highest-rate revolving debt's meta in amber: "{rate}% · highest rate, pay first".
- Footer sentence: "Rp {liquid} of it is liquid, ready within a few days."
- Clicking a row opens the existing detail or edit dialog.

## View C: Horizon
- Top left: net worth at 60px. Top right: "Next marker Rp 1 miliar / Rp X away · around {Mon YYYY} at this pace".
- Chart 1200×330, no axes or gridlines. Solid 2px line for history, with a warm gradient area fill (35% → 0). Dashed grey line from the last point to the milestone. Dotted horizontal guide at the milestone, labelled.
- Month strip below: one column per month plus a wider "→ {year}" column with a dashed top border. The selected month gets a 2px dark top border. Default selection = latest month.
- Selecting a month (click or arrow keys) moves the tooltip and the vertical marker. It also updates three readouts: Assets change, Debt paid down, Biggest mover (the holding with the largest % change). If a readout has no data, hide it.

## Actions (bottom pill)
- Segmented control: Overview · Owned · Owed · ⋯
  - Owned and Owed both open view B; scroll or highlight the matching column.
  - "Over time" sits in ⋯ or as a 4th segment; keep it to 4 visible segments max.
- ⋯ menu: Export template, Import CSV (both reuse the existing handlers), Accounts, Investments, Properties, Liabilities.
- Esc closes menus. The ← ghost back arrow (top-left, 60% opacity) returns to the previous route.

## Formatting
- id-ID locale. Full precision for hero numbers (Rp 808.052.170,00).
- Compact form elsewhere: "jt" for millions with 1 decimal, "M" (miliar) for billions with 2 decimals, comma as the decimal separator.

## Responsive
- Below 1024px: B columns stack.
- Below 768px: hero number drops to 52px, sparkline goes full width, pill spans full width minus 16px.
- Below 480px: hide the grid texture.

## Done when
- [ ] All three views render real data with no hard-coded numbers.
- [ ] Export/import still work from the ⋯ menu.
- [ ] Empty states work: no liabilities → hide the owe bar and show "No debts" in B; under 2 history points → hide the sparkline, delta and projection.
- [ ] Typecheck and lint pass.
