# PF-125 — Rename `Wallet` → `AccountName` across the full stack

> **GitHub Issue:** (create with `gh issue create`)
> **Status:** Done
> **Started:** —

## Objective

The `transactions.wallet` DB column was dropped in migration `20260518000001` and replaced with `account_id` UUID FK. The string field that parsers and the Python AI service produce — e.g. `"BCA"`, `"NeoBank"` — is now a transient alias-resolver input, never persisted directly. Calling it `Wallet` collides with the `AccountId: Guid?` already on the same DTO and is semantically wrong (this project has no digital wallets like GoPay/OVO in scope). Renaming to `AccountName` makes the relationship self-documenting: `AccountName` is the human-readable text, `AccountId` is the resolved FK.

The `wallet_account_aliases` table and `WalletAccountAlias` entity are **not renamed** — they describe the bridge/alias role and are internal infrastructure, not domain vocabulary.

## Acceptance Criteria

- [x] `TransactionDto.Wallet` is renamed to `AccountName` in C# with no compile errors
- [x] `TransactionResult.wallet` and `CategorizeRequest.wallet` in Python are renamed to `account_name`
- [x] `llm_parser.py` tool schema key `"wallet"` is renamed to `"account_name"` so LLM output matches the Pydantic model
- [x] `categorizer.py` references `request.account_name`
- [x] All bank parsers (BCA, NeoBank, Default, Csv) assign `AccountName`, not `Wallet`
- [x] `ILlmCategorizationClient.CategorizeAsync` parameter `wallet` → `accountName`
- [x] Frontend `transactionsApi.ts` `TransactionDto.wallet` renamed to `accountName`
- [x] `TopWalletsRow.tsx` renamed to `TopAccountsRow.tsx`; `WalletTabs.tsx` renamed to `AccountTabs.tsx`; all display labels "Wallet" → "Account"
- [x] `dotnet build` and `dotnet test` pass with zero errors
- [x] `pytest` in AI service passes

## Approach

Atomic rename across all layers in one PR (Approach A). The Python AI service is an internal-only dependency — the only caller is the .NET `LlmExtractionClient` — so there are no external consumers that would break. Steps 1–4 form a single build unit: the C# project won't compile until all `TransactionDto.Wallet` callers are updated. Steps 5–8 are independently committable. `wallet_account_aliases` table, `WalletAccountAlias` entity, and `AliasText` field are intentionally untouched — they name the bridge concept, not the domain term.

## Affected Files

| File | Change |
|------|--------|
| `services/ai-service/app/models.py` | Edit — `TransactionResult.wallet` → `account_name`; `CategorizeRequest.wallet` → `account_name` |
| `services/ai-service/app/services/llm_parser.py` | Edit — `tool_use` schema key `"wallet"` → `"account_name"` |
| `services/ai-service/app/services/categorizer.py` | Edit — `request.wallet` → `request.account_name` in prompt string |
| `services/ai-service/tests/test_categorize.py` | Edit — update any `wallet=` kwargs in test fixtures |
| `apps/api/src/PersonalFinance.Application/Dtos/TransactionDto.cs` | Edit — `Wallet` → `AccountName` |
| `apps/api/src/PersonalFinance.Domain/Entities/Transaction.cs` | Edit — transient `Wallet` property → `AccountName` |
| `apps/api/src/PersonalFinance.Infrastructure/External/LlmExtractionClient.cs` | Edit — nested `TransactionResult.Wallet` + `MapToDto` assignment + `CategorizeRequest.Wallet` |
| `apps/api/src/PersonalFinance.Infrastructure/External/LlmCategorizationClient.cs` | Edit — method param `wallet` → `accountName`; `CategorizeRequest` record field |
| `apps/api/src/PersonalFinance.Application/Interfaces/ILlmCategorizationClient.cs` | Edit — `CategorizeAsync` param `wallet` → `accountName` |
| `apps/api/src/PersonalFinance.Infrastructure/Parsers/BcaCsvParser.cs` | Edit — `Wallet = "BCA"` → `AccountName = "BCA"` |
| `apps/api/src/PersonalFinance.Infrastructure/Parsers/NeoBankPdfParser.cs` | Edit — `Wallet = "NeoBank"` → `AccountName = "NeoBank"` |
| `apps/api/src/PersonalFinance.Infrastructure/Parsers/DefaultCsvParser.cs` | Edit — local var `wallet` → `accountName`; assignment `Wallet =` → `AccountName =` |
| `apps/api/src/PersonalFinance.Infrastructure/Parsers/CsvTransactionParser.cs` | Edit — `Wallet = record.Wallet` → `AccountName = record.AccountName` (check CsvRecord field) |
| `apps/api/src/PersonalFinance.Application/Services/TransactionPipelineService.cs` | Edit — `tx.Wallet` → `tx.AccountName` (line 167 CategorizeAsync call) |
| `apps/api/src/PersonalFinance.Application/Services/InsightService.cs` | Edit — any `.Wallet` references → `.AccountName` |
| `apps/api/src/PersonalFinance.Application/Services/TransactionService.cs` | Edit — `Wallet =` → `AccountName =` in MapToDto (found during build, not in original plan) |
| `apps/api/src/PersonalFinance.Api/Controllers/TransactionsController.cs` | Edit — any `.Wallet` references → `.AccountName` |
| `apps/api/tests/PersonalFinance.Tests/**/*.cs` | Edit — `.Wallet =` / `.Wallet` in test setups → `.AccountName` |
| `apps/frontend/src/api/transactionsApi.ts` | Edit — `wallet: string` → `accountName: string` in `TransactionDto` interface |
| `apps/frontend/src/components/TransactionPreview.tsx` | Edit — `.wallet` refs → `.accountName`; display label "Wallet" → "Account" |
| `apps/frontend/src/components/TransactionTable.tsx` | Edit — `.wallet` refs → `.accountName`; column header "Wallet" → "Account" |
| `apps/frontend/src/components/dashboard/WalletTabs.tsx` | Rename → `AccountTabs.tsx`; update all internal "Wallet" labels |
| `apps/frontend/src/components/dashboard/TopWalletsRow.tsx` | Rename → `TopAccountsRow.tsx`; update internal labels |
| All files that import `WalletTabs` or `TopWalletsRow` | Edit — update import paths to new filenames |

