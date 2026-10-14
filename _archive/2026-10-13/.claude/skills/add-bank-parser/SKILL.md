---
name: add-bank-parser
description: Add a new bank statement parser for CSV or PDF import
---

# Add Bank Parser

Add support for parsing a new bank's statement format (CSV or PDF).

Ask the user for:
- **Bank name** (e.g., "Mandiri", "BNI", "CIMB")
- **File format** (CSV or PDF)
- **Sample data** — a few lines/pages of the file to understand the format

## Route Decision (THINK-01)

Answer this first: **Is this format fully deterministic (fixed columns, known delimiters)?**

| Answer | Path | Where |
|--------|------|-------|
| YES — CSV with fixed columns | Direct parser (.NET) | Steps A1–A6 below |
| NO — PDF or screenshot | LLM extractor (Python) | Steps B1–B5 below |

---

## How Bank Identification Works

`BankIdentifier` is a **closed generic dispatcher** — it reads the file once into a `BankProbeContext`
snapshot, then iterates over all registered `IBankSignature` services filtered by content type.
The first signature whose `Matches()` returns `true` wins.

**Adding a new bank = adding a `Signature` class + registering it. Never edit `BankIdentifier.cs`.**

### `BankProbeContext` fields

| Field | Type | Contents |
|-------|------|----------|
| `CsvTokenizedLines` | `IReadOnlyList<HashSet<string>>` | First **15 lines** of the CSV, each tokenized (see below) |
| `PdfFirstPageText` | `string` | Raw text of page 1 extracted via PdfPig |
| `IsPdf` | `bool` | `true` when content-type is `application/pdf` |

### CSV tokenization rules (`CsvTokenizer`)

Each line is split on `,`, `;`, and `\t`. Tokens are trimmed of `"`, `'`, and spaces, then
**converted to uppercase**. The result is a `HashSet<string>` with `OrdinalIgnoreCase` comparer.

```
"Tanggal;Keterangan;Cabang; Jumlah ;;Saldo"
→ { "TANGGAL", "KETERANGAN", "CABANG", "JUMLAH", "SALDO" }
```

**Always write token strings in UPPERCASE** in your `Matches()` implementation.

**Only the first 15 lines are scanned** (`BankProbeContextFactory.CsvScanLines = 15`). If a bank's
header row can appear beyond line 15, your signature will silently fail to match — verify against
a real export.

### PDF fallback behavior

If no PDF signature matches, `BankIdentifier` automatically returns `BankKeys.LlmPdf`. You do **not**
need an explicit catch-all PDF signature. Encrypted PDFs return `null` — the upload controller handles
that separately by prompting for a password.

---

## Path A: Direct CSV Parser (.NET)

### A1. Add Bank Constant
Add the new key to `apps/api/src/PersonalFinance.Infrastructure/Parsers/BankKeys.cs`:
```csharp
public const string {BankName} = "{BANKNAME}";
```

### A2. Create Signature
Create `apps/api/src/PersonalFinance.Infrastructure/Parsers/Signatures/{BankName}CsvSignature.cs`:

```csharp
namespace PersonalFinance.Infrastructure.Parsers.Signatures;

public sealed class {BankName}CsvSignature : IBankSignature
{
    public string BankKey => BankKeys.{BankName};

    public bool AppliesTo(string contentType) =>
        contentType.StartsWith("text/csv", StringComparison.OrdinalIgnoreCase);

    public bool Matches(BankProbeContext ctx) =>
        ctx.CsvTokenizedLines.Any(t =>
            t.Contains("COLUMN_UNIQUE_TO_THIS_BANK") &&   // uppercase — CsvTokenizer normalizes all tokens
            t.Contains("OTHER_COLUMN"));
}
```

**Design tips (from `BcaCsvSignature`):**
- Pick 2–3 column headers that together are unique to this bank — never rely on a single generic token
  like `"DATE"` or `"AMOUNT"`, which appear in many CSVs.
