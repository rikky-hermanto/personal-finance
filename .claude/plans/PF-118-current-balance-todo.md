# PF-118 — Dashboard Current Balance: inline strip + per-account popover

> **GitHub Issue:** (create on save)
> **Status:** To Do
> **Started:** 2026-05-21

## Objective

The Overview dashboard shows cashflow (money in/out) but not the user's actual account
balance. Users can't answer "how much money do I have right now?" without scrolling
through transactions. This task adds a "Current Balance" stat strip to the Overview
header — a single total with a click-to-expand popover breaking it down per account.
Opening balances are already stored on the Account entity; this task wires them up.

## Acceptance Criteria

- [ ] Overview page shows a "Current Balance" number inline (not a card) near the header
- [ ] Clicking the balance opens a Popover listing each account's name + current balance
- [ ] Total balance = Σ(account.openingBalance + allTimeCR − allTimeDB) across all active accounts
- [ ] Settings → Data tab has an "Account Starting Balances" section to edit opening_balance + opening_date per account
- [ ] Balance is labeled with "as of [latest transaction date]" to communicate data freshness
- [ ] No new card chrome — strip fits within the existing Overview layout

## Approach

New `GET /api/accounts/balances` endpoint on `AccountsController` computes current balance
per account (opening_balance + all-time credits − debits) using two supabase-csharp queries.
Frontend fetches this with React Query and renders a `CurrentBalanceStrip` component using
shadcn `Popover` for the breakdown. Settings → Data tab adds a form section that calls the
existing `PUT /api/accounts/{id}` to update `openingBalance` + `openingDate`. No new DB
migration needed — `opening_balance` and `opening_date` columns already exist.

## Affected Files

| File | Change |
|------|--------|
| `apps/api/src/PersonalFinance.Api/Controllers/AccountsController.cs` | Edit — add `GET /balances` action |
| `apps/api/src/PersonalFinance.Application/Dtos/AccountBalanceDto.cs` | Create — new DTO |
| `apps/frontend/src/api/accountsApi.ts` | Edit — add `getAccountBalances()` |
| `apps/frontend/src/components/dashboard/CurrentBalanceStrip.tsx` | Create — inline stat + Popover |
| `apps/frontend/src/pages/cashflow/OverviewTab.tsx` | Edit — wire in CurrentBalanceStrip |
| `apps/frontend/src/pages/settings/DataTab.tsx` | Edit — add Account Starting Balances section |

---

## TODO

### [ ] STEP 1 — Add AccountBalanceDto

Create `apps/api/src/PersonalFinance.Application/Dtos/AccountBalanceDto.cs`:

```csharp
namespace PersonalFinance.Application.Dtos;

public record AccountBalanceDto(
    Guid AccountId,
    string AccountName,
    string InstitutionName,
    string Currency,
    decimal OpeningBalance,
    decimal CurrentBalance,
    DateTime AsOf
);
```

> **Why:** Separate DTO keeps `AccountDto` (CRUD concern) clean from `AccountBalanceDto`
> (computed balance concern) — respects ARCH-03: file location must match its namespace.
> Place in `Application/Dtos/` where all other DTOs live.

---

### [ ] STEP 2 — Add `GET /api/accounts/balances` endpoint

Add to `AccountsController.cs` after the existing `GetAccounts()` action:

```csharp
[HttpGet("balances")]
public async Task<IActionResult> GetAccountBalances()
{
    var accounts = await supabase.From<Account>()
        .Filter("is_active", Operator.Equals, "true")
        .Order("name", Ordering.Ascending)
        .Get();

    if (!accounts.Models.Any())
        return Ok(Array.Empty<AccountBalanceDto>());

    var txResult = await supabase.From<Transaction>()
        .Select("account_id,flow,amount_idr,date")
        .Get();

    var txByAccount = txResult.Models
        .GroupBy(t => t.AccountId)
        .ToDictionary(g => g.Key, g => g.ToList());

    var institutions = await supabase.From<Institution>().Get();
    var instMap = institutions.Models.ToDictionary(i => i.Id, i => i.Name);

    var balances = accounts.Models.Select(a =>
    {
        var txs = txByAccount.GetValueOrDefault(a.Id, []);
        var totalCR = txs.Where(t => t.Flow == "CR").Sum(t => t.AmountIdr);
        var totalDB = txs.Where(t => t.Flow == "DB").Sum(t => t.AmountIdr);
        var asOf = txs.Any() ? txs.Max(t => t.Date) : a.OpeningDate;
        return new AccountBalanceDto(
            a.Id,
            a.Name,
            a.InstitutionId.HasValue ? instMap.GetValueOrDefault(a.InstitutionId.Value, "") : "",
            a.Currency,
            a.OpeningBalance,
            a.OpeningBalance + totalCR - totalDB,
            asOf
        );
    });

    return Ok(balances);
}
```

> **Why:** All-time query (no `months` cap) so opening balances from 2024 are correctly
> accumulated. Fetches only the columns needed (`account_id`, `flow`, `amount_idr`, `date`)
> to minimize payload. ARCH-04: action body delegates to supabase-csharp — no business logic
> in controller beyond mapping.

---

### [ ] STEP 3 — Add `getAccountBalances()` to frontend API client

Add to `apps/frontend/src/api/accountsApi.ts` (create if not present, else append):

