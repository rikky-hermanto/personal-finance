# PF-059 — Bidirectional CSV Import/Export — Master Cashflow Roundtrip

> **GitHub Issue:** [#82](https://github.com/rikky-hermanto/personal-finance/issues/82)
> **Status:** Ready
> **Started:** —

## Objective

Enable a seamless roundtrip between the app and Excel/CSV. The user can export all transactions as a CSV matching the master cashflow column schema, edit or add rows in Excel, and re-import back into the system. This serves both the one-time historical data migration and an ongoing monthly workflow where Excel is used for data entry and the app for analytics.

```
App ──Export──▶ CSV ──Open in Excel──▶ edit / add rows ──Import──▶ App
 ▲                                                                    │
 └────────────────── roundtrip lossless ─────────────────────────────┘
```

## Acceptance Criteria

- [ ] `DefaultCsvParser` preserves source-supplied `Category` values — does not overwrite with rule-based categorization when `Category` is already set and non-default
- [ ] `DefaultCsvParser` correctly parses 12-hour AM/PM date formats emitted by Excel CSV export (e.g. `1/1/24 12:30 AM`)
- [ ] `DefaultCsvParser` skips blank/empty rows without throwing `FormatException`
- [ ] `GET /api/transactions/export` endpoint returns a downloadable CSV in the master schema column order
- [ ] Export supports optional query params: `?wallet=BCA`, `?from=2024-01-01&to=2024-12-31`
- [ ] Exported CSV can be re-imported via existing Upload UI with zero duplicates (idempotent roundtrip)
- [ ] "Export CSV" button added to the Transactions/Cashflow UI
- [ ] "Download Template" button added near the Upload area — downloads a CSV with correct headers + 3 realistic sample rows covering IDR and USD transactions
- [ ] Unit tests added for category preservation, AM/PM date parsing, blank row skipping, and roundtrip schema

## Approach

Two-phase feature. Phase 1 fixes three small gaps in `DefaultCsvParser` and `CategoryRuleService` — no new parser or endpoint needed, just guards. Phase 2 adds a `GET /export` action using `CsvHelper` (already a project dependency) and a download button on the frontend. The export column schema exactly mirrors what `DefaultCsvParser` reads, making the roundtrip self-verifiable via re-import.

Out of scope: native `.xlsx` upload/download, PTKP field, Balance/Month-Tracker columns (computed at read-time), real-time sync.

## Affected Files

| File | Change |
|------|--------|
| `apps/api/src/PersonalFinance.Application/Services/CategoryRuleService.cs` | Phase 1 Fix A — skip categorization when Category already set |
| `apps/api/src/PersonalFinance.Infrastructure/Parsers/DefaultCsvParser.cs` | Phase 1 Fix B (AM/PM date formats) + Fix C (blank row guard) |
| `apps/api/src/PersonalFinance.Api/Controllers/TransactionsController.cs` | Phase 2 — new `GET /export` action |
| `apps/api/tests/PersonalFinance.Tests/Services/CategoryRuleServiceTests.cs` | Tests for Fix A |
| `apps/api/tests/PersonalFinance.Tests/Parsers/DefaultCsvParserTests.cs` | Tests for Fix B, Fix C, roundtrip schema |
| `apps/frontend/src/api/transactionsApi.ts` | `exportTransactionsCsv()` function |
| `apps/frontend/src/components/` or relevant cashflow page | Export CSV button + Download Template button |

---

## TODO

### [ ] STEP 1 — Guard existing categories in `CategorizeBatchAsync`

In `CategoryRuleService.cs` [lines 39–63](../../../apps/api/src/PersonalFinance.Application/Services/CategoryRuleService.cs#L39-L63), add a `continue` at the top of the transaction loop:

```csharp
foreach (var transaction in transactions)
{
    // Preserve source-supplied category (e.g. from CSV re-import of master spreadsheet)
    if (!string.IsNullOrWhiteSpace(transaction.Category)
        && !transaction.Category.Equals("Untracked Expense", StringComparison.OrdinalIgnoreCase))
        continue;

    // ... existing rule-matching logic unchanged
}
```

> **Why:** Every parser unconditionally calls `CategorizeBatchAsync` after parsing. Without this guard, a CSV containing hand-curated `Category` values (years of manual classification) would have them all overwritten by keyword-match rules. The guard is safe for normal bank-statement uploads because parsers set `Category = "Untracked Expense"` by default — only explicit source values are preserved.

---

### [ ] STEP 2 — Add AM/PM date formats to `DefaultCsvParser.ParseDate`

In `DefaultCsvParser.cs` [lines 132–138](../../../apps/api/src/PersonalFinance.Infrastructure/Parsers/DefaultCsvParser.cs#L132-L138), add 12-hour format variants to the `formats` array:

```csharp
var formats = new[]
{
    "M/d/yy h:mm tt", "M/d/yyyy h:mm tt",          // ← add these two
    "M/d/yy h:mm:ss tt", "M/d/yyyy h:mm:ss tt",    // ← add these two
    "M/d/yy H:mm", "M/d/yyyy H:mm", "M/d/yy", "M/d/yyyy",
    // ... existing formats unchanged
};
```

> **Why:** Excel CSV export uses the cell's display format, which for this spreadsheet is `M/D/YY h:mm AM/PM` (12-hour). The current list has `H:mm` (24-hour only). Without these formats, dates like `1/1/24 12:30 AM` fall through to the `DateTime.TryParse` fallback — which _may_ handle it but with ambiguous locale behavior. Explicit formats are deterministic.

---

### [ ] STEP 3 — Skip blank rows in `DefaultCsvParser.ParseAsync`

In `DefaultCsvParser.cs` [line 34](../../../apps/api/src/PersonalFinance.Infrastructure/Parsers/DefaultCsvParser.cs#L34), add a guard at the top of the `foreach` loop, before `CreateNormalizedHeaderDict`:

```csharp
foreach (var record in records)
{
    var recordDict = (IDictionary<string, object>)record;
    var normalizedDict = CreateNormalizedHeaderDict(recordDict);

    // Skip rows with no date (blank rows, disclaimer rows, summary rows)
    if (string.IsNullOrWhiteSpace(GetFieldValue(normalizedDict, "Date")))
        continue;

    // ... rest of loop unchanged
}
```

> **Why:** Excel CSV exports often include trailing blank rows or a top-of-file disclaimer row (visible in the screenshot: `DISCLAIMER: Financial market information is provided "as-is"...`). Without this guard, `ParseDate(null)` throws a `FormatException` and the entire upload fails. The guard is safe — any legitimate transaction has a Date.

---

### [ ] STEP 4 — Add `GET /api/transactions/export` endpoint

In `TransactionsController.cs`, add a new action below the existing `GET` endpoints:

```csharp
[HttpGet("export")]
public async Task<IActionResult> ExportCsv(
    [FromQuery] string? wallet,
    [FromQuery] DateTime? from,
    [FromQuery] DateTime? to)
{
    var transactions = await _transactionService.GetTransactionsWithBalanceAsync(wallet);

    if (from.HasValue)
        transactions = transactions.Where(t => t.Date >= from.Value).ToList();
    if (to.HasValue)
        transactions = transactions.Where(t => t.Date <= to.Value).ToList();

    var stream = new MemoryStream();
    using (var writer = new StreamWriter(stream, leaveOpen: true))
    using (var csv = new CsvWriter(writer, CultureInfo.InvariantCulture))
    {
        // Write header row matching DefaultCsvParser column names exactly
        csv.WriteField("Date");
        csv.WriteField("Item");
        csv.WriteField("Remarks");
        csv.WriteField("PTKP");
        csv.WriteField("Flow");
        csv.WriteField("Type");
        csv.WriteField("Category");
        csv.WriteField("Wallet");
        csv.WriteField("Amount");
        csv.WriteField("Exc. Rate");
        csv.WriteField("Amount (IDR)");
        csv.WriteField("Currency");
        await csv.NextRecordAsync();

        foreach (var t in transactions)
        {
            csv.WriteField(t.Date.ToString("M/d/yy H:mm", CultureInfo.InvariantCulture));
            csv.WriteField(t.Description);
            csv.WriteField(t.Remarks);
            csv.WriteField("");                    // PTKP — not in schema
            csv.WriteField(t.Flow);
            csv.WriteField(t.Type);
            csv.WriteField(t.Category);
            csv.WriteField(t.Wallet);
            csv.WriteField(t.AmountIdr);
            csv.WriteField(t.ExchangeRate?.ToString(CultureInfo.InvariantCulture) ?? "");
            csv.WriteField(t.AmountIdr);
            csv.WriteField(t.Currency);
            await csv.NextRecordAsync();
        }
    }

    stream.Position = 0;
    var filename = $"transactions-{DateTime.UtcNow:yyyy-MM-dd}.csv";
    return File(stream, "text/csv", filename);
}
```

> **Why:** Column names and order must match `DefaultCsvParser`'s `GetFieldValue` lookup keys exactly — including `Exc. Rate` and `Amount (IDR)` with the space and parentheses — so a re-import of the export produces zero schema mismatches. The header normalization at `DefaultCsvParser.cs:97–112` strips those characters, so the roundtrip is safe. Date filter is applied in-memory after the Supabase fetch; a dedicated query filter can be added to `ITransactionService` if volume warrants it later.

---

### [ ] STEP 5 — Add `exportTransactionsCsv` to the API client

In `apps/frontend/src/api/transactionsApi.ts`, add an export helper:

```typescript
export const exportTransactionsCsv = (wallet?: string, from?: string, to?: string): void => {
  const params = new URLSearchParams();
  if (wallet) params.set('wallet', wallet);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const query = params.toString();
  window.location.href = `${API_BASE_URL}/api/transactions/export${query ? `?${query}` : ''}`;
};
```

> **Why:** File downloads bypass React Query — the browser handles the `Content-Disposition: attachment` response directly. `window.location.href` is the correct pattern; a `fetch()` call would require `Blob` + `URL.createObjectURL()` boilerplate for no benefit.

---

### [ ] STEP 6 — Add `downloadTransactionTemplate` to the API client

In `apps/frontend/src/api/transactionsApi.ts`, add a template download helper alongside `exportTransactionsCsv`:

```typescript
const TEMPLATE_HEADERS = [
  'Date', 'Item', 'Remarks', 'PTKP', 'Flow', 'Type',
  'Category', 'Wallet', 'Amount', 'Exc. Rate', 'Amount (IDR)', 'Currency',
];

const TEMPLATE_ROWS = [
  // BCA — everyday IDR expense
  ['1/1/24 9:00 AM', 'Kopi Kenangan', 'DEBIT TRANSFER 01/01 4111111111111111', '', 'DB', 'Expense', 'Food & Drinks', 'BCA', '45000', '', '45000', 'IDR'],
  // NeoBank — saving interest credit
  ['1/2/24 0:01 AM', 'Saving Interest', 'SAVING INTEREST JAN 2024', '', 'CR', 'Income', 'Saving Interest', 'NeoBank', '931', '', '931', 'IDR'],
  // Wise — USD transfer (shows Exc. Rate column usage)
  ['1/5/24 10:30 AM', 'Freelance Payment', 'Transfer from Wise USD account', '', 'CR', 'Income', 'Bank Transfer', 'Wise', '50', '15800', '790000', 'USD'],
];

export const downloadTransactionTemplate = (): void => {
  const csvContent = [TEMPLATE_HEADERS, ...TEMPLATE_ROWS]
    .map(row => row.map(cell => (cell.includes(',') ? `"${cell}"` : cell)).join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'transaction-template.csv';
  link.click();
  URL.revokeObjectURL(url);
};
```

> **Why:** The template is static content — no backend call needed, no endpoint to maintain. Generating it in the frontend means it's always in sync with the TypeScript constants without a deploy. The three sample rows are chosen to demonstrate the three distinct cases a user needs to understand: plain IDR expense, IDR income, and a multi-currency Wise row with exchange rate. `URL.createObjectURL` + programmatic `<a>` click is the standard no-library browser download pattern.

---

### [ ] STEP 7 — Add "Export CSV" button to the Cashflow/Transactions UI

Find the Transactions tab or Upload page header component and add an Export button that calls `exportTransactionsCsv()`. Apply the data-oriented-theme skill conventions (neutral palette, functional styling).

```tsx
import { exportTransactionsCsv, downloadTransactionTemplate } from '@/api/transactionsApi';
import { Download, FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Export button — in the Transactions page header / action bar:
<Button variant="outline" size="sm" onClick={() => exportTransactionsCsv()}>
  <Download className="h-4 w-4 mr-2" />
  Export CSV
</Button>

// Template button — near the Upload dropzone (in FileUpload.tsx or UploadTab.tsx):
<Button variant="ghost" size="sm" onClick={downloadTransactionTemplate}>
  <FileDown className="h-4 w-4 mr-2" />
  Download Template
</Button>
```

Place the **Export CSV** button in the Transactions/Cashflow page header (co-located with filters so import and export are visible together). Place the **Download Template** button near or below the Upload dropzone — users are most likely to want the template when they're about to upload and don't know the format.

> **Why:** Positioning matters: the template is discovery UX for first-time importers ("what columns do I need?"), so it belongs next to the file drop target. Export is a power-user action that lives with filters and bulk operations. Keeping them in different locations avoids cluttering either surface.

---

### [ ] STEP 8 — Write unit tests

Add to `apps/api/tests/PersonalFinance.Tests/`:

**`Services/CategoryRuleServiceTests.cs`** (append to existing file):
- `CategorizeBatchAsync_WhenSourceCategoryIsSet_PreservesIt` — pre-set `Category = "Food"`, run categorize, assert `"Food"` unchanged.
- `CategorizeBatchAsync_WhenCategoryIsUntrackedExpense_AppliesMatchingRule` — confirms default still gets overwritten by rules.

**`Parsers/DefaultCsvParserTests.cs`** (new file, follow canonical xUnit + Moq pattern):
- `ParseAsync_AmPmDateFormat_ParsedCorrectly` — CSV fixture with `1/1/24 12:30 AM`, assert `DateTime(2024, 1, 1, 0, 30, 0)`.
- `ParseAsync_BlankDateRow_IsSkipped` — CSV with one valid row + one blank row, assert output count = 1.
- `ParseAsync_ExistingCategory_SurvivesCategorizeBatch` — end-to-end: Category set in CSV, assert it survives parse and categorize.
- `ParseAsync_MasterSpreadsheetSchema_AllFieldsMapped` — fixture CSV using exact master schema column headers, assert all fields on a sample row.

> **Why:** These tests lock the Fix A/B/C behavior so future parser changes can't silently regress the roundtrip guarantee. Follow `CategoryRuleServiceTests.cs` naming convention `MethodName_Condition_ExpectedResult` and `UseInMemoryDatabase` isolation pattern.

---

## Column Mapping Reference

| CSV column (export/import) | `TransactionDto` field | Notes |
|---|---|---|
| `Date` | `Date` | Export: `M/d/yy H:mm`; Import: flexible via ParseDate |
| `Item` | `Description` | |
| `Remarks` | `Remarks` | |
| `PTKP` | *(ignored)* | Emitted blank on export |
| `Flow` | `Flow` | `DB` / `CR` |
| `Type` | `Type` | `Expense` / `Income` / `Asset Transfer` / `Saving` |
| `Category` | `Category` | Preserved on re-import (Fix A) |
| `Wallet` | `Wallet` | |
| `Amount` | `AmountIdr` | |
| `Exc. Rate` | `ExchangeRate` | Null for IDR rows |
| `Amount (IDR)` | `AmountIdr` | Same as Amount for IDR rows |
| `Currency` | `Currency` | |

## Notes

- **Dedup key** is `Date|Description|Flow|Type|Wallet` (no Amount). Re-importing unchanged export = 0 new rows. Intentional and correct.
- **Balance** and **Month-Tracker** are not stored in the DB — Balance is computed at read-time in `GetTransactionsWithBalanceAsync`, Month-Tracker is derivable from Date. Both columns are dropped on import and not emitted on export.
- **Wise USD rows**: the spreadsheet has no `Currency` column. `DefaultCsvParser` defaults `Currency = "IDR"`. For a later improvement, infer `Currency = "USD"` when `ExchangeRate` is non-null and `Wallet = "Wise"` — but this is out of scope for PF-059.
- **Server-side size limit**: no `[RequestSizeLimit]` on the controller; Kestrel default is 30MB. A full-year CSV of ~5,000 rows ≈ 1MB — well under. No chunking needed.
- **Filter performance**: `GetTransactionsWithBalanceAsync` fetches all rows for the wallet, then filters in-memory. Fine for current data volumes. If Supabase query grows large, add date filter at the PostgREST level in a follow-up.
