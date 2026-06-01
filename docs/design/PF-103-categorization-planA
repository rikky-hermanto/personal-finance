# Plan: Historical Cashflow Import with Fuzzy Deduplication

## Context

The user has a 2-year master cashflow CSV (`docs/statement-examples/Cashflow 2024 2025.csv`) with
transactions from BCA, SeaBank, NeoBank, etc. in a unified semicolon-delimited format. They want
to bulk-import this historical data into the Supabase database. The upload pipeline already exists,
but two problems block it:

1. **File-hash gate (Tier 1):** Uploading the same master CSV a second time returns 409 Conflict,
   blocking re-imports when not all rows were previously in the DB.
2. **Exact-description deduplication only:** The same real-world transaction may appear in both
   the master CSV and a previously-parsed bank statement but with different Description text
   (e.g., master CSV: Item="Listrik" vs BCA statement: "PLN 123456789"). The composite key
   (`date|amount|description|wallet|flow`) won't catch this — inserting a phantom duplicate.

**Solution:** Add a fuzzy deduplication pass after the existing exact-match pass, surface a
third "Possible Duplicates" bucket in the upload preview UI, and add a bypass option when the
409 gate fires for an already-seen file.

---

## What Already Works (no changes needed)

- **`DefaultCsvParser`** already handles the master CSV format:
  - Semicolon auto-detected via `DetectDelimiter`
  - `Item` → Description, `Remarks` → Remarks (with fallback)
  - `Amount (IDR)` normalized to `AmountIDR` lookup key ✓
  - US-format amounts (169,338,655.95) parsed correctly ✓
  - `Balance` mapped to `dto.Balance` ✓
  - Categories preserved via `CategorizeBatchAsync` ✓

---

## Implementation Steps

### 1. `TransactionDto.cs` — Add `DuplicateStatus`
**File:** `apps/api/src/PersonalFinance.Application/Dtos/TransactionDto.cs`

Add enum and three new fields. Keep `IsDuplicate` as computed shim so internal callers compile:

```csharp
public enum DuplicateStatus { None, Exact, Fuzzy }

// Replace: public bool IsDuplicate { get; set; }
public DuplicateStatus DuplicateStatus { get; set; } = DuplicateStatus.None;

[System.Text.Json.Serialization.JsonIgnore]   // avoid duplicate in JSON, frontend uses DuplicateStatus
public bool IsDuplicate
{
    get => DuplicateStatus == DuplicateStatus.Exact;
    set => DuplicateStatus = value ? DuplicateStatus.Exact : DuplicateStatus.None;
}

public string? FuzzyMatchDescription { get; set; }
public double? FuzzyScore { get; set; }
```

`FilterLogic` (line 116–120) uses `!t.IsDuplicate` → shim means Fuzzy items pass through to insert.
This is correct — fuzzy-approved items should be importable.

---

### 2. `StringSimilarity.cs` — New static class (zero NuGet)
**New file:** `apps/api/src/PersonalFinance.Application/Services/StringSimilarity.cs`

~45-line Jaro-Winkler implementation. Threshold: `0.80`.

Key details:
- Apply `AggressiveNormalize()` to both strings before scoring (already exists in `TransactionService`)
- Expose `public static double JaroWinkler(string s1, string s2, double p = 0.1)`

---

### 3. `TransactionService.cs` — Second fuzzy pass in `TagDuplicatesLogic`
**File:** `apps/api/src/PersonalFinance.Application/Services/TransactionService.cs`

Add `GetFuzzyKey` (no description, date as `yyyy-MM-dd` only — handles master CSV date-only vs DB datetime mismatch):

```csharp
private static string GetFuzzyKey(TransactionDto t)
{
    var dateStr = StandardizeDate(t.Date).ToString("yyyy-MM-dd");
    var amountStr = Math.Round(t.AmountIdr, 2).ToString("F2", CultureInfo.InvariantCulture);
    var wallet = (string.IsNullOrWhiteSpace(t.Wallet) || t.Wallet == "-") ? "unknown" : t.Wallet.Trim().ToLower();
    return $"{dateStr}|{amountStr}|{wallet}|{t.Flow}";
}

private static string GetFuzzyKey(Transaction t) { /* same */ }
```

