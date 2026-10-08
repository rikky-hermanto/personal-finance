# PF-107 Phase 1C — Assets Management: Interactive Wiring

> **Parent Issue:** PF-107 (Assets Management)
> **Phase:** 1C of 6 — Wire all buttons, dialogs, and real API data
> **Status:** DONE
> **Depends on:** Phase 1B complete (UI scaffold + backend controllers live)
> **Blocks:** Phase 2 (auto-pricing)

## Objective

Phase 1B delivered the visual scaffold — layouts, tabs, tables, and hardcoded dummy data. Every button renders but does nothing; every tab shows fake numbers. Phase 1C makes the module actually functional: real API data in every tab, every button opens a dialog, every dialog submits to the backend.

The user should be able to navigate to `/assets`, enter their real institution/account/asset/liability data, add valuations, and see a live Net Worth headline that reflects actual entries — replacing the dummy data entirely.

## What Needs to Happen

### 1. API client bugs (critical — wrong URLs, wrong field names)
- `accountsApi.ts` calls `GET /api/institutions` → must be `GET /api/accounts/institutions`
- `accountsApi.ts` calls `POST /api/institutions` → must be `POST /api/accounts/institutions`
- `assetsApi.ts` calls `GET /api/holdings` → must be `GET /api/assets/holdings`
- `assetsApi.ts` calls `POST /api/valuations` → must be `POST /api/assets/valuations`
- `netWorthApi.ts` expects `{ totalIdr }` from `/current` → backend returns `{ netWorthIdr }` — mismatch
- `netWorthApi.ts` history expects `{ date, totalIdr }` per entry → backend returns `{ date, valueIdr }` — mismatch

### 2. Missing API client mutations
- `liabilitiesApi.ts` only has `getLiabilities()` — missing `addLiability()`
- `assetsApi.ts` missing `addAsset()`, `addHolding()`, `updateHolding()`

### 3. `AddValuationDialog` is a stub with no functionality
- No `react-hook-form` state; no controlled inputs
- Save button has no `onSubmit` handler; calls no API
- No `useMutation` + cache invalidation
- No date field
- No strategy branching (should at minimum support Manual entry; others show "Available in Phase 2")

### 4. All tabs use hardcoded `DUMMY_*` data
- `AccountsTab` — no `useQuery`; uses `DUMMY_INSTITUTIONS`
- `InvestmentsTab` / `HoldingsTable` — no `useQuery`; uses `DUMMY_HOLDINGS`
- `PropertiesTab` — no `useQuery`; uses `DUMMY_PROPERTIES`
- `LiabilitiesTab` — no `useQuery`; uses `DUMMY_LIABILITIES`
- `OverviewTab` — does use `useQuery` but falls back to dummy when API returns `{ netWorthIdr: 0 }` because field name doesn't match

### 5. Buttons with no onClick
Every "Add ..." and "Update ..." button across all tabs has no handler. Five new dialogs are needed:
- `AddInstitutionDialog` — for AccountsTab "Add Institution"
- `AddAccountDialog` — for AccountsTab "Add Account"
- `AddHoldingDialog` — for InvestmentsTab "Add Holding"
- `AddAssetDialog` — for PropertiesTab "Add Asset"
- `AddLiabilityDialog` — for LiabilitiesTab "Add Liability"

`AddValuationDialog` (already exists as stub) covers "Update" / "Update Valuation" / "Add Valuation" across all tabs.

---

## Affected Files

