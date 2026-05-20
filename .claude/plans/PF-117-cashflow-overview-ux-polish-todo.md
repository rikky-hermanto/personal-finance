# PF-117 — Dashboard Overview: Data Accuracy & UX Polish

> **GitHub Issue:** (to be linked)
> **Status:** To Do
> **Started:** 2026-05-21

## Objective

The Cashflow Overview dashboard has five UX issues found in a PO review: (1) YTD shows identical
data to Last Month with no explanation when data only covers January, (2) the baseline is the
latest transaction date (Jan 2026) not today, with no staleness indicator, (3) investment
categories (Stock, Mutual Fund, etc.) dominate the Top Expenses card because they are typed as
"Expense" in the DB, (4) chart header uses a different label vocabulary than the summary cards,
and (5) API failure leaves the page in a permanent skeleton state with no error message. This plan
fixes all five in one pass using the existing CashflowSectionMapping as the single source of truth.

## Acceptance Criteria

- [x] A "Data through [Month Year]" badge appears on the Overview page whenever the latest
      transaction date is more than 30 days before today
- [x] YTD shows a secondary note "(Jan 2026 only — upload data to expand)" when the year has only
      one month of data; it no longer silently duplicates Last Month
- [x] Investment categories (Stock, Crypto, Mutual Fund, Bond, Gold, P2P Lending, Dividend) are
      excluded from the Top Expense Categories card across all range selections
- [x] The Cash Flow chart header label matches the same range description shown on the
      Net Cashflow and Top Categories cards (e.g., "3 Months ending Jan 26" everywhere)
- [x] When the aggregated API call fails, the Overview page shows an inline error message
      ("Could not load dashboard data — check your connection") instead of frozen skeletons

## Approach

Add `DataThrough` (the baseline transaction date as a formatted string) to `DashboardDto`
and surface it from `DashboardService`. In the same service method, filter out any category whose
`CashflowSectionMapping.CategoryToSection` value is `CashflowSection.Investing` before building
the top-categories list — this reuses the existing mapping with no duplication. On the frontend,
read `dataThrough` to drive the staleness badge and YTD hint, pass `data.currentMonth.month` to
`MonthlyFlowChart` instead of the frontend button label to unify chart/card labels, and add an
error state to `OverviewTab`. No DB migration required.

## Affected Files

| File | Change |
|------|--------|
| `apps/api/src/PersonalFinance.Application/Dtos/DashboardDto.cs` | Edit — add `DataThrough: string` to `DashboardDto` |
| `apps/api/src/PersonalFinance.Application/Services/DashboardService.cs` | Edit — populate `DataThrough`; filter investing categories from top-categories |
| `apps/frontend/src/types/Dashboard.ts` | Edit — add `dataThrough: string` to `DashboardData` |
| `apps/frontend/src/pages/cashflow/OverviewTab.tsx` | Edit — staleness badge, YTD hint, error state, pass backend label to chart |
| `apps/frontend/src/components/dashboard/widgets/MonthlyFlowChart.tsx` | Edit — accept and display backend rangeLabel directly |

---

## TODO

### [x] STEP 1 — Extend DashboardDto with DataThrough field

In `apps/api/src/PersonalFinance.Application/Dtos/DashboardDto.cs`, add the field to `DashboardDto`:

```csharp
public record DashboardDto(
    DashboardSummaryDto Summary,
    DashboardCurrentMonthDto CurrentMonth,
    List<DashboardTopCategoryDto> TopCategories,
    List<DashboardCashFlowDto> CashFlow,
    DateTime LastUpdated,
    string DataThrough);   // ← add this
```

> **Why:** The frontend needs to know the actual date of the latest transaction, not `DateTime.Now`
> (which is the API response time). Surfacing it as a typed field avoids the frontend guessing from
> chart labels — governance THINK-05 and ARCH-04 both push business facts to the layer that owns them.

---

### [x] STEP 2 — Populate DataThrough and exclude investing categories in DashboardService

In `apps/api/src/PersonalFinance.Application/Services/DashboardService.cs`:

**2a — Filter investing categories from topCategories** (replace lines 109-118):

```csharp
var investingCategories = CashflowSectionMapping.CategoryToSection
    .Where(kvp => kvp.Value == CashflowSection.Investing)
    .Select(kvp => kvp.Key)
    .ToHashSet(StringComparer.OrdinalIgnoreCase);

var topCategories = currentRangeTxs
    .Where(t => t.Type.Equals("Expense", StringComparison.OrdinalIgnoreCase)
             && !string.IsNullOrEmpty(t.Category)
             && !investingCategories.Contains(t.Category))
    .GroupBy(t => t.Category)
    .Select(g => new DashboardTopCategoryDto(
        g.Key,
        g.Sum(t => t.AmountIdr),
        currentExpenses != 0 ? Math.Round(g.Sum(t => t.AmountIdr) / currentExpenses * 100, 1) : 0))
    .OrderByDescending(x => x.Amount)
    .Take(5)
    .ToList();
```

**2b — Pass DataThrough in the return statement** (line ~141):

