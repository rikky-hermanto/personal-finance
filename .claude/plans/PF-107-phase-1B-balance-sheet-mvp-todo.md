# PF-107 Phase 1B — Assets Management: Balance Sheet MVP

> **Parent Issue:** PF-107 (Assets Management)
> **Phase:** 1B of 6 — Frontend workspace, first user-visible delivery
> **Status:** Complete
> **Depends on:** Phase 1A complete (all 7 tables migrated, 4 controllers live)
> **Blocks:** Phase 2

## Objective

Ship the minimum visible Assets workspace that lets the user manually replicate their Excel Balance Sheet inside the app. No auto-pricing, no fancy charts — just accurate data entry, a working Net Worth headline, and a basic trend line. The user should be able to open the app, navigate to `/assets/overview`, and see a Net Worth number that matches (or can be manually reconciled to) their current Excel total. This is the moment the Excel workflow becomes optional.

## Acceptance Criteria

- [x] Sidebar has an `/assets` nav entry (icon `Landmark`) positioned between Dashboard and Cashflow
- [x] `/assets/*` route block added to `App.tsx`
- [x] `AssetsLayout.tsx` with 5 tabs: Overview · Accounts · Investments · Properties · Liabilities
- [x] **Overview tab**: NetWorthHeadline (current NW in IDR), NetWorthTrendChart (line chart from `valuations`), AllocationDonut (by asset class)
- [x] **Accounts tab**: lists all institutions + accounts with latest valuation per account; "Add Account" flow with `AddValuationDialog`
- [x] **Investments tab**: HoldingsTable (ticker, quantity, cost basis, latest value, P&L in IDR); "Add Holding" + "Add Valuation" per holding
- [x] **Properties tab**: card list of Real Estate + Tangibles + Vehicles + Receivables assets with latest value + last-updated date
- [x] **Liabilities tab**: table of liabilities with `LtvBadge` for any liability linked to an asset via `asset_id`
- [x] `AddValuationDialog` branches UX by `valuation_strategy`: `Manual` = text input; `RealTime` = read-only (shows auto-price); `Amortized` = schedule-based; `Algorithmic` = formula display
- [x] User can manually replay their Excel data (8 months × ~20 line items) via `AddValuationDialog` and see Net Worth Trend populate correctly
- [x] `/cashflow/accounts` and `pf_custom_wallets` localStorage **untouched** — verify after merge
- [x] All new components follow `.claude/skills/data-oriented-theme/SKILL.md` — no glassmorphism, no consumer-app aesthetics
- [x] Playwright E2E: Add institution → Add account → Add valuation → Verify headline updates

## Approach

Follow the existing tabbed-workspace pattern from `CashflowLayout.tsx` and `SettingsLayout.tsx` — same `Tabs` + `TabsContent` structure, same `AppShell` wrapper. API clients use plain `fetch()` in `src/api/`, same pattern as `transactionsApi.ts`. Net Worth Trend chart reads directly from `valuations` table via `GET /api/networth/history` — no materialized table yet (Phase 3). For low data volume (8 months × 20 assets), direct query is fast enough. Phase 3 adds the `daily_net_worth` materialized table for performance at scale.

Out of scope: auto-pricing (Phase 2), Treemap / Liquidity Ladder / Snapshot Compare (Phase 3), XIRR (Phase 4), Goals tab (Phase 5).

## Affected Files