| File | Change |
|------|--------|
| `apps/frontend/src/api/accountsApi.ts` | Fix URL bugs; add `updateAccount()`, `deleteAccount()` |
| `apps/frontend/src/api/assetsApi.ts` | Fix URL bugs; add `addAsset()`, `addHolding()`, `updateHolding()` |
| `apps/frontend/src/api/liabilitiesApi.ts` | Add `addLiability()` |
| `apps/frontend/src/api/netWorthApi.ts` | Fix field name mismatches |
| `apps/frontend/src/pages/assets/OverviewTab.tsx` | Remove dummy fallback; use corrected field names |
| `apps/frontend/src/pages/assets/AccountsTab.tsx` | Replace dummy data with useQuery; wire all buttons |
| `apps/frontend/src/pages/assets/InvestmentsTab.tsx` | Replace dummy data with useQuery; wire buttons |
| `apps/frontend/src/pages/assets/PropertiesTab.tsx` | Replace dummy data with useQuery; wire buttons |
| `apps/frontend/src/pages/assets/LiabilitiesTab.tsx` | Replace dummy data with useQuery; wire buttons |
| `apps/frontend/src/components/assets/AddValuationDialog.tsx` | Full implementation with react-hook-form + useMutation |
| `apps/frontend/src/components/assets/HoldingsTable.tsx` | Accept real `Holding[]` prop; drop DUMMY_HOLDINGS |
| `apps/frontend/src/components/assets/AddInstitutionDialog.tsx` | Create |
| `apps/frontend/src/components/assets/AddAccountDialog.tsx` | Create |
| `apps/frontend/src/components/assets/AddHoldingDialog.tsx` | Create |
| `apps/frontend/src/components/assets/AddAssetDialog.tsx` | Create |
| `apps/frontend/src/components/assets/AddLiabilityDialog.tsx` | Create |

---

## TODO

### [x] STEP 1 — Fix API client URL bugs and field name mismatches

**`apps/frontend/src/api/accountsApi.ts`** — fix institution URLs:
```typescript
// WRONG:
const res = await fetch(`${BASE}/api/institutions`);
// CORRECT:
const res = await fetch(`${BASE}/api/accounts/institutions`);
```
Apply the same fix to `POST /api/institutions` → `POST /api/accounts/institutions`.

**`apps/frontend/src/api/assetsApi.ts`** — fix holdings + valuations URLs:
```typescript
// WRONG:
fetch(`${BASE}/api/holdings`)
fetch(`${BASE}/api/valuations`, { method: 'POST', ... })
// CORRECT:
fetch(`${BASE}/api/assets/holdings`)
fetch(`${BASE}/api/assets/valuations`, { method: 'POST', ... })
```

**`apps/frontend/src/api/netWorthApi.ts`** — fix field names to match backend DTO:
```typescript
// Backend returns: { netWorthIdr: number }
export async function getNetWorthCurrent(): Promise<{ netWorthIdr: number }> { ... }

// Backend returns: { date: string, valueIdr: number }[]
export async function getNetWorthHistory(...): Promise<Array<{ date: string; valueIdr: number }>> { ... }
```

---

### [x] STEP 2 — Add missing API client mutations

