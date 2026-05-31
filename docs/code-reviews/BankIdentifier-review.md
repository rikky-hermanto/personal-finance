# Code Review — BankIdentifier.cs

**File:** [BankIdentifier.cs](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/BankIdentifier.cs)
**Date:** 2026-05-31
**Effort:** High (7 angles × 6 candidates → verified)
**Focus:** Uncle Bob Clean Code + design pattern sweet spot

---

## Findings (ranked most-severe first)

### 1. CONFIRMED — `"Superbank"` not registered in parser dictionary → every Superbank PDF throws `NotSupportedException`

**Line:** [BankIdentifier.cs:89](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/BankIdentifier.cs#L89)
**Severity:** Critical (functional bug — feature is silently broken)

[BankIdentifier.cs](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/BankIdentifier.cs) returns `"Superbank"` (mixed-case) but [Program.cs](../../apps/api/src/PersonalFinance.Api/Program.cs) only registers `"BCA"`, `"NEOBANK"`, `"STANDARD"`, `"LLM_PDF"`. `StatementImportService.TryGetValue("Superbank")` always misses, returning HTTP 400 with a misleading "format not recognised" error for every valid Superbank PDF upload.

**Fix:** Normalize the return value to `"SUPERBANK"` in [BankIdentifier.cs:89](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/BankIdentifier.cs#L89) and add the matching key in [Program.cs](../../apps/api/src/PersonalFinance.Api/Program.cs).

---

### 2. CONFIRMED — `contentType` exact equality silently rejects `"text/csv; charset=utf-8"`

**Line:** [BankIdentifier.cs:17](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/BankIdentifier.cs#L17)
**Severity:** High (functional bug — valid uploads silently fail)

HTTP clients (curl, browsers, Postman) routinely send `"text/csv; charset=utf-8"` or `"application/pdf; name=stmt.pdf"`. The equality checks on [BankIdentifier.cs:17](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/BankIdentifier.cs#L17) and [BankIdentifier.cs:61](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/BankIdentifier.cs#L61) fail, the method returns `null`, and [TransactionsController.cs](../../apps/api/src/PersonalFinance.Api/Controllers/TransactionsController.cs) returns 400 "format not recognised" for a perfectly valid file.

**Fix:**
```csharp
if (contentType.StartsWith("text/csv", StringComparison.OrdinalIgnoreCase))
// ...
else if (contentType.StartsWith("application/pdf", StringComparison.OrdinalIgnoreCase))
```

---

### 3. CONFIRMED — General `catch (Exception)` falls through to `LLM_PDF` for corrupt/non-PDF binaries

**Line:** [BankIdentifier.cs:98](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/BankIdentifier.cs#L98)
**Severity:** High (silent data quality + wasted LLM API spend)

A `.zip` or `.exe` uploaded with `Content-Type: application/pdf` causes PdfPig to throw. The catch block at [BankIdentifier.cs:98](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/BankIdentifier.cs#L98) logs a warning but does **not** return — execution continues to [BankIdentifier.cs:106](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/BankIdentifier.cs#L106) and returns `"LLM_PDF"`. The LLM extractor receives garbage bytes, burning an API call and potentially returning hallucinated transactions.

**Fix:** `LLM_PDF` should only be returned when PdfPig opens the file successfully but finds no known bank marker. Add `stream.Position = 0; return null;` inside the general catch block.

```csharp
catch (Exception ex)
{
    _logger.LogWarning(ex, "Error during PDF bank identification.");
    stream.Position = 0;
    return null;  // unreadable — reject, don't burn an LLM call
}
```

---

### 4. CONFIRMED — Missing namespace declaration (ARCH-03 / CODE-01 violation)

**Line:** [BankIdentifier.cs:5](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/BankIdentifier.cs#L5)
**Severity:** Medium (architectural violation — global namespace)

`BankIdentifier` is in the global namespace while every other file in [Parsers/](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/) declares `namespace PersonalFinance.Infrastructure.Parsers`. Architecture tests, IDE navigation, and namespace-based reflection break or produce ambiguous results.

**Fix:**
```csharp
namespace PersonalFinance.Infrastructure.Parsers;

public class BankIdentifier : IBankIdentifier
```

---

### 5. CONFIRMED — Bank key strings are magic literals with inconsistent casing

**Line:** [BankIdentifier.cs:45](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/BankIdentifier.cs#L45)
**Severity:** Medium (root cause of finding #1; maintenance trap)

`"BCA"`, `"NEOBANK"`, `"STANDARD"`, `"LLM_PDF"` are uppercase but `"Superbank"` is mixed-case. Any downstream dictionary or switch in [Program.cs](../../apps/api/src/PersonalFinance.Api/Program.cs) must be hand-maintained to match. This is the direct root cause of the parser miss in finding #1.

**Fix:** Introduce a `BankKeys` constants class at [Parsers/BankKeys.cs](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/BankKeys.cs) (new file):

```csharp
internal static class BankKeys
{
    public const string Bca = "BCA";
    public const string NeoBank = "NEOBANK";
    public const string Superbank = "SUPERBANK";
    public const string Standard = "STANDARD";
    public const string LlmPdf = "LLM_PDF";
}
```

Reference `BankKeys.Superbank` in both [BankIdentifier.cs](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/BankIdentifier.cs) and [Program.cs](../../apps/api/src/PersonalFinance.Api/Program.cs) so a rename is one change, not a grep exercise.

---

### 6. CONFIRMED — `firstFiveLines.Any(l => Tokenize(l))` re-tokenizes lines already tokenized in the outer loop

**Line:** [BankIdentifier.cs:36](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/BankIdentifier.cs#L36)
**Severity:** Low (redundant computation)

The outer `for` loop at [BankIdentifier.cs:22](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/BankIdentifier.cs#L22) calls `Tokenize(line)` per iteration and discards the result after the header checks. When the BCA four-token match fires on line 5, the `Any()` predicate calls `Tokenize()` on up to 5 previously-read lines a second time (10 calls for 5 lines).

**Fix:** Accumulate tokenized results in a `List<HashSet<string>>` alongside `firstFiveLines`:

```csharp
var firstFiveLines = new List<string>();
var tokenizedLines = new List<HashSet<string>>();

// ...in loop:
firstFiveLines.Add(line);
var tokens = Tokenize(line);
tokenizedLines.Add(tokens);

// ...in BCA check:
bool hasAccountToken = tokenizedLines.Any(t =>
    t.Contains("NO. REKENING") || t.Contains("REKENING") || t.Contains("NO.REKENING"));
```

---

### 7. CONFIRMED — `Tokenize()` is byte-for-byte duplicated in `BcaCsvParser.cs`

**Line:** [BankIdentifier.cs:113](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/BankIdentifier.cs#L113)
**Severity:** Low (divergence risk)

Both [BankIdentifier.cs:113](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/BankIdentifier.cs#L113) and [BcaCsvParser.cs](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/BcaCsvParser.cs) implement the same `Tokenize` method — same regex `[,;\t]`, same trim chars, same `OrdinalIgnoreCase HashSet`, same `ToUpperInvariant()`. If a future bank needs an additional delimiter (e.g. pipe `|`), editing one without the other causes BCA identification and BCA parsing to apply different tokenization rules — a silent mis-detection with no compiler error.

**Fix:** Extract to a shared static helper at [Parsers/CsvTokenizer.cs](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/CsvTokenizer.cs) (new file):

```csharp
internal static class CsvTokenizer
{
    private static readonly Regex Delimiter = new(@"[,;\t]", RegexOptions.Compiled);

    public static HashSet<string> Tokenize(string line)
    {
        var result = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (string.IsNullOrWhiteSpace(line)) return result;
        foreach (var part in Delimiter.Split(line))
        {
            var token = part.Trim('"', ' ', '\'').ToUpperInvariant();
            if (!string.IsNullOrEmpty(token)) result.Add(token);
        }
        return result;
    }
}
```

---

### 8. CONFIRMED — `IdentifyAsync` is a 90-line method mixing CSV fingerprinting and PDF text matching (SRP)

**Line:** [BankIdentifier.cs:14](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/BankIdentifier.cs#L14)
**Severity:** Low (Clean Code / maintainability)

The method has two distinct dispatch paths (CSV branch and PDF branch) plus stream lifecycle bookkeeping scattered throughout. Adding Wise CSV detection requires reading and modifying the same method body as NeoBank PDF detection — violating the Open/Closed principle and risking accidental breakage of adjacent stream-reset logic.

**Fix:** Extract private methods. The public method becomes a 5-line dispatch:

```csharp
public async Task<string?> IdentifyAsync(Stream stream, string contentType, string? pdfPassword = null)
{
    _logger.LogInformation("Identifying bank from stream with Content-Type: {ContentType}", contentType);
    if (contentType.StartsWith("text/csv", StringComparison.OrdinalIgnoreCase))
        return await IdentifyFromCsvAsync(stream);
    if (contentType.StartsWith("application/pdf", StringComparison.OrdinalIgnoreCase))
        return await IdentifyFromPdfAsync(stream, pdfPassword);
    _logger.LogDebug("Bank could not be identified for content type: {ContentType}", contentType);
    return null;
}
```

Each private method owns its own stream reset in a `try/finally`.

---

### 9. PLAUSIBLE — `pdf.GetPages().FirstOrDefault()` vs `pdf.GetPage(1)` clarity + potential efficiency

**Line:** [BankIdentifier.cs:76](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/BankIdentifier.cs#L76)
**Severity:** Low

`GetPages().FirstOrDefault()` is lazy at the C# iterator level and stops after one page. `GetPage(1)` (1-indexed) is a direct slot lookup that signals intent more clearly and avoids LINQ overhead. Whether there is a meaningful performance difference depends on PdfPig internals.

**Fix:**
```csharp
var firstPage = pdf.GetPage(1);
var firstPageText = firstPage?.Text ?? string.Empty;
```

---

### 10. CONFIRMED — `stream.Position = 0` repeated 8 times with no `try/finally` safety net

**Line:** [BankIdentifier.cs:19](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/BankIdentifier.cs#L19)
**Severity:** Low (latent bug — one missed reset corrupts downstream parser silently)

Every early-return path manually resets the stream. A developer adding a new bank branch (e.g. `image/png` for Bank Jago) and forgetting to reset leaves the stream at EOF. The downstream parser in [TransactionsController.cs](../../apps/api/src/PersonalFinance.Api/Controllers/TransactionsController.cs) reads 0 bytes and returns an empty transaction list with no exception thrown.

**Fix:** After extracting `IdentifyFromCsvAsync` and `IdentifyFromPdfAsync` (finding #8), each private method should wrap its logic:

```csharp
private async Task<string?> IdentifyFromCsvAsync(Stream stream)
{
    try
    {
        stream.Position = 0;
        // ... identification logic, no stream resets needed inside
        return result;
    }
    finally
    {
        stream.Position = 0;
    }
}
```

---

## Design Pattern Verdict

**Sweet spot: private method extraction + `BankKeys` constants. Not CoR yet.**

The codebase has 4 banks and 2 content types — Chain of Responsibility would introduce more abstraction than it saves. The right moves are:

1. Extract `IdentifyFromCsvAsync` / `IdentifyFromPdfAsync` (finding #8) → Clean Code, no pattern overhead
2. Introduce [BankKeys.cs](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/BankKeys.cs) constants (finding #5) → prevents casing bugs like finding #1
3. Extract shared [CsvTokenizer.cs](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/CsvTokenizer.cs) (finding #7) → single source of truth for delimiter logic

**Revisit Chain of Responsibility when bank count hits 5+**, at which point `IdentifyFromCsvAsync` will have 3+ if/else branches and an `IBankMatcher` pattern pays for itself.

---

## Fix Priority

| Priority | Finding | Files | Effort |
|----------|---------|-------|--------|
| P0 — fix now | #1 `"Superbank"` parser miss | [BankIdentifier.cs:89](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/BankIdentifier.cs#L89), [Program.cs](../../apps/api/src/PersonalFinance.Api/Program.cs) | 2-line fix |
| P0 — fix now | #2 Content-Type exact equality | [BankIdentifier.cs:17](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/BankIdentifier.cs#L17), [BankIdentifier.cs:61](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/BankIdentifier.cs#L61) | 2-line fix |
| P0 — fix now | #3 Corrupt PDF → LLM_PDF fallthrough | [BankIdentifier.cs:98](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/BankIdentifier.cs#L98) | 2-line fix |
| P1 — next PR | #4 Missing namespace | [BankIdentifier.cs:5](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/BankIdentifier.cs#L5) | 1-line fix |
| P1 — next PR | #5 Magic string constants | New [BankKeys.cs](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/BankKeys.cs) | Small new file |
| P2 — cleanup | #6 Tokenize re-invocation | [BankIdentifier.cs:36](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/BankIdentifier.cs#L36) | Minor refactor |
| P2 — cleanup | #7 Tokenize duplication | [BankIdentifier.cs:113](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/BankIdentifier.cs#L113), [BcaCsvParser.cs](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/BcaCsvParser.cs) → [CsvTokenizer.cs](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/CsvTokenizer.cs) | Extract shared helper |
| P2 — cleanup | #8 SRP / method extraction | [BankIdentifier.cs:14](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/BankIdentifier.cs#L14) | Medium refactor |
| P3 — nice-to-have | #9 `GetPage(1)` clarity | [BankIdentifier.cs:76](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/BankIdentifier.cs#L76) | 1-line change |
| P3 — nice-to-have | #10 `try/finally` stream reset | [BankIdentifier.cs:19](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/BankIdentifier.cs#L19) | Follows from #8 |