| File | Change |
|------|--------|
| `apps/frontend/src/components/Sidebar.tsx` | Modify — add `/assets` nav entry with `Landmark` icon |
| `apps/frontend/src/App.tsx` | Modify — add `/assets/*` route block |
| `apps/frontend/src/types/Institution.ts` | Create |
| `apps/frontend/src/types/Account.ts` | Create |
| `apps/frontend/src/types/Asset.ts` | Create — includes `ValuationStrategy` union type |
| `apps/frontend/src/types/Holding.ts` | Create |
| `apps/frontend/src/types/Valuation.ts` | Create — FX quad-tuple fields |
| `apps/frontend/src/types/Liability.ts` | Create — includes optional `ltv` field |
| `apps/frontend/src/api/accountsApi.ts` | Create |
| `apps/frontend/src/api/assetsApi.ts` | Create |
| `apps/frontend/src/api/liabilitiesApi.ts` | Create |
| `apps/frontend/src/api/netWorthApi.ts` | Create |
| `apps/frontend/src/pages/assets/AssetsLayout.tsx` | Create |
| `apps/frontend/src/pages/assets/OverviewTab.tsx` | Create |
| `apps/frontend/src/pages/assets/AccountsTab.tsx` | Create |
| `apps/frontend/src/pages/assets/InvestmentsTab.tsx` | Create |
| `apps/frontend/src/pages/assets/PropertiesTab.tsx` | Create |
| `apps/frontend/src/pages/assets/LiabilitiesTab.tsx` | Create |
| `apps/frontend/src/components/assets/NetWorthHeadline.tsx` | Create |
| `apps/frontend/src/components/assets/NetWorthTrendChart.tsx` | Create |
| `apps/frontend/src/components/assets/AllocationDonut.tsx` | Create |
| `apps/frontend/src/components/assets/AddValuationDialog.tsx` | Create |
| `apps/frontend/src/components/assets/HoldingsTable.tsx` | Create |
| `apps/frontend/src/components/assets/LtvBadge.tsx` | Create |
| `apps/frontend/e2e/assets.spec.ts` | Create |

---

## TODO

### [x] STEP 1 — Create TypeScript types

Create one file per entity in `apps/frontend/src/types/`. Each maps to the API response DTO:

```typescript
// types/Valuation.ts
export interface Valuation {
  id: string;
  subjectType: 'account' | 'asset' | 'holding';
  subjectId: string;
  valueNative: number;
  currency: string;
  fxRateToIdr: number;
  valueIdr: number;
  source: 'manual' | 'price_feed' | 'computed';
  notes?: string;
  valuedAt: string; // ISO 8601
}

// types/Asset.ts
export type ValuationStrategy = 'RealTime' | 'Algorithmic' | 'Amortized' | 'Manual';
export type AssetClass =
  | 'cash' | 'investments' | 'fixed_income' | 'crypto'
  | 'real_estate' | 'tangibles' | 'vehicles' | 'receivables' | 'retirement';

export interface Asset {
  id: string;
  name: string;
  assetClass: AssetClass;
  accountId?: string;
  acquiredDate?: string;
  acquisitionCost?: number;
  currency: string;
  valuationStrategy: ValuationStrategy;
  metadata?: Record<string, unknown>;
  latestValuation?: Valuation; // joined server-side on GET
}

// types/Liability.ts
export interface Liability {
  id: string;
  name: string;
  liabilityType: 'revolving' | 'installment' | 'personal';
  accountId?: string;
  assetId?: string;
  principal: number;
  interestRate?: number;
  startDate: string;
  endDate?: string;
  monthlyPayment?: number;
  ltv?: number; // computed server-side, null if no linked asset
}
```

> **Why define `ltv` as `number | undefined` on the frontend type?** LTV requires a linked asset and a current valuation for that asset. Either could be missing. Marking it optional forces every consumer of `Liability` to handle the null case in the UI — no silent `NaN` rendering.

---

### [x] STEP 2 — Create API client files

Create in `apps/frontend/src/api/`. Follow existing pattern from `transactionsApi.ts` — plain `fetch()`, no axios, use `VITE_API_URL` from env:

```typescript
// api/netWorthApi.ts
const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:7208';

export async function getNetWorthCurrent(): Promise<{ totalIdr: number }> {
  const res = await fetch(`${BASE}/api/networth/current`);
  if (!res.ok) throw new Error('Failed to fetch net worth');
  return res.json();
}

export async function getNetWorthHistory(from?: string, to?: string): Promise<Array<{
  date: string;
  totalIdr: number;
}>> {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const res = await fetch(`${BASE}/api/networth/history?${params}`);
  if (!res.ok) throw new Error('Failed to fetch net worth history');
  return res.json();
}

export async function getAllocationByClass(): Promise<Record<string, number>> {
  const res = await fetch(`${BASE}/api/networth/allocation`);
  if (!res.ok) throw new Error('Failed to fetch allocation');
  return res.json();
}
```

> **Why not React Query hooks inside the API files?** Keep the API layer as pure async functions (fetch wrappers). Hooks live in components — this way API functions are testable without React, and the same function can be called from multiple hooks or outside React.

---

### [x] STEP 3 — Add `/assets` to Sidebar