---

## TODO

### [x] STEP 1 — Rename Python cross-service contract fields (THINK-05 boundary)

Edit `services/ai-service/app/models.py` — two field renames:

```python
# In TransactionResult — line ~22
account_name: str = ""          # was: wallet

# In CategorizeRequest — line ~57
account_name: str = ""          # was: wallet
```

> **Why:** THINK-05 requires both sides of the cross-service contract to change atomically. The Python field name determines the JSON key that the Python service returns. With `JsonNamingPolicy.SnakeCaseLower` on the C# side, C# `AccountName` serializes to `account_name` over the wire — this must match the Python model field name exactly or deserialization silently produces empty strings.

---

### [x] STEP 2 — Update LLM tool schema key and categorizer prompt (Python internals)

In `services/ai-service/app/services/llm_parser.py`, find the `tool_use` input schema (around line 31) and rename the `"wallet"` property key to `"account_name"`:

```python
# Before
"wallet":        {"type": "string"},

# After
"account_name":  {"type": "string"},
```

In `services/ai-service/app/services/categorizer.py`, update the prompt string (around line 40):

```python
# Before
f"  Bank/Wallet: {request.wallet or '(unknown)'}\n\n"

# After
f"  Bank/Account: {request.account_name or '(unknown)'}\n\n"
```

> **Why:** The `tool_use` schema is what the LLM actually sees and what it uses to name the fields in its JSON output. If the schema still says `"wallet"` but the Pydantic model expects `"account_name"`, every extraction silently produces an empty `account_name`. This is the landmine called out in the architect consultation. The categorizer prompt change is cosmetic but removes the mixed terminology from the AI context window.

---

### [x] STEP 3 — Rename C# TransactionDto + Domain entity (THINK-05 boundary, same commit as Step 1)

In `apps/api/src/PersonalFinance.Application/Dtos/TransactionDto.cs`:

```csharp
public string AccountName { get; set; } = string.Empty; // was: Wallet — transient, from AI/parser, never written to DB
```

In `apps/api/src/PersonalFinance.Domain/Entities/Transaction.cs` (line 46):

```csharp
// Transient — populated from Account.Name after fetch, never written to DB
public string AccountName { get; set; } = string.Empty;
```

> **Why:** THINK-05 says rename both sides in the same commit. The C# DTO is the .NET side of the Python→.NET contract. The `Transaction` entity has an identically named transient property (no `[Column]` attribute) that should stay in sync with the DTO to avoid confusion when mapping between the two.

---

### [x] STEP 4 — Update `LlmExtractionClient` nested model and mapper

In `apps/api/src/PersonalFinance.Infrastructure/External/LlmExtractionClient.cs`:

```csharp
// Nested TransactionResult class (line ~169)
public string AccountName { get; set; } = string.Empty;  // was: Wallet

// MapToDto method (line ~133)
AccountName = r.AccountName,   // was: Wallet = r.Wallet
```

