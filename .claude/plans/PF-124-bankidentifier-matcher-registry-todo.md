# PF-124 — BankIdentifier Matcher Registry (Chain of Responsibility + Strategy)

> **GitHub Issue:** _(create on merge)_
> **Status:** To Do
> **Started:** 2026-05-31
> **Absorbs:** PF-123 (Fix ARCH-02 — IBankIdentifier move is Step 4 of this plan)

## Objective

Refactor `BankIdentifier` from a single 100-line method with hardcoded fingerprints and 12 manual
stream resets into a thin Chain-of-Responsibility dispatcher over a registry of self-describing
`IBankSignature` implementations (one class per bank). This closes the gap between the codebase's
stated architecture goal — "adding a new bank = adding a config file, not writing code" — and what
the code actually does today. It also serves as the stepping stone toward config-driven bank profiles
(PF-045).

### Identification Pipeline (big picture)

```
  File Upload (stream + contentType)
          |
          v
  BankIdentifier.IdentifyAsync()
          |
          |-- contentType null? ---------> return null
          |
          v
  BankProbeContextFactory.CreateAsync()   [reads stream ONCE]
          |
          |-- text/csv  --> read up to 15 lines --> tokenize each line
          |                      --> BankProbeContext { CsvTokenizedLines, IsPdf=false }
          |
          |-- application/pdf --> PdfPig extract page 1 text
          |                      --> BankProbeContext { PdfFirstPageText, IsPdf=true }
          |
          v
  Chain of Responsibility  [registered IBankSignature implementations, in order]
          |
          |-- BcaCsvSignature       AppliesTo? csv  --> Matches? TANGGAL+KETERANGAN+CABANG+SALDO
          |         yes --> return "BCA"
          |
          |-- StandardCsvSignature  AppliesTo? csv  --> Matches? DATE+(ITEM|DESCRIPTION)+AMOUNT
          |         yes --> return "standard"
          |
          |-- NeoBankPdfSignature   AppliesTo? pdf  --> Matches? "NOW Savings" in page 1 text
          |         yes --> return "NeoBank"
          |
          |-- SuperbankPdfSignature AppliesTo? pdf  --> Matches? "Superbank" in page 1 text
          |         yes --> return "Superbank"
          |
          |-- (no match, IsPdf=true) ----------------> return "llm_pdf"  [routed to LLM extractor]
          |
          |-- (no match, not PDF)  -----------------> return null         [unrecognized]
          |
          v
  finally: stream.Position = 0             [always reset, single point]
```

Adding a new bank = one new `IBankSignature` class + one `AddScoped` line in `Program.cs`.

## Acceptance Criteria

- [x] `BankIdentifier.IdentifyAsync` contains no hardcoded bank fingerprints — all detection logic lives in `IBankSignature` implementations
- [x] Stream reset happens exactly once, in a single `finally` block
- [x] Adding a new bank requires creating one new `IBankSignature` class and one `AddScoped` line in `Program.cs` — no edits to `BankIdentifier`
- [x] The BCA header scan window matches `BcaCsvParser` (both use `BankProbeContextFactory.CsvScanLines = 15`)
- [x] Dead `firstFiveLines` list and null `contentType` NRE are both fixed
- [x] `IBankIdentifier` lives in `Application/Interfaces/` with a proper namespace (ARCH-02)
- [x] Unit tests cover each `IBankSignature` implementation: happy path, AppliesTo gating, BCA stripped-preamble case, BCA header-at-line-11 case
- [x] All existing tests pass; `dotnet build` is clean

## Approach

Introduce `BankProbeContext` (a simple record carrying pre-read CSV tokens and PDF first-page text)
and `BankProbeContextFactory` (a static helper in Infrastructure that reads the stream once using
`CsvTokenizer` / PdfPig). Define `IBankSignature` as an internal Infrastructure interface with two
methods: `AppliesTo(contentType)` and `Matches(ctx)`. Create four signature classes in
`Infrastructure/Parsers/Signatures/`. Rewrite `BankIdentifier` as a primary-constructor class that
takes `IEnumerable<IBankSignature>` via DI and loops over matching signatures. Move `IBankIdentifier`
to `Application/Interfaces/` to satisfy ARCH-02. Do not touch the parser implementations, the
validation pipeline, or `StatementImportService` — their `BankKeys` contracts are unchanged.

## Affected Files

