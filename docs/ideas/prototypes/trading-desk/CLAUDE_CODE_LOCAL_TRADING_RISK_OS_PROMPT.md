# Master Prompt for Claude Code

## MANDATE — Local Personal Trading Risk OS

Copy the complete prompt below into Claude Code from the project directory.

---

You are acting as a senior product engineer, quantitative risk-systems designer, and UX engineer. Build a local-only web application named:

# MANDATE
## Personal Trading Risk OS

This application applies institutional-style risk governance to one person's multi-broker portfolio. It is a personal planning, reconciliation, position-sizing, and trade-journaling tool. It is not an order-execution system and must not present itself as financial advice.

## 1. Working mode

Work directly in the current repository.

Before editing:

1. Inspect the repository structure, package files, existing conventions, and current git status.
2. Read `CURRENT_INVESTMENT_RECAP_2026-07-30.md`. Treat it as the source of truth for demo account and position data.
3. Preserve unrelated user changes.
4. If the repository is empty, scaffold the application described below.
5. If it already contains an application, integrate with its existing architecture unless doing so would create a clear technical problem.
6. Do not commit, push, deploy, or connect to external services.
7. Do not ask questions unless a missing choice genuinely blocks implementation. Record reasonable non-blocking assumptions in `DECISIONS.md`.

Implement the application, run all relevant checks, fix failures, and finish with:

- What was implemented
- Files changed
- Commands to run it
- Test/build results
- Remaining MVP limitations

Do not stop after writing a plan.

## 2. Product scope

Build a focused local MVP containing:

1. Risk Command Center
2. Accounts and Portfolio
3. Risk Mandate
4. Pre-Trade Calculator and Compliance Gate
5. Basic Trading Journal
6. Reconciliation and Data Settings

Explicitly exclude from this MVP:

- Live broker APIs
- Automatic broker login
- Actual order placement
- Real-time quotes
- Cloud sync
- Authentication
- Multi-user access
- AI-generated trade recommendations
- Backtesting engine
- Options risk modelling
- Tax calculations
- Predictive signals
- Social or news feeds

Do not add placeholder navigation for excluded features.

## 3. Preferred technical stack

If no existing stack must be preserved, use:

- Vite
- React
- TypeScript with strict mode
- Tailwind CSS
- Lucide React
- Recharts
- Dexie with IndexedDB for persistent local data
- Zod for validation and import schemas
- React Hook Form for complex forms
- date-fns for dates
- Vitest for domain and calculation tests
- React Testing Library for critical component behaviour

Use `npm` unless an existing lockfile clearly selects another package manager.

Requirements:

- Local-only
- No runtime network calls
- No environment secrets
- No analytics
- No telemetry
- No CDN dependencies
- No fake “live” data
- Works with `npm run dev`
- Production build works with `npm run build`
- Data persists after refresh
- JSON backup and restore
- CSV export

## 4. Architecture

Keep financial calculations separate from presentation components.

Suggested structure:

```text
src/
  app/
  components/
  features/
    dashboard/
    accounts/
    portfolio/
    mandate/
    pretrade/
    journal/
    reconciliation/
  domain/
    entities/
    calculations/
    policies/
    validation/
  db/
  seed/
  shared/
  test/
```

Domain calculation functions must be pure, deterministic, and unit tested.

Never calculate core financial logic directly inside JSX.

Use decimal-safe calculation practices. Do not rely blindly on binary floating-point arithmetic for currency totals. Store:

- IDR monetary amounts as whole rupiah integers whenever possible
- Foreign-currency values as decimal strings or safely converted minor units
- Quantities separately from prices
- FX rates with explicit precision

Document any rounding policy.

## 5. Core domain concepts

The system must distinguish:

### Consolidated NAV

Total confirmed account equity across all brokers after FX conversion and reconciliation.

### Tentative Consolidated NAV

Total based on imported snapshots before duplicate and discrepancy resolution.

### Active Trading NAV

Only capital explicitly approved for active trading. This is the denominator for trading risk limits.

### Core Investment Capital

Long-term holdings not governed as short-term trades.

### Reserve Capital

Capital that must not be used for trading.

