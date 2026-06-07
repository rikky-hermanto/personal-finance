# Cashflow Ingestion — Bank Statement Parser

The cashflow module ingests bank statements from five Indonesian banks, each producing data in a different format. This doc covers the parsing strategy, bank detection, validation pipeline, categorization, and the master schema that all sources converge to.

> **Context:** Cashflow is L1 of the Financial Pyramid (Foundations). It feeds transaction data to `JourneyScoringService` for L1 indicator scoring. The ingestion pipeline exists to make pyramid scores accurate, not as a standalone product.

---

## Parser Strategy: Hybrid Approach

The project uses a **hybrid parser strategy** — direct parsers for deterministic sources, LLM extraction for unstructured sources (PDFs, screenshots).

```
Upload (CSV / PDF / Image)
       │
       ├── Image (PNG/JPEG/WEBP) ──────────────────────────────────► LlmExtractionClient.ParseImageAsync
       │                                                                      │
       └── CSV / PDF                                                          │
              │                                                               │
              ▼                                                               │
         BankIdentifier                                                       │
         (IBankSignature chain)                                               │
              │                                                               │
              ├── BCA        ──► BcaCsvParser          (direct, zero-LLM)    │
              ├── STANDARD   ──► DefaultCsvParser       (generic CSV)        │
              ├── NEOBANK    ──► NeoBankPdfParser       (PdfPig + regex)     │
              ├── SUPERBANK  ──► LlmPdfParser           (LLM extraction)     │
              └── LLM_PDF    ──► LlmPdfParser           (unrecognised PDFs)  │
                                       │                                     │
                                       ▼                                     │
                                  LlmExtractionClient.ParsePdfAsync          │
                                       │                                     │
                                       └──────────────────────────── Python AI service
                                                                            │
                                       ┌────────────────────────────────────┘
                                       ▼
                             ITransactionPipelineService.ProcessAsync
                             (DateNormalizer → DecimalFixer →
                              CurrencyStandardizer → SchemaValidator →
                              LLM Categorization → DeduplicateCheck)
                                       │
                                       ▼
                             Account Resolution (AccountName → AccountId)
                                       │
                                       ▼
                                   PostgreSQL
```

**Why hybrid, not LLM-only?**

- **CSV banks (BCA, generic):** Column positions are fixed and known. Direct parsing costs zero tokens, runs in milliseconds, and is 100% accurate.
- **PDF/image banks (Superbank, NeoBank, Bank Jago):** Layout varies across statement versions. LLM extraction via Gemini (JSON mode) or Anthropic (`tool_use`) handles variable structure.

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

All parsed output — regardless of source — runs through `ITransactionPipelineService.ProcessAsync()` before persisting. The pipeline has six stages:

| Stage | What it does |
|-------|-------------|
| **DateNormalizer** | Sets `DateTimeKind.Utc` on all dates; converts to UTC |
| **DecimalFixer** | `Math.Abs(Math.Round(amountIdr, 2))` — normalizes amount sign and precision |
| **CurrencyStandardizer** | Normalizes `"Rp"` / `"Rp."` → `"IDR"`; uppercases all currency codes |
| **SchemaValidator** | Rejects rows with empty `Description`, zero `AmountIdr`, or invalid `Flow` (`"DB"` / `"CR"` only) |
| **LLM Categorization** | Rows still `"Uncategorized"` after parser-layer categorization go through 4-layer LLM fallback (see below) |
| **DeduplicateCheck** | `ITransactionService.FilterOutDuplicatesAsync()` — removes rows already in the database |

`ITransactionPipelineService` is used by `upload-preview-new` (the Storage-based stub). The primary `upload-preview` endpoint calls individual steps directly via `ITransactionService.IdentifyDuplicatesAsync()` for the preview UI, then `FilterOutDuplicatesAsync()` on submit.