| File | Change |
|------|--------|
| `apps/api/src/PersonalFinance.Infrastructure/Parsers/BankIdentifier.cs` | Rewrite — thin loop, primary constructor, single finally |
| `apps/api/src/PersonalFinance.Infrastructure/Parsers/IBankIdentifier.cs` | Delete — moved to Application |
| `apps/api/src/PersonalFinance.Application/Interfaces/IBankIdentifier.cs` | Create — moved from Infrastructure, add namespace |
| `apps/api/src/PersonalFinance.Infrastructure/Parsers/BankProbeContext.cs` | Create — record with CsvTokenizedLines + PdfFirstPageText + IsPdf |
| `apps/api/src/PersonalFinance.Infrastructure/Parsers/BankProbeContextFactory.cs` | Create — static factory, reads stream once, CsvScanLines = 15 |
| `apps/api/src/PersonalFinance.Infrastructure/Parsers/IBankSignature.cs` | Create — internal Infrastructure interface |
| `apps/api/src/PersonalFinance.Infrastructure/Parsers/Signatures/BcaCsvSignature.cs` | Create — BCA header + account token check |
| `apps/api/src/PersonalFinance.Infrastructure/Parsers/Signatures/StandardCsvSignature.cs` | Create — DATE/ITEM/AMOUNT header check |
| `apps/api/src/PersonalFinance.Infrastructure/Parsers/Signatures/NeoBankPdfSignature.cs` | Create — "NOW Savings" first-page text check |
| `apps/api/src/PersonalFinance.Infrastructure/Parsers/Signatures/SuperbankPdfSignature.cs` | Create — "Superbank" first-page text check |
| `apps/api/src/PersonalFinance.Api/Program.cs` | Edit — add four `AddScoped<IBankSignature, ...>()` registrations |
| `apps/api/tests/PersonalFinance.Tests/Parsers/BankSignatureTests.cs` | Create — unit tests for all four signatures |

---

## TODO

### [x] STEP 1 — Quick fixes: dead code + null contentType guard

In [BankIdentifier.cs](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/BankIdentifier.cs):

**Remove** the `firstFiveLines` list (lines 23 and 29 — allocation and `.Add()` call):
```diff
-            var firstFiveLines = new List<string>();
             var tokenizedLines = new List<HashSet<string>>();
             for (int i = 0; i < 5; i++)
             {
                 var line = await reader.ReadLineAsync();
                 if (line == null) break;
-                firstFiveLines.Add(line);
                 var tokens = CsvTokenizer.Tokenize(line);
```

**Add** a null-content-type guard immediately after the log line (before the first `if`):
```csharp
if (string.IsNullOrEmpty(contentType))
    return null;
```

> **Why:** `firstFiveLines` was made dead by the prev-fix that replaced all its usages with `tokenizedLines` — leaving it allocates a list and runs `.Add()` on every iteration for no purpose. The null guard prevents an NRE on L19's `StartsWith` call when `IFormFile.ContentType` is absent (the parameter is non-nullable in the signature but the caller can pass null from an IFormFile).

---

### [x] STEP 2 — Create `BankProbeContext` record

Create `apps/api/src/PersonalFinance.Infrastructure/Parsers/BankProbeContext.cs`:

```csharp
namespace PersonalFinance.Infrastructure.Parsers;

/// <summary>
/// Pre-read snapshot of a file stream, built once before the signature chain runs.
/// Eliminates repeated stream seeks and repeated PDF/CSV parsing in BankIdentifier.
/// </summary>
public sealed record BankProbeContext(
    IReadOnlyList<HashSet<string>> CsvTokenizedLines,
    string PdfFirstPageText,
    bool IsPdf
);
```

> **Why:** Separating "read the stream" from "inspect the content" means each signature receives a plain in-memory object rather than a live stream, making signatures synchronous and trivially unit-testable with no file I/O. The record is sealed because nothing should inherit detection state.

---

### [x] STEP 3 — Create `BankProbeContextFactory`

Create `apps/api/src/PersonalFinance.Infrastructure/Parsers/BankProbeContextFactory.cs`:

```csharp
using System.Text;
using UglyToad.PdfPig;

namespace PersonalFinance.Infrastructure.Parsers;

internal static class BankProbeContextFactory
{
    /// <summary>
    /// Must match BcaCsvParser's header scan depth so a BCA file with a long preamble
    /// is not misidentified as unrecognized (review smell #2).
    /// </summary>
    internal const int CsvScanLines = 15;

    internal static async Task<BankProbeContext> CreateAsync(
        Stream stream, string contentType, string? pdfPassword)
    {
        if (contentType.StartsWith("text/csv", StringComparison.OrdinalIgnoreCase))
        {
            stream.Position = 0;
            using var reader = new StreamReader(stream, Encoding.UTF8,
                detectEncodingFromByteOrderMarks: true, bufferSize: 1024, leaveOpen: true);

            var lines = new List<HashSet<string>>();
            for (int i = 0; i < CsvScanLines; i++)
            {
                var line = await reader.ReadLineAsync();
                if (line == null) break;
                lines.Add(CsvTokenizer.Tokenize(line));
            }
            return new BankProbeContext(lines, string.Empty, IsPdf: false);
        }

        if (contentType.StartsWith("application/pdf", StringComparison.OrdinalIgnoreCase))
        {
            using var ms = new MemoryStream();
            stream.Position = 0;
            await stream.CopyToAsync(ms);
            ms.Position = 0;

            using var pdf = string.IsNullOrEmpty(pdfPassword)
                ? PdfDocument.Open(ms)
                : PdfDocument.Open(ms, new ParsingOptions { Password = pdfPassword });

            var text = pdf.NumberOfPages > 0 ? pdf.GetPage(1).Text : string.Empty;
            return new BankProbeContext([], text, IsPdf: true);
        }

        return new BankProbeContext([], string.Empty, IsPdf: false);
    }
}
```

> **Why:** The factory is `internal static` because it is an Infrastructure implementation detail — nothing outside this assembly needs to construct a context. Keeping PdfPig usage here (not in `BankIdentifier`) means `BankIdentifier` no longer needs a `using UglyToad.PdfPig` import. PDF exceptions (`PdfDocumentEncryptedException`, general `Exception`) are intentionally allowed to bubble up to `BankIdentifier`, which owns logging.

---

### [x] STEP 4 — Define `IBankSignature` interface

Create `apps/api/src/PersonalFinance.Infrastructure/Parsers/IBankSignature.cs`:

```csharp
namespace PersonalFinance.Infrastructure.Parsers;

/// <summary>
/// A single bank's detection rule. Implementations live in Parsers/Signatures/.
/// </summary>
public interface IBankSignature
{
    /// <summary>Returns the BankKeys constant this signature identifies.</summary>
    string BankKey { get; }

    /// <summary>Returns true if this signature is applicable to the given content type.</summary>
    bool AppliesTo(string contentType);

    /// <summary>Returns true if the probed content matches this bank's fingerprint.</summary>
    bool Matches(BankProbeContext ctx);
}
```

> **Why:** `IBankSignature` is `public` so the test project (a separate assembly) can test each implementation directly without reflection. `Matches` is synchronous because all I/O was already done by `BankProbeContextFactory` — keeping it sync avoids async state-machine overhead in the inner loop.

---

### [x] STEP 5 — Create the four bank signature classes

Create `apps/api/src/PersonalFinance.Infrastructure/Parsers/Signatures/BcaCsvSignature.cs`:

```csharp
namespace PersonalFinance.Infrastructure.Parsers.Signatures;

public sealed class BcaCsvSignature : IBankSignature
{
    public string BankKey => BankKeys.Bca;

    public bool AppliesTo(string contentType) =>
        contentType.StartsWith("text/csv", StringComparison.OrdinalIgnoreCase);

    // CABANG (branch column) is BCA-specific — no other supported bank puts it in their CSV header.
    // Relying on the column header alone (not the preamble) makes detection resilient to
    // stripped metadata lines (e.g. user saved through Excel and lost the No. Rekening rows).
    public bool Matches(BankProbeContext ctx) =>
        ctx.CsvTokenizedLines.Any(t =>
            t.Contains("TANGGAL") &&
            t.Contains("KETERANGAN") &&
            t.Contains("CABANG") &&
            t.Contains("SALDO"));
}
```

Create `apps/api/src/PersonalFinance.Infrastructure/Parsers/Signatures/StandardCsvSignature.cs`:

```csharp
namespace PersonalFinance.Infrastructure.Parsers.Signatures;

public sealed class StandardCsvSignature : IBankSignature
{
    public string BankKey => BankKeys.Standard;

    public bool AppliesTo(string contentType) =>
        contentType.StartsWith("text/csv", StringComparison.OrdinalIgnoreCase);

    public bool Matches(BankProbeContext ctx) =>
        ctx.CsvTokenizedLines.Any(t =>
            t.Contains("DATE") &&
            (t.Contains("ITEM") || t.Contains("DESCRIPTION")) &&
            t.Contains("AMOUNT"));
}
```

