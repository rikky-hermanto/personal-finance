# PF-046 — LLM Extraction Client: .NET → Python HTTP Bridge

> **GitHub Issue:** [#55](https://github.com/rikky-hermanto/personal-finance/issues/55)
> **Status:** In Progress
> **Started:** 2026-05-01

## Objective

Wire the end-to-end PDF extraction MVP so any non-BCA PDF uploaded through the existing UI gets parsed by the Python AI service instead of returning "Bank format not recognized." The .NET API currently only identifies NeoBank PDFs (hardcoded `"NOW Savings"` signature) — every other PDF falls through to `null` and a 400 error. This ticket adds the HTTP bridge (`ILlmExtractionClient` + `LlmExtractionClient`), a `LlmPdfParser` that slots into the existing parser-dictionary DI pattern, and a `BankIdentifier` fallback so any unrecognized PDF routes to `"LLM_PDF"`. No Supabase Storage, no Webhooks, no auth — the flow stays synchronous. Unblocks Superbank, Bank Jago, and any future PDF banks without writing bank-specific .NET parsers.

## Acceptance Criteria

- [ ] `ILlmExtractionClient` interface in `Application/Interfaces/`
- [ ] `LlmExtractionClient` typed `HttpClient` in `Infrastructure/External/` — POSTs multipart to `/parse-pdf`, deserializes `PdfParseResponse` → `List<TransactionDto>`
- [ ] `LlmPdfParser : IBankStatementParser` in `Infrastructure/Parsers/` — calls client, then `CategorizeBatchAsync`
- [ ] `BankIdentifier` returns `"LLM_PDF"` for any PDF not matched by existing signatures (fallback, not null)
- [ ] `Program.cs` registers `AddHttpClient<ILlmExtractionClient, LlmExtractionClient>` with 2-min timeout and `"LLM_PDF"` entry in parser dictionary
- [ ] `appsettings.Development.json` has `AiService:BaseUrl = "http://localhost:8000"` for local non-Docker runs
- [ ] Unit tests: `LlmExtractionClientTests` (mock HttpMessageHandler) and `LlmPdfParserTests` (mock client + category service)
- [ ] Uploading a non-NeoBank PDF through the UI returns a transaction preview (not a 400 error)

## Approach

Keep the existing synchronous upload-preview-submit flow — no async job model, no polling, no Realtime. The browser POSTs multipart to `/api/transactions/upload-preview`, gets back a transaction array, same as today for CSVs. The only change is what happens server-side when the bank code resolves to `"LLM_PDF"`: the new `LlmPdfParser` forwards the stream to Python via HTTP and maps the response.

NeoBank stays on its existing PdfPig regex parser (zero LLM cost, working). `bank_hint` is passed as `null` — the LLM infers bank context from PDF content, which is sufficient for MVP. Bank-specific hint detection and prompts are a follow-up.

Out of scope: Supabase Storage, Database Webhooks, Realtime status updates, bank-specific prompts, Supabase Auth.

## Affected Files

| File | Change |
|------|--------|
| `apps/api/src/PersonalFinance.Application/Interfaces/ILlmExtractionClient.cs` | Create — interface |
| `apps/api/src/PersonalFinance.Infrastructure/External/LlmExtractionClient.cs` | Create — typed HttpClient + `LlmExtractionException` |
| `apps/api/src/PersonalFinance.Infrastructure/Parsers/LlmPdfParser.cs` | Create — `IBankStatementParser` wrapping the client |
| `apps/api/src/PersonalFinance.Infrastructure/Parsers/BankIdentifier.cs` | Modify — add `"LLM_PDF"` fallback for unrecognized PDFs |
| `apps/api/src/PersonalFinance.Api/Program.cs` | Modify — register HttpClient + `LlmPdfParser` + parser dict entry |
| `apps/api/src/PersonalFinance.Api/appsettings.Development.json` | Modify — add `AiService:BaseUrl` |
| `apps/api/tests/PersonalFinance.Tests/Infrastructure/LlmExtractionClientTests.cs` | Create — unit tests |
| `apps/api/tests/PersonalFinance.Tests/Infrastructure/LlmPdfParserTests.cs` | Create — unit tests |

---

## TODO

### [ ] STEP 1 — Create `ILlmExtractionClient` interface
```csharp
// Application/Interfaces/ILlmExtractionClient.cs
Task<List<TransactionDto>> ParsePdfAsync(
    Stream pdf, string fileName, string? bankHint, string? password,
    CancellationToken ct = default);
```

> **Why:** Application layer owns the interface (ARCH-02). Keeping it in `Application/Interfaces/` means `LlmPdfParser` (in Infrastructure) depends inward — it references the interface, not the concrete HttpClient. Tests can mock this interface without touching HttpClient plumbing.

### [ ] STEP 2 — Create `LlmExtractionClient` + `LlmExtractionException`
```csharp
// Infrastructure/External/LlmExtractionClient.cs
// - Constructor: HttpClient (injected by IHttpClientFactory)
// - POST multipart/form-data to /parse-pdf with fields: file (StreamContent), bank_hint, password
// - Deserialize PdfParseResponse (snake_case JSON) → List<TransactionDto>
// - Map: date string "YYYY-MM-DD" → DateTime.Parse(..., DateTimeStyles.AssumeUniversal)
// - Map: amount_idr float → (decimal)
// - HTTP 422 → throw NotSupportedException("AI service: invalid PDF format")
// - HTTP 502 → throw LlmExtractionException(detail from body)
// - Other non-success → throw LlmExtractionException("AI service unavailable")
```

> **Why:** Typed `HttpClient` registered via `AddHttpClient<I, Impl>` gets its `BaseAddress` and `Timeout` set once at registration — no magic strings scattered around. Snake_case mapping is critical: Python returns `amount_idr` / `exchange_rate`, .NET expects `AmountIdr` / `ExchangeRate` — use `JsonNamingPolicy.SnakeCaseLower`. `LlmExtractionException` lets the controller's existing `catch (Exception)` → 500 handler work without leaking detail (ERR-01).

### [ ] STEP 3 — Create `LlmPdfParser`
```csharp
// Infrastructure/Parsers/LlmPdfParser.cs
public class LlmPdfParser : IBankStatementParser
{
    // Constructor: ILlmExtractionClient, ICategoryRuleService, ILogger<LlmPdfParser>
    public async Task<List<TransactionDto>> ParseAsync(Stream fileStream, string? password = null)
    {
        var transactions = await _client.ParsePdfAsync(fileStream, "upload.pdf", bankHint: null, password);
        await _categoryRuleService.CategorizeBatchAsync(transactions);
        _logger.LogInformation("LLM PDF parsing complete. Parsed {Count} transactions.", transactions.Count);
        return transactions;
    }
}
```

> **Why:** Mirrors the `NeoBankPdfParser` pattern exactly — call extractor, call `CategorizeBatchAsync`, return. Calling `CategorizeBatchAsync` here (not in the controller) keeps the N+1 rule (PERF-01): rules loaded once for the batch, not once per row. The `LlmExtractionException` propagates up to the controller's catch block which returns 500 with a safe message (already in place from PF-028).

### [ ] STEP 4 — Update `BankIdentifier` fallback
```csharp
// After the NeoBank check block (~line 62), before stream.Position = 0 at line 70:
// Replace the existing "fall through to null" with:
stream.Position = 0;
_logger.LogDebug("PDF bank unrecognized — routing to LLM extractor.");
return "LLM_PDF";
```

> **Why:** Currently any PDF that isn't NeoBank returns `null`, causing the controller to return 400 "Bank format not recognized" before the import even starts. Returning `"LLM_PDF"` routes it to `LlmPdfParser` instead. NeoBank keeps its early-return path unchanged — it never reaches this fallback.

### [ ] STEP 5 — Register in `Program.cs`
```csharp
// Add HttpClient registration (after builder.Services.AddSupabase):
builder.Services.AddHttpClient<ILlmExtractionClient, LlmExtractionClient>(client =>
{
    client.BaseAddress = new Uri(
        builder.Configuration["AiService:BaseUrl"] ?? "http://localhost:8000");
    client.Timeout = TimeSpan.FromMinutes(2);
});

// Add parser class registration (with existing scoped parsers):
builder.Services.AddScoped<LlmPdfParser>();

// Add to parser dictionary (in IStatementImportService factory):
{ "LLM_PDF", serviceProvider.GetRequiredService<LlmPdfParser>() }
```

> **Why:** `AddHttpClient<I, Impl>` integrates with `IHttpClientFactory` — handles socket lifecycle, DNS refresh, and resilience correctly (avoids socket exhaustion from `new HttpClient()`). 2-min timeout accommodates slow LLM responses without hanging indefinitely. The `??` fallback ensures it works if the config key is missing (e.g., tests).

### [ ] STEP 6 — Add `AiService:BaseUrl` to `appsettings.Development.json`
```json
"AiService": {
  "BaseUrl": "http://localhost:8000"
}
```

> **Why:** Docker compose injects `AiService__BaseUrl` as an env var so it works in containers. Local non-Docker runs (`dotnet run`) won't have that env var — without this entry the client falls back to the hardcoded default in Step 5. Better to make it explicit and visible in config.

### [ ] STEP 7 — Write `LlmExtractionClientTests`
```csharp
// tests/PersonalFinance.Tests/Infrastructure/LlmExtractionClientTests.cs
// Test cases:
// - ParsePdfAsync_ValidResponse_ReturnsMappedTransactionDtos
// - ParsePdfAsync_Http422_ThrowsNotSupportedException
// - ParsePdfAsync_Http502_ThrowsLlmExtractionException
// - ParsePdfAsync_AmountIdr_MappedCorrectlyAsDecimal
// Pattern: mock HttpMessageHandler → return canned JSON → assert output
```

> **Why:** The field mapping (snake_case → PascalCase, float → decimal, date string → DateTime) is the most likely source of silent data corruption. These tests catch mapping regressions before they reach production data. Use a real `HttpClient` constructed around a mock `HttpMessageHandler` — don't mock `HttpClient` itself (it's not designed for mocking).