**`apps/frontend/src/api/liabilitiesApi.ts`** — add `addLiability`:
```typescript
export async function addLiability(data: Partial<Liability>): Promise<Liability> {
  const res = await fetch(`${BASE}/api/liabilities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to add liability');
  return res.json();
}
```

**`apps/frontend/src/api/assetsApi.ts`** — add `addAsset`, `addHolding`:
```typescript
export async function addAsset(data: Partial<Asset>): Promise<Asset> {
  const res = await fetch(`${BASE}/api/assets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to add asset');
  return res.json();
}

export async function addHolding(data: Partial<Holding>): Promise<Holding> {
  const res = await fetch(`${BASE}/api/assets/holdings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to add holding');
  return res.json();
}
```

---

### [x] STEP 3 — Implement `AddValuationDialog` fully

Replace the stub in `apps/frontend/src/components/assets/AddValuationDialog.tsx` with a working dialog. Use `react-hook-form`. On submit, call `addValuation()` via `useMutation`, then `onSuccess()` (caller invalidates cache).

```typescript
import { useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { addValuation } from '@/api/assetsApi';
import { ValuationStrategy } from '@/types/Asset';

type Props = {
  subjectType: 'account' | 'asset' | 'holding';
  subjectId: string;
  subjectName: string;
  currency: string;
  strategy: ValuationStrategy;
  onSuccess: () => void;
  onClose: () => void;
};

type FormValues = {
  valueNative: number;
  valuedAt: string; // ISO date string (YYYY-MM-DD)
  notes?: string;
};
```

Form fields:
- `valuedAt` — `<input type="date">`, defaults to today
- `valueNative` — `<input type="number">`, label = `Value (${currency})`
- `notes` — `<input type="text">`, optional

Strategy branching (in the dialog body):
- `Manual` → show the form fields above
- `RealTime` | `Algorithmic` | `Amortized` → show the form fields above + a muted notice: _"Auto-pricing arrives in Phase 2. Enter manually for now."_

`useMutation` pattern:
```typescript
const mutation = useMutation({
  mutationFn: (values: FormValues) =>
    addValuation({
      subjectType,
      subjectId,
      valueNative: values.valueNative,
      currency,
      fxRateToIdr: 1, // Phase 1C: IDR-only; FX in Phase 2
      valueIdr: values.valueNative, // same as native for IDR
      source: 'manual',
      notes: values.notes,
      valuedAt: values.valuedAt,
    }),
  onSuccess: () => {
    onSuccess();
    onClose();
  },
});
```

> **Why `fxRateToIdr: 1` hard-coded?** All Phase 1C assets are IDR-denominated. Wise USD accounts and FX conversion are a Phase 2 concern (requires JISDOR rate feed). Hard-coding 1 now is correct for IDR assets and clearly wrong for non-IDR — that tension will surface in Phase 2 naturally.

Disable the Save button while `mutation.isPending`. Show `mutation.error?.message` as inline error text below the form.

---

### [x] STEP 4 — Create `AddInstitutionDialog`

New file: `apps/frontend/src/components/assets/AddInstitutionDialog.tsx`

Fields:
- `name` — text, required
- `type` — select: `Bank | E-Money | Brokerage | Exchange | Other`
- `country` — text, default `"ID"` (Indonesia)

On submit: `addInstitution({ name, type, country })` via `useMutation`.
On success: call `onSuccess()` → caller invalidates `['institutions']`.

---

### [x] STEP 5 — Create `AddAccountDialog`

New file: `apps/frontend/src/components/assets/AddAccountDialog.tsx`

Requires `institutions: Institution[]` prop (passed by AccountsTab after it fetches them).

Fields:
- `institutionId` — select (institution name list), required
- `name` — text, required
- `accountType` — select: `savings | checking | giro | e-money | investment | crypto | other`
- `currency` — text, default `"IDR"`
- `openingBalance` — number, default `0`
- `openingDate` — date, default today

On submit: `addAccount({ institutionId, name, accountType, currency, openingBalance, openingDate })`.
On success: invalidate `['accounts']`.

---

### [x] STEP 6 — Wire `AccountsTab` to real data

Replace `DUMMY_INSTITUTIONS` and the static data with:

```typescript
const { data: institutions = [], refetch: refetchInst } = useQuery({
  queryKey: ['institutions'],
  queryFn: getInstitutions,
});
const { data: accounts = [], refetch: refetchAcc } = useQuery({
  queryKey: ['accounts'],
  queryFn: getAccounts,
});

// Group accounts by institutionId on the frontend
const byInstitution = institutions.map(inst => ({
  ...inst,
  accounts: accounts.filter(a => a.institutionId === inst.id),
}));
```

Button wiring:
- "Add Institution" → `setShowAddInstitution(true)` → `<AddInstitutionDialog onSuccess={() => refetchInst()} />`
- "Add Account" → `setShowAddAccount(true)` → `<AddAccountDialog institutions={institutions} onSuccess={() => refetchAcc()} />`
- "Update" per account row → `setValuationTarget({ subjectType: 'account', subjectId: account.id, ... })` → `<AddValuationDialog onSuccess={() => refetchAcc()} />`

Account row "Value (IDR)" column: use `account.latestValuation?.valueIdr ?? account.openingBalance`.
"Last Updated" column: use `account.latestValuation?.valuedAt ?? account.openingDate`.

> **Note:** `AccountDto` from the backend does not currently include `latestValuation`. In Phase 1B, the plan called for a server-side JOIN. If the backend isn't joining, the account rows will show `openingBalance` until a valuation is added. This is acceptable for Phase 1C — Phase 2 can add the JOIN. Do NOT silently render `0` as the value; use `openingBalance` explicitly so the user sees meaningful data.

---

### [x] STEP 7 — Create `AddHoldingDialog`

New file: `apps/frontend/src/components/assets/AddHoldingDialog.tsx`

Requires `accounts: Account[]` prop (passed by InvestmentsTab — filter to accounts with `accountType` in `['investment', 'crypto', 'brokerage']` or just show all).

Fields:
- `accountId` — select (account name list), required
- `ticker` — text, required (e.g. `BBCA`, `BTC`)
- `quantity` — number, required
- `costBasis` — number, required (total IDR cost, not per-unit)
- `currency` — text, default `"IDR"`

On submit: `addHolding({ accountId, ticker, quantity, costBasis, currency })`.
On success: invalidate `['holdings']`.

---

### [x] STEP 8 — Wire `InvestmentsTab` and `HoldingsTable` to real data

**`InvestmentsTab`:**
```typescript
const { data: holdings = [], refetch } = useQuery({
  queryKey: ['holdings'],
  queryFn: getHoldings,
});
const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: getAccounts });
```

Button wiring:
- "Add Holding" → `<AddHoldingDialog accounts={accounts} onSuccess={() => refetch()} />`
- "Add Valuation" → open `<AddValuationDialog subjectType="holding" subjectId={holding.id} ... onSuccess={() => refetch()} />`

**`HoldingsTable`:**

Remove `DUMMY_HOLDINGS`. Accept `holdings: Holding[]` and `onAddValuation: (holding: Holding) => void` props.

Column rendering with real data:
- `Ticker` — `holding.ticker`
- `Qty` — `holding.quantity`
- `Avg Cost` — `holding.costBasis / holding.quantity` (per-unit; requires `quantity > 0`)
- `Latest Price` — `holding.latestValuation ? holding.latestValuation.valueIdr / holding.quantity : —`
- `Market Value` — `holding.latestValuation?.valueIdr ?? holding.costBasis`
- `P&L` — `latestValuation ? valueIdr - costBasis : —` (show `—` when no valuation yet)
- `Weight` — `marketValue / totalMarketValue * 100`

> **Why show `—` for P&L when no valuation?** Showing `0` would imply the holding is break-even. Showing `—` signals "no market price recorded yet" — the user knows to add a valuation.

---

### [x] STEP 9 — Create `AddAssetDialog`

New file: `apps/frontend/src/components/assets/AddAssetDialog.tsx`

Fields:
- `name` — text, required
- `assetClass` — select: `real_estate | tangibles | vehicles | receivables | retirement | fixed_income`
  (exclude `cash`, `investments`, `crypto` — those come via accounts/holdings)
- `currency` — text, default `"IDR"`
- `valuationStrategy` — select: `Manual | Amortized | Algorithmic` (no RealTime for other assets in Phase 1C)
- `acquiredDate` — date, optional
- `acquisitionCost` — number, optional
- `notes` — text, optional (stored in `metadata.notes`)

On submit: `addAsset({ name, assetClass, currency, valuationStrategy, acquiredDate, acquisitionCost, metadata: { notes } })`.
On success: invalidate `['assets']`.

---

### [x] STEP 10 — Wire `PropertiesTab` to real data

```typescript
const { data: assets = [], refetch } = useQuery({
  queryKey: ['assets'],
  queryFn: getAssets,
});
```

Filter assets client-side to exclude `cash`, `investments`, `crypto` (those tabs own those classes):
```typescript
const properties = assets.filter(a =>
  ['real_estate', 'tangibles', 'vehicles', 'receivables', 'retirement', 'fixed_income'].includes(a.assetClass)
);
```

Card rendering with real data: use `asset.latestValuation?.valueIdr ?? asset.acquisitionCost ?? 0` for the value display.

Button wiring:
- "Add Asset" → `<AddAssetDialog onSuccess={() => refetch()} />`
- "Update Valuation" per card → `<AddValuationDialog subjectType="asset" subjectId={asset.id} subjectName={asset.name} currency={asset.currency} strategy={asset.valuationStrategy} onSuccess={() => refetch()} />`

---

### [x] STEP 11 — Create `AddLiabilityDialog`

New file: `apps/frontend/src/components/assets/AddLiabilityDialog.tsx`

Fields:
- `name` — text, required
- `liabilityType` — select: `revolving | installment | personal`
- `principal` — number, required
- `interestRate` — number, optional (% per annum)
- `startDate` — date, required
- `endDate` — date, optional
- `monthlyPayment` — number, optional

On submit: `addLiability({ name, liabilityType, principal, interestRate, startDate, endDate, monthlyPayment })`.
On success: invalidate `['liabilities']`.

> **Why no `assetId` in the Add dialog?** Linking a liability to an asset (for LTV calculation) is an advanced action. For Phase 1C, users add the liability first, then link it via edit (Phase 2). Keeping the Add dialog simple reduces form complexity and matches how most users think ("add the loan, worry about linking later").

---

### [x] STEP 12 — Wire `LiabilitiesTab` to real data

```typescript
const { data: liabilities = [], refetch } = useQuery({
  queryKey: ['liabilities'],
  queryFn: getLiabilities,
});
```

The `ltv` field comes from the backend (computed server-side from linked asset's latest valuation). `LtvBadge` already handles `ltv == null` — no change needed there.

Button wiring:
- "Add Liability" → `<AddLiabilityDialog onSuccess={() => refetch()} />`

---

### [x] STEP 13 — Fix `OverviewTab` dummy data fallback

Remove the `isDataEmpty` fallback logic and `DUMMY_*` constants. Fix field names to match backend:

```typescript
const { data: current } = useQuery({ queryKey: ['networth-current'], queryFn: getNetWorthCurrent });
const { data: history = [] } = useQuery({ queryKey: ['networth-history'], queryFn: () => getNetWorthHistory() });
const { data: allocation = {} } = useQuery({ queryKey: ['networth-allocation'], queryFn: getAllocationByClass });

