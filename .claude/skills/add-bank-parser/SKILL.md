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
| YES — CSV with fixed columns | Direct parser (.NET) | Steps A1–A5 below |
| NO — PDF or screenshot | LLM extractor (Python) | Steps B1–B5 below |

---

## Path A: Direct CSV Parser (.NET)

### A1. Check Bank Detection
Open `apps/api/src/PersonalFinance.Infrastructure/Parsers/BankIdentifier.cs`.
- If the bank is not yet detected, add a detection block in `IdentifyAsync()`:
  - Check header row tokens (use `CsvTokenizer.Tokenize()`)
  - Return `BankKeys.{BankName}` on match
- Add the constant to `BankKeys.cs` if it doesn't exist

### A2. Create Parser
Create `apps/api/src/PersonalFinance.Infrastructure/Parsers/{BankName}CsvParser.cs`
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

### A3. Register in DI
Update `apps/api/src/PersonalFinance.Api/Program.cs`:

```csharp
// 1. Register the parser class
builder.Services.AddScoped<{BankName}CsvParser>();

// 2. Add to the dictionary-based factory (inside the IStatementImportService registration block)
{ BankKeys.{BankName}, serviceProvider.GetRequiredService<{BankName}CsvParser>() },
```

### A4. Add Tests
Create `apps/api/tests/PersonalFinance.Tests/Parsers/{BankName}CsvParserTests.cs`:
- Correct field mapping from sample data
- Edge cases: empty fields, unusual amounts, date formats
- `BankIdentifier` correctly returns `BankKeys.{BankName}` for sample headers

### A5. Verify End-to-End
- Start stack: `npm start` (or `supabase start` + `dotnet run` + `npm run dev`)
- Upload a sample file via `POST /api/transactions/upload-preview`
- Verify parsed transactions in the response
- Submit via `POST /api/transactions/submit`

---

## Path B: LLM Extractor (PDF / Screenshot)

The .NET side routes PDF banks to the Python AI service. Check first whether detection and routing are already wired:

- **Detection**: `BankIdentifier.cs` — is there already a block returning `BankKeys.{BankName}`?
- **Routing**: `Program.cs` — is `BankKeys.{BankName}` already mapped in the `IStatementImportService` dictionary?

If both exist, **the .NET side is complete**. If not, follow B1–B2.

### B1. Add Bank Detection (if missing)
Update `apps/api/src/PersonalFinance.Infrastructure/Parsers/BankIdentifier.cs`:
- In the `application/pdf` branch of `IdentifyAsync()`, add a text-match block:
  ```csharp
  else if (firstPageText.Contains("BankMarker", StringComparison.OrdinalIgnoreCase))
  {
      _logger.LogDebug("Bank identified as {BankName}.");
      stream.Position = 0;
      return BankKeys.{BankName};
  }
  ```
- Add the constant to `BankKeys.cs`

### B2. Wire Routing in DI (if missing)
Update `apps/api/src/PersonalFinance.Api/Program.cs` — add to the `IStatementImportService` dictionary:
```csharp
{ BankKeys.{BankName}, serviceProvider.GetRequiredService<LlmPdfParser>() },
```
No new .NET parser class is needed — `LlmPdfParser` handles all PDF banks via the Python AI service.

### B3. Create Python Extractor
Create `services/ai-service/app/providers/{bank_name}.py` (or add a bank-specific prompt).

The Python AI service receives the PDF via `POST /parse-pdf`. The extraction is handled by `LlmParser` in `services/ai-service/app/services/llm_parser.py`. If the bank needs a custom prompt or pre-processing, add it there using the `bank_hint` parameter already threaded through from `LlmExtractionClient.ParsePdfAsync()`.

- Use `tool_use` with `temperature=0.0` (see `.claude/rules/ai-service.md` — mandatory)
- Include bank-specific date format, decimal convention, and 2–3 sanitized example rows in the prompt
- Return fields matching the frozen `TransactionDto` contract (see `.claude/rules/ai-service.md`)
- Log `response.usage.input_tokens` and `response.usage.output_tokens`

### B4. Add Tests

**.NET side** (if you added B1/B2):
- `BankIdentifier` returns `BankKeys.{BankName}` for a sample PDF with the bank marker

**Python side**:
- Create `services/ai-service/tests/test_{bank_name}_extractor.py`
- Mock `anthropic.AsyncAnthropic` — never call the real API in tests (see `.claude/rules/ai-service.md` for the canonical mock pattern)
- Cover: correct field extraction, `stop_reason == "max_tokens"` error path, malformed LLM output

### B5. Verify End-to-End
- Start stack: `npm start` (or `supabase start` + `dotnet run` + `uvicorn` + `npm run dev`)
- Upload a real sample PDF via `POST /api/transactions/upload-preview`
- Verify the Python service log shows the correct bank hint and token counts
- Verify parsed transactions in the response
- Submit and confirm they appear in `GET /api/transactions`
