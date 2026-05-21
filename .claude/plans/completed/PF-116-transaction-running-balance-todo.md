# PF-115 — Transaction Running Balance View

> **GitHub Issue:** TBD
> **Status:** Done
> **Started:** 2026-05-19

## Objective

The Balance column in the Transactions table shows `0` for every row. Fix it by computing a per-account
running balance using a PostgreSQL window function exposed as a VIEW. The running balance is the
cumulative net position of a bank account after each transaction, sorted chronologically.

## Acceptance Criteria

- [x] Supabase migration creates `v_transactions_with_balance` VIEW
- [x] VIEW computes `running_balance` via `SUM(...) OVER (PARTITION BY account_id ORDER BY date, id)`
- [x] `TransactionWithBalance` entity maps `running_balance` column from the VIEW
- [x] `GetTransactionPageAsync` queries the VIEW instead of the raw `transactions` table
- [x] `TransactionDto.Balance` is populated from `RunningBalance` (not hardcoded `0`)
- [x] Balance column in the UI shows real values for all imported bank statement transactions
- [x] Balance stays correct when category / type / search filters are active
- [x] Rows with `account_id = null` show `—` instead of `0` in the UI
- [x] `dotnet build` passes with no errors

## Approach

Postgres window functions are the canonical pattern for running totals. By wrapping the window function
in a VIEW, PostgREST (and therefore `supabase-csharp`) treats it identically to a table —
`From<TransactionWithBalance>()` uses the same filter/sort/range patterns as `From<Transaction>()`
with no RPC plumbing needed.

The window is partitioned by `account_id` so each bank account's balance resets independently.
UI filters (category, type, search) narrow which rows are returned but do not affect the window
computation — balance is always the true account-level running total, not a filtered partial sum.

A prefix-sum approach (K+2 queries per page) was considered and rejected: it requires a filter-split
invariant that every future developer must manually respect, generates 4–6 round-trips for
mixed-account pages, and is easy to get wrong on same-date tie-breaking.

**Out of scope:** opening balance per account, CSV export balance column, backfilling
transactions with `account_id = null`, MATERIALIZED VIEW.

## Affected Files

| File | Change |
|------|--------|
| `supabase/migrations/20260519000000_add_transactions_balance_view.sql` | Create — VIEW definition |
| `apps/api/src/PersonalFinance.Domain/Entities/TransactionWithBalance.cs` | Create — entity for the VIEW |
| `apps/api/src/PersonalFinance.Application/Services/TransactionService.cs` | Edit — swap `From<Transaction>()`, map RunningBalance, remove `Balance = 0` |
| `apps/api/src/PersonalFinance.Application/Dtos/TransactionDto.cs` | Edit — remove stale comment |
| `apps/frontend/src/components/TransactionTable.tsx` | Edit — show `—` when balance is zero |

---

## TODO

### [x] STEP 1 — Create the Supabase migration file

Create `supabase/migrations/20260519000000_add_transactions_balance_view.sql` with:

```sql
CREATE VIEW v_transactions_with_balance AS
SELECT
  t.*,
  SUM(
    CASE WHEN t.flow = 'CR' THEN t.amount_idr ELSE -t.amount_idr END
  ) OVER (
    PARTITION BY t.account_id
    ORDER BY t.date ASC, t.id ASC
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) AS running_balance
FROM transactions t;
```

> **Why this SQL:** The window function accumulates a signed amount per account in chronological order.
> `PARTITION BY account_id` ensures each bank account's balance is independent.
> `ORDER BY date, id` gives a deterministic sort — `id` breaks ties when two transactions share the
> same date. `ROWS UNBOUNDED PRECEDING` means "sum everything from the first row in this partition
> up to and including the current row." No new column is added to `transactions` — the VIEW is
> purely a read-time computation.

---

### [x] STEP 2 — Apply the migration

```bash
supabase db push
```

> **Why:** `supabase db push` applies all pending migrations in `supabase/migrations/` to the local
> Supabase instance. It is the only safe way to evolve the schema — never run raw SQL directly in
> Studio for schema changes, as that won't be tracked in the migration history.

**Expected output:**
```
Applying migration 20260519000000_add_transactions_balance_view.sql...
Done.
```

**Verify in Studio** — open `http://localhost:54323`, navigate to Table Editor or SQL Editor and run:
```sql
SELECT id, account_id, date, flow, amount_idr, running_balance
FROM v_transactions_with_balance
ORDER BY account_id, date, id
LIMIT 20;
```
Expected: `running_balance` increments or decrements per account with each row, matching the
cumulative CR minus DB sum. Cross-check a few rows manually against known account data.

---

### [x] STEP 3 — Create `TransactionWithBalance` entity

Create `apps/api/src/PersonalFinance.Domain/Entities/TransactionWithBalance.cs`:

```csharp
using Postgrest.Attributes;
using Postgrest.Models;

namespace PersonalFinance.Domain.Entities;

[Table("v_transactions_with_balance")]
public class TransactionWithBalance : Transaction
{
    [Column("running_balance")]
    public decimal? RunningBalance { get; set; }
}
```

> **Why inherit `Transaction`:** All `[Column]` mappings are already declared on the base class.
> Adding one extra property and overriding `[Table]` is all that is needed — no duplication.
> `supabase-csharp` resolves `[Table]` from the most-derived class, so `[Table("v_transactions_with_balance")]`
> here overrides the `[Table("transactions")]` on the base. `RunningBalance` is nullable because
> rows with `account_id = null` receive `NULL` from the window function.