### Legacy / Recovery Positions

Positions opened before the current mandate or without a valid trade plan and stop.

### Buying Power / Trade Limit

Broker-provided purchasing capacity. Never add it to equity, NAV, cash, or risk capital.

Display this rule prominently:

> Buying power bukan modal sendiri. Batas risiko dihitung dari Active Trading NAV, bukan trade limit broker.

On first load:

- Import all screenshot holdings as `Legacy / Unclassified`.
- Leave Active Trading NAV unapproved.
- Set the global trade gate to `BLOCKED`.
- Require explicit capital-bucket assignment before enabling new trade approval.

## 6. Data model

Create typed entities equivalent to:

### BrokerAccount

- id
- brokerName
- accountLabel
- reportingCurrency
- reportedEquity
- calculatedEquity
- settledCash
- unsettledCash
- buyingPower
- tradeLimit
- liabilities
- lastUpdatedAt
- dataSource
- reconciliationStatus
- notes

### CashBalance

- id
- accountId
- currency
- nativeAmount
- reportingCurrencyAmount
- settlementStatus
- fxRateId

### Position

- id
- accountId
- symbol
- instrumentName
- exchange
- assetClass
- sector
- nativeCurrency
- quantity
- lotSize
- averagePrice
- currentPrice
- costBasisNative
- marketValueNative
- costBasisIdr
- marketValueIdr
- unrealizedPnlIdr
- sleeve
- strategy
- stopPrice
- targetPrice
- correlationGroup
- legacyStatus
- priceTimestamp
- notes

### FxRate

- id
- baseCurrency
- quoteCurrency
- rate
- asOf
- sourceLabel
- isStale

### RiskMandate

- id
- version
- status
- effectiveDate
- activeTradingNavIdr
- riskPerTradePercent
- hardRiskPerTradePercent
- dailyLossLimitPercent
- weeklyLossLimitPercent
- monthlyLossLimitPercent
- normalPortfolioHeatPercent
- hardPortfolioHeatPercent
- correlatedClusterHeatPercent
- maxStockExposurePercent
- maxCryptoExposurePercent
- maxAltcoinExposurePercent
- minRewardRisk
- maxConsecutiveDailyLosses
- maxConsecutiveLossesBeforeReview
- leverageAllowed
- averagingDownAllowed
- approvedAt
- changeReason

### TradePlan

- id
- createdAt
- accountId
- symbol
- side
- assetClass
- strategy
- setup
- entryPrice
- stopPrice
- targets
- estimatedFees
- estimatedSlippagePercent
- quantityStep
- plannedQuantity
- plannedPositionValue
- plannedRisk
- plannedReward
- rewardRiskRatio
- correlatedGroup
- thesis
- invalidation
- gateStatus
- gateReasons
- mandateVersion

### JournalEntry

- id
- tradePlanId
- openedAt
- closedAt
- approvedQuantity
- actualQuantity
- entryPrice
- exitPrice
- grossPnl
- fees
- slippage
- netPnl
- initialRisk
- realizedR
- exitReason
- ruleCompliant
- mistakeTags
- reviewNotes

### ReconciliationIssue

- id
- accountId
- severity
- type
- reportedValue
- calculatedValue
- difference
- status
- resolution
- resolvedAt

## 7. Default risk mandate

Seed an editable preset named `Conservative Personal Trader`:

| Parameter | Default |
|---|---:|
| Risk per trade | 0.50% of Active Trading NAV |
| Hard risk-per-trade ceiling | 1.00% |
| Global daily loss limit | 1.00% or 2R |
| Weekly loss limit | 2.50% |
| Monthly loss limit | 5.00% |
| Normal portfolio heat | 2.00% |
| Hard portfolio heat | 3.00% |
| Correlated-cluster heat | 1.25% |
| Maximum single-stock exposure | 10.00% |
| Maximum crypto exposure per symbol | 7.50% |
| Maximum speculative altcoin exposure | 2.50% |
| Minimum planned reward/risk | 2.00R |
| Consecutive-loss daily stop | 3 losses |
| Risk review threshold | 5 consecutive losses |
| Margin/leverage | Disabled |
| Averaging down | Disabled |