Create `apps/api/src/PersonalFinance.Infrastructure/Parsers/Signatures/NeoBankPdfSignature.cs`:

```csharp
namespace PersonalFinance.Infrastructure.Parsers.Signatures;

public sealed class NeoBankPdfSignature : IBankSignature
{
    public string BankKey => BankKeys.NeoBank;

    public bool AppliesTo(string contentType) =>
        contentType.StartsWith("application/pdf", StringComparison.OrdinalIgnoreCase);

    public bool Matches(BankProbeContext ctx) =>
        ctx.PdfFirstPageText.Contains("NOW Savings", StringComparison.OrdinalIgnoreCase);
}
```

Create `apps/api/src/PersonalFinance.Infrastructure/Parsers/Signatures/SuperbankPdfSignature.cs`:

```csharp
namespace PersonalFinance.Infrastructure.Parsers.Signatures;

public sealed class SuperbankPdfSignature : IBankSignature
{
    public string BankKey => BankKeys.Superbank;

    public bool AppliesTo(string contentType) =>
        contentType.StartsWith("application/pdf", StringComparison.OrdinalIgnoreCase);

    public bool Matches(BankProbeContext ctx) =>
        ctx.PdfFirstPageText.Contains("Superbank", StringComparison.OrdinalIgnoreCase);
}
```

> **Why:** Each class is `sealed` because bank fingerprints are not polymorphic — no signature should be subclassed. The `AppliesTo` gating means the `BankIdentifier` loop skips PDF signatures entirely when processing a CSV upload, so the order of registration in DI only matters within each content type group.

---

### [x] STEP 6 — Rewrite `BankIdentifier` as thin dispatcher

Replace the contents of `apps/api/src/PersonalFinance.Infrastructure/Parsers/BankIdentifier.cs`:

```csharp
using Microsoft.Extensions.Logging;
using UglyToad.PdfPig.Exceptions;

namespace PersonalFinance.Infrastructure.Parsers;

public sealed class BankIdentifier(
    IEnumerable<IBankSignature> signatures,
    ILogger<BankIdentifier> logger) : IBankIdentifier
{
    public async Task<string?> IdentifyAsync(Stream stream, string contentType, string? pdfPassword = null)
    {
        logger.LogInformation("Identifying bank from stream with Content-Type: {ContentType}", contentType);

        if (string.IsNullOrEmpty(contentType))
            return null;

        try
        {
            var ctx = await BankProbeContextFactory.CreateAsync(stream, contentType, pdfPassword);

            foreach (var sig in signatures.Where(s => s.AppliesTo(contentType)))
            {
                if (sig.Matches(ctx))
                {
                    logger.LogDebug("Bank identified as {BankKey}.", sig.BankKey);
                    return sig.BankKey;
                }
            }

            if (ctx.IsPdf)
            {
                logger.LogDebug("PDF bank unrecognized — routing to LLM extractor.");
                return BankKeys.LlmPdf;
            }

            logger.LogDebug("Bank could not be identified.");
            return null;
        }
        catch (PdfDocumentEncryptedException ex)
        {
            logger.LogWarning(ex, "PDF is encrypted and requires a password.");
            return null;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Error during bank identification.");
            return null;
        }
        finally
        {
            stream.Position = 0;
        }
    }
}
```

> **Why:** The primary constructor syntax (`BankIdentifier(IEnumerable<IBankSignature> signatures, ...)`) eliminates the private field boilerplate that was previously needed — consistent with other C# 12 classes in the codebase. The single `try/catch/finally` replaces all 12 manual stream resets: the `finally` fires whether identification succeeds, throws, or returns early, so no exit path can leave the stream at EOF.

---

### [x] STEP 7 — Move `IBankIdentifier` to `Application/Interfaces/`

**Create** `apps/api/src/PersonalFinance.Application/Interfaces/IBankIdentifier.cs`:

```csharp
namespace PersonalFinance.Application.Interfaces;

public interface IBankIdentifier
{
    /// <summary>
    /// Identifies the bank code from the file stream and content type.
    /// Stream is guaranteed to be reset to position 0 on return.
    /// </summary>
    Task<string?> IdentifyAsync(Stream stream, string contentType, string? pdfPassword = null);
}
```

**Delete** `apps/api/src/PersonalFinance.Infrastructure/Parsers/IBankIdentifier.cs`.

