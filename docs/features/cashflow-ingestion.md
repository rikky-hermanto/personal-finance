# Cashflow Ingestion — Bank Statement Parser

> **Code reviewed:** 2026-10-08. Implemented call paths are distinguished from the experimental pipeline; runtime checks were not rerun.

The cashflow module combines registered BCA/NeoBank/Superbank signatures, standard CSV mapping and generic AI extraction. A dedicated Wise+FX CSV parser remains absent. This doc covers the parsing strategy, bank detection, validation pipeline, categorization, and the master schema that all sources converge to.

> **Context:** Cashflow is L1 of the Financial Pyramid (Foundations). It feeds transaction data to `JourneyScoringService` for L1 indicator scoring. The ingestion pipeline exists to make pyramid scores accurate, not as a standalone product.

---

## Parser Strategy: Hybrid Approach

The project uses a **hybrid parser strategy** — direct parsers for deterministic sources, LLM extraction for unstructured sources (PDFs, screenshots).

```text
Standard upload-preview
  ├─ CSV/PDF → BankIdentifier → registered parser
  │   ├─ BCA / standard CSV → deterministic parse + history/rules/presets
  │   ├─ NeoBank PDF → deterministic PdfPig/regex parse
  │   └─ Superbank / generic readable PDF → FastAPI extraction + history/rules/presets
  └─ Image → FastAPI vision extraction
      → resolve AccountName to AccountId → tag duplicates → return preview
      → optional bulk Suggest (separate category suggestion endpoint)
      → user review/edit → submit nonduplicates + file hash/alias
      → background embedding enrichment + transaction INSERT realtime notification

Experimental upload-preview-new
  ├─ CSV → Storage roundtrip → parser → TransactionPipelineService → preview
  └─ PDF/image → Storage → 202 processing_id → no completing worker yet
```

**Why hybrid, not LLM-only?**

- **BCA/standard CSV and NeoBank PDF:** Deterministic parsers avoid extraction-model calls. Accuracy and runtime depend on supported format/fixtures; no universal 100% accuracy or latency claim is established.
- **Other readable PDFs and screenshots:** Structured Gemini/Anthropic extraction handles variable structure; NeoBank PDF uses a direct parser. Outputs still need review.

---

## Bank Detection: IBankSignature Chain

`BankIdentifier` implements `IBankIdentifier`. Before the chain runs, `BankProbeContextFactory.CreateAsync()` reads the file once and builds a `BankProbeContext` snapshot — this eliminates repeated stream seeks and repeated PDF parsing across the chain.

```
BankProbeContext {
    CsvTokenizedLines:   List<HashSet<string>>  // first 15 lines tokenized (CSV only)
    PdfFirstPageText:    string                 // first page text via PdfPig (PDF only)
    IsPdf:               bool
}
```

Each `IBankSignature` implementation declares:
- `BankKey` — the `BankKeys` constant it identifies
- `AppliesTo(contentType)` — coarse filter (e.g. `text/csv` only, `application/pdf` only)
- `Matches(ctx)` — the actual fingerprint check

**Registration order matters** — first match wins within each content-type group.

| Order | Signature | Content-Type | Fingerprint |
|-------|-----------|-------------|-------------|
| 1 | `BcaCsvSignature` | `text/csv` | Header contains `TANGGAL` + `KETERANGAN` + `CABANG` + `SALDO` |
| 2 | `StandardCsvSignature` | `text/csv` | Header contains `DATE` + (`ITEM` or `DESCRIPTION`) + `AMOUNT` |
| 3 | `NeoBankPdfSignature` | `application/pdf` | First-page text contains `"NOW Savings"` |
| 4 | `SuperbankPdfSignature` | `application/pdf` | First-page text contains `"Superbank"` |
| — | *(fallback)* | `application/pdf` | No signature matched → `BankKeys.LlmPdf` |

`BankKeys.LlmPdf` is a sentinel constant, not a real bank. Any PDF that doesn't match a signature falls through to it and is routed to `LlmPdfParser`. If an image is uploaded, `BankIdentifier` is skipped entirely — images go directly to `LlmExtractionClient.ParseImageAsync`.

---

## Bank Profiles