In `apps/api/src/PersonalFinance.Infrastructure/External/LlmCategorizationClient.cs`:

```csharp
// CategorizeRequest record (line ~64–70)
private sealed record CategorizeRequest(
    string Description,
    string Remarks,
    string Flow,
    double AmountIdr,
    string AccountName,           // was: Wallet
    List<string> AvailableCategories);

// CategorizeAsync method signature (line ~26)
public async Task<(string Category, double Confidence)> CategorizeAsync(
    string description, string remarks, string flow, decimal amountIdr, string accountName,
    IReadOnlyList<string> availableCategories, CancellationToken ct = default)

// Call site inside CategorizeAsync (line ~33–35)
var request = new CategorizeRequest(
    description, remarks, flow, (double)amountIdr, accountName,
    availableCategories.ToList());
```

> **Why:** `LlmExtractionClient` owns the C# mirror of the Python `TransactionResult` Pydantic model — it's the deserialization target. `LlmCategorizationClient` sends a `CategorizeRequest` to Python's `/categorize` endpoint; with `SnakeCaseLower` policy, C# `AccountName` serializes to `account_name` which now matches the renamed Python `CategorizeRequest.account_name` field.

---

### [x] STEP 5 — Update `ILlmCategorizationClient` interface

In `apps/api/src/PersonalFinance.Application/Interfaces/ILlmCategorizationClient.cs`:

```csharp
Task<(string Category, double Confidence)> CategorizeAsync(
    string description,
    string remarks,
    string flow,
    decimal amountIdr,
    string accountName,              // was: wallet
    IReadOnlyList<string> availableCategories,
    CancellationToken ct = default);
```

> **Why:** Interface parameter names are part of the documented contract (they show in IDE tooltips and go-to-definition). Updating the interface ensures all future implementers use the correct terminology. This also fixes `TransactionPipelineService.cs:167` where the call `CategorizeAsync(..., tx.Wallet, ...)` becomes `CategorizeAsync(..., tx.AccountName, ...)`.

---

### [x] STEP 6 — Update bank parsers

In `apps/api/src/PersonalFinance.Infrastructure/Parsers/BcaCsvParser.cs` (line ~127):
```csharp
AccountName = "BCA",
```

In `apps/api/src/PersonalFinance.Infrastructure/Parsers/NeoBankPdfParser.cs` (line ~106):
```csharp
AccountName = "NeoBank",
```

In `apps/api/src/PersonalFinance.Infrastructure/Parsers/DefaultCsvParser.cs` (lines ~65, ~75):
```csharp
string? accountName = GetFieldValue(normalizedDict, "Wallet", "BankAccount", "Bank", "Account");
// ...
AccountName = string.IsNullOrEmpty(accountName) ? "-" : accountName,
```

In `apps/api/src/PersonalFinance.Infrastructure/Parsers/CsvTransactionParser.cs` (line ~34):
```csharp
AccountName = record.Wallet ?? "",
```
Note: `record.Wallet` refers to the CSV record field (column header "Wallet") — the CSV column header is separate from the DTO property name and should stay as-is unless you also update the CSV template header. Check the `CsvTransactionParser` CSV column binding to confirm.

> **Why:** Parsers are the source of the `AccountName` string. Hardcoded values like `"BCA"` and `"NeoBank"` are the alias texts that `wallet_account_aliases.alias_text` matches against — the column header in the CSV template (`"Bank Account"`) is not affected by this rename since it's a user-facing CSV header, not a code identifier.

---

### [x] STEP 7 — Update all remaining C# callers and run build

Use IDE rename refactor or grep to catch any remaining `.Wallet` references in:
- `TransactionPipelineService.cs` — `tx.Wallet` → `tx.AccountName` (line 167)
- `InsightService.cs` — any `.Wallet` groupings
- `TransactionsController.cs` — any `.Wallet` assignments or reads

Then verify:
```bash
cd apps/api && dotnet build PersonalFinance.slnx
```

Fix any remaining compile errors before proceeding to tests.

> **Why:** These service/controller files use `TransactionDto.Wallet` indirectly. The build is the authoritative check — it will surface every missed reference. Running it now (before touching tests and frontend) means any failure is unambiguously a missed rename, not a test-infrastructure issue.

---

### [x] STEP 8 — Update backend tests

Run:
```bash
cd apps/api && dotnet test 2>&1 | grep -E "error|FAILED"
```

Find all test files that reference `.Wallet` (grep result included `CategorizationLayerTests.cs`, `LlmExtractionClientTests.cs`, `LlmPdfParserTests.cs`, `DefaultCsvParserTests.cs`) and update `.Wallet =` → `.AccountName =` in test object initializers and assertions.