- Target the **column header row**, not preamble metadata — preamble rows vary (e.g. account number lines
  get stripped when a user opens the file in Excel and re-saves it). The header row is always present.
- Test that your marker is absent in `StandardCsvSignature`'s match criteria so there's no ambiguity.

Reference: `BcaCsvSignature.cs`.

### A3. Create Parser
Create `apps/api/src/PersonalFinance.Infrastructure/Parsers/{BankName}CsvParser.cs`:
- Implement `IBankStatementParser`
- Reference pattern: `BcaCsvParser.cs` or `DefaultCsvParser.cs`
- Return `List<TransactionDto>` with these fields:
  - `Date` — parsed from bank's date format
  - `Description` — main transaction description
  - `Remarks` — additional notes/reference (default `""`)
  - `Flow` — `"DB"` (debit) or `"CR"` (credit)
  - `Type` — use `TransactionTypeClassifier.Classify(desc, flow)`
  - `AmountIdr` — use `CsvAmountParser.TryParse()` for Indonesian decimals
  - `Currency` — default `"IDR"`
  - `Wallet` — bank name string (e.g., `"Mandiri"`)
  - `StatementBalance` / `Balance` — running balance if available
- Call `await _categoryRuleService.CategorizeBatchAsync(transactions)` **once at the end** — never per-row (PERF-01)

### A4. Register in DI
Update `apps/api/src/PersonalFinance.Api/Program.cs` in three places:

```csharp
// --- Block 1: parser class registrations (before IStatementImportService) ---
builder.Services.AddScoped<{BankName}CsvParser>();

// --- Block 2: inside the IStatementImportService dictionary factory ---
{ BankKeys.{BankName}, serviceProvider.GetRequiredService<{BankName}CsvParser>() },

// --- Block 3: signature registrations (after IStatementImportService, before IBankIdentifier) ---
// Order within each content-type group matters — first match wins.
// Place more-specific signatures BEFORE generic fallbacks (e.g., before StandardCsvSignature).
builder.Services.AddScoped<IBankSignature, {BankName}CsvSignature>();
```

The comment in Program.cs before the signature block reads:
```
// Bank identification signatures — order within each content-type group matters (first match wins)
```
Insert your signature line before `StandardCsvSignature` (the CSV catch-all).

### A5. Add Tests
Add a test class to `apps/api/tests/PersonalFinance.Tests/Parsers/BankSignatureTests.cs`.
Reference the existing `BcaCsvSignatureTests` class for the canonical pattern:

```csharp
public class {BankName}CsvSignatureTests
{
    // Build a BankProbeContext from raw CSV line strings (mirrors BankProbeContextFactory behavior)
    private static BankProbeContext CsvCtx(params string[] rawLines)
    {
        var tokenized = rawLines.Select(CsvTokenizer.Tokenize).ToList();
        return new BankProbeContext(tokenized, string.Empty, IsPdf: false);
    }

    [Fact]
    public void Matches_WithValidHeader_ReturnsTrue()
    {
        var ctx = CsvCtx("col1;UNIQUE_COLUMN;col2;..."); // use real column headers from the bank
        Assert.True(new {BankName}CsvSignature().Matches(ctx));
    }

    [Fact]
    public void Matches_WithoutUniqueMarker_ReturnsFalse()
    {
        var ctx = CsvCtx("DATE;DESCRIPTION;AMOUNT");     // generic CSV — must not match
        Assert.False(new {BankName}CsvSignature().Matches(ctx));
    }

    [Fact]
    public void Matches_WithHeaderBeyondLine14_ReturnsFalse()
    {
        // CsvScanLines = 15 — a header at line 16+ will be missed; document this limit
        var deepLines = Enumerable.Repeat("metadata", 15)
            .Append("col1;UNIQUE_COLUMN;col2")
            .ToArray();
        Assert.False(new {BankName}CsvSignature().Matches(CsvCtx(deepLines)));
    }

    [Fact]
    public void AppliesTo_Csv_ReturnsTrue() =>
        Assert.True(new {BankName}CsvSignature().AppliesTo("text/csv"));

    [Fact]
    public void AppliesTo_Pdf_ReturnsFalse() =>
        Assert.False(new {BankName}CsvSignature().AppliesTo("application/pdf"));
}
```

