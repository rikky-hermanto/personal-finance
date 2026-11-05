# Handoff: Accounts Revamp (zen)

## Overview
Replace the two duplicated account screens — **Settings › Banks & Accounts** (`pages/settings/BanksTab.tsx`) and **Assets › Accounts** (`pages/assets/AccountsTab.tsx`) — with one calm, focused Accounts experience:

- **A · Quiet list** — single list of accounts, grouped by type, showing only name, balance, freshness.
- **A · Account sheet** — right side sheet holding every control (update balance, cashflow toggle, details, edit, remove).
- **B · Check-in** — focus-mode flow to update stale balances one account per screen.
- **C · First run** — empty-state onboarding: pick a type of place, then add.

## About the design files
`Accounts Revamp.html` is a **design reference built in HTML**, not production code. Recreate it in the existing frontend (`apps/frontend`, React + Vite + Tailwind + shadcn/ui + TanStack Query + react-router) using the codebase's existing components, tokens and patterns. Open the HTML in a browser; it is a pan/zoom canvas with 4 frames.

## Fidelity
**High-fidelity** for layout, hierarchy, copy, spacing and behavior. Colors/fonts in the mock mirror the app's zen theme; use the app's Tailwind tokens (`bg-background`, `bg-card`, `text-muted-foreground`, `border-border`, `bg-secondary`, `text-foreground`) rather than the literal values.

## Principles (apply to every decision)
1. **One page.** Canonical route `/assets/accounts`. `/settings/banks` → `<Navigate to="/assets/accounts" replace />`; remove the Banks tab from `SettingsLayout`.
2. **Flatten institution → account.** Institution is a detail of an account, never a nesting header. UI never says "institution" to the user (use "Bank / app").
3. **Controls hidden until asked.** No inline edit/delete/toggle/currency in list rows. Everything lives in the sheet.

---

## Screen A1 · Quiet list (`/assets/accounts`)
Container: centered column `max-w-[640px] mx-auto`, `py-11`.

**Header row** (flex, justify-between, items-end)
- Eyebrow `Accounts` — 11px, uppercase, tracking 0.08em, weight 500, muted.
- Total — 34px, weight 500, tabular-nums, `whitespace-nowrap`, font = app's numeric/sans (mock: Plus Jakarta Sans). Value: sum of `accountValue(a)` (latestValuation.valueIdr ?? openingBalance) of active accounts, `formatCurrency(.., 'IDR')`.
- Sub `Across {n} accounts` — 13px muted, mt 6px.
- Right: primary pill button `+ Add account` — h-36, px-14, rounded-full, `bg-foreground text-background`, 13px/500, lucide `Plus` 14px.

**Stale nudge** (only if ≥1 stale account) — mt 22px, rounded-xl, px-16 py-12, warm tint bg (mock `hsl(38 60% 95%)`; use a warning/10 token). Left: 6px warning dot + `{n} balances haven’t been updated in over a year` (pluralize; if threshold changes, update copy). Right link `Review now →` (500) → opens Check-in (B).
- **Stale rule:** `accountUpdatedAt(a)` older than **30 days** = row shows "Needs update"; the nudge counts accounts older than the threshold the copy states. Recommend one constant `STALE_DAYS = 30` and copy `haven’t been updated in 30+ days`. (Mock copy "over a year" reflects current sample data.)

**Filter chips** — mt 22px, gap 6px: `All · Cash · Investing · Crypto` (only render chips for types that exist). Chip h-30, px-12, rounded-full, 12.5px; active = `bg-secondary text-foreground font-medium`, inactive = muted text, no bg.

**Groups** — header row: label left (11px uppercase, tracking 0.08em, muted) + group subtotal right (12px tabular-nums, muted); padding `22px 4px 8px`. Group mapping from `account.accountType` (map existing enum values → Cash / Investing / Crypto / Other).

**Account row** — grid `36px 1fr auto 16px`, gap 14px, p-12, rounded-xl; hover `bg-background/50` (very light warm). Whole row is a button → opens sheet.
- Monogram: 36px circle `bg-secondary`, 2 initials, 12px/600. Use `logoUrl` from institution if present.
- Name 14px/500 (account name; if it differs from institution name, show institution in meta: `Savings · BCA`).
- Meta 12px muted: account type label.
- Right: balance 14px/500 tabular-nums; below 11.5px freshness: `Updated today / yesterday / N days ago / last week` (muted) or `Needs update` (warning color) when stale.
- Chevron-right 16px, `#bbb`/muted-foreground/50.
- Inactive accounts (`isActive=false`): hidden by default; a quiet `Show archived (n)` text link at the bottom of the list.
- Institution with no accounts: row at 55% opacity, meta `No account added yet`, right side `Finish setup` (fg, 500) → opens Add flow prefilled with that institution.