In `apps/frontend/src/components/Sidebar.tsx`, add the assets nav entry **between Dashboard and Cashflow**:

```tsx
import { Landmark } from 'lucide-react';

// In the nav items array, between Dashboard and Cashflow:
{ href: '/assets', label: 'Assets', icon: Landmark },
```

Run the dev server and verify the Landmark icon appears at the correct position. Clicking it should show a 404 until App.tsx routes are added (next step).

> **Why `Landmark` icon?** Lucide's `Landmark` (a government/bank building) is the standard semantic icon for "balance sheet / net worth / assets" in financial UIs. `TrendingUp` is already used for dashboard growth metrics. Consistent iconography matters more than cleverness.

---

### [x] STEP 4 — Add routes to App.tsx

In `apps/frontend/src/App.tsx`, add the assets route block:

```tsx
import AssetsLayout from '@/pages/assets/AssetsLayout';
import OverviewTab from '@/pages/assets/OverviewTab';
import AccountsTab from '@/pages/assets/AccountsTab';
import InvestmentsTab from '@/pages/assets/InvestmentsTab';
import PropertiesTab from '@/pages/assets/PropertiesTab';
import LiabilitiesTab from '@/pages/assets/LiabilitiesTab';

// Inside the router:
<Route path="/assets" element={<AssetsLayout />}>
  <Route index element={<Navigate to="/assets/overview" replace />} />
  <Route path="overview" element={<OverviewTab />} />
  <Route path="accounts" element={<AccountsTab />} />
  <Route path="investments" element={<InvestmentsTab />} />
  <Route path="properties" element={<PropertiesTab />} />
  <Route path="liabilities" element={<LiabilitiesTab />} />
</Route>
```

> **Why nested routes with `<Outlet />` instead of state-based tab switching?** The existing cashflow workspace uses this pattern (`/cashflow/transactions`, `/cashflow/upload`). Nested routes mean the active tab is bookmarkable, browser-back navigable, and deep-linkable. State-based tabs break all three.

---

### [x] STEP 5 — Create AssetsLayout.tsx

```tsx
// pages/assets/AssetsLayout.tsx
import { Outlet, NavLink } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { PageHeader } from '@/components/PageHeader';

const tabs = [
  { to: '/assets/overview',     label: 'Overview'     },
  { to: '/assets/accounts',     label: 'Accounts'     },
  { to: '/assets/investments',  label: 'Investments'  },
  { to: '/assets/properties',   label: 'Properties'   },
  { to: '/assets/liabilities',  label: 'Liabilities'  },
];

export default function AssetsLayout() {
  return (
    <AppShell>
      <PageHeader title="Assets" subtitle="Balance sheet & net worth" />
      <nav className="flex gap-1 border-b border-border mb-6">
        {tabs.map(tab => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                isActive
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </AppShell>
  );
}
```

> **Why copy the tab nav pattern instead of abstracting it?** The same visual pattern (border-b-2 active underline) exists in `CashflowLayout.tsx` and `SettingsLayout.tsx`. Three similar files is not yet the threshold for abstraction — wait until a 4th workspace appears. Premature abstraction here would mean changing the shared component every time one workspace tab needs different behaviour.

---

### [x] STEP 6 — Create OverviewTab.tsx with 3 widgets

```tsx
// pages/assets/OverviewTab.tsx
import { useQuery } from '@tanstack/react-query';
import { NetWorthHeadline } from '@/components/assets/NetWorthHeadline';
import { NetWorthTrendChart } from '@/components/assets/NetWorthTrendChart';
import { AllocationDonut } from '@/components/assets/AllocationDonut';
import { getNetWorthCurrent, getNetWorthHistory, getAllocationByClass } from '@/api/netWorthApi';

export default function OverviewTab() {
  const { data: current } = useQuery({ queryKey: ['networth-current'], queryFn: getNetWorthCurrent });
  const { data: history } = useQuery({ queryKey: ['networth-history'], queryFn: () => getNetWorthHistory() });
  const { data: allocation } = useQuery({ queryKey: ['networth-allocation'], queryFn: getAllocationByClass });

  return (
    <div className="space-y-6">
      <NetWorthHeadline totalIdr={current?.totalIdr} />
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <NetWorthTrendChart data={history ?? []} />
        </div>
        <AllocationDonut data={allocation ?? {}} />
      </div>
    </div>
  );
}
```

