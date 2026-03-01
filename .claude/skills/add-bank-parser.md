---
name: add-bank-parser
description: Add a new bank statement parser for CSV or PDF import
---

# Add Bank Parser

Add support for parsing a new bank's statement format (CSV or PDF).

Ask the user for:
- **Bank name** (e.g., "Mandiri", "BNI", "CIMB")
- **File format** (CSV or PDF)
- **Sample data** — a few lines of the file to understand the format

## Steps

### 1. Create Parser
Create `api/src/PersonalFinance.Infrastructure/Parsers/{BankName}{Format}Parser.cs`
- Implement `IBankStatementParser`
- Reference patterns:
  - CSV: see `BcaCsvParser.cs` or `DefaultCsvParser.cs`
  - PDF: see `NeoBankPdfParser.cs` (uses PdfPig library)
- Return `List<TransactionDto>` with these fields mapped:
  - `Date` — parsed from bank format
  - `Description` — main transaction description
  - `Remarks` — additional notes/reference
  - `Flow` — `"DB"` (debit) or `"CR"` (credit)
  - `Type` — `"Expense"` or `"Income"`
  - `AmountIdr` — transaction amount
  - `Currency` — default `"IDR"`
  - `Wallet` — bank name (e.g., `"Mandiri"`)
- Apply category rules via `ICategoryRuleService.CategorizeAsync()` for each transaction

### 2. Add Bank Detection
Update `api/src/PersonalFinance.Infrastructure/Parsers/BankIdentifier.cs`:
- Add detection logic in `IdentifyAsync()`:
  - For CSV: check header row content in first few lines
  - For PDF: check first page text for bank-specific markers (logo text, bank name)
- Return a unique bank code string (e.g., `"MANDIRI"`)

### 3. Register Parser in DI
Update `api/src/PersonalFinance.Api/Program.cs`:
```csharp
builder.Services.AddScoped<IBankStatementParser, {BankName}{Format}Parser>();
```

### 4. Add Tests
Create tests for the new parser covering:
- Correct field mapping from sample data
- Edge cases (empty fields, unusual amounts, date formats)
- Bank identification from sample file headers

### 5. Verify End-to-End
- Start Docker: `docker compose up --build`
- Upload a sample file via POST to `/api/transactions/upload-preview`
- Verify transactions are parsed correctly in the response
- Submit via POST to `/api/transactions/submit`
- Verify transactions appear in GET `/api/transactions`
