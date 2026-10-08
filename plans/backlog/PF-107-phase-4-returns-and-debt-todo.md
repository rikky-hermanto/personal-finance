# PF-107 Phase 4 — Returns + Debt Health

> **Parent Issue:** PF-107 (Assets Management)
> **Phase:** 4 of 6 — Performance analytics + debt intelligence
> **Status:** Not started
> **Depends on:** Phase 3 complete (daily_net_worth populated, visual suite live)
> **Blocks:** Phase 5

## Objective

Add the analytical layer that separates a wealth tracker from a balance sheet viewer. XIRR (money-weighted return) tells the user how their investments actually performed accounting for when cash was put in or taken out — not just the simple "market went up 10%". Debt Health Scorecard turns the liabilities list into actionable intelligence: which loans should be paid off first, what is the total debt-service coverage, and how does debt-to-asset ratio trend over time. Allocation Drift shows how the portfolio has drifted from the user's target and quantifies the rebalance needed in IDR.

## Acceptance Criteria

- [ ] XIRR computed server-side for each `Holding` and for the total portfolio
- [ ] `InvestmentsTab` shows XIRR column in HoldingsTable
- [ ] Overview shows portfolio-level XIRR since inception
- [ ] **Debt Health Scorecard** added to `LiabilitiesTab`: debt-to-asset ratio, total monthly debt service, avalanche vs snowball payoff order
- [ ] **Allocation Drift** added to Overview or `InvestmentsTab`: target % per asset class (user-configured in Settings) vs actual % + rebalance amount in IDR
- [ ] Target allocations stored in DB (Settings → Asset Targets tab, enabled in Phase 1A)
- [ ] No TWR — XIRR only

## Approach

XIRR requires knowing all cash-in and cash-out events for a holding: buys (cost_basis increases), sells, and current market value. These are stored across `holdings` (cost_basis), `valuations` (current market value), and ideally a `transactions` history if available — but since assets and cashflow are decoupled, cash flows are approximated from the `valuations` history (each cost_basis change = implicit cash flow). Use the Newton-Raphson XIRR approximation (standard formula, no external library needed).

Debt Health Scorecard computes from the `liabilities` table alone — no cashflow coupling required.

Out of scope: TWR time-weighted returns (cut — too complex for marginal benefit over XIRR), What-If scenarios (backlog), cashflow reconciliation (backlog).

## Affected Files

| File | Change |
|------|--------|
| `apps/api/src/PersonalFinance.Application/Interfaces/IReturnsService.cs` | Create |
| `apps/api/src/PersonalFinance.Infrastructure/Services/ReturnsService.cs` | Create — XIRR implementation |
| `apps/api/src/PersonalFinance.Api/Controllers/NetWorthController.cs` | Modify — add returns + allocation endpoints |
| `apps/api/src/PersonalFinance.Api/Controllers/AssetsController.cs` | Modify — add XIRR per holding |
| `apps/frontend/src/components/assets/HoldingsTable.tsx` | Modify — add XIRR column |
| `apps/frontend/src/components/assets/DebtHealthScorecard.tsx` | Create |
| `apps/frontend/src/components/assets/AllocationDriftWidget.tsx` | Create |
| `apps/frontend/src/pages/assets/LiabilitiesTab.tsx` | Modify — add DebtHealthScorecard |
| `apps/frontend/src/pages/assets/OverviewTab.tsx` | Modify — add XIRR + AllocationDriftWidget |
| `apps/frontend/src/api/netWorthApi.ts` | Modify — returns + allocation drift endpoints |
| `apps/frontend/src/api/assetsApi.ts` | Modify — XIRR per holding endpoint |

---

## TODO

### [ ] STEP 1 — Implement XIRR service

XIRR = the discount rate `r` that makes NPV of cash flows = 0:
`∑ (CF_i / (1+r)^(t_i/365)) = 0`

```csharp
// Infrastructure/Services/ReturnsService.cs
public class ReturnsService : IReturnsService
{
    // Cash flows for a Holding:
    // - Negative CF at acquisition date: -acquisition_cost
    // - Positive CF today: +current_market_value
    // If user updates cost_basis over time (buys more), each update = new negative CF

    public decimal ComputeXirr(IEnumerable<(DateTime date, decimal amount)> cashFlows)
    {
        // Newton-Raphson iteration
        // Converges in ~20 iterations for typical return ranges (-100% to +1000%)
        // Return 0 if insufficient data (< 2 cash flows, or all same date)
    }
}
```