**`NetWorthHeadline`**: large IDR number + percentage change since last month. Use `@/lib/format.ts` for IDR formatting. Format: `Rp 1.291.427.205,83` matching user's existing Excel format.

**`NetWorthTrendChart`**: Recharts `LineChart` — x-axis = month labels (Sep 2025 … Apr 2026), y-axis = IDR value in billions. Use `--chart-1` token for the line color.

**`AllocationDonut`**: Recharts `PieChart` — one slice per asset class, labelled with class name + percentage. Use `--chart-1` through `--chart-5` tokens for slice colors.

> **Why 3-column grid with trend taking 2 columns?** The trend chart is the highest-information density widget — it tells the user *if* wealth is growing. The donut answers *what* it's in. Width ratio 2:1 reflects their relative importance. This is Bloomberg-density thinking: pack signal per pixel, don't equalize widget sizes.

---

### [x] STEP 7 — Create AccountsTab.tsx

Displays grouped by Institution. Each institution expands to show its accounts with latest `value_idr`. "Add Valuation" button per account opens `AddValuationDialog`.

Key data pattern:
```typescript
// Group accounts by institution_id on the frontend
const byInstitution = accounts.reduce((acc, account) => {
  const key = account.institutionId ?? 'unlinked';
  if (!acc[key]) acc[key] = [];
  acc[key].push(account);
  return acc;
}, {} as Record<string, Account[]>);
```

Each account row shows: account name, currency, latest `value_idr`, last-updated date. Multi-currency accounts (e.g. Wise USD) show both native and IDR value.

---

### [x] STEP 8 — Create InvestmentsTab.tsx with HoldingsTable

`HoldingsTable` columns: Institution, Ticker, Quantity, Avg Cost (IDR), Latest Price (IDR/unit), Market Value (IDR), P&L (IDR + %), Weight (% of total holdings).

Phase 1B: Price and Market Value come from the latest `Valuation` row for the holding, entered manually via `AddValuationDialog`. Phase 2 will auto-populate these via CoinGecko / price feeds.

> **Why show P&L in Phase 1B before auto-pricing?** The user enters both `cost_basis` at acquisition and current `value_idr` via manual valuation. P&L = `value_idr - (cost_basis × quantity)`. This works purely from entered data — no price feed required.

---

### [x] STEP 9 — Create PropertiesTab.tsx

Card grid layout — one card per asset in classes: `real_estate`, `tangibles`, `vehicles`, `receivables`, `retirement`.

Each card:
- Asset name + asset class badge
- Latest `value_idr` (large, bold)
- `valuation_strategy` badge: `Manual` / `RealTime` / `Amortized` / `Algorithmic`
- Last updated: "Updated 3 days ago" (relative date)
- "Update Valuation" button → `AddValuationDialog`

For `receivables` (Piutang): show face value + a "Collectible" status toggle (user marks as collectible/doubtful — stored in `metadata.status`).

---

### [x] STEP 10 — Create LiabilitiesTab.tsx with LtvBadge

Table columns: Name, Type, Principal (IDR), Interest Rate, Monthly Payment, Linked Account/Asset, LTV.

```tsx
// components/assets/LtvBadge.tsx
interface LtvBadgeProps { ltv?: number }

export function LtvBadge({ ltv }: LtvBadgeProps) {
  if (ltv == null) return null;
  const pct = Math.round(ltv * 100);
  const color = pct < 60 ? 'text-success' : pct < 80 ? 'text-warning' : 'text-destructive';
  return (
    <span className={`font-mono tabular-nums text-xs ${color}`}>
      LTV {pct}%
    </span>
  );
}
```

LTV thresholds: < 60% = green (healthy), 60-80% = amber (watch), > 80% = red (alert).

---

### [x] STEP 11 — Create AddValuationDialog.tsx

Central dialog for entering valuations. Branches by `valuation_strategy`:

```tsx
// components/assets/AddValuationDialog.tsx
type Props = {
  subjectType: 'account' | 'asset' | 'holding';
  subjectId: string;
  subjectName: string;
  currency: string;
  strategy: ValuationStrategy;
  onSuccess: () => void;
}

// Strategy branching in render:
// Manual:      date picker + value input + optional notes
// RealTime:    read-only (shows latest price_feed value with refresh button — Phase 2)
// Amortized:   date picker + auto-computed value based on schedule (shows formula)
// Algorithmic: date picker + auto-computed value (shows formula, e.g. depreciation)
```