| Bank | Format | BankKey | Parser | Special Handling |
|------|--------|---------|--------|-----------------|
| BCA | CSV | `BCA` | `BcaCsvParser` | Semantic-anchor: scans up to 15 lines for `TANGGAL/KETERANGAN/JUMLAH/SALDO`; detects delimiter (`,` / `;` / `\t`); `CABANG` column = BCA-unique fingerprint |
| NeoBank | PDF | `NEOBANK` | `NeoBankPdfParser` | PdfPig text extraction + regex (`dd MMM yyyy`); amount sign (`-`/`+`) determines `flow`; balance from last 2 numeric matches per entry |
| Superbank | PDF | `SUPERBANK` | `LlmPdfParser` | Routes to LLM extraction; bank-specific prompt in Python `app/prompts/superbank_v1.py` — but currently `LlmPdfParser` passes `bankHint: null` to the client, so the Superbank prompt is NOT applied via the BankIdentifier path (see note below) |
| Bank Jago | Screenshot | *(no BankKey)* | `LlmExtractionClient` | Image path bypasses BankIdentifier; `bankHint` passed from frontend `[FromForm]` parameter |
| Standard / Wise | CSV | `STANDARD` | `DefaultCsvParser` | Generic CSV fallback; auto-detects delimiter; maps `DATE`, `ITEM`, `DESCRIPTION`, `AMOUNT`, `BALANCE`, `WALLET` / `BankAccount` / `Account` headers case-insensitively |
| Unrecognised PDF | PDF | `LLM_PDF` | `LlmPdfParser` | Generic LLM extraction; `bankHint: null` (no bank-specific prompt) |

> **Note on Superbank bank_hint gap (PF-128):** `IBankStatementParser.ParseAsync()` has no `bankHint` parameter. `LlmPdfParser` always calls `ParsePdfAsync(..., bankHint: null)`. The Superbank-specific prompt in `app/prompts/superbank_v1.py` is reachable only when `bank_hint` is supplied directly to `POST /parse-pdf` — it is currently not triggered by the BankIdentifier → LlmPdfParser routing path. This is known tech debt.

---

## Validation Pipeline

`ITransactionPipelineService.ProcessAsync()` is implemented but only called by the CSV branch of experimental `upload-preview-new`. Standard `upload-preview` does not call it. The service implements these stages after parser-level categorization:

| Stage | What it does |
|-------|-------------|
| **DateNormalizer** | Relabels unspecified timestamps UTC; converts timestamps with a known kind to UTC (existing behavior, not a timezone-correctness guarantee) |
| **DecimalFixer** | `Math.Abs(Math.Round(amountIdr, 2))` — normalizes amount sign and precision |
| **CurrencyStandardizer** | Normalizes `"Rp"` / `"Rp."` → `"IDR"`; uppercases all currency codes |
| **SchemaValidator** | Rejects rows with empty `Description`, zero `AmountIdr`, or invalid `Flow` (`"DB"` / `"CR"` only) |
| **LLM Categorization** | Rows still `"Uncategorized"` try merchant batch suggestions then residual `/categorize` |
| **DeduplicateCheck** | `ITransactionService.FilterOutDuplicatesAsync()` — removes rows already in the database |

`ITransactionPipelineService` is used by `upload-preview-new` (the Storage-based stub). The primary `upload-preview` endpoint calls individual steps directly via `ITransactionService.IdentifyDuplicatesAsync()` for the preview UI, then `FilterOutDuplicatesAsync()` on submit.