---

### [x] STEP 4 — Update `TransactionService` to query the VIEW

In `apps/api/src/PersonalFinance.Application/Services/TransactionService.cs`:

**4a.** In `GetTransactionPageAsync`, find the two `_supabase.From<Transaction>()` calls (the count
query and the data query). Replace the data query with `From<TransactionWithBalance>()`:

```csharp
// BEFORE
IPostgrestTable<Transaction> query = _supabase.From<Transaction>();

// AFTER
IPostgrestTable<TransactionWithBalance> query = _supabase.From<TransactionWithBalance>();
```

The count query stays on `From<Transaction>()` — counting from the base table is cheaper
(no window function overhead on a COUNT(*)).

**4b.** Update the `Select` lambda in `GetTransactionPageAsync` to pass `RunningBalance` to `MapToDto`:

```csharp
// BEFORE
Items = result.Models.Select(t => MapToDto(t, accountNames)).ToList(),

// AFTER
Items = result.Models.Select(t =>
{
    var dto = MapToDto(t, accountNames);
    dto.Balance = t.RunningBalance ?? 0m;
    return dto;
}).ToList(),
```

**4c.** Remove the `dto.Balance = 0` override line in `GetTransactionsAsync` (the non-paginated
export path, around line 169). That method stays on `From<Transaction>()` — balance is not
needed for CSV export.

> **Why keep the count query on `From<Transaction>()`:** The VIEW recomputes the window function on
> every SELECT. Running it for a COUNT(*) would scan and aggregate all rows unnecessarily.
> Using the base table for the count is semantically identical (same row count) and avoids the
> overhead.

---

### [x] STEP 5 — Remove the stale comment in `TransactionDto`

In `apps/api/src/PersonalFinance.Application/Dtos/TransactionDto.cs`, remove the outdated comment
on the `Balance` field:

```csharp
// BEFORE
public decimal Balance { get; set; } // Calculated on the fly (UI)

// AFTER
public decimal Balance { get; set; }
```

> **Why:** The comment was the original intent that never shipped. Now that balance is computed
> server-side by the VIEW, the comment is wrong and misleading.

---

### [x] STEP 6 — Build and smoke-test the backend

```bash
cd apps/api && dotnet build PersonalFinance.slnx
```

Expected: no errors or warnings.

Then start the API:
```bash
dotnet run --project src/PersonalFinance.Api
```

Smoke-test the endpoint:
```bash
curl "http://localhost:7208/api/transactions?page=1&pageSize=5" | jq '.[].balance'
```

> **Expected:** non-zero decimal values for imported bank statement transactions. If all values are
> still `0`, the `From<TransactionWithBalance>()` swap in Step 4 did not take effect — re-check
> that `[Table("v_transactions_with_balance")]` is on `TransactionWithBalance`, not `Transaction`.

---

### [x] STEP 7 — Update the frontend Balance cell display

In `apps/frontend/src/components/TransactionTable.tsx`, find the Balance cell render (search for
`formatCurrency(tx.balance)`). Update it to show `—` when balance is zero (meaning the row has no
linked account):

```tsx
// BEFORE
{tx.balance != null ? formatCurrency(tx.balance).replace('Rp', '').trim() : '—'}

// AFTER
{tx.balance !== 0
  ? formatCurrency(tx.balance).replace('Rp', '').trim()
  : '—'}
```

> **Why `!== 0` instead of `!= null`:** The backend maps `NULL` → `0m`, so the frontend receives
> `0` (not null) for rows without an account. Checking `!== 0` correctly shows `—` for those rows.
> Imported transactions with a real running balance will always be non-zero (the opening
> transaction for any account will be ±amount, never 0 unless a CR and DB of equal value happened
> simultaneously — an acceptable edge case).

---

### [x] STEP 8 — Verify end-to-end in the browser

Open `http://localhost:8080/cashflow/transactions`.

**Check 1 — Balance column shows real values:**
Rows for BCA, NeoBank, Superbank, Bank Jago imported transactions should show a non-zero balance.
The last row for each account (earliest date) should equal approximately that account's earliest
known balance.

**Check 2 — Filter stability:**
Apply a "Groceries" category filter. The Balance values for each remaining row should still reflect
the full account running balance, not a filtered partial sum. (If they change, the window function
is being affected by the filter — this would mean PostgREST is pushing the filter into the OVER
clause, which is not expected behavior.)

**Check 3 — Null case:**
If any transaction has `account_id = null` (visible in Studio), its Balance cell should show `—`.

---

## Notes

- **VIEW vs MATERIALIZED VIEW:** A regular VIEW recomputes the window on every SELECT. For personal
  finance data volumes (hundreds to low thousands of transactions per account), this is negligible.
  A MATERIALIZED VIEW would require a refresh trigger on every INSERT/UPDATE — unnecessary complexity.
- **Index recommendation:** If Supabase EXPLAIN shows a sequential scan on the window computation,
  add `CREATE INDEX ON transactions (account_id, date, id);`. Check with:
  `EXPLAIN SELECT * FROM v_transactions_with_balance LIMIT 50;`
- **`account_id = null` rows:** These are transactions imported before the bank-account-linking
  feature was added. Their `running_balance` will be NULL from the window function (NULL partition
  key means no partition). Backend maps to `0`, frontend shows `—`. Will self-heal once those
  transactions are linked to accounts.
- **Export path unaffected:** `GetTransactionsAsync` (CSV export, line ~150) stays on
  `From<Transaction>()`. Balance is not a field in CSV exports.