Also add parser tests in `apps/api/tests/PersonalFinance.Tests/Parsers/{BankName}CsvParserTests.cs`:
- Correct field mapping from sample CSV rows
- Edge cases: empty fields, unusual amounts, date formats

### A6. Verify End-to-End
- Start stack: `npm start` (or `supabase start` + `dotnet run` + `npm run dev`)
- Upload a sample file via `POST /api/transactions/upload-preview`
- Verify parsed transactions in the response
- Submit via `POST /api/transactions/submit`

---

## Path B: LLM Extractor (PDF / Screenshot)

The .NET side routes detected PDF banks to the Python AI service via `LlmPdfParser`. Check first whether
detection and routing are already wired:

- **Detection**: Does `Parsers/Signatures/{BankName}PdfSignature.cs` exist?
- **Routing**: Is `BankKeys.{BankName}` already mapped in the `IStatementImportService` dictionary in `Program.cs`?

If both exist, **the .NET side is complete** — go straight to B3. If not, follow B1–B2.

### B1. Add Bank Constant + Signature (if missing)

Add the key to `BankKeys.cs`:
```csharp
public const string {BankName} = "{BANKNAME}";
```

Create `apps/api/src/PersonalFinance.Infrastructure/Parsers/Signatures/{BankName}PdfSignature.cs`:

```csharp
namespace PersonalFinance.Infrastructure.Parsers.Signatures;

public sealed class {BankName}PdfSignature : IBankSignature
{
    public string BankKey => BankKeys.{BankName};

    public bool AppliesTo(string contentType) =>
        contentType.StartsWith("application/pdf", StringComparison.OrdinalIgnoreCase);

    public bool Matches(BankProbeContext ctx) =>
        ctx.PdfFirstPageText.Contains("UniqueMarkerFromBankPdf", StringComparison.OrdinalIgnoreCase);
}
```

`PdfFirstPageText` is extracted from **page 1 only** via PdfPig. Pick a text marker that:
- Appears on the first page of every statement from this bank
- Is unique to this bank's template (e.g., the bank's registered legal name, a specific header label)
- Is not generic enough to appear on another bank's first page

Reference `NeoBankPdfSignature.cs` or `SuperbankPdfSignature.cs`.

**You do NOT need a catch-all "unrecognized PDF" signature.** Any PDF that doesn't match a registered
signature is automatically routed to `BankKeys.LlmPdf` by `BankIdentifier`.

**Do NOT edit `BankIdentifier.cs`** — adding a new bank = adding a new signature class + registering it.

### B2. Wire DI (if missing)
Update `apps/api/src/PersonalFinance.Api/Program.cs` in two places:

```csharp
// --- Block 1: inside the IStatementImportService dictionary factory ---
{ BankKeys.{BankName}, serviceProvider.GetRequiredService<LlmPdfParser>() },

// --- Block 2: signature registrations (after IStatementImportService, before IBankIdentifier) ---
builder.Services.AddScoped<IBankSignature, {BankName}PdfSignature>();
```

No new .NET parser class is needed — `LlmPdfParser` handles all PDF banks via the Python AI service.

### B3. Create Python Prompt
Create `services/ai-service/app/prompts/{bank_name}_v1.py` with the bank-specific system prompt:

```python
# services/ai-service/app/prompts/{bank_name}_v1.py

SYSTEM_PROMPT = """You are extracting transactions from a {BankName} e-statement PDF.

## Column semantics
- "{DebitColumn}"  = money leaving the account → flow: "DB"
- "{CreditColumn}" = money entering the account → flow: "CR"

## Date format
Dates appear as "..." (e.g., "7 Jun"). The year is in the period header at the top.
Reconstruct full dates as YYYY-MM-DD.

## Amount format (Indonesian decimal convention)
Amounts use period (.) as thousands separator and comma (,) as decimal separator.
Example: "Rp1.000.000,00" → amount_idr: 1000000.0. Always positive — flow encodes direction.

## Secondary description (remarks field)
If the description contains a reference number or secondary label separated by a newline
or dash, put it in remarks. Otherwise leave remarks empty ("").

## Rows to SKIP
1. Opening balance row (no debit/credit value)
2. Footer totals row (no date)
3. Rows where description is blank

## Sanitized examples
[Add 2–3 real rows with [NAME] placeholders for any PII — per PF-126 security policy]
"""
```

Then wire the prompt into `services/ai-service/app/services/llm_parser.py`:

```python
# Add import at top:
from app.prompts.{bank_name}_v1 import SYSTEM_PROMPT as _{BANKNAME}_PROMPT

# Add entry to _BANK_PROMPTS dict:
_BANK_PROMPTS: dict[str, str] = {
    "SUPERBANK": _SUPERBANK_PROMPT,   # existing
    "{BANKNAME}": _{BANKNAME}_PROMPT,  # new
}
```

Rules (from `.claude/rules/ai-service.md` — mandatory):
- `temperature=0.0` — extraction is deterministic
- Log `input_tokens` and `output_tokens` per call
- Use `claude-sonnet-4-6` for full statement extraction

### B4. Add Tests

**.NET side** — add to `apps/api/tests/PersonalFinance.Tests/Parsers/BankSignatureTests.cs`.
Reference the `NeoBankPdfSignatureTests` class for the canonical pattern:

```csharp
public class {BankName}PdfSignatureTests
{
    // Build a BankProbeContext from PDF first-page text
    private static BankProbeContext PdfCtx(string text) =>
        new([], text, IsPdf: true);

    [Fact]
    public void Matches_WithBankMarker_ReturnsTrue() =>
        Assert.True(new {BankName}PdfSignature().Matches(PdfCtx("...text containing UniqueMarker...")));

    [Fact]
    public void Matches_WithoutMarker_ReturnsFalse() =>
        Assert.False(new {BankName}PdfSignature().Matches(PdfCtx("Some other bank statement")));

    [Fact]
    public void AppliesTo_Pdf_ReturnsTrue() =>
        Assert.True(new {BankName}PdfSignature().AppliesTo("application/pdf"));

    [Fact]
    public void AppliesTo_Csv_ReturnsFalse() =>
        Assert.False(new {BankName}PdfSignature().AppliesTo("text/csv"));
}
```

**Python side**:
Create `services/ai-service/tests/test_{bank_name}_extractor.py`. Mock at the provider level —
never call the real API in tests:

```python
def _make_provider_with_transactions(transactions: list[dict]) -> AsyncMock:
    provider = AsyncMock()
    provider.extract_structured = AsyncMock(return_value={"transactions": transactions})
    return provider

@pytest.mark.anyio
async def test_{bank_name}_happy_path():
    mock_txns = [{ "date": "2025-06-07", "description": "...", "flow": "DB",
                   "amount_idr": 105000.0, "currency": "IDR" }]
    parser = LlmParser(_make_provider_with_transactions(mock_txns))
    result = await parser.parse(ParseRequest(text=SAMPLE_TEXT, bank_hint="{BANKNAME}"))
    assert result.total_parsed == 1
```

Cover: happy path, `_build_system_prompt("{BANKNAME}")` returns the bank-specific prompt,
provider error raises `LlmParseError`, regression that generic fallback still works for other hints.

Reference `tests/test_superbank_extractor.py` for the complete pattern once PF-128 is merged.

### B5. Verify End-to-End
- Start stack: `npm start` (or `supabase start` + `dotnet run` + `uvicorn` + `npm run dev`)
- Upload a real sample PDF via `POST /api/transactions/upload-preview`
- Verify the Python service log shows the correct bank hint and token counts
- Verify parsed transactions in the response
- Submit and confirm they appear in `GET /api/transactions`