```typescript
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:7208';

export interface AccountBalance {
  accountId: string;
  accountName: string;
  institutionName: string;
  currency: string;
  openingBalance: number;
  currentBalance: number;
  asOf: string; // ISO date string
}

export async function getAccountBalances(): Promise<AccountBalance[]> {
  const res = await fetch(`${API_BASE}/api/accounts/balances`);
  if (!res.ok) throw new Error('Failed to fetch account balances');
  return res.json();
}
```

> **Why:** Follows the project's plain-fetch pattern (no axios). Separate file from
> `transactionsApi.ts` because this is an accounts concern. React Query key will be
> `['account-balances']`.

---

### [ ] STEP 4 — Create `CurrentBalanceStrip` component

Create `apps/frontend/src/components/dashboard/CurrentBalanceStrip.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { getAccountBalances } from '@/api/accountsApi';
import { cn } from '@/lib/utils';

const fmt = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'decimal', minimumFractionDigits: 2 }).format(n);

const CurrentBalanceStrip = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['account-balances'],
    queryFn: getAccountBalances,
    staleTime: 60_000,
  });

  const total = data?.reduce((sum, a) => sum + a.currentBalance, 0) ?? 0;
  const asOf = data?.reduce((latest, a) =>
    !latest || a.asOf > latest ? a.asOf : latest, '' as string);
  const asOfLabel = asOf
    ? new Date(asOf).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';

  if (isLoading) return <Skeleton className="h-5 w-48" />;
  if (!data?.length) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className={cn(
          "flex items-baseline gap-2 group cursor-pointer",
          "hover:opacity-80 transition-opacity"
        )}>
          <span className="text-xs text-muted-foreground">Current Balance</span>
          <span className="text-sm font-semibold text-foreground tabular-nums">
            Rp {fmt(total)}
          </span>
          {asOfLabel && (
            <span className="text-xs text-muted-foreground/60">as of {asOfLabel}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <div className="px-3 py-2 border-b">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Balance by Account
          </p>
        </div>
        <div className="divide-y">
          {data.map((a) => (
            <div key={a.accountId} className="flex items-center justify-between px-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-foreground">{a.accountName}</p>
                {a.institutionName && (
                  <p className="text-xs text-muted-foreground">{a.institutionName}</p>
                )}
              </div>
              <span className={cn(
                "text-sm tabular-nums font-medium",
                a.currentBalance >= 0 ? "text-foreground" : "text-destructive"
              )}>
                Rp {fmt(a.currentBalance)}
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between px-3 py-2.5 border-t bg-muted/30">
          <span className="text-xs font-semibold text-muted-foreground">Total</span>
          <span className="text-sm font-bold tabular-nums">Rp {fmt(total)}</span>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default CurrentBalanceStrip;
```

> **Why:** shadcn `Popover` (not `Tooltip`) so it works on mobile tap, stays open without
> hover hold. `tabular-nums` on all amounts for alignment. `staleTime: 60_000` avoids
> refetching on every tab focus — balance doesn't change mid-session.

---

### [ ] STEP 5 — Wire into OverviewTab

In `apps/frontend/src/pages/cashflow/OverviewTab.tsx`, add the strip below the page header
(after the `<h2>Overview</h2>` row, before the staleness badge):

```tsx
import CurrentBalanceStrip from '@/components/dashboard/CurrentBalanceStrip';

// Inside the JSX, after the flex header div:
<CurrentBalanceStrip />
```

> **Why:** Placing it directly below the page title keeps it in the header zone without
> adding a card border — satisfies the "less cardly" requirement. No range-filter dependency
> since balance is always all-time.

---

### [ ] STEP 6 — Account Starting Balances in Settings → Data tab

In `apps/frontend/src/pages/settings/DataTab.tsx`, add a new section above the Danger Zone.
Fetch accounts via React Query and render an editable table — one row per account with
`opening_balance` (number input) and `opening_date` (date input). On blur/change, call
`PUT /api/accounts/{id}` with the updated account.

Key additions:

```tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Fetch accounts
const { data: accounts } = useQuery({
  queryKey: ['accounts'],
  queryFn: async () => {
    const res = await fetch(`${API_BASE}/api/accounts`);
    return res.json() as Promise<AccountDto[]>;
  },
});

// Update opening balance mutation
const { mutate: updateAccount } = useMutation({
  mutationFn: async ({ id, openingBalance, openingDate }: { id: string; openingBalance: number; openingDate: string }) => {
    await fetch(`${API_BASE}/api/accounts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ openingBalance, openingDate }),
    });
  },
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['account-balances'] }),
});
```

Render as a compact table (no card chrome, just a divider section):

```
Account Starting Balances
───────────────────────────────────────────────────
BCA          Opening balance: [_________]  Date: [__/__/____]
Superbank    Opening balance: [_________]  Date: [__/__/____]
NeoBank      Opening balance: [_________]  Date: [__/__/____]
...
```

> **Why:** Editing opening balance lives in Settings not on the dashboard — it's a one-time
> setup action, not a daily view. Invalidating `account-balances` query on save ensures the
> Overview strip immediately reflects the new baseline.

---

## Notes

- `opening_balance` and `opening_date` already exist on the `accounts` table — no migration needed
- The balance calculation is all-time (no months cap) — important for users who started tracking in 2024
- For Wise (multi-currency), `currentBalance` will be in AUD — consider adding a note in the Popover that Wise is shown in native currency, not converted to IDR
- If an account has zero transactions, `currentBalance = openingBalance` which is correct
- Verify `UpdateAccountCommand` maps `openingBalance` and `openingDate` before executing STEP 6