These are configurable governance defaults, not claims of universal optimality.

All loss limits are global across accounts. Reaching a limit on Stockbit must also block Binance, Mandiri Sekuritas, and IBKR trade plans.

## 8. Drawdown circuit breaker

Implement:

| Peak-to-current drawdown | State | Risk multiplier |
|---|---|---:|
| 0%–3% | Normal | 1.00× |
| >3%–5% | Caution | 0.50× |
| >5%–8% | Defensive | 0.25× |
| >8% | Risk Freeze | 0.00× |
| >10% | Mandate Reset | 0.00× |

Formula:

```text
drawdown = (currentNav - highWaterMarkNav) / highWaterMarkNav

baseRiskBudget =
  activeTradingNav × riskPerTradePercent

adjustedRiskBudget =
  baseRiskBudget × drawdownRiskMultiplier
```

Show the active regime and multiplier on the Dashboard and Pre-Trade screen.

## 9. Position-sizing engine

Required inputs:

- Broker account
- Capital sleeve
- Symbol
- Asset class
- Currency
- Long or short
- Strategy
- Setup
- Entry
- Stop
- Target
- Estimated buy and sell fees
- Estimated slippage
- Available cash
- Quantity step
- Optional correlation group
- Thesis
- Invalidation condition

Long risk per unit:

```text
longUnitRisk =
  (entryPrice - stopPrice)
  + entryPrice × slippagePercent
  + entryPrice × buyFeePercent
  + stopPrice × sellFeePercent
```

Short risk per unit:

```text
shortUnitRisk =
  (stopPrice - entryPrice)
  + entryPrice × slippagePercent
  + entryPrice × sellFeePercent
  + stopPrice × buyToCoverFeePercent
```

Sizing:

```text
riskSizedQuantity =
  adjustedRiskBudget / unitRisk

exposureCappedQuantity =
  maxPermittedPositionValue / entryPrice

cashCappedQuantity =
  availableCash / estimatedEntryCostPerUnit

finalQuantity =
  floorToQuantityStep(
    min(
      riskSizedQuantity,
      exposureCappedQuantity,
      cashCappedQuantity
    )
  )
```

For Indonesian stocks:

- 1 lot = 100 shares
- Round down to a complete lot

For US stocks and crypto:

- Support fractional quantities
- Use configurable quantity steps

Additional metrics:

```text
plannedPositionValue = quantity × entryPrice

plannedLoss = quantity × unitRisk

plannedReward =
  quantity × abs(targetPrice - entryPrice)
  - estimatedExitCosts

rewardRiskRatio = plannedReward / plannedLoss

positionExposurePercent =
  plannedPositionValue / activeTradingNav

portfolioHeat =
  sum(openInitialPlannedRisk) / activeTradingNav

realizedR =
  netRealizedPnl / initialPlannedRisk
```

Display:

> Planned loss bukan jaminan maximum loss. Gap, slippage, likuiditas, dan kegagalan eksekusi dapat menghasilkan kerugian lebih besar.

## 10. Compliance gate

Return exactly one state:

- `PASS`
- `WARNING`
- `BLOCKED`

Hard-block when:

- Active Trading NAV has not been approved
- Entry or stop is missing
- Stop is invalid for the selected direction
- Planned risk exceeds the current permitted risk
- Daily, weekly, or monthly loss limit is reached
- Hard portfolio heat would be exceeded
- Correlated-cluster heat would be exceeded
- Single-symbol exposure would be exceeded
- Cash is insufficient
- Margin would be required
- Consecutive-loss circuit breaker is active
- Drawdown risk freeze is active
- User attempts to add to a losing legacy position

Warn when:

- Reward/risk is below 2R
- Exposure is within 10% of a concentration limit
- Data or FX rates are stale
- The same sector or correlation group is already concentrated
- Stop distance is unusually wide
- Position is classified as low liquidity

Show every gate reason, input value, applicable limit, and remaining headroom. Never return only a coloured badge.

## 11. Screens

### A. Risk Command Center

Top metrics:

- Tentative Consolidated NAV
- Reconciled Consolidated NAV
- Active Trading NAV
- Total cash
- Current open risk
- Portfolio heat
- Current drawdown
- Today's global P&L
- Global gate status

Panels:

- Capital buckets
- Broker allocation
- Asset-class allocation
- Currency exposure
- Largest positions
- Risk-budget utilization
- Reconciliation alerts
- Unbounded-risk positions

Use compact charts only when they communicate a relationship better than a table.

### B. Accounts and Portfolio

Provide:

- Broker-account cards
- Sortable, filterable consolidated positions table
- Native and IDR values
- Cost, market value, P&L, portfolio weight, and account weight
- Sleeve assignment
- Stop and risk status
- Legacy classification
- Manual add/edit/delete

Group/filter by:

- Broker
- Sleeve
- Asset class
- Currency
- Sector
- Strategy

Do not generate buy or sell recommendations.

### C. Risk Mandate

Provide:

- Editable risk parameters
- Version number
- Effective date
- Change reason
- Approval checkbox
- Approval timestamp
- Previous versions

Editing an approved mandate must create a new version rather than mutate historical policy.

### D. Pre-Trade

Use a split layout:

- Left: trade inputs
- Centre: calculated position size and risk
- Right: PASS/WARNING/BLOCKED gate report

Calculations must update immediately.

Include a small “Why this quantity?” breakdown showing:

- Risk limit
- Stop distance
- Fee/slippage allowance
- Risk-sized quantity
- Exposure cap
- Cash cap
- Final rounded quantity

### E. Trading Journal

MVP functions:

- Create journal entry from an approved trade plan
- Record actual entry and exit
- Record fees and slippage
- Calculate net P&L and realized R
- Record exit reason
- Record compliance status
- Record mistake tags
- Filter by strategy, broker, and symbol

Mistake tags:

- FOMO
- Revenge trade
- Oversized
- No valid stop
- Moved stop wider
- Added to loser
- Late entry
- Early exit
- Broke daily limit
- Ignored correlation
- Unplanned trade
- Poor liquidity
- Process compliant

Show only basic MVP statistics:

- Closed trades
- Win rate
- Average win in R
- Average loss in R
- Expectancy in R
- Profit factor
- Compliance rate

Formula:

```text
expectancyR =
  winRate × averageWinR
  - lossRate × averageLossR

profitFactor =
  grossProfit / abs(grossLoss)
```

Show `Sample size belum memadai` for fewer than 30 closed trades.

### F. Reconciliation and Settings

For every account show:

- Reported cash
- Position market value
- Liabilities
- Calculated equity
- Reported equity
- Difference
- Buying power
- Last update
- Status

Formula:

```text
calculatedAccountEquity =
  eligibleCash
  + sum(positionMarketValues)
  - liabilities
```

Never add buying power or trade limit to equity.

Support resolution of:

- Duplicate cash section
- Market-value mismatch
- Missing FX rate
- Unknown instrument
- Estimated cost basis
- Stale snapshot

Provide:

- Editable USD/IDR
- Editable SGD/USD
- FX timestamps
- JSON export
- JSON restore with schema validation
- CSV positions export
- Reset to demo data

## 12. Multi-currency behaviour

Reporting currency is IDR.

Supported native currencies:

- IDR
- USD
- SGD
- USDT

For foreign positions show:

- Native cost and market value
- IDR cost and market value
- Native P&L
- IDR P&L
- FX rate and timestamp

When entry FX is available:

```text
combinedIdrPnl =
  currentNativeMarketValue × currentFx
  - originalNativeCost × entryFx

assetPricePnlIdr =
  nativeAssetPnl × currentFx

fxTranslationPnl =
  combinedIdrPnl - assetPricePnlIdr
```

If entry FX is absent, display:

`FX attribution unavailable — entry FX rate required.`

## 13. Demo data and reconciliation

Read all exact seed data from:

`CURRENT_INVESTMENT_RECAP_2026-07-30.md`

Seed:

- Mandiri Sekuritas account and ELTY, GOTO, BBCA, HMSP, BBRI
- Stockbit cash-only section
- Stockbit stock account and AADI, ANTM
- Binance USDT, BTC/USDT, and unconfirmed Gold instrument
- IBKR multi-currency cash and fractional IBM position

Required imported-data flags:

- Stockbit Rp33,178,117 cash section: `Needs reconciliation`
- Mandiri market-value difference: `Needs reconciliation`
- Binance gold symbol: `Instrument unconfirmed`
- IBM average cost USD214.07: `Estimated`
- All positions: `Legacy / Unclassified`
- All positions without stop: `Unbounded Risk`

Initial totals:

```text
Tentative Consolidated NAV:
Rp1,064,953,064.41

NAV excluding possibly duplicated Stockbit cash:
Rp1,031,774,947.41

Approximate listed-instrument market value:
Rp978,114,277.70
```

Do not silently force totals to reconcile. Preserve discrepancies and make them visible.

## 14. Visual design

Use an institutional risk-desk aesthetic without copying any financial company's UI.

Design rules:

- Desktop-first, responsive to tablet
- Graphite or dark navy surface
- Off-white primary text
- Muted grey secondary text
- Teal for normal/pass
- Amber for warning
- Muted red for losses and blocked states
- No gradients
- No glassmorphism
- No excessive shadows
- No decorative financial imagery
- No fake ticker tape
- Compact data density
- Tabular numerals
- Clear alignment of currency columns
- Strong keyboard focus states
- Accessible contrast
- Do not rely on colour alone for status

Formats:

- IDR: `Rp784.938.962`
- USD: `$7,793.85`
- SGD: `S$12.38`
- Percentage: `-31.39%`
- Risk multiple: `1.75R`

Show precise values in tooltips or detail views.

## 15. Required tests

Unit-test at least:

1. Long position sizing
2. Short position sizing
3. Indonesian lot rounding
4. Fractional-share rounding
5. Fee and slippage inclusion
6. Exposure cap
7. Cash cap
8. Drawdown multiplier
9. Portfolio heat
10. Daily global loss lock
11. Invalid stop direction
12. Missing Active Trading NAV
13. FX conversion
14. Reconciliation difference
15. Expectancy in R
16. Profit factor

Add component tests for:

- PASS trade
- WARNING trade
- BLOCKED trade
- Changing FX recalculates foreign positions
- Stockbit duplicate-cash resolution changes consolidated NAV
- Data persists after reinitializing the data layer

## 16. Acceptance scenarios

The MVP is complete only when:

1. First launch loads the provided portfolio snapshot.
2. Active Trading NAV is initially unapproved.
3. New trades are initially blocked.
4. Approving an Active Trading NAV enables valid trade calculation.
5. A valid Indonesian stock trade produces a lot-rounded quantity.
6. Increasing quantity above the risk limit blocks the plan.
7. Omitting a stop blocks the plan.
8. Reward/risk below 2R produces a warning.
9. Reaching the global daily loss limit blocks all brokers.
10. Changing USD/IDR recalculates Binance and IBKR IDR values.
11. Resolving the Stockbit cash duplication changes reconciled NAV.
12. Reloading the browser preserves user changes.
13. JSON export and restore reproduce the same state.
14. `npm test` passes.
15. `npm run build` passes.

## 17. Documentation

Create or update `README.md` with:

- Product purpose
- Scope and exclusions
- Technical stack
- Local setup
- Development commands
- Data-storage location
- Backup and restore
- Risk-formula summary
- Rounding assumptions
- Demo-data disclaimer
- How to clear local data

Create `DECISIONS.md` containing material assumptions and implementation choices.

Add a permanent application footer:

> Risk-control and planning tool. Bukan sistem eksekusi order, bukan penasihat investasi, dan tidak menjamin kerugian tidak terjadi.

## 18. Final verification

Before finishing:

1. Run formatting and linting if configured.
2. Run the full test suite.
3. Run the production build.
4. Inspect the primary screens at desktop width.
5. Fix console errors and obvious layout overflow.
6. Verify no runtime network requests are made.
7. Confirm no broker credentials or secrets are requested or stored.
8. Report any acceptance criterion that remains incomplete.

Begin implementation now.