## Screen A2 · Account sheet
Right side sheet (shadcn `Sheet side="right"`), width 400px, p-28, flex-col gap-24, `border-l`, shadow `-12px 0 40px rgb(0 0 0/.06)`, scrim `rgb(40 36 30/.18)`.
1. **Header** — monogram + name (16px/500) + meta `Checking · IDR`; close X (18px muted).
2. **Balance today** — eyebrow label; input h-48 rounded-xl border, prefix `Rp` (14px muted), value 18px tabular-nums, prefilled with current value, numeric with thousand separators (id-ID). Helper below (12px): if stale, warning color `Last updated {relative}. Enter today’s balance to keep net worth accurate.`; else muted `Last updated {relative}`. Button `Save balance` (dark pill, aligned start) → creates a valuation via the existing `AddValuationDialog` logic/API (subjectId = account.id, today's date). Disabled until value changes.
3. **Include in Cashflow** — between top/bottom borders, py-16. Title 13.5px/500, description 12.5px muted lh 1.45: `Transactions from this account count toward your monthly income and spending.` Switch on right → `setAccountCashflowFlag(id, bool)`, optimistic.
4. **Details** — 2-col key/value grid, 13px, row gap 10px, keys muted: `Institution`, `Type`, `Currency`.
5. **Footer** (mt-auto, justify-between, 13px): `Edit details` → existing `AddAccountDialog` in edit mode; `Remove account` (destructive red) → confirm dialog → `deleteAccount`.

## Screen B · Check-in (focus mode)
Full-page/overlay focus view (hide sidebar & activity panel; reuse focus-mode pattern if present). Content centered vertically, gap 28px.
- Top bar (absolute, inset 28/32): left `Balance check-in` muted 13px; right `× Done for now` → exit.
- Progress: segments 24×3px rounded, gap 6px; done = `bg-foreground`, pending = `bg-border`.
- Monogram 56px (15px text).
- Question (serif, 30px/1.1, weight 400): `What’s in your {name} {type lowercased} today?`
- Sub 14px muted: `Last recorded {amount} · {relative}`.
- Input 360×60, centered text 24px tabular-nums, `Rp` prefix 16px muted, autofocus.
- Actions (gap 10px): `Same as before` (outline pill) → save valuation with previous value + today; `Save & next` (dark pill, Enter key) → save valuation, advance.
- Footer 12.5px muted: `{i} of {n} · Skip this one` (skip = advance without saving).
- After last: brief completion state `All balances are up to date` + button `Back to accounts`.
- Queue = stale accounts sorted by oldest update first.

## Screen C · First run (no accounts)
Replaces the empty list. Centered, gap 32px.
- Progress 2 segments (step 1 active).
- Title serif 30px `Where does your money live?`; sub 14px muted `Add one place to start. You can add the rest later.`
- 2×2 grid of 240px tiles, gap 12px. Tile: border, rounded-2xl, p-20, gap 14px, lucide icon 20px, title 14px/500, desc 12.5px muted lh 1.45. Selected = `border-foreground` + 1px ring.
  - `landmark` Bank — Savings or checking, like BCA or Jago
  - `trending-up` Investing app — Stocks or funds, like Bibit or Stockbit
  - `bitcoin` Crypto — Exchange or wallet, like Binance
  - `wallet` Something else — E-wallet, cash, marketplace balance
- `Continue` (dark pill, h-42, px-22), disabled until a tile is picked.
- Step 2 (not drawn; keep same visual language): single form — Name (with institution autocomplete from `getInstitutions`, creating one via `addInstitution` if new), Type (preset from step 1), Currency (default IDR), Balance today. Submit → `addInstitution` (if needed) → `addAccount`. The user never sees institution/account as separate steps.
- The same 2-step flow is used by `+ Add account` (in a dialog when accounts exist).

## Interactions & behavior
- Row click / Enter → open sheet; Esc closes sheet/check-in.
- Sheet transition: shadcn default slide (~200ms ease-out).
- Mutations invalidate `['accounts']`, `['institutions']`, `['account-balances']` and any net-worth queries.
- Loading: skeleton rows (3) at row height; never spinners in the header total (show `—`).
- Errors: inline 12px destructive text under the relevant control; toast for delete failures.
- Responsive: column is fluid below 640px; sheet becomes full-width bottom sheet under 640px; check-in input becomes `w-full max-w-[360px]`.

## State
- `selectedAccountId | null` (sheet), `filter: 'all'|'cash'|'investing'|'crypto'`, `showArchived`.
- Check-in: `queue: Account[]`, `index`, `draftValue`.
- First run: `step: 1|2`, `pickedKind`.
- Data: `getAccounts`, `getInstitutions` (join client-side), valuations API already used by `AddValuationDialog`.

## Design tokens (mock values → map to app tokens)
- Canvas bg `hsl(42 17% 94%)` → `bg-background`; card `#fff` → `bg-card`
- Foreground `hsl(35 9% 19%)`; muted fg `hsl(0 0% 42%)`; secondary `hsl(39 18% 91%)`; border `hsl(39 18% 88%)`
- Warning `hsl(35 80% 42%)`; destructive `hsl(354 60% 48%)`
- Radii: rows/inputs 12px, tiles 16px, page 14px, buttons/chips full
- Type: serif (ui-serif/Georgia) only for check-in & first-run questions; numbers in app numeric font, tabular-nums; UI text Inter 11–14px
- Spacing: 6 / 10 / 12 / 14 / 22 / 28 / 32 / 44px

## Assets
Icons: lucide (`plus`, `chevron-right`, `x`, `landmark`, `trending-up`, `bitcoin`, `wallet`) — already available via `lucide-react`. Monograms are generated initials; use `institution.logoUrl` when available. No images.

## Files
- `Accounts Revamp.html` — design reference (4 frames).
- Codebase touchpoints: `apps/frontend/src/App.tsx`, `pages/assets/AccountsTab.tsx`, `pages/settings/BanksTab.tsx`, `pages/settings/SettingsLayout.tsx`, `components/assets/AddAccountDialog.tsx`, `components/assets/AddValuationDialog.tsx`, `api/accountsApi.ts`, `types/Account.ts`, `types/Institution.ts`.