> **Why XIRR and not simple ROI?** Simple ROI = `(currentValue - cost) / cost`. It ignores time. If the user put in IDR 100M two years ago and it's now IDR 120M, simple ROI = 20%. But XIRR = ~9.5% annualized — very different. XIRR is the number that lets you compare investment performance against alternatives (e.g. "is my Mansek returning more than a deposito at 5%?"). That's the user's actual question.

---

### [ ] STEP 2 — Add XIRR column to HoldingsTable

```tsx
// In HoldingsTable.tsx, add column:
{ header: 'XIRR', accessor: 'xirr', render: (v) =>
    v == null
      ? <span className="text-muted-foreground">—</span>
      : <span className={cn('font-mono tabular-nums', v >= 0 ? 'text-success' : 'text-destructive')}>
          {(v * 100).toFixed(1)}%
        </span>
}
```

Show `—` for holdings with insufficient history (< 30 days since acquisition). Tooltip on hover: "Money-weighted return since acquisition".

---

### [ ] STEP 3 — Build Debt Health Scorecard

```tsx
// components/assets/DebtHealthScorecard.tsx
// Metrics row:
// - Debt-to-Asset: total_liabilities / total_assets (as %)
//   Green < 20%, Amber 20–40%, Red > 40%
// - Total Monthly Payment: sum of liabilities.monthly_payment
// - Payoff Order (Avalanche): sorted by interest_rate DESC
//   "Pay off [X] first — saves you Rp Y,M in interest"

// Avalanche vs Snowball toggle:
// Avalanche = highest interest rate first (mathematically optimal)
// Snowball = smallest balance first (psychologically motivating)
// Default: Avalanche — show note "saves Rp X,M vs snowball method"
```

> **Why avalanche as default?** For a single user with clear financial literacy (they track 20 line items in Excel), avalanche is the right default. It maximizes interest savings. The snowball toggle is for transparency — some users prefer momentum wins. Showing the interest savings comparison makes the trade-off concrete and non-judgmental.

---

### [ ] STEP 4 — Build AllocationDriftWidget

User sets target allocation per asset class in Settings → Asset Targets (enabled in Phase 1A):

```
Target: Investments 60%, Cash 15%, Crypto 10%, Real Estate 10%, Other 5%
Actual: Investments 75%, Cash 11%, Crypto 13%, Real Estate 6%, Other 5%
```

```tsx
// components/assets/AllocationDriftWidget.tsx
// Table with columns: Asset Class | Target % | Actual % | Drift | Rebalance (IDR)
// Rebalance IDR = (target_pct - actual_pct) × total_net_worth
// Positive rebalance = "buy Rp X,M more"
// Negative rebalance = "sell Rp X,M"
// Flag rows where |drift| > 5 percentage points
```

API:
```
GET /api/networth/allocation-drift
→ { targets: {...}, actuals: {...}, rebalance: { investments: -123000000, cash: +45000000, ... } }
```

---

### [ ] STEP 5 — Wire target allocations in Settings

Settings → Asset Targets tab (already enabled as a tab placeholder in Phase 1A). Add a simple form with a numeric input per asset class that must sum to 100%:

```tsx
// Validation: sum of all targets must equal 100%
// Show live "remaining: X%" as user adjusts values
// Save calls PATCH /api/settings/asset-targets
```

Store in a new `user_settings` table (or extend existing settings if one exists):
```sql
-- If no settings table exists yet:
CREATE TABLE public.user_settings (
  user_id  uuid PRIMARY KEY,
  targets  jsonb NOT NULL DEFAULT '{}',  -- { "cash": 15, "investments": 60, ... }
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

---

## Notes

- **XIRR convergence guard**: Newton-Raphson can diverge for pathological cash flow patterns (all outflows, or 0 positive flows). Cap iterations at 100 and return `null` if no convergence. The UI shows `—` for null XIRR.
- **Portfolio-level XIRR**: To compute XIRR for the total portfolio, aggregate all holdings' cash flows (all acquisitions + current total value as a single positive flow today). This gives the "since-inception" return of the full portfolio.
- **User settings table**: Check if `user_settings` or equivalent already exists in the Supabase schema before creating a new one. If a settings table exists for existing features (e.g. date format preferences from PF-regional-settings), add `targets jsonb` as a new column rather than creating a new table.
- **Debt health = liabilities only, no cashflow**: All Debt Health metrics compute from `liabilities` table fields (`principal`, `interest_rate`, `monthly_payment`). No join to `transactions`. Pure assets-module data.