→ For the `upload-preview-new` endpoint status, see [Dead Stubs](#dead-stubs) below.

---

## Categorization call paths

CategoryRuleService preserves populated categories, tries exact normalized description/remarks history, then flow/type-aware user rules and presets. BCA/standard/LLM PDF parsers call it; this is not a promise that every image/PDF goes through the full pipeline.

The experimental CSV pipeline separately calls merchant batch suggestions and residual /categorize. Residual rule seeding requires rule_seed_allowed plus confidence >=0.85; Jev never permits seeding. Bulk preview Suggest calls /suggest-categories separately and is unchanged by the Jev switch. Sanitization exists for merchant suggestion patterns, not complete PII protection of every provider input.

See the [categorization reference](../architecture/categorization-pipeline.md) for the actual order, acceptance boundaries and opt-in Jev status.

---

## Account Resolution

After standard parsing (or the experimental CSV pipeline), the controller calls `ResolveAccountIdsAsync()` to link each transaction's `AccountName` string to an actual `Account` entity UUID.

**Lookup order (per distinct wallet name):**

1. **Alias cache** — `WalletAccountAlias` table hit via `ResolveAliasesBatchAsync()`
2. **Normalized contains** — `NormalizeAccountName(wallet)` is substring of normalized `Account.Name`
3. **Token intersection** — tokenized wallet words ∩ tokenized account/institution name; score ≥ 0.5 threshold
4. **Auto-learn** — fuzzy matches are written to `WalletAccountAlias` so the next upload is a cache hit

The three Supabase calls (accounts, institutions, aliases) fire in parallel via `Task.WhenAll`.

---

## Master Schema

All banks converge to this unified schema before persisting. Fields marked **contract** must be mapped deliberately between `TransactionDto.cs` (C#), the extraction client and `TransactionResult` (Python). C# uses decimal/DateTime, while Python extraction retains float/string values; these are not identical validation/serialization contracts.

| Field | C# (`TransactionDto`) | Python (`TransactionResult`) | Type | Notes |
|-------|----------------------|------------------------------|------|-------|
| `date` | `Date` | `date` | C# DateTime / Python string | ISO 8601 input **[contract]** |
| `description` | `Description` | `description` | string | Original bank text **[contract]** |
| `remarks` | `Remarks` | `remarks` | string | Secondary description or memo; `""` if absent **[contract]** |
| `flow` | `Flow` | `flow` | `"DB"` \| `"CR"` | Debit or Credit **[contract]** |
| `type` | `Type` | `type` | C# string / Python Expense or Income | C# also uses Asset Transfer; consumers must map deliberately **[contract]** |
| `amount_idr` | `AmountIdr` | `amount_idr` | C# decimal / Python float | Canonical IDR amount; review parser/normalization behavior **[contract]** |
| `currency` | `Currency` | `currency` | ISO 4217 string | Default `"IDR"` **[contract]** |
| `exchange_rate` | `ExchangeRate` | `exchange_rate` | C# decimal? / Python float? | Optional FX contract; no dedicated Wise parser **[contract]** |
| `account_name` | `AccountName` | `account_name` | string | Bank name string from parser; transient — not written to DB, used only for `AccountId` resolution **[contract]** |
| `statement_balance` | `StatementBalance` | `statement_balance` | C# decimal? / Python float? | Statement balance contract; used as dedup tie-break |
| `category` | `Category` | `category` | string | Default `"Uncategorized"`; overwritten by categorization pipeline |
| `raw_text` | *(not mapped)* | `raw_text` | string | Original bank line for audit; Python-only, not sent to C# |
| `account_id` | `AccountId` | *(not in Python)* | `Guid?` | Resolved post-parse by `ResolveAccountIdsAsync()` |
| `is_duplicate` | `IsDuplicate` | *(not in Python)* | `bool` | Flag set by `IdentifyDuplicatesAsync()` for the preview UI |

> **Warning:** Any rename of a **[contract]** field requires updating both `TransactionDto.cs` and `models.py` in the same commit. See governance rule THINK-05.

---

## Dead Stubs

**`POST /api/transactions/upload-preview-new`** — Do not call from the frontend. This is a stub for the future event-driven pipeline (PF-S11):

- **For PDFs/images:** Uploads to Supabase Storage bucket `bank-statements/` and returns `202 Accepted`. The intent is that a Database Webhook fires → Python AI service extracts → Realtime pushes result to frontend. That webhook pipeline does not yet exist. The 202 is a dead end.
- **For CSVs:** Falls back to synchronous parse with an unnecessary Storage round-trip.

The active frontend path is `POST /api/transactions/upload-preview` (synchronous, direct parse).

---

## Key Source Files

| What | Path |
|------|------|
| Bank identifier (IBankSignature chain) | [apps/api/src/PersonalFinance.Infrastructure/Parsers/BankIdentifier.cs](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/BankIdentifier.cs) |
| IBankSignature interface | [apps/api/src/PersonalFinance.Infrastructure/Parsers/IBankSignature.cs](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/IBankSignature.cs) |
| BankProbeContext + factory | [apps/api/src/PersonalFinance.Infrastructure/Parsers/BankProbeContext.cs](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/BankProbeContext.cs) · [BankProbeContextFactory.cs](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/BankProbeContextFactory.cs) |
| Signature implementations | [apps/api/src/PersonalFinance.Infrastructure/Parsers/Signatures/](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/Signatures/) |
| BankKeys constants | [apps/api/src/PersonalFinance.Infrastructure/Parsers/BankKeys.cs](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/BankKeys.cs) |
| BCA CSV parser | [apps/api/src/PersonalFinance.Infrastructure/Parsers/BcaCsvParser.cs](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/BcaCsvParser.cs) |
| NeoBank PDF parser | [apps/api/src/PersonalFinance.Infrastructure/Parsers/NeoBankPdfParser.cs](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/NeoBankPdfParser.cs) |
| Generic CSV parser (standard format) | [apps/api/src/PersonalFinance.Infrastructure/Parsers/DefaultCsvParser.cs](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/DefaultCsvParser.cs) |
| LLM PDF router | [apps/api/src/PersonalFinance.Infrastructure/Parsers/LlmPdfParser.cs](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/LlmPdfParser.cs) |
| Shared amount parser | [apps/api/src/PersonalFinance.Infrastructure/Parsers/Shared/CsvAmountParser.cs](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/Shared/CsvAmountParser.cs) |
| LLM extraction client (.NET) | [apps/api/src/PersonalFinance.Infrastructure/External/LlmExtractionClient.cs](../../apps/api/src/PersonalFinance.Infrastructure/External/LlmExtractionClient.cs) |
| Statement import service (parser dispatch) | [apps/api/src/PersonalFinance.Application/Services/StatementImportService.cs](../../apps/api/src/PersonalFinance.Application/Services/StatementImportService.cs) |
| Validation pipeline | [apps/api/src/PersonalFinance.Application/Services/TransactionPipelineService.cs](../../apps/api/src/PersonalFinance.Application/Services/TransactionPipelineService.cs) |
| Upload + account resolution | [apps/api/src/PersonalFinance.Api/Controllers/TransactionsController.cs](../../apps/api/src/PersonalFinance.Api/Controllers/TransactionsController.cs) |
| Parser registration (DI) | [apps/api/src/PersonalFinance.Api/Program.cs](../../apps/api/src/PersonalFinance.Api/Program.cs) |
| Python extraction service | [services/ai-service/app/services/llm_parser.py](../../services/ai-service/app/services/llm_parser.py) |
| Superbank-specific prompt | [services/ai-service/app/prompts/superbank_v1.py](../../services/ai-service/app/prompts/superbank_v1.py) |
| TransactionDto (frozen contract) | [apps/api/src/PersonalFinance.Application/Dtos/TransactionDto.cs](../../apps/api/src/PersonalFinance.Application/Dtos/TransactionDto.cs) |
| Pydantic models (frozen contract) | [services/ai-service/app/models.py](../../services/ai-service/app/models.py) |

→ [Current status and parser gaps](../STATUS.md#ingestion-boundaries)
→ [Categorization and caller reference](../architecture/categorization-pipeline.md)

## Adding a New Bank

1. **Deterministic format?** → Implement `IBankStatementParser` in `.NET Infrastructure/Parsers/`. Register parser in `Program.cs` parser dict and add `BankKey` constant to `BankKeys.cs`.
2. **LLM format (PDF)?** → Add a bank-specific prompt in `services/ai-service/app/prompts/{bank}_v1.py` and register it in `_BANK_PROMPTS` dict in `llm_parser.py`. Route to `LlmPdfParser` in the parser dict and extend/verify bank-hint propagation; registering a prompt alone does not make the normal .NET path select it.
3. Implement `IBankSignature` in `Parsers/Signatures/` with the bank's fingerprint. Register in `Program.cs` — order matters, more-specific signatures before more-generic ones.
4. Add a row to the Bank Profiles table in this document.