In `TagDuplicatesLogic`, after the exact-match pass completes, add a fuzzy pass:

```csharp
// Fuzzy pass: transactions not yet marked Exact
var fuzzyLookup = existing.ToLookup(GetFuzzyKey);

foreach (var t in incoming.Where(x => x.DuplicateStatus == DuplicateStatus.None))
{
    var candidates = fuzzyLookup[GetFuzzyKey(t)];
    foreach (var candidate in candidates)
    {
        var score = StringSimilarity.JaroWinkler(
            AggressiveNormalize(t.Description),
            AggressiveNormalize(candidate.Description));
        if (score >= 0.80)
        {
            t.DuplicateStatus = DuplicateStatus.Fuzzy;
            t.FuzzyMatchDescription = candidate.Description;
            t.FuzzyScore = score;
            break;
        }
    }
}
```

Update `IdentifyDuplicatesAsync` log at line 70–72 to count all non-None as duplicates.

---

### 4. `TransactionsController.cs` — File-hash bypass param
**File:** `apps/api/src/PersonalFinance.Api/Controllers/TransactionsController.cs`

Add `[FromForm] bool bypassFileHash = false` to `UploadPreview` (line 76–80):

```csharp
public async Task<IActionResult> UploadPreview(
    IFormFile file,
    [FromForm] string? pdfPassword = null,
    [FromForm] string? bankHint = null,
    [FromForm] string? dateFormat = null,
    [FromForm] bool bypassFileHash = false)  // NEW
{
    // ...
    if (!bypassFileHash && await _transactionService.IsFileProcessedAsync(hash))
    {
        return Conflict(new { Message = "This file has already been processed.", Hash = hash });
    }
    // ...
}
```

No changes to `SubmitTransactions` — it already calls `RegisterFileHashAsync` at the end.

---

### 5. Frontend types — `Transaction.ts` and `transactionsApi.ts`
**Files:**
- `apps/frontend/src/types/Transaction.ts`
- `apps/frontend/src/api/transactionsApi.ts`

Add to `Transaction` interface:
```typescript
duplicateStatus?: 'None' | 'Exact' | 'Fuzzy';
fuzzyMatchDescription?: string;
fuzzyScore?: number;
```

Add to `TransactionDto` in `transactionsApi.ts`:
```typescript
duplicateStatus: 'None' | 'Exact' | 'Fuzzy';
fuzzyMatchDescription?: string | null;
fuzzyScore?: number | null;
```

Update `uploadPreview()` to accept and forward `bypassFileHash?: boolean` as a FormData field.

---

### 6. `FileUpload.tsx` — 409 bypass prompt
**File:** `apps/frontend/src/components/FileUpload.tsx`

Add state:
```typescript
const [showBypassPrompt, setShowBypassPrompt] = useState(false);
const [bypassPending, setBypassPending] = useState<File | null>(null);
```

In `handleProcessFiles`, detect the 409 before the generic error handler:
```typescript
if (res?.status === 409) {
  setShowBypassPrompt(true);
  setBypassPending(file);
  return;
}
```

Render prompt when `showBypassPrompt`:
```
"This file was previously imported.
 Re-process to find transactions not yet in your database?"
[Cancel]  [Yes, re-process]
```

"Yes, re-process" calls `uploadPreview(file, ..., bypassFileHash: true)`.

Also extend the DTO→Transaction mapping (wherever `isDuplicate` is currently mapped) to carry through `duplicateStatus`, `fuzzyMatchDescription`, `fuzzyScore`.

---

### 7. `TransactionPreview.tsx` — Three-bucket preview
**File:** `apps/frontend/src/components/TransactionPreview.tsx`

Replace lines 102–103:
```typescript
// Before:
const newTransactions       = useMemo(() => editedTransactions.filter(t => !t.isDuplicate), [...]);
const duplicateTransactions = useMemo(() => editedTransactions.filter(t => t.isDuplicate),  [...]);

// After:
const newTransactions       = useMemo(() => editedTransactions.filter(t => !t.duplicateStatus || t.duplicateStatus === 'None'), [...]);
const fuzzyTransactions     = useMemo(() => editedTransactions.filter(t => t.duplicateStatus === 'Fuzzy'),  [...]);
const exactDuplicates       = useMemo(() => editedTransactions.filter(t => t.duplicateStatus === 'Exact'),  [...]);
```