→ For the `upload-preview-new` endpoint status, see [Dead Stubs](#dead-stubs) below.

---

## 4-Layer Categorization

Categorization runs in four layers, applied in order per transaction. Each layer can exit early:

| Layer | Mechanism | Applied by |
|-------|-----------|-----------|
| **Layer 0 — Source file** | Category column in CSV (master exports, Standard format) | Parser directly |
| **Layer 1 — Rule match** | `ICategoryRuleService.CategorizeBatchAsync()` — longest-keyword match against 106+ rules | Parser (all parsers call this) |
| **Layer 2 — Category presets** | `CategoryPresetService` seed — cold-start safe static mappings | Pipeline |
| **Layer 3 — LLM batch suggest** | `ILlmSuggestionClient.SuggestBatchAsync()` — batch merchant → category; high-confidence results auto-seed new rules | `TransactionPipelineService` |
| **Layer 4 — LLM single fallback** | `ILlmCategorizationClient.CategorizeAsync()` — per-transaction if still `"Uncategorized"` after batch suggest | `TransactionPipelineService` |

**Auto-seed threshold:** Confidence ≥ 0.85 causes a new `CategoryRule` to be written automatically, so the same transaction won't hit LLM next month.

**PII sanitization before LLM:** `SanitizeForLlm()` strips Indonesian phone numbers, `A/N ...` (atas nama) patterns, 7+ digit account numbers, and long alphanumeric reference IDs before sending descriptions to the LLM.

---

## Account Resolution

After parsing and pipeline, the controller calls `ResolveAccountIdsAsync()` to link each transaction's `AccountName` string to an actual `Account` entity UUID.

**Lookup order (per distinct wallet name):**

1. **Alias cache** — `WalletAccountAlias` table hit via `ResolveAliasesBatchAsync()`
2. **Normalized contains** — `NormalizeAccountName(wallet)` is substring of normalized `Account.Name`
3. **Token intersection** — tokenized wallet words ∩ tokenized account/institution name; score ≥ 0.5 threshold
4. **Auto-learn** — fuzzy matches are written to `WalletAccountAlias` so the next upload is a cache hit

The three Supabase calls (accounts, institutions, aliases) fire in parallel via `Task.WhenAll`.

---

## Master Schema

All banks converge to this unified schema before persisting. Fields marked **contract** are frozen across `TransactionDto.cs` (C#) and `TransactionResult` (Python `models.py`) — renaming either side without updating the other causes silent null values in PostgreSQL.

| Field | C# (`TransactionDto`) | Python (`TransactionResult`) | Type | Notes |
|-------|----------------------|------------------------------|------|-------|
| `date` | `Date` | `date` | string | ISO 8601 `YYYY-MM-DD` **[contract]** |
| `description` | `Description` | `description` | string | Original bank text **[contract]** |
| `remarks` | `Remarks` | `remarks` | string | Secondary description or memo; `""` if absent **[contract]** |
| `flow` | `Flow` | `flow` | `"DB"` \| `"CR"` | Debit or Credit **[contract]** |
| `type` | `Type` | `type` | `"Expense"` \| `"Income"` | Derived from flow + category context **[contract]** |
| `amount_idr` | `AmountIdr` | `amount_idr` | decimal | Always in IDR, always positive **[contract]** |
| `currency` | `Currency` | `currency` | ISO 4217 string | Default `"IDR"` **[contract]** |
| `exchange_rate` | `ExchangeRate` | `exchange_rate` | decimal? | FX rate (Wise / foreign-currency banks only) **[contract]** |
| `account_name` | `AccountName` | `account_name` | string | Bank name string from parser; transient — not written to DB, used only for `AccountId` resolution **[contract]** |
| `statement_balance` | `StatementBalance` | `statement_balance` | decimal? | Balance from bank statement row; used as dedup tie-break |
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

The active production path is `POST /api/transactions/upload-preview` (synchronous, direct parse).

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
| Generic CSV parser (Standard/Wise) | [apps/api/src/PersonalFinance.Infrastructure/Parsers/DefaultCsvParser.cs](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/DefaultCsvParser.cs) |
| LLM PDF router | [apps/api/src/PersonalFinance.Infrastructure/Parsers/LlmPdfParser.cs](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/LlmPdfParser.cs) |
| Shared amount parser | [apps/api/src/PersonalFinance.Infrastructure/Parsers/Shared/CsvAmountParser.cs](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/Shared/CsvAmountParser.cs) |
| LLM extraction client (.NET) | [apps/api/src/PersonalFinance.Infrastructure/External/LlmExtractionClient.cs](../../apps/api/src/PersonalFinance.Infrastructure/External/LlmExtractionClient.cs) |
| Statement import service (parser dispatch) | [apps/api/src/PersonalFinance.Application/Services/StatementImportService.cs](../../apps/api/src/PersonalFinance.Application/Services/StatementImportService.cs) |
| Validation pipeline | [apps/api/src/PersonalFinance.Application/Services/TransactionPipelineService.cs](../../apps/api/src/PersonalFinance.Application/Services/TransactionPipelineService.cs) |
| Upload + account resolution | [apps/api/src/PersonalFinance.Api/Controllers/TransactionsController.cs](../../apps/api/src/PersonalFinance.Api/Controllers/TransactionsController.cs) |
| Parser registration (DI) | [apps/api/src/PersonalFinance.Api/Program.cs](../../apps/api/src/PersonalFinance.Api/Program.cs) (lines 97–116) |
| Python extraction service | [services/ai-service/app/services/llm_parser.py](../../services/ai-service/app/services/llm_parser.py) |
| Superbank-specific prompt | [services/ai-service/app/prompts/superbank_v1.py](../../services/ai-service/app/prompts/superbank_v1.py) |
| TransactionDto (frozen contract) | [apps/api/src/PersonalFinance.Application/Dtos/TransactionDto.cs](../../apps/api/src/PersonalFinance.Application/Dtos/TransactionDto.cs) |
| Pydantic models (frozen contract) | [services/ai-service/app/models.py](../../services/ai-service/app/models.py) |

→ Bank profile YAML schema reference: [docs/design/bank-profiles-reference.md](../design/bank-profiles-reference.md)
→ Validation pipeline design notes: [docs/design/validation-pipeline.md](../design/validation-pipeline.md)

## Adding a New Bank

1. **Deterministic format?** → Implement `IBankStatementParser` in `.NET Infrastructure/Parsers/`. Register parser in `Program.cs` parser dict and add `BankKey` constant to `BankKeys.cs`.
2. **LLM format (PDF)?** → Add a bank-specific prompt in `services/ai-service/app/prompts/{bank}_v1.py` and register it in `_BANK_PROMPTS` dict in `llm_parser.py`. Route to `LlmPdfParser` in the parser dict.
3. Implement `IBankSignature` in `Parsers/Signatures/` with the bank's fingerprint. Register in `Program.cs` — order matters, more-specific signatures before more-generic ones.
4. Add a row to the Bank Profiles table in this document.
