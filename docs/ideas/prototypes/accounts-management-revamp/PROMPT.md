# Execution prompt — paste into Claude Code

You are implementing the **Accounts Revamp** in `apps/frontend` (React + Vite + Tailwind + shadcn/ui + TanStack Query + react-router).

Read first, in order:
1. `docs\ideas\prototypes\accounts-management-revamp/README.md` — the full spec (source of truth).
2. `docs\ideas\prototypes\accounts-management-revamp/Accounts Revamp.html` — visual reference (4 frames: A list, A sheet, B check-in, C first run).
3. Current code: `src/App.tsx`, `src/pages/assets/AccountsTab.tsx`, `src/pages/settings/BanksTab.tsx`, `src/pages/settings/SettingsLayout.tsx`, `src/components/assets/AddAccountDialog.tsx`, `src/components/assets/AddValuationDialog.tsx`, `src/api/accountsApi.ts`, `src/types/Account.ts`, `src/types/Institution.ts`.

Follow `CLAUDE.md` / `AGENTS.md` conventions. Use existing Tailwind tokens and shadcn components; do not paste the HTML/CSS. No backend changes unless a step says so.

## Plan (commit after each step; keep the app building)

1. **Routing & consolidation**
   - `/settings/banks` → `<Navigate to="/assets/accounts" replace />`; remove the Banks tab from `SettingsLayout`. Keep `BanksTab.tsx` until step 6, then delete it once its logic is migrated.
   - Remove the "Manage accounts in Settings → Banks & Accounts" link from `AccountsTab`.

2. **Shared helpers** — `src/lib/accounts.ts`: `accountValue`, `accountUpdatedAt`, `relativeUpdated(iso)` ("Updated today / yesterday / N days ago / last week"), `STALE_DAYS = 30`, `isStale`, `accountGroup(accountType) → 'cash'|'investing'|'crypto'|'other'`, `initials(name)`. Add unit tests if the repo has a test setup.

3. **A1 Quiet list** — rewrite `pages/assets/AccountsTab.tsx` per README: header total, stale nudge, filter chips, grouped rows, archived toggle, "Finish setup" rows for institutions without accounts. Split into `components/accounts/AccountsHeader.tsx`, `StaleNudge.tsx`, `AccountRow.tsx`, `AccountGroup.tsx`.

4. **A2 Account sheet** — `components/accounts/AccountSheet.tsx` (shadcn Sheet, 400px). Balance save reuses the valuation API from `AddValuationDialog`; cashflow switch uses `setAccountCashflowFlag` optimistically; Edit opens `AddAccountDialog` in edit mode; Remove = confirm dialog → `deleteAccount`. Invalidate `accounts`, `institutions`, balances and net-worth queries on success.

5. **B Check-in** — `components/accounts/BalanceCheckIn.tsx`, full-screen focus overlay (reuse existing focus-mode pattern if present). Queue = stale accounts, oldest first. "Same as before", "Save & next" (Enter), "Skip this one", "Done for now" (Esc), completion state.

6. **C First run + Add flow** — `components/accounts/AddPlaceFlow.tsx`: step 1 type tiles, step 2 single form (name with institution autocomplete, type, currency IDR default, balance today). Submit creates institution if new, then account, then opening valuation. Render inline when there are zero accounts; in a Dialog from "+ Add account". Migrate anything still needed from `BanksTab.tsx`, then delete it.

7. **Polish & verify**
   - Copy exactly as in the README (English, curly apostrophes).
   - Loading skeletons, inline errors, keyboard (Enter/Esc), focus rings, responsive rules (< 640px: bottom sheet, fluid input).
   - `npm run lint`, `npm run build`, existing tests pass.
   - Manually check: empty state → add first account; stale nudge → check-in through all; sheet toggle persists after refresh; `/settings/banks` redirects.

## Constraints
- Never show the words "institution" in UI copy; use "Bank / app".
- No inline edit/delete/toggle controls in list rows.
- Numbers: `formatCurrency(v, 'IDR')`, tabular-nums, `whitespace-nowrap` on totals.
- Don't touch unrelated pages (Cashflow › Accounts tab stays as is unless it links to `/settings/banks` — update such links to `/assets/accounts`).

When done, report: files changed, anything in the README you couldn't implement and why, and any API gaps found.
