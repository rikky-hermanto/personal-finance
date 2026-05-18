# PF-115 — Integrate Cashflow Wallets → Assets Accounts (Wallet → Bank Account rename)

> **GitHub Issue:** [#TBD](https://github.com/rikky-hermanto/personal-finance/issues)
> **Status:** Done
> **Started:** 2026-05-18

## Objective

Cashflow transactions currently identify their source using a raw text string (`wallet: "BCA"`), while the Assets module maintains proper `accounts` records in the database. These two systems have been deliberately decoupled since PF-107, but the cost of that decision is now visible: custom wallets live in localStorage, the cashflow sidebar has no relationship to the real account registry, and the `wallet` text field is ambiguous when a user has multiple accounts at the same institution.

This ticket links the two systems. Every transaction gets an `account_id` FK pointing to an `accounts` row. The `upload-preview` endpoint auto-resolves `account_id` server-side (alias lookup → account name-match fallback). A `wallet_account_aliases` table auto-resolves future uploads of the same bank. The "Wallet" terminology is retired across all UI labels in favor of "Bank Account". Custom localStorage wallets are retired in favour of server-side accounts.

Depends on: PF-107 Phase 1C (Assets Accounts live). Unblocks: balance auto-valuation seam (statement balance → candidate `Valuation` after confirm), per-account net position in Overview.

---

## Acceptance Criteria

- [x] `wallet` column is dropped from `transactions` table (data reset — no migration of old rows)
- [x] `account_id` is NOT NULL FK on `transactions`, referencing `accounts(id)` ON DELETE RESTRICT
- [x] `wallet_account_aliases` table exists: `(alias_text, account_id)` with UNIQUE constraint
- [x] Deduplication composite index rebuilt: replaces `wallet` with `account_id`
- [x] `upload-preview` endpoint auto-resolves `account_id` server-side (alias lookup → account name-match fallback); returns `accountId` on each `TransactionDto` in the preview response
- [x] On upload submit, all transactions in the batch are saved with the resolved `account_id`
- [x] The alias `(wallet_text → account_id)` is saved automatically on first successful **submit** (not preview)
- [x] Subsequent uploads of the same bank auto-resolve `account_id` via the alias at preview time
- [x] `AccountSelector` component built (grouped by institution, pre-fill support) — available for future wizard integration
- [x] Cashflow `AccountsTab` sidebar lists server accounts (from `/api/transactions/account-summaries`) instead of localStorage custom wallets
- [x] Filtering transactions by account uses `accountId` exclusively in all API queries
- [x] All UI labels read "Bank Account" / "Bank Accounts" — no visible "Wallet" text remains in cashflow UI
- [x] `pf_custom_wallets` localStorage key is cleared on first load (no migration banner needed — data reset)
- [x] AI service contract is unchanged — `wallet` field stays in `TransactionResult` and `CategorizeRequest` as a transient in-flight value; it is no longer persisted to the DB
- [ ] Upload wizard "Select Bank Account" step (Step 0 before file drop) — **deferred**; auto-resolution covers the happy path. Manual account selection via wizard not yet implemented.

---

## Approach

**Server-side auto-resolution strategy**: `account_id` is resolved in the `.NET API` layer after parsing — first by alias lookup (`wallet_account_aliases` table), then by account name-match fallback. The resolved `accountId` is returned on each `TransactionDto` in the preview response and flows through to the submit call.

The AI service contract (`wallet` field in `TransactionResult`) is frozen per THINK-05. It is NOT renamed. The `wallet` string continues to flow from parser → AI service → `TransactionDto`. The `account_id` is resolved server-side in `TransactionsController.AutoResolveAccountIdAsync()`. This keeps the AI service completely unaware of the accounts system.

The `wallet` column is dropped from `transactions` entirely. `account_id` replaces it as `NOT NULL` — every transaction must belong to an account. The deduplication composite index is rebuilt using `account_id` in place of `wallet`. The AI service's `wallet` field survives as a transient DTO value used only for alias lookup during the upload pipeline; it is never written to the DB.

The cashflow `AccountsTab` sidebar switches from "unique wallet strings + custom localStorage wallets" to server accounts sourced from `GET /api/transactions/account-summaries`. This endpoint joins `accounts` (filtered by `include_in_cashflow = true`) with transaction aggregates grouped by `account_id`.

**Out of scope:** renaming the `wallet` field in the AI service contract (THINK-05 frozen — transient is fine); per-account valuation auto-write (Reconciliation Exploration phase — separate ticket); multi-account per-file uploads (one file = one account); upload wizard Step 0 UI (deferred — auto-resolution covers the happy path).

---

## Affected Files

### Database
| File | Change |
|------|--------|
| `supabase/migrations/20260518000001_transactions_account_id.sql` | Created — drop `wallet` column, add `account_id` NOT NULL FK, rebuild dedup index, create `wallet_account_aliases` table |

### Backend (.NET)
| File | Change |
|------|--------|
| `PersonalFinance.Domain/Entities/Transaction.cs` | Edited — removed `Wallet` property, added `AccountId Guid` property |
| `PersonalFinance.Domain/Entities/WalletAccountAlias.cs` | Created — new entity for alias table |
| `PersonalFinance.Application/Dtos/TransactionDto.cs` | Edited — added `AccountId Guid?` property; `Wallet` retained as transient |
| `PersonalFinance.Application/Interfaces/ITransactionService.cs` | Edited — added `ResolveAliasAsync`, `UpsertAliasAsync`; `accountId` param on filter methods |
| `PersonalFinance.Application/Services/TransactionService.cs` | Edited — `ResolveAliasAsync` (Get + order by created_at desc + Limit 1); `UpsertAliasAsync` (Insert + 23505 catch); dedup key uses `t.AccountId`; all filters use `account_id` |
| `PersonalFinance.Application/Commands/Accounts/CreateAccountCommandHandler.cs` | Edited |
| `PersonalFinance.Application/Services/DashboardService.cs` | Edited — replaced `wallet` filter with `accountId` filter; removed `wallet` from all PostgREST queries |
| `PersonalFinance.Application/Services/SpendingAnalysisService.cs` | Edited — replaced `wallet` filter with `accountId` filter |
| `PersonalFinance.Application/Validation/CreateTransactionCommandValidator.cs` | Edited |
| `PersonalFinance.Api/Controllers/AccountsController.cs` | Edited |
| `PersonalFinance.Api/Controllers/SpendingAnalysisController.cs` | Edited — `wallet?` param replaced with `accountId?` |
| `PersonalFinance.Api/Controllers/TransactionsController.cs` | Edited — `upload-preview` auto-resolves `account_id` via `AutoResolveAccountIdAsync`; `submit` upserts alias; `account-summaries` inline endpoint (filters `include_in_cashflow=true`); `resolve-alias` endpoint; all GET params use `accountId` |

### Frontend
| File | Change |
|------|--------|
| `apps/frontend/src/api/transactionsApi.ts` | Edited — `accountId` in query params; `getAccountSummaries()`; `resolveAlias()`; `wallet` noted as transient in `TransactionDto` |
| `apps/frontend/src/api/accountsApi.ts` | Edited |
| `apps/frontend/src/api/spendingAnalysisApi.ts` | Edited — `wallet?` → `accountId?` params |
| `apps/frontend/src/types/Transaction.ts` | Edited — added `accountId?: string` |
| `apps/frontend/src/components/AccountSelector.tsx` | Created — grouped by institution, pre-fill support |
| `apps/frontend/src/components/FileUpload.tsx` | Edited — maps `t.accountId` from preview response; no wizard Step 0 (deferred) |
| `apps/frontend/src/components/TransactionPreview.tsx` | Edited — passes `accountId` through submit |
| `apps/frontend/src/components/TransactionTable.tsx` | Edited — "Wallet" column → "Bank Account"; filter by `accountId` |
| `apps/frontend/src/components/CashFlowDashboard.tsx` | Edited |
| `apps/frontend/src/components/dashboard/WalletTabs.tsx` | Edited |
| `apps/frontend/src/pages/cashflow/AccountsTab.tsx` | Edited — full rewrite: server accounts from `getAccountSummaries`, localStorage cleared, labels updated |
| `apps/frontend/src/pages/cashflow/CashflowLayout.tsx` | Edited |
| `apps/frontend/src/pages/assets/AccountsTab.tsx` | Edited |
| `apps/frontend/src/pages/settings/BanksTab.tsx` | Edited — custom wallets section removed |

---

## Implementation Details

### STEP 1 — Supabase migration ✅

File: `supabase/migrations/20260518000001_transactions_account_id.sql`

```sql
-- Drop existing dedup index (references wallet column — must drop before altering column)
DROP INDEX IF EXISTS idx_transactions_deduplication_composite;

-- Drop wallet column — data reset means no rows to preserve
ALTER TABLE public.transactions
  DROP COLUMN IF EXISTS wallet;

-- Add account_id as NOT NULL FK
ALTER TABLE public.transactions
  ADD COLUMN account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT;

-- Rebuild dedup index using account_id in place of wallet
CREATE UNIQUE INDEX idx_transactions_deduplication_composite
  ON public.transactions (
    date,
    amount_idr,
    description,
    account_id,
    flow,
    COALESCE(bank_running_balance, -999999999)
  );

-- Index for account-scoped queries
CREATE INDEX idx_transactions_account_id ON public.transactions (account_id);

-- Alias table: maps wallet text (from parser/AI) → account_id
CREATE TABLE public.wallet_account_aliases (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alias_text  text NOT NULL,
  account_id  uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (alias_text, account_id)
);

-- RLS: open (flip to auth.uid() in PF-S08)
ALTER TABLE public.wallet_account_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wallet_account_aliases_open" ON public.wallet_account_aliases
  FOR ALL USING (true) WITH CHECK (true);
```

> **Why `ON DELETE RESTRICT` not `CASCADE` or `SET NULL`?** We don't want silent data deletion if someone removes an account. RESTRICT forces the user to reassign or explicitly delete transactions first. SET NULL is gone because `account_id` is NOT NULL.

> **Why `UNIQUE(alias_text, account_id)` not `UNIQUE(alias_text)`?** The same alias text (`"BCA"`) might legitimately map to BCA Savings or BCA Giro. Two rows are valid — the resolver picks the most recent one. `UNIQUE(alias_text)` would block the second account from ever being aliased under that name.

---

### STEP 2 — `WalletAccountAlias` entity + `Transaction.AccountId` ✅

`PersonalFinance.Domain/Entities/WalletAccountAlias.cs`:
```csharp
[Table("wallet_account_aliases")]
public class WalletAccountAlias : BaseModel
{
    [PrimaryKey("id")]       public Guid Id { get; set; }
    [Column("alias_text")]   public string AliasText { get; set; } = string.Empty;
    [Column("account_id")]   public Guid AccountId { get; set; }
    [Column("created_at")]   public DateTime CreatedAt { get; set; }
}
```

`Transaction.cs`: removed `Wallet` property, added `[Column("account_id")] public Guid AccountId { get; set; }`.

`TransactionDto.cs`: `Wallet` stays (transient, used for alias lookup). Added `public Guid? AccountId { get; set; }`.

---

### STEP 3 — `upload-preview`: auto-resolve `account_id` server-side ✅

**Actual implementation** (differs from original plan — no wizard Step 0 was added).

`TransactionsController.UploadPreview()` calls `AutoResolveAccountIdAsync(walletText)` after parsing:

```csharp
private async Task<Guid?> AutoResolveAccountIdAsync(string walletText)
{
    if (string.IsNullOrWhiteSpace(walletText)) return null;

    // 1. Alias lookup (most recent for this wallet text)
    var aliasId = await _transactionService.ResolveAliasAsync(walletText);
    if (aliasId.HasValue) return aliasId;

    // 2. Fallback: name-contains match against accounts table
    var accounts = await _supabase.From<Account>().Get();
    var match = accounts.Models.FirstOrDefault(a =>
        a.Name.Contains(walletText, StringComparison.OrdinalIgnoreCase) ||
        walletText.Contains(a.Name, StringComparison.OrdinalIgnoreCase));
    return match?.Id;
}
```

The resolved `accountId` is set on all `TransactionDto` objects before returning the preview response. The frontend maps `t.accountId` and it flows through to the submit call.

> **Why auto-resolve in preview rather than adding a wizard step?** The auto-resolution covers the happy path (repeat uploads of the same bank). The name-match fallback handles first-time uploads with a single account per institution. A wizard step adds friction for the common case. The `AccountSelector` component is built and ready for future wiring if disambiguation is needed.

---

### STEP 4 — `ResolveAliasAsync` + `UpsertAliasAsync` ✅

**Actual implementation:**

```csharp
public async Task<Guid?> ResolveAliasAsync(string walletText)
{
    if (string.IsNullOrWhiteSpace(walletText)) return null;

    var result = await _supabase.From<WalletAccountAlias>()
        .Filter("alias_text", Operator.Equals, walletText.Trim())
        .Order("created_at", Ordering.Descending)
        .Limit(1)
        .Get();

    return result.Models.FirstOrDefault()?.AccountId;
}

public async Task UpsertAliasAsync(string walletText, Guid accountId)
{
    if (string.IsNullOrWhiteSpace(walletText)) return;
    try
    {
        await _supabase.From<WalletAccountAlias>().Insert(new WalletAccountAlias
        {
            AliasText = walletText.Trim(),
            AccountId = accountId,
        });
    }
    catch (Exception ex) when (ex.Message.Contains("23505"))
    {
        // Alias pair already exists — no-op
    }
}
```

`UpsertAliasAsync` is called from `TransactionsController.Submit()` (not the upload endpoint):
```csharp
var first = request.Transactions.FirstOrDefault(t => t.AccountId.HasValue && !string.IsNullOrWhiteSpace(t.Wallet));
if (first != null)
    await _transactionService.UpsertAliasAsync(first.Wallet, first.AccountId!.Value);
```

> **Why plain Insert + 23505 catch instead of Upsert?** The `UNIQUE(alias_text, account_id)` pair means a second insert of the same pair is a harmless no-op. The catch absorbs the PostgreSQL unique violation. If the user later selects a *different* account for the same wallet text, a new row is inserted (valid — resolver picks the most recent).

> **Why resolve with Order + Limit 1 instead of Single?** `UNIQUE(alias_text, account_id)` allows multiple rows for the same alias_text pointing to different accounts. `Single()` would throw on multiple results. Ordering by `created_at desc` + Limit 1 returns the most recent alias for that text.

---

### STEP 5 — Replace `wallet` filter with `accountId` filter on all GET endpoints ✅

All `.Filter("wallet", ...)` calls removed from `TransactionService`, `DashboardService`, and `SpendingAnalysisService`. Replaced with:

```csharp
if (accountId.HasValue)
    query = query.Filter("account_id", Operator.Equals, accountId.Value.ToString());
```

Dedup key in `TransactionService.GetRegularKey()` updated:
```csharp
// OLD: ...wallet normalization logic...
// NEW:
return $"{date:yyyy-MM-dd HH:mm:ss}|{amountStr}|{desc}|{t.AccountId}|{t.Flow}";
```

---

### STEP 6 — Upload wizard: no new step added (deferred) ⚠️

The original plan called for adding "Bank Account" as wizard Step 0 before file drop. **This was not implemented.** Instead:

- `upload-preview` auto-resolves `account_id` server-side (see STEP 3)
- The resolved `accountId` is returned in the preview response and flows through to submit
- `WorkflowStep` in `FileUpload.tsx` remains `'upload' | 'review' | 'preview' | 'submitted'` — no 'account' step
- The `AccountSelector` component is built and available for future wiring

**Future work:** If auto-resolution fails (no alias, no name match), the user has no way to specify the account during upload. A wizard step (or an inline account picker in the Review step) would address this. Tracked as future enhancement.

---

### STEP 7 — `AccountSelector` component ✅

`apps/frontend/src/components/AccountSelector.tsx` — built and ready.

Props:
```typescript
type AccountSelectorProps = {
  value: string | null;
  onChange: (id: string, name: string, institutionName: string) => void;
  prefilledAccountId?: string | null;
  prefilledNote?: string;
};
```

Data: `useQuery(['accounts'], getAccounts)` + `useQuery(['institutions'], getInstitutions)` — grouped by institution. Empty state shows "Add accounts in Settings → Banks & Accounts."

Not currently wired into the upload wizard (see STEP 6).

---

### STEP 8 — `AccountsTab.tsx` rewritten to use server accounts ✅

Full rewrite of `apps/frontend/src/pages/cashflow/AccountsTab.tsx`:
- Fetches `getAccountSummaries(12)` from `GET /api/transactions/account-summaries`
- Left sidebar lists server accounts grouped with institution name, net position, total in/out, transaction count
- Click account card → `setSelectedAccountId(id)` → transactions filtered by `accountId`
- "All Bank Accounts" option (null) shows aggregate
- Empty state: "No accounts yet. Add in Settings → Banks & Accounts."
- No "Unlinked" bucket — `account_id` is NOT NULL

Backend `account-summaries` endpoint (inline in `TransactionsController`):
- Filters `accounts` by `include_in_cashflow = true`
- Joins transaction aggregates grouped by `account_id`
- Accounts with zero transactions still appear (`transactionCount: 0`)

---

### STEP 9 — Clear localStorage + `customWallets.ts` removed ✅

In `AccountsTab.tsx` on mount:
```typescript
useEffect(() => {
  localStorage.removeItem('pf_custom_wallets');
}, []);
```

`apps/frontend/src/lib/customWallets.ts` deleted. All imports removed from `AccountsTab.tsx` and `BanksTab.tsx`.

---

### STEP 10 — UI label rename: "Wallet" → "Bank Account" ✅

| Location | Old text | New text |
|----------|----------|----------|
| `AccountsTab.tsx` page heading / sidebar | "Wallets" | "Bank Accounts" |
| `TransactionTable.tsx` column header | "Wallet" | "Bank Account" |
| `BanksTab.tsx` custom wallets section | "Local Custom Wallets" | *(removed entirely)* |
| Dashboard widgets | any "wallet" label | "Bank Account" |
| CSV export header | "Wallet" | "Bank Account" |
| `spendingAnalysisApi.ts` function params | `wallet?` | `accountId?` |

**Not renamed (THINK-05 frozen):**
- `wallet` field in `TransactionDto.cs` and Python `TransactionResult` / `CategorizeRequest`
- `wallet_account_aliases` table name
- Internal C# variable names like `walletText`

---

### STEP 11 — `resolve-alias` GET endpoint ✅

`GET /api/transactions/resolve-alias?aliasText={text}`

Returns:
```json
{ "accountId": "uuid", "accountName": "BCA Savings", "institutionName": "BCA" }
```
or 404 if no alias found.

Also joins against `institutions` table to resolve `institutionName` from `account.InstitutionId`.

Frontend: `resolveAlias(aliasText)` function in `transactionsApi.ts` — available for wizard pre-fill when Step 0 is eventually implemented.

---

### STEP 12 — Verification ✅

```bash
# Apply migration
supabase db push

# Build backend
cd apps/api && dotnet build PersonalFinance.slnx

# Start all services
npm start

# Manual test checklist:
# 1. supabase db reset — confirm transactions table has account_id (NOT NULL), no wallet column
# 2. Navigate to /cashflow/accounts — sidebar shows server accounts grouped by institution
# 3. Confirm "pf_custom_wallets" key is gone from localStorage after first load
# 4. Upload a BCA CSV — confirm upload-preview returns transactions with accountId populated
# 5. After submit: check Supabase Studio — transactions.account_id = BCA's uuid, no wallet column
# 6. Check wallet_account_aliases table — row: alias_text="BCA", account_id=BCA's uuid
# 7. Upload another BCA CSV — confirm accountId is auto-resolved in preview response
# 8. Click BCA Savings card in sidebar — confirm transactions filtered to that account only
# 9. Confirm zero "Wallet" text visible across all cashflow UI tabs (use browser find)
```

> **If auto-resolution returns null accountId:** Check that `AutoResolveAccountIdAsync` is finding an account — log the wallet text on the backend. Add the account name in Settings → Banks & Accounts to trigger the name-match fallback. Or upload once with a working account and the alias will be saved for future uploads.

---

## Notes

**AI service `wallet` field is now transient only.** The `wallet` field in Python `TransactionResult` and `CategorizeRequest` remains (THINK-05 frozen). It flows from parser → AI service → `TransactionDto.Wallet` in C#, where it is used as the `aliasText` for the `wallet_account_aliases` lookup. It is then discarded — never written to the `transactions` table. The `Transaction` entity has no `Wallet` property.

**Deduplication index rebuilt using `account_id`.** The old composite index used `wallet` (text). The new index uses `account_id` (uuid). This is strictly better — uuid equality is unambiguous, whereas wallet text was case/whitespace sensitive and parser-dependent. The in-code dedup key in `TransactionService` uses `t.AccountId`.

**`account_id` NOT NULL enforces upload discipline.** Every transaction must have a known account before it can be saved. If auto-resolution fails (no alias, no name match), `AccountId` will be null on the DTO and the DB constraint will reject the insert. The upload wizard Step 0 (deferred) would address this edge case.

**One-file-one-account assumption.** Each upload is assumed to be a single account's statement. Multi-account upload is out of scope.

**Settings → Banks & Accounts is the sole account registry.** The cashflow module reads accounts; it does not create them.

**Future: Upload wizard Step 0.** If `AccountId` is null after auto-resolution, the user currently has no recovery path during upload. Future work: add an inline account picker to the Review step or a dedicated Step 0 using the `AccountSelector` component already built.

**Future: Reconciliation Exploration.** After this ticket, the seam exists to implement: on upload confirm, if the file's ending balance matches the `Account`'s latest `Valuation`, offer "update balance to Rp X?" — one tap creates a `Valuation` row in the Assets module. Separate ticket.