Add state for user-promoted fuzzy items:
```typescript
const [promotedFuzzy, setPromotedFuzzy] = useState<Set<string | number>>(new Set());
```

Submit payload = `newTransactions` + promoted fuzzy items (sent with `isDuplicate: false`).

**New Group 2 — Possible Duplicates (between Ready to Save and Exact Duplicates):**

```
[amber dot] Possible Duplicates (N) — similar transactions already in DB

  Date     Description          Amount     Similarity     Match in DB
  -------  -------------------  ---------  -------------  -----------------------
  1/1/24   Listrik              210,000    89%            Listrik PLN123456789...   [Import anyway]
```

- Amber/warning accent (`text-amber-500`, dot `bg-amber-500`)
- `FuzzyScore * 100`% badge per row
- Tooltip or secondary line showing `fuzzyMatchDescription`
- "Import anyway" button → `setPromotedFuzzy(prev => new Set(prev).add(tx.id))`
- When promoted, the row moves to the Ready to Save count (update summary card)

Exact Duplicates group (Group 3) unchanged except renamed from "Duplicates" to "Duplicates — Already in DB".

---

## Data Flow (end-to-end)

```
User uploads master CSV (2nd time)
  → 409 Conflict
  → Frontend shows bypass prompt
  → User clicks "Yes, re-process" (bypassFileHash=true)
  → DefaultCsvParser parses N rows
  → TagDuplicatesLogic:
      Pass 1 (exact):   date+amount+desc+wallet+flow → DuplicateStatus.Exact
      Pass 2 (fuzzy):   date+amount+wallet+flow → JaroWinkler(desc) ≥ 0.80 → DuplicateStatus.Fuzzy
  → Response: N transactions tagged None/Exact/Fuzzy
  → Frontend: 3 groups rendered
  → User reviews fuzzy group, optionally promotes
  → Submit: DuplicateStatus.None + promoted items → AddTransactionsAsync
  → Hash registered in uploaded_files
```

---

## Critical Files

| File | Change |
|------|--------|
| `apps/api/src/PersonalFinance.Application/Dtos/TransactionDto.cs` | Add `DuplicateStatus` enum + `FuzzyMatchDescription` + `FuzzyScore`; keep `IsDuplicate` as `[JsonIgnore]` shim |
| `apps/api/src/PersonalFinance.Application/Services/StringSimilarity.cs` | **New** — Jaro-Winkler static class |
| `apps/api/src/PersonalFinance.Application/Services/TransactionService.cs` | Add `GetFuzzyKey`, fuzzy pass in `TagDuplicatesLogic` |
| `apps/api/src/PersonalFinance.Api/Controllers/TransactionsController.cs` | Add `bypassFileHash` param to `UploadPreview` |
| `apps/frontend/src/types/Transaction.ts` | Add `duplicateStatus`, `fuzzyMatchDescription`, `fuzzyScore` |
| `apps/frontend/src/api/transactionsApi.ts` | Add new fields to `TransactionDto`; add `bypassFileHash` to `uploadPreview` |
| `apps/frontend/src/components/FileUpload.tsx` | Add 409 detection + bypass prompt + carry new fields in DTO mapping |
| `apps/frontend/src/components/TransactionPreview.tsx` | Three-bucket split + "Possible Duplicates" section + promote buttons |

---

## Verification

1. **Build:** `cd apps/api && dotnet build PersonalFinance.slnx` — no compile errors
2. **Upload master CSV first time** — parses, exact duplicates tagged correctly, preview shows Ready/Exact buckets
3. **Upload master CSV second time** — 409 fires, bypass prompt appears, re-process works
4. **Fuzzy test:** Upload a file where one row's description slightly differs from a DB row (e.g., "Listrik" vs "Listrik PLN Token"). Expect DuplicateStatus=Fuzzy, fuzzyScore shown in UI.
5. **Promote test:** Click "Import anyway" on a fuzzy row → it moves to Ready to Save bucket, count updates, submit includes it.
6. **No regression:** Upload a normal BCA CSV → exact deduplication still works as before (DuplicateStatus=Exact for known duplicates).