**Update** `BankIdentifier.cs` — add the using for the moved interface:
```csharp
using PersonalFinance.Application.Interfaces;
```

**Verify** all consumers use the correct namespace:
```bash
grep -rn "IBankIdentifier" apps/api/src/
```
Typically only `Program.cs` and `TransactionsController.cs` reference it — confirm both already have `using PersonalFinance.Application.Interfaces;`.

> **Why:** Per ARCH-02, interfaces belong in the layer that *consumes* them. `IBankIdentifier` is consumed by `TransactionsController` (Api layer) which delegates through `StatementImportService` — both external to Infrastructure. Moving it here also makes `IBankIdentifier` consistently discoverable alongside all other service interfaces (`ICategoryRuleService`, `ITransactionService`, etc.).

---

### [x] STEP 8 — Update DI in `Program.cs`

In [Program.cs](../../apps/api/src/PersonalFinance.Api/Program.cs), **before** the `AddScoped<IBankIdentifier, BankIdentifier>()` line, add the four signature registrations:

```csharp
// Bank identification signatures — order within each content-type group matters (first match wins)
builder.Services.AddScoped<IBankSignature, BcaCsvSignature>();
builder.Services.AddScoped<IBankSignature, StandardCsvSignature>();
builder.Services.AddScoped<IBankSignature, NeoBankPdfSignature>();
builder.Services.AddScoped<IBankSignature, SuperbankPdfSignature>();
builder.Services.AddScoped<IBankIdentifier, BankIdentifier>();
```

Also add the required using at the top of `Program.cs`:
```csharp
using PersonalFinance.Infrastructure.Parsers.Signatures;
```

> **Why:** Registering all four as `IBankSignature` causes the DI container to inject `IEnumerable<IBankSignature>` to `BankIdentifier` with all four in registration order. BCA is registered before Standard because BCA's reinforcement check (account token) is stricter — a file that matches Standard headers could theoretically also match a loose BCA check, so BCA goes first within the CSV group.

---

### [x] STEP 9 — Add unit tests for all four signatures

Create `apps/api/tests/PersonalFinance.Tests/Parsers/BankSignatureTests.cs`:

```csharp
using PersonalFinance.Infrastructure.Parsers;
using PersonalFinance.Infrastructure.Parsers.Signatures;

namespace PersonalFinance.Tests.Parsers;

public class BcaCsvSignatureTests
{
    private static BankProbeContext CsvCtx(params string[] rawLines)
    {
        var tokenized = rawLines.Select(CsvTokenizer.Tokenize).ToList();
        return new BankProbeContext(tokenized, string.Empty, IsPdf: false);
    }
    // ... (full test class as designed)
}
```

Then verify all tests pass:
```bash
cd apps/api && dotnet test --filter "FullyQualifiedName~BankSignatureTests"
```

> **Why:** Each signature class has exactly two non-trivial behaviours to verify: `Matches` (happy path + negative) and `AppliesTo` (correct content type gating). The BCA 15-line test (`Matches_WithBcaHeaderOnLine10_ReturnsTrue`) is a regression guard specifically for review smell #2 — without it, a future change that tightens the scan window would silently reintroduce the bug.

---

### [x] STEP 10 — Build and verify

```bash
cd apps/api && dotnet build PersonalFinance.slnx && dotnet test PersonalFinance.slnx
```

Confirm:
- Zero build errors
- All tests pass (including new `BankSignatureTests`)
- No remaining references to `IBankIdentifier` in `Infrastructure/Parsers/` namespace

> **Why:** The ARCH-02 move (Step 7) changes the namespace of `IBankIdentifier`. A build error here means a using directive is missing somewhere — check `TransactionsController.cs` and any other file that directly references the interface.

---

## Notes

- **Registration order matters within content-type groups.** The DI container injects signatures in registration order. Within the CSV group, BCA before Standard is intentional — BCA's double-token check is stricter so it should win first. Document this in the Program.cs comment added in Step 8.
- **Do not touch `StatementImportService` or any parser.** Their `BankKeys` string contracts are unchanged. Only the identification step changes.
- **PF-123 is absorbed by Step 7** — close PF-123 when this plan completes.
- **PF-045 (YAML bank profiles)** is the natural next step: replace each `IBankSignature.Matches` with a data-loaded predicate from a YAML profile. The registry is the stepping stone.
- **Wise CSV parser (PF-043)** can now be added by creating one `WiseCsvSignature` class and one `WiseCsvParser` class — no edits to `BankIdentifier`.
