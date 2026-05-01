# PF-058 — Settings Page + Categories Nesting

> **GitHub Issue:** [#81](https://github.com/rikky-hermanto/personal-finance/issues/81)
> **Status:** TODO
> **Depends on:** PF-056 (Cashflow workspace shell — establishes page shell pattern)
> **Parallel with:** PF-057

## Objective

Build a real Settings page (replacing the current "Settings panel coming soon…" placeholder div) and move Categories from the top-level sidebar into `/settings/categories`. The Settings page follows the same workspace pattern established in PF-056: a layout shell with sub-navigation.

After this ticket:
- Sidebar has 3 top-level items: **Dashboard**, **Cashflow**, **Settings** (Categories and old Upload/Transactions are gone)
- `/settings` → redirects to `/settings/categories` (the only live sub-page)
- `/categories` (old URL) → redirects to `/settings/categories`
- Settings shell shows sub-nav with Categories live + placeholder items (Banks & Accounts, Rules, Profile — disabled/coming soon)

## Acceptance Criteria

- [ ] Create `pages/settings/SettingsLayout.tsx` — shell with vertical sub-nav on left, content on right
- [ ] Sub-nav items: **Categories** (live link), **Banks & Accounts**, **Rules**, **Profile** (all three disabled/greyed)
- [ ] Nested routes: `/settings` → redirects to `/settings/categories`; `/settings/categories` renders CategoryManager
- [ ] Create `pages/settings/CategoriesPage.tsx` wrapping existing `<CategoryManager />`
- [ ] Old route `/categories` redirects to `/settings/categories`
- [ ] Sidebar: remove "Categories" top-level item; "Settings" item links to `/settings`
- [ ] Settings item in sidebar active for all `/settings/*` URLs

## Approach

`SettingsLayout` uses a two-column layout: a narrow left column with vertical sub-nav links, and a wide right column with `<Outlet />`. This is a different pattern from Cashflow (which uses horizontal tabs) because Settings items are more heterogeneous — categories, account config, rules, profile are conceptually different from transactional workflow tabs.

Using a vertical sub-nav (like Linear's Settings page) scales better as more settings sections are added. Horizontal tabs would get cramped.

`CategoriesPage` in settings is a thin wrapper over the existing `<CategoryManager />` — no logic changes.

Out of scope: Banks & Accounts content, Rules content, Profile content (all placeholder). No backend changes.

## Affected Files

| File | Change |
|------|--------|
| Create `apps/frontend/src/pages/settings/SettingsLayout.tsx` | New layout with vertical sub-nav + Outlet |
| Create `apps/frontend/src/pages/settings/CategoriesPage.tsx` | Wraps `<CategoryManager />` |
| `apps/frontend/src/App.tsx` | Add `/settings/*` nested routes + `/categories` redirect |
| `apps/frontend/src/components/Sidebar.tsx` | Remove Categories item; Settings active for `/settings/*` |
| `apps/frontend/src/pages/SettingsPage.tsx` (from PF-055) | Delete — replaced by SettingsLayout + nested routes |

---

## TODO

### [ ] STEP 1 — Create SettingsLayout with vertical sub-nav

Create `apps/frontend/src/pages/settings/SettingsLayout.tsx`:

```tsx
import { NavLink, Outlet } from "react-router-dom";
import { Tag, Landmark, BookOpen, User } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { cn } from "@/lib/utils";

const SUB_NAV = [
  { label: "Categories",       icon: Tag,       to: "/settings/categories", live: true },
  { label: "Banks & Accounts", icon: Landmark,  to: "/settings/banks",      live: false },
  { label: "Rules",            icon: BookOpen,  to: "/settings/rules",      live: false },
  { label: "Profile",          icon: User,      to: "/settings/profile",    live: false },
];

const SettingsLayout = () => (
  <div className="p-8">
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Settings"
        subtitle="Manage categories, accounts, and application preferences"
      />

      <div className="flex gap-8">
        {/* Vertical sub-nav */}
        <nav className="w-48 shrink-0">
          <ul className="space-y-1">
            {SUB_NAV.map((item) =>
              item.live ? (
                <li key={item.label}>
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                        isActive
                          ? "bg-accent text-accent-foreground font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                      )
                    }
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </NavLink>
                </li>
              ) : (
                <li key={item.label}>
                  <span className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground/50 cursor-not-allowed">
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.label}
                    <span className="ml-auto text-xs">Soon</span>
                  </span>
                </li>
              )
            )}
          </ul>
        </nav>

        {/* Content pane */}
        <div className="flex-1 min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  </div>
);

export default SettingsLayout;
```

> **Why vertical sub-nav (not horizontal tabs like Cashflow)?** Settings sections are conceptually distinct configuration domains — Categories, Accounts, Rules, Profile. Horizontal tabs suit workflow steps or views of the same data (Overview/Transactions/Upload in Cashflow). Vertical nav suits heterogeneous configuration areas and scales to 6–8 items without crowding. Consistent with how Linear, Notion, and GitHub structure their settings pages.

---

### [ ] STEP 2 — Create CategoriesPage in settings

Create `apps/frontend/src/pages/settings/CategoriesPage.tsx`:

```tsx
import CategoryManager from "@/components/CategoryManager";

const CategoriesPage = () => <CategoryManager />;
export default CategoriesPage;
```

> **Why no header inside CategoriesPage?** SettingsLayout already renders the "Settings" PageHeader. Adding another header inside the content pane would create a double-header. The sub-nav label ("Categories") makes context clear.

---

### [ ] STEP 3 — Add Settings routes to App.tsx

Add nested `/settings/*` routes and the `/categories` redirect:

```tsx
import SettingsLayout from "@/pages/settings/SettingsLayout";
import CategoriesPage from "@/pages/settings/CategoriesPage";

// Inside <Route path="/" element={<AppShell />}>:

{/* Old /categories redirect */}
<Route path="categories" element={<Navigate to="/settings/categories" replace />} />

{/* Settings workspace */}
<Route path="settings" element={<SettingsLayout />}>
  <Route index element={<Navigate to="categories" replace />} />
  <Route path="categories" element={<CategoriesPage />} />
</Route>
```

Also remove the old flat `<Route path="settings" element={<SettingsPage />} />` that PF-055 created — it's replaced by the nested layout route above.

> **Why `<Navigate to="categories" replace />` on the settings index?** Same reason as Cashflow — avoids redirect loops in browser history. `/settings` navigates straight to `/settings/categories` without polluting history.

---

### [ ] STEP 4 — Update Sidebar

Remove the "Categories" top-level item. Update "Settings" NavLink to stay active for all `/settings/*` paths:

```tsx
const menuItems = [
  { id: "dashboard", label: "Dashboard", icon: BarChart3, to: "/dashboard",  end: true },
  { id: "cashflow",  label: "Cashflow",  icon: Wallet,   to: "/cashflow",   end: false },
  { id: "settings",  label: "Settings",  icon: Settings2, to: "/settings",  end: false },
];

// In NavLink render:
<NavLink
  to={item.to}
  end={item.end}
  className={({ isActive }) => cn(...)}
>
```

Using `end={false}` for Settings means `/settings/categories` keeps Settings highlighted. `end={true}` for Dashboard means `/dashboard` only matches exactly (prevents highlighting for all paths).

> **Why is this the last sidebar change?** After PF-055 (add Cashflow), PF-056 (replace Upload/Transactions), and now PF-058 (remove Categories), the sidebar is in its final state: Dashboard / Cashflow / Settings. Clean, three items.

---

### [ ] STEP 5 — Clean up SettingsPage.tsx from PF-055

Delete `apps/frontend/src/pages/SettingsPage.tsx` — it was a placeholder that is now fully replaced by `SettingsLayout` + `CategoriesPage`:

```bash
# Verify nothing imports it first
grep -r "SettingsPage" apps/frontend/src/
# Then delete
rm apps/frontend/src/pages/SettingsPage.tsx
```

---

### [ ] STEP 6 — Smoke test

```bash
cd apps/frontend && npm run dev
```

Manual checks:
- [ ] Sidebar shows exactly 3 items: Dashboard, Cashflow, Settings (no Upload, Transactions, or Categories)
- [ ] Click Settings → URL becomes `/settings/categories`, Categories sub-nav item highlighted, CategoryManager renders and is functional (add/edit/delete category rules work)
- [ ] Sub-nav shows Categories (clickable), Banks & Accounts / Rules / Profile (greyed + "Soon" badge)
- [ ] Navigate to `/categories` (old URL) → redirects to `/settings/categories`
- [ ] Refresh at `/settings/categories` → stays there
- [ ] Settings sidebar item highlighted for `/settings/categories`
- [ ] All Cashflow tabs still work (no regression)
- [ ] Dashboard still renders

---

## Notes

- After this ticket, the sidebar IA is in its final planned state: 3 top-level items only (Dashboard / Cashflow / Settings). All future workspaces (Portfolio, Debts) will be added to this list following the same pattern.
- `CategoryManager.tsx` is 247 LOC — it's purely a frontend component managing category rules via the API. It doesn't need any changes; just move where it's rendered.
- The disabled sub-nav items use a `<span>` (not `<button>` or `<NavLink>`) to ensure they're semantically non-interactive. Using a `<button disabled>` would also work but requires additional styling to match the visual treatment.
- **What's next:** After PF-055–058 are done, the IA restructure is complete. Next priority returns to the Supabase migration (PF-S08 — Auth) or AI service pipeline (PF-S11 — Webhook).
