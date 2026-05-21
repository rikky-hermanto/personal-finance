# PF-055 — URL Routing Migration (activeView → react-router)

> **GitHub Issue:** [#78](https://github.com/rikky-hermanto/personal-finance/issues/78)
> **Status:** TODO
> **Feeds into:** PF-056 (Cashflow workspace shell)

## Objective

Replace the `activeView` string-state navigation in `Index.tsx` with proper URL-based routing using `react-router-dom`. Currently the entire app is a single-page state machine — clicking "Transactions" in the sidebar sets `activeView = 'transactions'` and a switch statement swaps the content. The browser URL never changes, making back/forward broken, deep-links impossible, and nested routes (needed for Cashflow tabs in PF-056 and Settings in PF-058) infeasible.

`react-router-dom` is already installed and `BrowserRouter` is mounted in `App.tsx`, but only two routes exist (`/` and `*`). This ticket migrates to URL routes without any visible UX change — same sidebar, same pages, just driven by URL now.

## Acceptance Criteria

- [ ] Routes registered in `App.tsx`: `/dashboard`, `/upload`, `/transactions`, `/categories`, `/settings`
- [ ] `/` redirects to `/dashboard`
- [ ] `Sidebar.tsx` uses `<NavLink>` for active state — drops `activeView`/`onViewChange` props
- [ ] `AppShell.tsx` uses `<Outlet />` to render child route content — drops `children` prop
- [ ] `Index.tsx` `renderContent()` switch removed — each view becomes its own page component in `pages/`
- [ ] "New upload" CTA in Sidebar uses `<Link to="/upload">` or `useNavigate('/upload')`
- [ ] Browser back/forward works; refresh at `/transactions` stays on Transactions

## Approach

Extract each `case` from `Index.tsx`'s `renderContent()` switch into its own thin page component (`DashboardPage`, `UploadPage`, `TransactionsPage`, `CategoriesPage`, `SettingsPage`) in `src/pages/`. These components are wrappers — they just render the existing business components (`CashFlowDashboard`, `FileUpload`, etc.) with the same header markup they had in Index.

`AppShell` becomes the layout route: it renders the sidebar + main area shell, and `<Outlet />` fills the content pane. `App.tsx` declares the route tree. `Sidebar` switches from `activeView === item.id` comparison to `NavLink`'s built-in `isActive` based on `to` path.

`Index.tsx` is effectively deleted (its logic distributes into page components + App.tsx routes).

Out of scope: no nested routes yet (those come in PF-056/PF-058), no visual changes, no new components beyond thin page wrappers.

## Affected Files

| File | Change |
|------|--------|
| `apps/frontend/src/App.tsx` | Replace 2-route config with full route tree; add Navigate redirect from `/` |
| `apps/frontend/src/pages/Index.tsx` | Delete `renderContent()` + state wiring; file becomes obsolete (remove or empty) |
| `apps/frontend/src/components/AppShell.tsx` | Replace `{children}` with `<Outlet />`; drop `activeView`/`onViewChange`/`transactions` props |
| `apps/frontend/src/components/Sidebar.tsx` | Replace `onViewChange`/`isActive` with `<NavLink>`; drop `activeView`/`onViewChange` props; CTA uses `<Link>` |
| Create `apps/frontend/src/pages/DashboardPage.tsx` | Wraps `<CashFlowDashboard />` + header markup |
| Create `apps/frontend/src/pages/UploadPage.tsx` | Wraps `<FileUpload />` + header markup |
| Create `apps/frontend/src/pages/TransactionsPage.tsx` | Wraps `<TransactionTable />` + header markup |
| Create `apps/frontend/src/pages/CategoriesPage.tsx` | Wraps `<CategoryManager />` + header markup |
| Create `apps/frontend/src/pages/SettingsPage.tsx` | Placeholder div (same as current Index.tsx lines 109–125) |

---

## TODO

### [ ] STEP 1 — Read current source files before editing

```bash
# Understand what we're replacing
cat apps/frontend/src/App.tsx
cat apps/frontend/src/pages/Index.tsx
cat apps/frontend/src/components/AppShell.tsx
cat apps/frontend/src/components/Sidebar.tsx
```

> **Why:** AppShell currently passes `activeView`, `onViewChange`, `transactions` props to Sidebar. Sidebar passes `onViewChange` callbacks back. Understanding the full prop chain prevents missing a connection during refactor.

---

### [ ] STEP 2 — Create page components (one per route)

Create `apps/frontend/src/pages/DashboardPage.tsx`:
```tsx
import CashFlowDashboard from "@/components/CashFlowDashboard";

const DashboardPage = () => <CashFlowDashboard />;
export default DashboardPage;
```

Create `apps/frontend/src/pages/UploadPage.tsx`:
```tsx
import FileUpload from "@/components/FileUpload";

const UploadPage = () => (
  <div className="p-8">
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Upload Statement</h1>
        <p className="text-sm text-muted-foreground">Upload your bank statement to extract transactions</p>
      </div>
      <FileUpload />
    </div>
  </div>
);
export default UploadPage;
```

Create `apps/frontend/src/pages/TransactionsPage.tsx`:
```tsx
import TransactionTable from "@/components/TransactionTable";

const TransactionsPage = () => (
  <div className="p-8">
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Transactions</h1>
        <p className="text-sm text-muted-foreground">Browse and search your transaction history</p>
      </div>
      <TransactionTable />
    </div>
  </div>
);
export default TransactionsPage;
```

Create `apps/frontend/src/pages/CategoriesPage.tsx`:
```tsx
import CategoryManager from "@/components/CategoryManager";

const CategoriesPage = () => (
  <div className="p-8">
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Categories</h1>
        <p className="text-sm text-muted-foreground">Manage transaction category rules</p>
      </div>
      <CategoryManager />
    </div>
  </div>
);
export default CategoriesPage;
```

Create `apps/frontend/src/pages/SettingsPage.tsx`:
```tsx
const SettingsPage = () => (
  <div className="p-8">
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Application settings and configuration</p>
      </div>
      <p className="text-muted-foreground text-sm">Settings panel coming soon…</p>
    </div>
  </div>
);
export default SettingsPage;
```

> **Why thin wrappers instead of inline routes?** Keeps route config (App.tsx) separate from page content. Each page component can be enriched independently in later tickets without touching App.tsx.

---

### [ ] STEP 3 — Update AppShell to use `<Outlet />`

Replace the `children`-based render in `AppShell.tsx` with `<Outlet />`. Also drop the `activeView`, `onViewChange`, and `transactions` props that were only needed by the old Sidebar:

```tsx
import { Outlet } from "react-router-dom";
import Sidebar from "@/components/Sidebar";
import ActivityPanel from "@/components/ActivityPanel";

const AppShell = () => (
  <div className="flex h-screen w-full overflow-hidden">
    <Sidebar />
    <main className="flex-1 overflow-y-auto">
      <Outlet />
    </main>
    <ActivityPanel />
  </div>
);

export default AppShell;
```

> **Why remove `transactions` prop from AppShell?** `ActivityPanel` and `Sidebar` were receiving `transactions` state from `Index.tsx` to show recent uploads. `TransactionTable` already fetches its own data from the API directly — that pattern should be extended to `ActivityPanel` too. For now, `ActivityPanel` can fetch independently or render without it; passing state down through AppShell was always a prop-drilling anti-pattern.

---

### [ ] STEP 4 — Update Sidebar to use NavLink

Replace the `activeView`/`onViewChange` prop-based navigation with `<NavLink>` from react-router-dom. NavLink automatically receives `isActive` based on the current URL:

```tsx
import { NavLink, useNavigate } from "react-router-dom";
// ... existing icon imports

const menuItems = [
  { id: "dashboard",    label: "Dashboard",    icon: BarChart3,  to: "/dashboard" },
  { id: "upload",       label: "Upload",       icon: Upload,     to: "/upload" },
  { id: "transactions", label: "Transactions", icon: List,       to: "/transactions" },
  { id: "categories",   label: "Categories",   icon: Tag,        to: "/categories" },
  { id: "settings",     label: "Settings",     icon: Settings,   to: "/settings" },
];

const Sidebar = () => {
  const navigate = useNavigate();
  // ... existing collapsed state

  return (
    <aside ...>
      {/* New upload CTA */}
      <button onClick={() => navigate("/upload")} ...>
        + New upload
      </button>

      <nav>
        {menuItems.map((item) => (
          <NavLink
            key={item.id}
            to={item.to}
            className={({ isActive }) =>
              cn("flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              )
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
};
```

Drop the `activeView` and `onViewChange` props entirely from the component signature.

> **Why `NavLink` over `Link` + manual `useLocation` comparison?** NavLink's `isActive` callback handles exact matching, `end` prop, and case-insensitive matching out of the box. Manual comparison with `useLocation().pathname` is error-prone (e.g., `/transactions` vs `/transactions/`).

---

### [ ] STEP 5 — Update App.tsx with full route tree

```tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AppShell from "@/components/AppShell";
import DashboardPage from "@/pages/DashboardPage";
import UploadPage from "@/pages/UploadPage";
import TransactionsPage from "@/pages/TransactionsPage";
import CategoriesPage from "@/pages/CategoriesPage";
import SettingsPage from "@/pages/SettingsPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="upload" element={<UploadPage />} />
          <Route path="transactions" element={<TransactionsPage />} />
          <Route path="categories" element={<CategoriesPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
```

> **Why nest all routes inside the `AppShell` route?** AppShell is the layout (sidebar + main + activity panel). All content pages are children — they render into AppShell's `<Outlet />`. The `*` catch-all is also nested so NotFound still renders inside the shell (with sidebar visible).

---

### [ ] STEP 6 — Verify and smoke test

Start the dev server:
```bash
cd apps/frontend && npm run dev
```

Manual checks:
- [ ] Click each sidebar item → URL changes to the correct path
- [ ] Active sidebar item highlighted correctly per URL
- [ ] Navigate to `/transactions`, reload browser → stays on Transactions
- [ ] Browser back button after clicking around → returns to correct previous page
- [ ] `/` in address bar → redirects to `/dashboard`
- [ ] "New upload" CTA in sidebar → navigates to `/upload`
- [ ] No console errors

---

## Notes

- `Index.tsx` after this refactor is effectively dead — its `renderContent()` switch and `useState` for `activeView` are removed. The file can be deleted or left as an empty re-export; the route components in `pages/` replace it.
- `ActivityPanel` receives `transactions` from AppShell currently — after removing that prop, check what ActivityPanel actually renders. If it just shows a static "no recent activity" state that's fine for now.
- `mockTransactions` seeded in Index.tsx state (`useState(mockTransactions)`) is passed to `CashFlowDashboard`. After this refactor, `CashFlowDashboard` must fetch its own data — which it likely already does via `useEffect`. Verify this before assuming.
- **What's next:** PF-056 adds nested `/cashflow/*` routes on top of this foundation.