```csharp
var dataThrough = baselineDate.ToString("MMMM yyyy");  // e.g. "January 2026"

return new DashboardDto(
    summaryDto,
    new DashboardCurrentMonthDto(
        rangeLabel,
        currentIncome, currentExpenses, currentNet,
        Math.Round(incomeChange, 1), Math.Round(expenseChange, 1), Math.Round(netChange, 1)),
    topCategories,
    cashFlow,
    DateTime.Now,
    dataThrough);   // ← new field
```

> **Why:** `CashflowSectionMapping` is the canonical list of which categories are investing activity.
> Using it here means adding a new investing category (e.g., "ETF") to the mapping automatically
> excludes it from Top Expenses — no frontend list to keep in sync. The `baselineDate` variable is
> already computed earlier in the method, so `DataThrough` is zero-cost to populate.

---

### [x] STEP 3 — Update TypeScript Dashboard type

In `apps/frontend/src/types/Dashboard.ts`, add `dataThrough` to `DashboardData`:

```typescript
export interface DashboardData {
  summary: DashboardSummary;
  currentMonth: DashboardCurrentMonth;
  topCategories: DashboardTopCategory[];
  cashFlow: DashboardCashFlow[];
  lastUpdated: string;
  dataThrough: string;   // ← "January 2026" — the baseline transaction date
}
```

> **Why:** Keeping types in sync with the DTO contract is THINK-05 in governance. A typed field
> prevents `dataThrough` from being silently `undefined` at runtime when the API starts returning it.

---

### [x] STEP 4 — Simplify MonthlyFlowChart to use the backend label

In `apps/frontend/src/components/dashboard/widgets/MonthlyFlowChart.tsx`, replace the
label-transform logic with a direct render of whatever the backend sends:

```tsx
const MonthlyFlowChart = ({ data, isLoading, rangeLabel }: MonthlyFlowChartProps) => (
  <div className="bg-card border border-border rounded-lg p-5">
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-sm font-medium text-foreground">Cash Flow</h3>
      <span className="text-xs text-muted-foreground">{rangeLabel || '—'}</span>
    </div>
    <FinancialChart data={data} type="composed" height={200} isLoading={isLoading} />
  </div>
);
```

In `OverviewTab.tsx`, change the `rangeLabel` prop passed to `MonthlyFlowChart` (line ~93):

```tsx
// Before
rangeLabel={RANGES.find(r => r.value === range)?.label}

// After — use the backend-computed label so chart matches cards
rangeLabel={data?.currentMonth?.month}
```

> **Why:** The backend already computes a human-readable range label ("3 Months ending Jan 26",
> "YTD 2026", "January 2026"). Passing it through eliminates the two-vocabulary problem where
> cards say "3 Months ending Jan 26" and the chart says "Last 3M" for the same period.

---

### [x] STEP 5 — Add staleness badge, YTD hint, and error state to OverviewTab

In `apps/frontend/src/pages/cashflow/OverviewTab.tsx`:

**5a — Add error state:**

```tsx
const [error, setError] = useState<string | null>(null);
```

**5b — Update fetchData:**

```tsx
const fetchData = async () => {
  try {
    setIsLoading(true);
    setError(null);
    const result = await getDashboardData(undefined, undefined, undefined, range);
    setData(result);
  } catch (err) {
    console.error('Failed to fetch dashboard data:', err);
    setError('Could not load dashboard data — check your connection and try again.');
  } finally {
    setIsLoading(false);
  }
};
```

**5c — Add staleness badge, YTD hint, and error message below the heading row:**

```tsx
{/* Error state */}
{error && !isLoading && (
  <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
    {error}
  </div>
)}

{/* Staleness badge — only when data is from > 30 days ago */}
{!error && data?.dataThrough && (() => {
  const isStale = new Date().getTime() -
    new Date(data.dataThrough).getTime() > 30 * 24 * 60 * 60 * 1000;
  return isStale ? (
    <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
      Data through {data.dataThrough} — upload a new statement to sync
    </div>
  ) : null;
})()}

{/* YTD hint — when YTD range returns only one month */}
{range === 0 && data && data.cashFlow.length === 1 && (
  <p className="text-xs text-muted-foreground -mt-3">
    Showing {data.dataThrough} only — upload data for subsequent months to see full YTD.
  </p>
)}
```

> **Why:** The staleness badge answers the question users have when they open the dashboard in
> May 2026 and see January 2026 data — without it they assume the dashboard is broken. The YTD
> hint explains why YTD and Last Month appear identical, which was the #1 confusing UX finding in
> the PO review. The error state fills the ERR-01 governance gap: never leave the user with a
> silent failure.

---

## Notes

- The percentage shown in Top Categories still uses `currentExpenses` (all expenses including
  investing) as the denominator after the investing filter. Percentages reflect share of *total*
  outflows, not share of *operating* expenses — acceptable for now but worth revisiting if a
  dedicated operating-expenses view is added later.
- The staleness threshold of 30 days is hardcoded in STEP 5c. If the app gains a configurable
  upload frequency setting, derive it from there instead.
- `Withdrawing` and `Insurance` are `CashflowSection.Financing` — they will continue to appear in
  Top Expenses (they are cash outflows, not investments). This is intentional.
- `"Vet and Dog"` in the mapping vs `"Vet and Dog Supply"` in transactions is a data consistency
  mismatch — separate cleanup ticket, not in scope here.
- DashboardService already has `ILogger<DashboardService>` injected; no new tech debt added.
