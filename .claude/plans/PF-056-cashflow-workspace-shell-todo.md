# PF-056 — Cashflow Workspace Shell (Tabs + Sidebar IA Update)

> **GitHub Issue:** [#79](https://github.com/rikky-hermanto/personal-finance/issues/79)
> **Status:** TODO
> **Depends on:** PF-055 (URL routing migration — MUST be done first)
> **Feeds into:** PF-057 (Cashflow Overview tab content)

## Objective

Build the Cashflow workspace as a tabbed shell — the primary workflow surface for daily cashflow work. When the user clicks "Cashflow" in the sidebar they land on a page with three horizontal tabs at the top (Overview / Transactions / Upload), styled like Stockbit/TradingView: a single workspace with tools in it, not a list of separate features.

This ticket also performs the sidebar IA update: "Upload" and "Transactions" disappear as top-level items, replaced by a single "Cashflow" entry. Categories stays for now (moved in PF-058).

The shadcn `Tabs` component is already installed (`components/ui/tabs.tsx`). `WalletTabs.tsx` is the existing usage reference for styling.

## Acceptance Criteria

- [ ] Create `pages/cashflow/CashflowLayout.tsx` — page shell with header + horizontal tabs, renders `<Outlet />` below tabs
- [ ] Tabs use shadcn `Tabs`, styled consistent with `WalletTabs.tsx` (bg-muted, h-8, text-xs triggers)
- [ ] Active tab driven by `useLocation` — tab highlight follows URL, not internal state
- [ ] Nested routes: `/cashflow` → redirects to `/cashflow/overview`, plus `/cashflow/overview`, `/cashflow/transactions`, `/cashflow/upload`
- [ ] Create `pages/cashflow/OverviewTab.tsx` (placeholder — "Coming in PF-057")
- [ ] Create `pages/cashflow/TransactionsTab.tsx` wrapping existing `<TransactionTable />`
- [ ] Create `pages/cashflow/UploadTab.tsx` wrapping existing `<FileUpload />`
- [ ] Sidebar: replace `upload` + `transactions` items with single `cashflow` item → `/cashflow`; item is active for all `/cashflow/*` URLs
- [ ] Old routes `/upload` and `/transactions` redirect to `/cashflow/upload` and `/cashflow/transactions`
- [ ] "New upload" CTA in Sidebar navigates to `/cashflow/upload`
- [ ] Extract shared `components/PageHeader.tsx` used across all tab pages

## Approach

`CashflowLayout` is a layout route component (like AppShell, but scoped). It renders:
1. A `PageHeader` ("Cashflow" title + subtitle)
2. A tab bar (`Tabs` + `TabsList` + `TabsTrigger` for each of the 3 tabs)
3. `<Outlet />` below — the active tab's content renders here

Active tab is computed from `useLocation().pathname` matching against `/cashflow/overview`, `/cashflow/transactions`, `/cashflow/upload`. Clicking a tab navigates via `useNavigate`. This avoids double-source-of-truth (tab state + URL) bugs.

`UploadTab` and `TransactionsTab` are thin wrappers — they remove the outer `p-8 / max-w-6xl` wrapper (now owned by the layout) and just render the business component.

Out of scope: Overview tab real content (PF-057), Settings nested routes (PF-058), visual restyling of FileUpload or TransactionTable internals.

## Affected Files

| File | Change |
|------|--------|
| Create `apps/frontend/src/pages/cashflow/CashflowLayout.tsx` | New layout route with tabs + Outlet |
| Create `apps/frontend/src/pages/cashflow/OverviewTab.tsx` | Placeholder |
| Create `apps/frontend/src/pages/cashflow/TransactionsTab.tsx` | Wraps `<TransactionTable />` |
| Create `apps/frontend/src/pages/cashflow/UploadTab.tsx` | Wraps `<FileUpload />` |
| Create `apps/frontend/src/components/PageHeader.tsx` | Shared header pattern (title + subtitle) |
| `apps/frontend/src/App.tsx` | Add `/cashflow/*` nested routes + `/upload` `/transactions` redirects |
| `apps/frontend/src/components/Sidebar.tsx` | Replace upload + transactions with cashflow; fix CTA; add `/cashflow/*` active matcher |
| `apps/frontend/src/pages/UploadPage.tsx` | Keep (still needed for old-URL redirect target or remove if redirect is in App.tsx) |
| `apps/frontend/src/pages/TransactionsPage.tsx` | Same as above |

---

## TODO

### [ ] STEP 1 — Create shared `PageHeader` component

Create `apps/frontend/src/components/PageHeader.tsx`:

```tsx
interface PageHeaderProps {
  title: string;
  subtitle?: string;
}

const PageHeader = ({ title, subtitle }: PageHeaderProps) => (
  <div className="mb-6">
    <h1 className="text-xl font-semibold">{title}</h1>
    {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
  </div>
);

export default PageHeader;
```

> **Why extract this now?** Every page in Index.tsx repeated the same `mb-6 / h1.text-xl + p.text-sm.text-muted-foreground` markup. CashflowLayout renders one header above the tabs — without a shared component this pattern would diverge between pages over time. Also used in SettingsLayout (PF-058).

---

### [ ] STEP 2 — Read WalletTabs.tsx for tab styling reference

```bash
cat apps/frontend/src/components/dashboard/WalletTabs.tsx
cat apps/frontend/src/components/ui/tabs.tsx
```

Note the exact Tailwind classes used on `TabsList` and `TabsTrigger` — apply them consistently in CashflowLayout.

> **Why:** shadcn Tabs are unstyled by default. WalletTabs already has the project's established tab styling (`bg-muted h-8 gap-0.5 p-0.5` on TabsList, `text-xs h-7 px-3 rounded-sm data-[state=active]:bg-card` on TabsTrigger). Matching this prevents two different tab styles co-existing.

---

### [ ] STEP 3 — Create CashflowLayout with URL-driven tabs

Create `apps/frontend/src/pages/cashflow/CashflowLayout.tsx`:

```tsx
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from "@/components/PageHeader";

const TABS = [
  { value: "overview",      label: "Overview",      path: "/cashflow/overview" },
  { value: "transactions",  label: "Transactions",  path: "/cashflow/transactions" },
  { value: "upload",        label: "Upload",        path: "/cashflow/upload" },
];

const CashflowLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const activeTab = TABS.find((t) => location.pathname.startsWith(t.path))?.value ?? "overview";

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        <PageHeader
          title="Cashflow"
          subtitle="Track income, expenses, and upload bank statements"
        />

        <Tabs value={activeTab} onValueChange={(v) => {
          const tab = TABS.find((t) => t.value === v);
          if (tab) navigate(tab.path);
        }}>
          <TabsList className="bg-muted h-8 gap-0.5 p-0.5 mb-6">
            {TABS.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="text-xs h-7 px-3 rounded-sm data-[state=active]:bg-card"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Outlet />
      </div>
    </div>
  );
};

export default CashflowLayout;
```

> **Why `useLocation` + `useNavigate` instead of `<TabsContent>` children?** With `<TabsContent>`, all tab content mounts inside the `<Tabs>` component — which conflicts with the nested-route `<Outlet />` pattern where each tab is a separate route. URL-driven tab value with `onValueChange` → `navigate()` gives us URL routing AND tab UX. The active tab always matches the URL — no state divergence.
>
> **Why `startsWith` instead of exact match?** `/cashflow/upload` may have sub-paths later (e.g., `/cashflow/upload/preview`). `startsWith` keeps the tab highlighted for all child paths.

---

### [ ] STEP 4 — Create tab page components

Create `apps/frontend/src/pages/cashflow/OverviewTab.tsx`:
```tsx
const OverviewTab = () => (
  <div className="text-muted-foreground text-sm py-8 text-center">
    Cashflow overview coming soon — PF-057
  </div>
);
export default OverviewTab;
```

Create `apps/frontend/src/pages/cashflow/TransactionsTab.tsx`:
```tsx
import TransactionTable from "@/components/TransactionTable";

const TransactionsTab = () => <TransactionTable />;
export default TransactionsTab;
```

Create `apps/frontend/src/pages/cashflow/UploadTab.tsx`:
```tsx
import FileUpload from "@/components/FileUpload";

const UploadTab = () => <FileUpload />;
export default UploadTab;
```

> **Why no outer padding in tab components?** CashflowLayout already handles `p-8 / max-w-6xl`. Adding it in tab components would double-pad. The layout owns the container; tabs own only their content.

---

### [ ] STEP 5 — Add Cashflow routes to App.tsx

Add the nested `/cashflow/*` route block and old-URL redirects:

```tsx
import { Navigate, Route, Routes } from "react-router-dom";
import CashflowLayout from "@/pages/cashflow/CashflowLayout";
import OverviewTab from "@/pages/cashflow/OverviewTab";
import TransactionsTab from "@/pages/cashflow/TransactionsTab";
import UploadTab from "@/pages/cashflow/UploadTab";

// Inside <Route path="/" element={<AppShell />}>:

{/* Old flat routes redirect to cashflow workspace */}
<Route path="upload" element={<Navigate to="/cashflow/upload" replace />} />
<Route path="transactions" element={<Navigate to="/cashflow/transactions" replace />} />

{/* Cashflow workspace */}
<Route path="cashflow" element={<CashflowLayout />}>
  <Route index element={<Navigate to="overview" replace />} />
  <Route path="overview" element={<OverviewTab />} />
  <Route path="transactions" element={<TransactionsTab />} />
  <Route path="upload" element={<UploadTab />} />
</Route>
```

> **Why `replace` on the `/cashflow` index redirect?** Without `replace`, navigating to `/cashflow` pushes a history entry that the browser back button hits (landing on `/cashflow` again, which redirects again). `replace` avoids this redirect loop in history.

---

### [ ] STEP 6 — Update Sidebar

Replace `upload` and `transactions` items with `cashflow`. Update the NavLink `to` and the `end` prop (so `/cashflow` item stays active for all `/cashflow/*` URLs):

```tsx
const menuItems = [
  { id: "dashboard",  label: "Dashboard",  icon: BarChart3, to: "/dashboard" },
  { id: "cashflow",   label: "Cashflow",   icon: Wallet,    to: "/cashflow" },
  { id: "categories", label: "Categories", icon: Tag,       to: "/categories" },
  { id: "settings",   label: "Settings",   icon: Settings2, to: "/settings" },
];
```

For the Cashflow NavLink, omit the `end` prop so it stays active for child paths:
```tsx
<NavLink
  to={item.to}
  end={item.id !== "cashflow"}  // cashflow stays active for /cashflow/*
  className={({ isActive }) => cn(...)}
>
```

Update the "New upload" CTA:
```tsx
<button onClick={() => navigate("/cashflow/upload")} ...>
  + New upload
</button>
```

> **Why keep Categories in sidebar for now?** Categories moves to Settings in PF-058. Doing it in this ticket would conflate two concerns (cashflow IA + settings IA). Keep Categories where it is — PF-058 removes it.

---

### [ ] STEP 7 — Smoke test

```bash
cd apps/frontend && npm run dev
```

Manual checks:
- [ ] Click "Cashflow" in sidebar → URL becomes `/cashflow/overview`, Overview tab active (placeholder text shows)
- [ ] Click "Transactions" tab → URL becomes `/cashflow/transactions`, TransactionTable renders and loads data
- [ ] Click "Upload" tab → URL becomes `/cashflow/upload`, FileUpload renders
- [ ] Refresh browser at `/cashflow/transactions` → stays on Transactions tab
- [ ] Navigate to `/upload` (old URL) → redirects to `/cashflow/upload`
- [ ] Navigate to `/transactions` (old URL) → redirects to `/cashflow/transactions`
- [ ] "New upload" CTA → navigates to `/cashflow/upload`
- [ ] Sidebar "Cashflow" item highlighted for all `/cashflow/*` paths
- [ ] "Dashboard" and "Categories" sidebar items still work as before

---

## Notes

- `UploadPage.tsx` and `TransactionsPage.tsx` created in PF-055 are now replaced by redirects. They can be deleted — or kept temporarily if needed for non-cashflow-tab access (not needed per the new IA).
- `FileUpload` currently calls `transactionsApi.uploadPreview()` then renders `TransactionPreview`. The full upload → preview → submit flow should work unchanged inside the UploadTab wrapper. Verify the full happy path in smoke test.
- `TransactionTable` fetches independently via `useEffect` — no prop threading needed.
- The `Wallet` icon used for "Cashflow" in the sidebar — check if it's already imported from `lucide-react` in `Sidebar.tsx`, or add it.
- **What's next:** PF-057 replaces OverviewTab placeholder with real cashflow widgets. PF-058 builds Settings shell and moves Categories under it.