// Backend returns { netWorthIdr }, not { totalIdr }
<NetWorthHeadline totalIdr={current?.netWorthIdr} />

// Backend returns { date, valueIdr }[], not { date, totalIdr }[]
<NetWorthTrendChart data={history} />  // update chart to use .valueIdr
```

Update `NetWorthTrendChart` to map `valueIdr` from the data key (check what field the chart currently accesses).

When API returns no data (empty DB), the headline should show `Rp 0` and the trend chart should show an empty state — not crash and not fall back to fake data.

---

## Dialog Implementation Pattern

All new dialogs follow the same structure. Use this as a template:

```typescript
// components/assets/AddXxxDialog.tsx
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';

type Props = { onSuccess: () => void; onClose: () => void; };

export function AddXxxDialog({ onSuccess, onClose }: Props) {
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>();
  const mutation = useMutation({
    mutationFn: addXxx,
    onSuccess: () => { onSuccess(); onClose(); },
  });

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-card border border-border rounded-xl p-6 shadow-lg max-w-md w-full">
        <h2 className="text-base font-semibold mb-4">Add Xxx</h2>
        <form onSubmit={handleSubmit(v => mutation.mutate(v))} className="space-y-4">
          {/* fields */}
          {mutation.error && (
            <p className="text-xs text-destructive">{String(mutation.error)}</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-xs rounded-md border border-border text-foreground hover:bg-accent transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={mutation.isPending}
              className="px-4 py-2 text-xs rounded-md bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 transition-colors">
              {mutation.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

Key requirements for every dialog:
- `react-hook-form` — not uncontrolled inputs with manual state
- `useMutation` — not `await fetch(...)` inline in an onClick
- Disable Save while `isPending`
- Show `mutation.error` inline (not alert/console)
- Call `onClose()` inside `onSuccess` — dialog must close itself after save
- Backdrop click does NOT close (prevents accidental dismissal on slow saves)

---

## Out of Scope for Phase 1C

- FX conversion preview in `AddValuationDialog` (Wise USD — Phase 2)
- Edit/Delete for any entity (only Add + Update Valuation in this phase)
- LTV link from Add Liability dialog (Phase 2 edit flow)
- Auto-pricing / price feeds (Phase 2)
- `GET /api/assets` JOIN with `latestValuation` in backend (Phase 2 optimization)
- `data-testid` attributes for Playwright E2E (can be layered on top without blocking)

---

## Notes

- **Backend API port:** `accountsApi.ts`, `assetsApi.ts`, `liabilitiesApi.ts`, and `netWorthApi.ts` all default to port `7209` — verify this matches `VITE_API_URL` in your `.env`. The API runs on `7208` by default per CLAUDE.md.
- **React Query cache keys:** use `['institutions']`, `['accounts']`, `['assets']`, `['holdings']`, `['liabilities']`, `['networth-current']`, `['networth-history']`, `['networth-allocation']` — keep these consistent across tabs so invalidation works correctly.
- **No `useQueryClient` invalidation pattern used yet in the codebase.** Use `queryClient.invalidateQueries({ queryKey: ['xxx'] })` in `onSuccess`, or pass a `refetch` function from the parent — both are acceptable. The `refetch` pattern is simpler given the current codebase has no shared QueryClient usage examples.