For Phase 1B, `RealTime` and `Algorithmic` still allow manual override with a warning: "Auto-pricing available in Phase 2. Enter manually for now."

FX conversion preview: when `currency ≠ IDR`, show live conversion using the latest `fx_rates` row:
`USD 1,000 → ~Rp 16,200,000 (rate: 16,200 · JISDOR 2026-05-14)`

> **Why show the FX preview?** This is the user's exact problem with the Excel — they manually looked up exchange rates and typed them in. Showing the preview builds trust that the FX conversion is correct. It also surfaces JISDOR connectivity problems early (if the rate looks wrong, the user knows before saving).

---

### [x] STEP 12 — Write Playwright E2E test

Create `apps/frontend/e2e/assets.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test('assets flow: add institution → account → valuation → verify headline', async ({ page }) => {
  await page.goto('/assets/overview');

  // Headline shows — even if Rp 0
  await expect(page.getByTestId('net-worth-headline')).toBeVisible();

  // Navigate to accounts tab
  await page.click('a[href="/assets/accounts"]');

  // Add institution
  await page.click('button:has-text("Add Institution")');
  await page.fill('[name="name"]', 'BCA Test');
  await page.selectOption('[name="type"]', 'bank');
  await page.click('button:has-text("Save")');
  await expect(page.getByText('BCA Test')).toBeVisible();

  // Add account
  await page.click('button:has-text("Add Account")');
  await page.fill('[name="name"]', 'BCA Tabungan');
  await page.selectOption('[name="accountType"]', 'savings');
  await page.click('button:has-text("Save")');

  // Add valuation
  await page.click('button:has-text("Add Valuation")');
  await page.fill('[name="valueNative"]', '50000000');
  await page.click('button:has-text("Save")');

  // Overview should update
  await page.click('a[href="/assets/overview"]');
  await expect(page.getByTestId('net-worth-headline')).toContainText('50');
});
```

> **Why test the full Add→View flow rather than individual component renders?** These are Playwright E2E tests, not unit tests. The value is catching integration failures: "does the POST actually land in the DB and reflect in the GET?" Unit tests can't catch that. Full flow = full confidence.

---

## Reference: Asset Class → User's Excel Mapping

| App `asset_class` | User's Excel row | Example entries |
|---|---|---|
| `cash` | Hard Cash (BCA, Bank Jago, Neo Bank, Seabank, Superbank, Wise) | Tabungan, Giro, e-money |
| `investments` | Stock/Mutual Fund (Mansek, Bibit, Stockbit) | BBCA, Reksa Dana Saham |
| `fixed_income` | (not in Excel yet) | ORI, SBN, Deposito |
| `crypto` | Crypto Coin (Binance, Pluang) | BTC, ETH, PAXG |
| `real_estate` | Plot Land (Silangit) | Tanah, Rumah |
| `tangibles` | Gold (Tokopedia, Bulaklak) | Emas batangan |
| `vehicles` | (not in Excel yet) | Mobil, Motor |
| `receivables` | Piutang (Melda/Lae, Nelly, Roga, Pesta, Ucok) | Pinjaman ke orang |
| `retirement` | Jamsostek | BPJS, DPLK |

## Notes

- **Read skills first**: Before writing any component, read `.claude/skills/data-oriented-theme/SKILL.md`. The data-oriented theme drives all visual decisions (mono font for numbers, divider-based cards, no decorative gradients).
- **`latestValuation` join**: The `GET /api/assets` controller should JOIN the latest `Valuation` per asset and include it in the response DTO. Avoids N+1 queries on the frontend. If the join is too expensive, a separate `GET /api/assets/{id}/valuation/latest` per card is acceptable for Phase 1B volume.
- **`/cashflow/accounts` independence check**: After merge, navigate to `/cashflow/transactions` and the AccountsTab. Verify `pf_custom_wallets` localStorage still works. The two account concepts must coexist silently.
- **IDR formatting**: All `value_idr` displays should use `formatIDR()` from `@/lib/format.ts` — format `1291427205.83` as `Rp 1.291.427.205,83` (Indonesian thousands separator = `.`, decimal = `,`) matching the user's Excel exactly.