Note: `WalletAliasGuardTests.cs` and `WalletAliasBatchResolutionTests.cs` test the `WalletAccountAlias` entity — do **not** touch these.

> **Why:** Tests use `TransactionDto` directly in Arrange blocks. A missed `.Wallet` in a test file causes a compile error, not a runtime failure, so the build in Step 7 will already have caught them. This step is mostly a sanity pass and any remaining failures after the Step 7 build fix are real logic issues.

---

### [x] STEP 9 — Update Python tests

```bash
cd services/ai-service && grep -rn "wallet" tests/
```

In `tests/test_categorize.py` and any other test files, update `wallet=` kwargs in fixture instantiation:
```python
# Before
CategorizeRequest(description="...", wallet="BCA", ...)

# After
CategorizeRequest(description="...", account_name="BCA", ...)
```

Run:
```bash
cd services/ai-service && pytest
```

> **Why:** Python test fixtures construct Pydantic models directly with keyword arguments. `wallet=` will now fail with a `ValidationError` since the field no longer exists on the model — catching this early prevents a CI surprise.

---

### [x] STEP 10 — Update frontend API client

In `apps/frontend/src/api/transactionsApi.ts`, line 14:

```typescript
export interface TransactionDto {
  // ...
  accountName: string;   // was: wallet — transient, from AI/parser pipeline, never persisted
  accountId: string;
  // ...
}
```

Search all frontend files that destructure or access `.wallet` from a `TransactionDto`:
```bash
grep -rn "\.wallet" apps/frontend/src/
```

Update each occurrence to `.accountName`. Key files from the grep results: `TransactionPreview.tsx`, `TransactionTable.tsx`, `FileUpload.tsx`, `CashFlowDashboard.tsx`.

> **Why:** `transactionsApi.ts` `TransactionDto` is the TypeScript mirror of the C# `TransactionDto` JSON response. When C# `AccountName` serializes (camelCase default in ASP.NET Core), it becomes `accountName` in JSON. The frontend must use the same key. Note: `types/Transaction.ts` already uses `bank: string` (a pre-existing frontend-internal rename) — do **not** change that field; it's a separate frontend model.

---

### [x] STEP 11 — Rename frontend display components

Rename files:
```
apps/frontend/src/components/dashboard/WalletTabs.tsx
  → AccountTabs.tsx

apps/frontend/src/components/dashboard/TopWalletsRow.tsx
  → TopAccountsRow.tsx
```

Update import references across all files that import these components:
```bash
grep -rn "WalletTabs\|TopWalletsRow" apps/frontend/src/
```

Inside the renamed files, update:
- Component function name: `WalletTabs` → `AccountTabs`, `TopWalletsRow` → `TopAccountsRow`
- Display strings: any "Wallet" label → "Account"
- `export default` declarations

> **Why:** Component file names and function names are part of the ubiquitous language visible to developers. Display labels ("Wallet" tab, "Top Wallets" section heading) are visible to the user. Both should say "Account" — the DB has said `account_id` since `20260518`, and the UI should follow.

---

### [x] STEP 12 — Final build and test sweep

```bash
# Backend
cd apps/api && dotnet build PersonalFinance.slnx && dotnet test

# AI service
cd services/ai-service && pytest

# Frontend
cd apps/frontend && npm run build
```

> **Why:** The full build sweep confirms the rename is complete with no stale references. TypeScript compilation (`npm run build`) is the authoritative check for the frontend since it enforces interface conformance across all component files.

---

## Notes

- `wallet_account_aliases` table, `WalletAccountAlias` entity, `alias_text` column: **intentionally untouched.** These name the bridge/resolver concept — the "wallet text" is what legacy parsers produced, and the alias table maps it to `account_id`. Renaming it `account_aliases` is a separate, optional cleanup with a DB migration.
- `types/Transaction.ts` frontend model has `bank: string` (already a frontend-internal rename from before). Do not rename it to `accountName` — it's a different model from `transactionsApi.ts TransactionDto` and has no direct serialization contract with the backend.
- THINK-05 requires Steps 1, 3, and 4 (Python models + C# DTO + LlmExtractionClient) to land in the **same commit**. The safest way is to do Steps 1–4 before any commit, then verify `dotnet build` passes, then commit the whole contract-change atomically.
- The `CsvTransactionParser` maps `record.Wallet` where `record` refers to a CSV column binding — the column header in the user-facing CSV template is `"Bank Account"` (unchanged). Only the DTO property name changes, not the CSV template column header.
- `TransactionService.cs` had an undocumented `Wallet =` in its `MapToDto` method — caught and fixed by the build step.
