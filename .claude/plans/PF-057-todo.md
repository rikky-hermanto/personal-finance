# PF-057 — Cashflow Overview Tab Content

> **GitHub Issue:** [#80](https://github.com/rikky-hermanto/personal-finance/issues/80)
> **Status:** TODO
> **Depends on:** PF-056 (Cashflow workspace shell — OverviewTab.tsx must exist as placeholder)
> **Parallel with:** PF-058

## Objective

Replace the OverviewTab placeholder with a slim, cashflow-focused summary that gives users an instant read of their financial health when they open the Cashflow workspace. This is the "first glance" view — not a full drill-down.

At the same time, refactor `CashFlowDashboard.tsx` into composable widget components so the global Dashboard and Cashflow Overview can each compose only the widgets they need. Dashboard = cross-module monitoring surface (will grow to include portfolio + debts). Cashflow Overview = cashflow-only lens.

If we copy the full dashboard into Overview we get two identical pages. If we gut the Dashboard we lose the global monitoring home. Extracting widgets solves both.

## Acceptance Criteria

- [ ] `CashFlowDashboard.tsx` refactored — extracts `NetCashflowCard`, `TopCategoriesCard`, `MonthlyFlowChart` into `components/dashboard/widgets/`
- [ ] `pages/cashflow/OverviewTab.tsx` composes the 3 cashflow widgets + 2 quick-action buttons
- [ ] Quick actions: "Upload statement" links to `/cashflow/upload`, "View all transactions" links to `/cashflow/transactions`
- [ ] `pages/DashboardPage.tsx` (global Dashboard) reuses the same widgets + adds placeholder sections for "Portfolio" and "Debts"
- [ ] All widgets use the same data source as the current dashboard (no new API calls needed)

## Approach

Read `CashFlowDashboard.tsx` to identify which JSX blocks map to which widgets, then extract each block into its own file in `components/dashboard/widgets/`. Each widget is a self-contained component that fetches or receives its own data via the existing hooks/API calls.

`DashboardPage` wraps the 3 cashflow widgets identically to the old `CashFlowDashboard`, then appends two placeholder card sections for Portfolio and Debts (disabled/greyed out with "Coming soon" text). This makes the Dashboard's growth direction visually obvious.

`OverviewTab` composes only the 3 cashflow widgets in a tighter layout, plus quick-action buttons at the top.

Out of scope: actual Portfolio or Debts data (placeholders only), new API endpoints, restyling widget internals.

## Affected Files

| File | Change |
|------|--------|
| `apps/frontend/src/components/CashFlowDashboard.tsx` | Refactor — extract widgets; optionally keep as thin composer or delete |
| Create `apps/frontend/src/components/dashboard/widgets/NetCashflowCard.tsx` | Extracted widget |
| Create `apps/frontend/src/components/dashboard/widgets/TopCategoriesCard.tsx` | Extracted widget |
| Create `apps/frontend/src/components/dashboard/widgets/MonthlyFlowChart.tsx` | Extracted widget |
| `apps/frontend/src/pages/cashflow/OverviewTab.tsx` | Replace placeholder — compose 3 widgets + quick actions |
| `apps/frontend/src/pages/DashboardPage.tsx` | Recompose with same widgets + Portfolio/Debts placeholder cards |

---

## TODO

### [ ] STEP 1 — Read CashFlowDashboard.tsx in full

```bash
cat apps/frontend/src/components/CashFlowDashboard.tsx
```

Map the component's internal JSX to the three widgets. Identify:
- What data each widget section needs (props, internal state, API calls)
- Whether data is fetched inside the dashboard or received as props
- Which hooks/utilities are used (`useTransactions`, `mockTransactions`, etc.)

> **Why read first?** `CashFlowDashboard` is 198 LOC. Without reading it, we might split at the wrong seam and break data flow. The widget extraction must respect where data lives.

---

### [ ] STEP 2 — Extract `NetCashflowCard` widget

Create `apps/frontend/src/components/dashboard/widgets/NetCashflowCard.tsx`.

Pattern (adjust to match actual CashFlowDashboard internals after Step 1):
```tsx
interface NetCashflowCardProps {
  totalIncome: number;
  totalExpense: number;
  month?: string;
}

const NetCashflowCard = ({ totalIncome, totalExpense, month }: NetCashflowCardProps) => {
  const net = totalIncome - totalExpense;
  // ... render card with net, income, expense
};

export default NetCashflowCard;
```

If the dashboard fetches data internally (useEffect/useQuery inside), preserve that pattern inside the widget — don't add a new fetch, just move the existing code.

> **Why accept props instead of always fetching internally?** If both Dashboard and OverviewTab render the same widget, two fetches for the same data would fire. If the data is already fetched at a parent level, props allow reuse without duplication. Match whatever pattern the current dashboard uses.

---

### [ ] STEP 3 — Extract `TopCategoriesCard` widget

Create `apps/frontend/src/components/dashboard/widgets/TopCategoriesCard.tsx`.

Shows top 3–5 expense categories for the current month. Extract exactly what `CashFlowDashboard` already renders for this — no new logic.

---

### [ ] STEP 4 — Extract `MonthlyFlowChart` widget

Create `apps/frontend/src/components/dashboard/widgets/MonthlyFlowChart.tsx`.

Shows the 6-month cashflow trend (income vs expense bar/line chart via Recharts). Extract from `CashFlowDashboard`.

> **Why keep Recharts?** It's already installed and used. No need to introduce a new charting library for this refactor.

---

### [ ] STEP 5 — Build OverviewTab with widgets + quick actions

Replace `pages/cashflow/OverviewTab.tsx` placeholder:

```tsx
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Upload, List } from "lucide-react";
import NetCashflowCard from "@/components/dashboard/widgets/NetCashflowCard";
import TopCategoriesCard from "@/components/dashboard/widgets/TopCategoriesCard";
import MonthlyFlowChart from "@/components/dashboard/widgets/MonthlyFlowChart";

const OverviewTab = () => (
  <div className="space-y-6">
    {/* Quick actions */}
    <div className="flex gap-3">
      <Button asChild variant="outline" size="sm">
        <Link to="/cashflow/upload">
          <Upload className="h-4 w-4 mr-2" />
          Upload statement
        </Link>
      </Button>
      <Button asChild variant="ghost" size="sm">
        <Link to="/cashflow/transactions">
          <List className="h-4 w-4 mr-2" />
          View all transactions
        </Link>
      </Button>
    </div>

    {/* Cashflow widgets */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <NetCashflowCard />
      <TopCategoriesCard />
    </div>
    <MonthlyFlowChart />
  </div>
);

export default OverviewTab;
```

Adjust the grid layout based on actual widget sizes from Step 1 reading.

> **Why quick actions at the top?** Overview is a summary — the natural next action after seeing the summary is to either add data (upload) or investigate (transactions). Surfacing these as primary actions makes the workspace flow explicit.

---

### [ ] STEP 6 — Update DashboardPage with widgets + placeholders

Replace `pages/DashboardPage.tsx` (which currently just renders `<CashFlowDashboard />`):

```tsx
import NetCashflowCard from "@/components/dashboard/widgets/NetCashflowCard";
import TopCategoriesCard from "@/components/dashboard/widgets/TopCategoriesCard";
import MonthlyFlowChart from "@/components/dashboard/widgets/MonthlyFlowChart";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import PageHeader from "@/components/PageHeader";

const ComingSoonCard = ({ title }: { title: string }) => (
  <Card className="opacity-50">
    <CardHeader>
      <CardTitle className="text-sm font-medium">{title}</CardTitle>
    </CardHeader>
    <CardContent>
      <p className="text-xs text-muted-foreground">Coming soon</p>
    </CardContent>
  </Card>
);

const DashboardPage = () => (
  <div className="p-8">
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Dashboard"
        subtitle="Your complete financial overview"
      />

      {/* Cashflow section */}
      <section className="mb-8">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-4">Cashflow</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <NetCashflowCard />
          <TopCategoriesCard />
        </div>
        <MonthlyFlowChart />
      </section>

      {/* Future sections — placeholders */}
      <section className="mb-8">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-4">Portfolio</h2>
        {/* TODO: PF-Portfolio — holdings, performance, allocation */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ComingSoonCard title="Holdings" />
          <ComingSoonCard title="Performance" />
          <ComingSoonCard title="Allocation" />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-4">Debts & Receivables</h2>
        {/* TODO: PF-Debts — outstanding debts, due-date alerts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ComingSoonCard title="Debts" />
          <ComingSoonCard title="Receivables" />
        </div>
      </section>
    </div>
  </div>
);

export default DashboardPage;
```

> **Why section headers on Dashboard?** When Portfolio and Debts are built, the Dashboard will compose their widgets under clear section headers. Placeholder sections with `opacity-50` cards communicate the growth direction without building the real data yet. The user can see where things will live.

---

### [ ] STEP 7 — Delete or slim down CashFlowDashboard.tsx

After widgets are extracted and DashboardPage no longer imports `CashFlowDashboard`, check if anything else still imports it:

```bash
grep -r "CashFlowDashboard" apps/frontend/src/
```

If nothing imports it → delete the file. If still referenced → keep it temporarily, convert to a thin composer that re-exports the extracted widgets.

---

### [ ] STEP 8 — Smoke test

```bash
cd apps/frontend && npm run dev
```

Manual checks:
- [ ] Cashflow > Overview tab: shows 3 widgets with real data (or empty-state message if no transactions)
- [ ] Overview quick actions: "Upload statement" → `/cashflow/upload`, "View all transactions" → `/cashflow/transactions`
- [ ] Dashboard page: shows Cashflow section with same 3 widgets + Portfolio/Debts placeholder cards
- [ ] No duplicate API calls (open Network tab — widget data fetched once per widget, not twice)
- [ ] No console errors

---

## Notes

- Widget data sourcing depends entirely on what's in `CashFlowDashboard.tsx` — read it first (Step 1) before writing any widget code. If it uses `mockTransactions` seeded in Index.tsx state, that pattern must be replaced with an internal fetch or React Query.
- If widgets accept data as props (more flexible for composition), both OverviewTab and DashboardPage would need to fetch the data at their level and pass down. If widgets fetch internally, they just render anywhere. Internal fetch is simpler for now.
- `CashFlowDashboard` may already use `@tanstack/react-query` — check. If it does, React Query caching means two components fetching the same query key will hit the cache, not the network twice.
- **What's next:** PF-058 (Settings + Categories nesting) is independent and can be done in parallel.