### [ ] STEP 8 — Write `LlmPdfParserTests`
```csharp
// tests/PersonalFinance.Tests/Infrastructure/LlmPdfParserTests.cs
// Test cases:
// - ParseAsync_ValidResponse_CallsCategorizeBatchAsync
// - ParseAsync_ClientThrows_PropagatesException
// Pattern: mock ILlmExtractionClient + ICategoryRuleService via Moq
```

> **Why:** Confirms the `CategorizeBatchAsync` is called exactly once on the returned list (N+1 guard) and that exceptions from the client propagate cleanly without being swallowed.

### [ ] STEP 9 — Build + test
```bash
cd apps/api && dotnet build PersonalFinance.slnx && dotnet test
```

> **Why:** Compilation catches interface mismatches and missing DI registrations before any manual testing.

### [ ] STEP 10 — Smoke test end-to-end
Start the AI service (`cd services/ai-service && uvicorn app.main:app --reload --port 8000`) and API (`dotnet run --project src/PersonalFinance.Api`), then upload a non-NeoBank PDF at `http://localhost:8080`. Confirm preview shows extracted transactions.

> **Why:** Unit tests verify the parts; this verifies the whole. The multipart request format, JSON deserialization, and timeout setting are all exercised only under real network conditions.

### [ ] STEP 11 — Update kanban
Move PF-046 to Done in [GitHub Project #4](https://github.com/users/rikky-hermanto/projects/4), close issue #55, update `.kanban/BOARD.md`.

## Notes

- Python `POST /parse-pdf` accepts `bank_hint` as optional form field — passing `null` is valid; the LLM uses PDF content to infer the bank
- Python returns `wallet: ""` by default when no bank is identified — `LlmExtractionClient` should keep it as-is; category rules will still apply
- `LlmExtractionException` needs to be a new class; suggested location: `Infrastructure/External/LlmExtractionException.cs`
- The existing controller `catch (Exception)` block (line 100–103 in `TransactionsController.cs`) already returns a safe 500 message — `LlmExtractionException` will be caught there without leaking details (PF-028 already done)
- PF-050 (Docker Compose ai-service) is already done — `ai-service` container is wired and port 8000 is exposed
