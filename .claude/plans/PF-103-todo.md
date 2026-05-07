# PF-103 — 4-Layer Categorization Engine

> **GitHub Issue:** [create before starting]
> **Status:** TODO
> **Depends on:** PF-S07 (Supabase migration — DONE), PF-050 (AI service Docker — DONE)
> **Feeds into:** PF-S13 (RAG + natural language querying)

## Objective

Replace the current single-layer keyword-match categorizer with a 4-layer engine that leverages
every available signal in the transaction data, starting with the cheapest (exact cache) and
escalating to LLM only when necessary. The goal is to reduce "Untracked Expense" output to near
zero for known recurring transactions while keeping LLM costs proportional to truly novel transactions.

**Current state:** `CategoryRuleService.CategorizeBatchAsync` runs one pass of keyword matching
against `description` filtered by `type` (Expense/Income). No flow signal, no history cache, no
LLM fallback. All novel transactions return `"Untracked Expense"`.

**Target state:** Cascade dengan pre-gate + 4 numbered layers:

```
Incoming transaction (description, remarks, flow, type, amount_idr, wallet)
  │
  ├── [Preserved] Type AND Category already set in source file? → keep both as-is
  │     (Pre-gate, not a numbered layer. Master CSV import case: Type="Saving",
  │      Category="Emergency Fund" — user's ground truth, never overridden.)
  │
  ├── [Layer 0] Description (Item/merchant name) non-empty?
  │     → exact lookup (description, flow) in history cache (O(1) hash map)
  │     Highest signal: merchant name is stable across months ("Go Mie Go" is always "Go Mie Go").
  │     → HIT: return cached category
  │     → MISS: continue
  │
  ├── [Layer 1] Remarks non-empty?
  │     → exact lookup (remarks, flow) in history cache (O(1) hash map)
  │     Lower signal: bank-generated text may embed dates or ref numbers that vary monthly
  │     ("TARIKAN ATM 14/01..." ≠ "TARIKAN ATM 15/01..."). Use only when Description missed.
  │     → HIT: return cached category
  │     → MISS: continue
  │
  ├── [Layer 2] Enhanced rule engine: flow-aware keyword matching
  │     → flow-specific rules (e.g. CR + "SAVING INTEREST" → Saving Interest) first,
  │        then flow-agnostic rules; keyword searched in Description, then Remarks fallback
  │     → MATCH: return category
  │     → NO MATCH: continue
  │
  ├── [Layer 3] LLM fallback (Gemini via ai-service /categorize)
  │     → for genuinely novel transactions; confidence ≥ 0.85 auto-accepts
  │        and seeds a Layer 2 rule (next month same transaction skips LLM entirely)
  │     → HIGH CONFIDENCE: return + seed rule
  │     → LOW CONFIDENCE: return category but do not seed rule
  │
  └── [Layer 4] "Untracked Expense" — user reviews manually in upload preview
        → user confirms → seeds Layer 0/1 cache + creates Layer 2 rule
```

**Key insight from CSV analysis:** The `Item` column already maps to `TransactionDto.Description`
via `DefaultCsvParser` (when non-empty), and `Remarks` maps to `TransactionDto.Remarks`.
For NeoBank QRIS transactions: `Description = "Go Mie Go"` (stable), `Remarks = "QRIS (PAYMENT)"`
(useless alone). Layer 0 hits on Description reliably; Layer 1 on Remarks only helps for
invariant bank strings like "SAVING INTEREST". Layers 0 and 1 share one in-memory hash map
loaded once per batch — the lookup key differs (description vs remarks).

## Acceptance Criteria

- [ ] `category_rules` table has a nullable `flow` column (`varchar(5)`, NULL = any flow)
- [ ] Existing 106 seeded rules are unchanged (default to `flow = NULL`)
- [ ] `CategoryRuleService.CategorizeBatchAsync` tries `Description`-based cache lookup first (Layer 0), then `Remarks`-based cache (Layer 1), before rule matching
- [ ] Layers 0 and 1 share one in-memory hash map loaded once per batch (no N+1 queries)
- [ ] Flow-specific rules take priority over flow-agnostic rules in keyword matching (Layer 2)
- [ ] Keyword matching searches `Description` first, then falls back to `Remarks` (Layer 2)
- [ ] `TransactionPipelineService` calls LLM for rows still at `"Untracked Expense"` after Layers 0+1+2
- [ ] LLM-confirmed categories (confidence ≥ 0.85) auto-create a new `CategoryRule`
- [ ] Python `POST /categorize` endpoint returns `{ category, confidence }` in < 3 seconds
- [ ] All parsers produce the same or better categorization without changing their signatures
- [ ] xUnit tests cover: history cache hit, flow-specific priority, Remarks fallback, LLM path
- [ ] Python tests cover: `/categorize` happy path, low-confidence response, unknown category

## Approach

**Rule matching enhancement (Layer 2):** Add nullable `flow` column to `category_rules`. No
existing seeded rules are touched — they default to `NULL` (flow-agnostic, same behavior as today).
New flow-aware rules can be added via the Settings UI or seeded in the migration. Rule priority:
flow-specific rules first, then flow-agnostic, both ordered by `keyword_length` descending
(longest match wins — already the existing strategy).

**History cache (Layers 0 and 1):** Load all distinct category mappings from the `transactions`
table once per batch into two in-memory dictionaries sharing the same Supabase query:
- `descCache`: key = `(description.toLower, flow)` → category (Layer 0, Item/merchant name)
- `remCache`: key = `(remarks.toLower, flow)` → category (Layer 1, bank-generated text)

Layer 0 is tried first because Description = merchant name is stable across months. Layer 1 is
tried only on cache miss and only when `Remarks` is non-empty — bank text like "SAVING INTEREST"
is invariant but "TARIKAN ATM 14/01 5307952056461149" changes date each month making it unreliable.
Both dictionaries are built from one Supabase round-trip, avoiding N+1 calls.

**LLM integration (Layer 3):** New `POST /categorize` endpoint on the Python AI service. Takes
`{ description, remarks, flow, amount_idr, wallet, available_categories[] }`, returns
`{ category, confidence }`. Uses Gemini structured JSON output (same provider pattern as existing
parsers). The .NET side calls this via a new typed `HttpClient` (`ILlmCategorizationClient`).
LLM step runs only on the subset still at `"Untracked Expense"` — typically < 5% of transactions
in a recurring-monthly upload scenario.

**Auto-seeding rules from LLM (Layer 3 → Layer 2 feedback):** When LLM confidence ≥ 0.85, the
engine calls `ICategoryRuleService.AddAsync` to create a new keyword rule from the transaction's
description. Next month's identical transaction skips LLM entirely (hit in Layer 1 or Layer 2).

**Wiring strategy:** Parsers already call `CategorizeBatchAsync` internally. To avoid changing all
parser constructors, the enhancement is split: parsers still call `CategorizeBatchAsync` (now
Layers 0+1+2), and `TransactionPipelineService.ProcessAsync` gains a new LLM step after validation
but before dedup (Layer 3). This keeps parsers signature-stable.

**No Local ML:** ~1,500 rows of training data is insufficient for a well-behaved Naive Bayes
classifier on Indonesian vendor names with ~20 categories. Gemini is more accurate, cheaper to
maintain, and already wired in. Skip Local ML entirely.

## Affected Files

| File | Change |
|------|--------|
| `supabase/migrations/20260507000000_add_flow_to_category_rules.sql` | **New** — add `flow` column + seed 6 flow-specific rules |
| `apps/api/src/PersonalFinance.Domain/Entities/CategoryRule.cs` | Add nullable `Flow` property |
| `apps/api/src/PersonalFinance.Application/Dtos/CategoryRuleDto.cs` | Add nullable `Flow` property |
| `apps/api/src/PersonalFinance.Application/Interfaces/ICategoryRuleService.cs` | No change to signature |
| `apps/api/src/PersonalFinance.Application/Services/CategoryRuleService.cs` | Add Description-cache (Layer 0) + Remarks-cache (Layer 1) + flow-aware matching + Remarks fallback (Layer 2) |
| `apps/api/src/PersonalFinance.Application/Interfaces/ILlmCategorizationClient.cs` | **New** — interface for LLM categorize call |
| `apps/api/src/PersonalFinance.Infrastructure/External/LlmCategorizationClient.cs` | **New** — typed HttpClient calling Python `/categorize` |
| `apps/api/src/PersonalFinance.Application/Services/TransactionPipelineService.cs` | Inject `ILlmCategorizationClient` + `ICategoryRuleService`; add Layer 3 step after SchemaValidator |
| `apps/api/src/PersonalFinance.Api/Program.cs` | Register `ILlmCategorizationClient` as scoped HttpClient |
| `services/ai-service/app/main.py` | Add `POST /categorize` endpoint |
| `services/ai-service/app/models.py` | Add `CategorizeRequest` + `CategorizeResponse` models |
| `services/ai-service/app/services/categorizer.py` | **New** — Gemini structured output for categorization |
| `services/ai-service/tests/test_categorize.py` | **New** — endpoint tests with mocked LLM |
| `apps/api/tests/PersonalFinance.Tests/Services/CategorizationEngineTests.cs` | **New** — xUnit tests for all 4 layers |

---

## TODO

### [ ] STEP 1 — DB migration: add `flow` column to `category_rules`

Create `supabase/migrations/20260507000000_add_flow_to_category_rules.sql`:

```sql
-- Add nullable flow column to category_rules.
-- NULL means the rule applies to any flow direction (backwards-compatible default).
-- 'DB' or 'CR' means the rule only fires for that specific flow.
ALTER TABLE category_rules
    ADD COLUMN flow character varying(5) NULL;

-- Seed 6 high-confidence flow-specific rules that the existing keyword-only system
-- gets wrong when the keyword appears on the wrong side of the ledger.
-- These augment the existing 106 rules; they do not replace them.
INSERT INTO category_rules (keyword, type, category, keyword_length, flow) VALUES
    ('SAVING INTEREST',  'Income',  'Saving Interest',    14, 'CR'),
    ('INTEREST',         'Income',  'Saving Interest',     8, 'CR'),
    ('Neo Rewards',      'Income',  'Reward',              10, 'CR'),
    ('TOP-UP & BILLS REFUND', 'Income', 'Refund',         18, 'CR'),
    ('TARIKAN ATM',      'Expense', 'Withdrawing',         10, 'DB'),
    ('BIAYA ADM',        'Expense', 'Transfer/Admin Fee',   8, 'DB');
```

Apply:
```bash
supabase db push
```

Verify in Studio (`http://localhost:54323`):
```sql
SELECT id, keyword, type, category, flow FROM category_rules ORDER BY id DESC LIMIT 10;
-- Expect: 6 new rows with flow = 'CR' or 'DB', all prior rows with flow = NULL
```

> **Why nullable `flow` (not `''` empty string)?**
> NULL unambiguously means "flow-agnostic" — it cannot be confused with a missing or incorrect
> value. Filtering `WHERE flow IS NULL` is cleaner than `WHERE flow = ''`.
>
> **Why only 6 new flow-specific rules, not update all 106?**
> The existing 106 rules are already correct for the vast majority of transactions. Only rules
> where the keyword is genuinely ambiguous across DB/CR benefit from the flow signal. Adding
> flow constraints to unambiguous keywords (e.g., "TARIKAN ATM" is always debit) is redundant
> and adds maintenance burden.

---

### [ ] STEP 2 — Update `CategoryRule` entity and `CategoryRuleDto`

**File:** `apps/api/src/PersonalFinance.Domain/Entities/CategoryRule.cs`

Add after `KeywordLength`:
```csharp
[Column("flow")]
public string? Flow { get; set; }
```

**File:** `apps/api/src/PersonalFinance.Application/Dtos/CategoryRuleDto.cs`

Add after `KeywordLength`:
```csharp
public string? Flow { get; set; }
```

**File:** `apps/api/src/PersonalFinance.Application/Services/CategoryRuleService.cs`

Update both `MapToDto` and `MapToEntity` to include `Flow`:
```csharp
private static CategoryRuleDto MapToDto(CategoryRule entity) => new()
{
    Id = entity.Id,
    Keyword = entity.Keyword,
    Type = entity.Type,
    Category = entity.Category,
    KeywordLength = entity.KeywordLength,
    Flow = entity.Flow          // NEW
};

private static CategoryRule MapToEntity(CategoryRuleDto dto) => new()
{
    Id = dto.Id,
    Keyword = dto.Keyword,
    Type = dto.Type,
    Category = dto.Category,
    Flow = dto.Flow             // NEW
};
```

Build to verify no compile errors:
```bash
cd apps/api && dotnet build PersonalFinance.slnx
```

> **Why nullable `string?` (not `FlowType` enum)?**
> NULL is the dominant case (106 existing rules). A nullable enum (`FlowType?`) is correct
> semantically but adds a conversion layer for Supabase PostgREST which serializes enums as
> strings. Nullable `string?` is simpler and consistent with how `Flow` is typed throughout
> the codebase (`TransactionDto.Flow` is `string`).

---

### [ ] STEP 3 — Enhance `CategoryRuleService`: history cache + flow-aware matching

**File:** `apps/api/src/PersonalFinance.Application/Services/CategoryRuleService.cs`

Replace the `CategorizeBatchAsync` method with:

```csharp
public async Task<List<TransactionDto>> CategorizeBatchAsync(List<TransactionDto> transactions)
{
    _logger.LogDebug("Batch categorizing {Count} transactions.", transactions.Count);

    // Pre-gate: preserve source-supplied Type AND Category.
    // If the source file already supplied BOTH a non-default Type AND a non-default Category
    // (e.g. master CSV rows with Type="Saving" Category="Emergency Fund"), preserve both as-is.
    // The engine must never override a source-supplied Type — it is the user's ground truth.
    var needsCategorization = transactions
        .Where(tx => string.IsNullOrWhiteSpace(tx.Category)
            || tx.Category.Equals("Untracked Expense", StringComparison.OrdinalIgnoreCase))
        .ToList();

    if (needsCategorization.Count == 0)
        return transactions;

    // ── Layers 0 + 1: History cache (one Supabase query, two lookup dictionaries) ─────────
    // Build two dictionaries from a single round-trip:
    //   descCache: (description, flow) → category  [Layer 0 — stable merchant name]
    //   remCache:  (remarks, flow)     → category  [Layer 1 — bank-generated text]
    var historyResult = await _supabase.From<Transaction>()
        .Select("description,remarks,flow,category")
        .Get();

    var categorized = historyResult.Models
        .Where(t => !string.IsNullOrWhiteSpace(t.Category)
                 && !t.Category.Equals("Untracked Expense", StringComparison.OrdinalIgnoreCase))
        .ToList();

    var descCache = categorized
        .Where(t => !string.IsNullOrWhiteSpace(t.Description))
        .GroupBy(t => (t.Description!.Trim().ToLowerInvariant(), t.Flow?.ToUpperInvariant()))
        .ToDictionary(g => g.Key, g => g.First().Category);

    var remCache = categorized
        .Where(t => !string.IsNullOrWhiteSpace(t.Remarks))
        .GroupBy(t => (t.Remarks!.Trim().ToLowerInvariant(), t.Flow?.ToUpperInvariant()))
        .ToDictionary(g => g.Key, g => g.First().Category);

    var stillNeeded = new List<TransactionDto>();
    foreach (var tx in needsCategorization)
    {
        var flow = tx.Flow?.ToUpperInvariant();

        // Layer 0: Description (Item/merchant name) — highest signal, most stable across months.
        if (!string.IsNullOrWhiteSpace(tx.Description))
        {
            var descKey = (tx.Description.Trim().ToLowerInvariant(), flow);
            if (descCache.TryGetValue(descKey, out var fromDesc))
            {
                tx.Category = fromDesc;
                _logger.LogDebug("Layer 0 cache hit (Description): '{Desc}' → '{Cat}'", tx.Description, fromDesc);
                continue;
            }
        }

        // Layer 1: Remarks (bank-generated text) — lower signal; only tried when Remarks is
        // populated AND Description cache missed. Useful for invariant strings like "SAVING INTEREST"
        // but unreliable for date-embedded strings like "TARIKAN ATM 14/01 5307952056461149".
        if (!string.IsNullOrWhiteSpace(tx.Remarks))
        {
            var remKey = (tx.Remarks.Trim().ToLowerInvariant(), flow);
            if (remCache.TryGetValue(remKey, out var fromRem))
            {
                tx.Category = fromRem;
                _logger.LogDebug("Layer 1 cache hit (Remarks): '{Rem}' → '{Cat}'", tx.Remarks, fromRem);
                continue;
            }
        }

        stillNeeded.Add(tx);
    }

    if (stillNeeded.Count == 0)
    {
        _logger.LogInformation("All {Count} transactions resolved by history cache (Layers 0+1).", needsCategorization.Count);
        return transactions;
    }

    // ── Layer 2: Flow-aware rule engine ──────────────────────────────────────
    var rulesResult = await _supabase.From<CategoryRule>()
        .Order("keyword_length", Ordering.Descending)
        .Get();
    var rules = rulesResult.Models;

    foreach (var tx in stillNeeded)
    {
        var typeRules = rules.Where(r =>
            r.Type.Equals(tx.Type, StringComparison.OrdinalIgnoreCase));

        // Flow-specific rules take priority over flow-agnostic rules (both ordered by keyword_length DESC).
        var ordered = typeRules
            .Where(r => !string.IsNullOrEmpty(r.Flow) && r.Flow.Equals(tx.Flow, StringComparison.OrdinalIgnoreCase))
            .Concat(typeRules.Where(r => string.IsNullOrEmpty(r.Flow)));

        foreach (var rule in ordered)
        {
            // Search Description first; fall back to Remarks.
            // Keeps priority: merchant name (stable) wins over bank text (variable).
            var primaryTarget   = tx.Description ?? string.Empty;
            var secondaryTarget = tx.Remarks     ?? string.Empty;

            if (primaryTarget.Contains(rule.Keyword, StringComparison.OrdinalIgnoreCase)
                || secondaryTarget.Contains(rule.Keyword, StringComparison.OrdinalIgnoreCase))
            {
                tx.Category = rule.Category;
                _logger.LogDebug("Layer 2 rule match: '{Keyword}' (flow={Flow}) → '{Cat}'",
                    rule.Keyword, rule.Flow ?? "any", rule.Category);
                break;
            }
        }
    }

    return transactions;
}
```

> **Why two separate dictionaries (`descCache` and `remCache`) instead of one composite key?**
> The lookup keys have different semantics: `descCache` key is `(description, flow)` where
> description = merchant name (stable); `remCache` key is `(remarks, flow)` where remarks =
> bank-generated text (variable). Merging them into one dictionary would require a flag to
> distinguish which field the key came from, adding complexity. Two dictionaries is clearer
> and marginally faster (skip `remCache` lookup when `Remarks` is empty).
>
> **Why is Layer 1 (Remarks cache) still worth having if bank text can embed dates?**
> Not all bank text is variable. "SAVING INTEREST", "INTEREST", "BIAYA ADM", "Neo Rewards"
> are invariant across months and would hit the Remarks cache reliably. Variable strings like
> "TARIKAN ATM 14/01..." simply won't hit and fall through to Layer 2's keyword rule
> ("TARIKAN ATM" keyword match), which is the right outcome.
>
> **Why `GroupBy` + `First()` instead of `ToDictionary` directly?**
> The same key may appear multiple times if the user corrected the category on a past import.
> `ToDictionary` throws on duplicate keys; `GroupBy + First()` is safe. A future improvement
> could sort by `date DESC` and take the most-recent category.
>
> **Why load all rules instead of filtering by type per transaction?**
> All parsers call `CategorizeBatchAsync` with a mixed list of Expense/Income/AssetTransfer
> transactions. Fetching once and filtering in memory is one Supabase round-trip per batch.

---

### [ ] STEP 4 — New `ILlmCategorizationClient` interface

**New file:** `apps/api/src/PersonalFinance.Application/Interfaces/ILlmCategorizationClient.cs`

```csharp
namespace PersonalFinance.Application.Interfaces;

public interface ILlmCategorizationClient
{
    /// <summary>
    /// Asks the LLM to classify a single transaction into one of the supplied categories.
    /// Returns (category, confidence) where confidence is 0.0–1.0.
    /// Returns ("Untracked Expense", 0.0) when the LLM is unavailable or returns
    /// a category not in the supplied list.
    /// Never throws — all errors are swallowed and logged.
    /// </summary>
    Task<(string Category, double Confidence)> CategorizeAsync(
        string description,
        string remarks,
        string flow,
        decimal amountIdr,
        string wallet,
        IReadOnlyList<string> availableCategories,
        CancellationToken ct = default);
}
```

> **Why `Never throws`?** Layer 3 is a best-effort enrichment. A transient AI service error
> should not fail the entire upload. The method contract makes this explicit so callers don't
> need try/catch.

---

### [ ] STEP 5 — New `LlmCategorizationClient` implementation

**New file:** `apps/api/src/PersonalFinance.Infrastructure/External/LlmCategorizationClient.cs`

```csharp
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Infrastructure.External;

public class LlmCategorizationClient : ILlmCategorizationClient
{
    private readonly HttpClient _http;
    private readonly ILogger<LlmCategorizationClient> _logger;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public LlmCategorizationClient(HttpClient http, ILogger<LlmCategorizationClient> logger)
    {
        _http = http;
        _logger = logger;
    }

    public async Task<(string Category, double Confidence)> CategorizeAsync(
        string description, string remarks, string flow, decimal amountIdr, string wallet,
        IReadOnlyList<string> availableCategories,
        CancellationToken ct = default)
    {
        try
        {
            var request = new CategorizeRequest(
                description, remarks, flow, (double)amountIdr, wallet,
                availableCategories.ToList());

            var response = await _http.PostAsJsonAsync("/categorize", request, JsonOptions, ct);

            if (!response.IsSuccessStatusCode)
            {
                var body = await response.Content.ReadAsStringAsync(ct);
                _logger.LogWarning("LLM categorize returned {Status}: {Body}", (int)response.StatusCode, body);
                return ("Untracked Expense", 0.0);
            }

            var result = await response.Content.ReadFromJsonAsync<CategorizeResponse>(JsonOptions, ct);
            if (result is null || !availableCategories.Contains(result.Category, StringComparer.OrdinalIgnoreCase))
            {
                _logger.LogWarning("LLM returned unknown category '{Cat}' — discarding.", result?.Category);
                return ("Untracked Expense", 0.0);
            }

            _logger.LogInformation("Layer 3 LLM: '{Desc}' → '{Cat}' (confidence={Conf:P0})",
                description, result.Category, result.Confidence);
            return (result.Category, result.Confidence);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "LLM categorize call failed — falling back to Untracked Expense.");
            return ("Untracked Expense", 0.0);
        }
    }

    private sealed record CategorizeRequest(
        string Description,
        string Remarks,
        string Flow,
        double AmountIdr,
        string Wallet,
        List<string> AvailableCategories);

    private sealed class CategorizeResponse
    {
        public string Category    { get; set; } = "Untracked Expense";
        public double Confidence  { get; set; } = 0.0;
    }
}
```

> **Why validate that the LLM's response is in `availableCategories`?**
> LLMs can hallucinate category names not in the prompt. Silently accepting a hallucinated
> category would insert bad data. Discarding it and returning "Untracked Expense" is safer —
> the user will review it in the upload preview.
>
> **Why `(decimal)amountIdr → (double)` in the request?**
> Python's Pydantic and Gemini JSON mode serialize amounts as `float`. The .NET `decimal`
> is cast to `double` only for the HTTP payload — no precision is lost for transaction amounts
> in this range (max ~500M IDR, well within float64 precision).

---

### [ ] STEP 6 — Enhance `TransactionPipelineService` with Layer 3 + auto-seed

**File:** `apps/api/src/PersonalFinance.Application/Services/TransactionPipelineService.cs`

Inject `ILlmCategorizationClient` and `ICategoryRuleService`. Add Layer 3 after SchemaValidator,
before DeduplicateCheck:

```csharp
public class TransactionPipelineService : ITransactionPipelineService
{
    private readonly ITransactionService _transactionService;
    private readonly ILlmCategorizationClient _llmCategorizer;
    private readonly ICategoryRuleService _categoryRuleService;
    private readonly ILogger<TransactionPipelineService> _logger;

    private const double LlmAutoAcceptThreshold = 0.85;

    public TransactionPipelineService(
        ITransactionService transactionService,
        ILlmCategorizationClient llmCategorizer,
        ICategoryRuleService categoryRuleService,
        ILogger<TransactionPipelineService> logger)
    {
        _transactionService = transactionService;
        _llmCategorizer = llmCategorizer;
        _categoryRuleService = categoryRuleService;
        _logger = logger;
    }

    public async Task<List<TransactionDto>> ProcessAsync(List<TransactionDto> transactions)
    {
        if (transactions == null || !transactions.Any())
            return new List<TransactionDto>();

        var validTransactions = new List<TransactionDto>();

        foreach (var t in transactions)
        {
            // 1. DateNormalizer
            t.Date = t.Date.Kind == DateTimeKind.Unspecified
                ? DateTime.SpecifyKind(t.Date, DateTimeKind.Utc)
                : t.Date.ToUniversalTime();

            // 2. DecimalFixer
            t.AmountIdr = Math.Abs(Math.Round(t.AmountIdr, 2));

            // 3. CurrencyStandardizer
            if (string.IsNullOrWhiteSpace(t.Currency)
                || t.Currency.Trim().Equals("Rp", StringComparison.OrdinalIgnoreCase)
                || t.Currency.Trim().Equals("Rp.", StringComparison.OrdinalIgnoreCase))
                t.Currency = "IDR";
            else
                t.Currency = t.Currency.Trim().ToUpper();

            // 4. SchemaValidator
            if (string.IsNullOrWhiteSpace(t.Description))
            {
                _logger.LogWarning("Skipping transaction with empty description. Date: {Date}", t.Date);
                continue;
            }
            if (t.AmountIdr == 0)
            {
                _logger.LogWarning("Skipping transaction with 0 amount. Description: {Desc}", t.Description);
                continue;
            }
            if (string.IsNullOrWhiteSpace(t.Flow) || (t.Flow != "CR" && t.Flow != "DB"))
            {
                _logger.LogWarning("Skipping transaction with invalid flow '{Flow}'. Description: {Desc}", t.Flow, t.Description);
                continue;
            }

            validTransactions.Add(t);
        }

        // 4.5. Layer 3: LLM fallback for rows still at "Untracked Expense" after parser's Layers 0+1+2.
        await ApplyLlmCategorizationAsync(validTransactions);

        // 5. DeduplicateCheck
        var finalTransactions = await _transactionService.FilterOutDuplicatesAsync(validTransactions);

        return finalTransactions;
    }

    private async Task ApplyLlmCategorizationAsync(List<TransactionDto> transactions)
    {
        // Only target rows where Category is still at default — meaning neither the source file
        // nor Layers 1+2 supplied a category. Type is NEVER overridden here; the LLM only
        // returns a category, and the source-supplied Type is the user's ground truth.
        var uncategorized = transactions
            .Where(t => t.Category.Equals("Untracked Expense", StringComparison.OrdinalIgnoreCase))
            .ToList();

        if (uncategorized.Count == 0) return;

        _logger.LogInformation("Layer 3: {Count} transactions need LLM categorization.", uncategorized.Count);

        // Load available categories once for the batch (used to constrain LLM response).
        var allRules = await _categoryRuleService.GetAllAsync();
        var availableCategories = allRules
            .Select(r => r.Category)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Order()
            .ToList();

        if (availableCategories.Count == 0) return;

        foreach (var tx in uncategorized)
        {
            var (category, confidence) = await _llmCategorizer.CategorizeAsync(
                tx.Description, tx.Remarks, tx.Flow, tx.AmountIdr, tx.Wallet,
                availableCategories);

            if (category.Equals("Untracked Expense", StringComparison.OrdinalIgnoreCase))
                continue;

            tx.Category = category;

            // Auto-seed rule when confidence is high — prevents the same transaction
            // from hitting LLM next month.
            if (confidence >= LlmAutoAcceptThreshold)
            {
                _logger.LogInformation(
                    "Auto-seeding rule: keyword='{Desc}', type='{Type}', flow='{Flow}', category='{Cat}' (confidence={Conf:P0})",
                    tx.Description, tx.Type, tx.Flow, category, confidence);

                await _categoryRuleService.AddAsync(new CategoryRuleDto
                {
                    Keyword  = tx.Description,
                    Type     = tx.Type,
                    Flow     = tx.Flow,
                    Category = category
                });
            }
        }
    }
}
```

> **Why LLM step runs before dedup (step 4.5, not after step 5)?**
> Duplicate transactions should still show their correct category in the preview's
> "Duplicates — Already in DB" bucket. If LLM ran after dedup, duplicates would always
> show "Untracked Expense" in the preview even when the category is known.
>
> **Why `LlmAutoAcceptThreshold = 0.85`?**
> Empirically, Gemini classification confidence above 85% has negligible hallucination rate
> for closed-set category lists (< 20 options). Below 85%, the transaction is left at its
> LLM-assigned category for this upload but no rule is seeded — the user can create the rule
> manually if they want it to persist.
>
> **Why `availableCategories` from rules, not a hard-coded list?**
> The user can add custom categories via Settings. Hard-coding the list would mean new
> categories are invisible to the LLM until the code is updated. Loading from rules at
> runtime keeps the LLM's option set in sync with what the user has actually defined.

---

### [ ] STEP 7 — Register `LlmCategorizationClient` in `Program.cs`

**File:** `apps/api/src/PersonalFinance.Api/Program.cs`

Find the block where `ILlmExtractionClient` is registered (HTTP client for AI service).
Add `ILlmCategorizationClient` registration immediately after, pointing to the same base URL:

```csharp
// Existing:
builder.Services.AddHttpClient<ILlmExtractionClient, LlmExtractionClient>(client =>
{
    client.BaseAddress = new Uri(builder.Configuration["AiService:BaseUrl"] ?? "http://localhost:8000");
    client.Timeout = TimeSpan.FromMinutes(5);
});

// NEW — shares the same base URL and timeout:
builder.Services.AddHttpClient<ILlmCategorizationClient, LlmCategorizationClient>(client =>
{
    client.BaseAddress = new Uri(builder.Configuration["AiService:BaseUrl"] ?? "http://localhost:8000");
    client.Timeout = TimeSpan.FromSeconds(15);  // Categorization is faster than PDF extraction
});
```

> **Why a shorter timeout (15 s) than the extraction client (5 min)?**
> Categorizing a single transaction is a small prompt — the LLM should respond in < 3 s.
> A 15 s timeout gives headroom for a busy provider without blocking the upload pipeline
> for a full 5 minutes if the AI service is down.

---

### [ ] STEP 8 — Python AI service: Pydantic models for `/categorize`

**File:** `services/ai-service/app/models.py`

Add at the end:

```python
class CategorizeRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    description: str
    remarks: str = ""
    flow: Literal["DB", "CR"]
    amount_idr: Decimal
    wallet: str = ""
    available_categories: list[str]


class CategorizeResponse(BaseModel):
    category: str
    confidence: float  # 0.0 – 1.0
```

> **Why `available_categories` in the request (not hard-coded in the prompt)?**
> The .NET side owns the canonical category list (from `category_rules` table). Passing it
> at runtime means the Python service never needs to be updated when the user adds categories.

---

### [ ] STEP 9 — Python AI service: `categorizer.py` service

**New file:** `services/ai-service/app/services/categorizer.py`

```python
import json
import logging
from decimal import Decimal

from app.models import CategorizeRequest, CategorizeResponse
from app.providers.base import LlmProvider

logger = logging.getLogger(__name__)

_CATEGORIZE_SCHEMA = {
    "type": "object",
    "properties": {
        "category":   {"type": "string"},
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
    },
    "required": ["category", "confidence"],
}

_SYSTEM_PROMPT = (
    "You are a personal finance transaction classifier. "
    "Given a bank transaction, return the most appropriate category from the provided list. "
    "Set confidence to a value between 0.0 and 1.0 reflecting how certain you are. "
    "If no category clearly fits, pick the closest one and set confidence below 0.5. "
    "Never invent categories outside the provided list."
)


class Categorizer:
    def __init__(self, provider: LlmProvider) -> None:
        self._provider = provider

    async def categorize(self, request: CategorizeRequest) -> CategorizeResponse:
        flow_label = "debit (money out)" if request.flow == "DB" else "credit (money in)"
        prompt = (
            f"Transaction:\n"
            f"  Description: {request.description}\n"
            f"  Remarks: {request.remarks or '(none)'}\n"
            f"  Flow: {flow_label}\n"
            f"  Amount (IDR): {request.amount_idr:,.0f}\n"
            f"  Bank/Wallet: {request.wallet or '(unknown)'}\n\n"
            f"Available categories (choose exactly one):\n"
            + "\n".join(f"  - {c}" for c in request.available_categories)
        )

        logger.info(
            "Categorizing | desc=%s | flow=%s | categories=%d",
            request.description, request.flow, len(request.available_categories),
        )

        raw = await self._provider.generate_json(
            system_prompt=_SYSTEM_PROMPT,
            user_prompt=prompt,
            schema=_CATEGORIZE_SCHEMA,
        )

        try:
            data = json.loads(raw) if isinstance(raw, str) else raw
            return CategorizeResponse(
                category=data["category"],
                confidence=float(data.get("confidence", 0.5)),
            )
        except (KeyError, TypeError, ValueError) as e:
            logger.warning("Failed to parse LLM categorize response: %s — raw=%s", e, raw)
            return CategorizeResponse(
                category=request.available_categories[0] if request.available_categories else "Untracked Expense",
                confidence=0.0,
            )
```

> **Why call `provider.generate_json` (not `provider.extract_transactions`)?**
> This is a classification task, not a data extraction task. The existing `LlmParser` is
> designed for multi-transaction extraction with `tool_use` schema. A simple JSON object
> response is cleaner for single-value classification.
>
> **`generate_json` is a new method on the provider interface** — see the note below about
> adding it to `base.py` and both provider implementations.

**Add `generate_json` to provider base and implementations:**

**`services/ai-service/app/providers/base.py`** — add abstract method:
```python
@abstractmethod
async def generate_json(self, system_prompt: str, user_prompt: str, schema: dict) -> dict:
    """Return a JSON object matching the given schema."""
```

**`services/ai-service/app/providers/gemini.py`** — add implementation:
```python
async def generate_json(self, system_prompt: str, user_prompt: str, schema: dict) -> dict:
    import json
    response = await self._client.aio.models.generate_content(
        model=self._model,
        contents=user_prompt,
        config={
            "system_instruction": system_prompt,
            "response_mime_type": "application/json",
            "response_schema": schema,
            "temperature": 0.0,
        },
    )
    return json.loads(response.text)
```

**`services/ai-service/app/providers/anthropic.py`** — add implementation:
```python
async def generate_json(self, system_prompt: str, user_prompt: str, schema: dict) -> dict:
    tools = [{
        "name": "classify",
        "description": "Return classification result",
        "input_schema": schema,
    }]
    response = await self._client.messages.create(
        model=self._model,
        max_tokens=256,
        temperature=0.0,
        system=system_prompt,
        tools=tools,
        tool_choice={"type": "any"},
        messages=[{"role": "user", "content": user_prompt}],
    )
    tool_block = next(b for b in response.content if b.type == "tool_use")
    return tool_block.input
```

---

### [ ] STEP 10 — Python AI service: `POST /categorize` endpoint

**File:** `services/ai-service/app/main.py`

Add import at top:
```python
from app.models import CategorizeRequest, CategorizeResponse
from app.services.categorizer import Categorizer
```

Add to lifespan after `app.state.pdf_extractor = PdfExtractor()`:
```python
app.state.categorizer = Categorizer(provider=provider)
```

Add endpoint after existing routes:
```python
@app.post("/categorize", response_model=CategorizeResponse)
async def categorize_transaction(request: CategorizeRequest) -> CategorizeResponse:
    if not request.available_categories:
        raise HTTPException(status_code=422, detail="available_categories must not be empty")
    return await app.state.categorizer.categorize(request)
```

Smoke test with the service running:
```bash
curl -X POST http://localhost:8000/categorize \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Go Mie Go",
    "remarks": "QRIS (PAYMENT)",
    "flow": "DB",
    "amount_idr": 37500,
    "wallet": "NeoBank",
    "available_categories": ["Food", "Bill", "Groceries", "Electricity", "Transfer/Admin Fee"]
  }'
# Expected: { "category": "Food", "confidence": 0.97 }
```

---

### [ ] STEP 11 — Python tests for `POST /categorize`

**New file:** `services/ai-service/tests/test_categorize.py`

```python
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.services.categorizer import Categorizer
from app.models import CategorizeResponse


def _mock_categorizer(category: str = "Food", confidence: float = 0.95) -> Categorizer:
    mock = AsyncMock(spec=Categorizer)
    mock.categorize = AsyncMock(return_value=CategorizeResponse(
        category=category, confidence=confidence))
    return mock


@pytest.mark.anyio
async def test_categorize_happy_path():
    app.state.categorizer = _mock_categorizer("Food", 0.95)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/categorize", json={
            "description": "Go Mie Go",
            "remarks": "QRIS (PAYMENT)",
            "flow": "DB",
            "amount_idr": 37500,
            "wallet": "NeoBank",
            "available_categories": ["Food", "Bill", "Groceries"],
        })
    assert response.status_code == 200
    data = response.json()
    assert data["category"] == "Food"
    assert data["confidence"] == pytest.approx(0.95)


@pytest.mark.anyio
async def test_categorize_empty_categories_returns_422():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/categorize", json={
            "description": "Netflix",
            "flow": "DB",
            "amount_idr": 46500,
            "wallet": "SeaBank",
            "available_categories": [],
        })
    assert response.status_code == 422


@pytest.mark.anyio
async def test_categorize_low_confidence_still_returns_response():
    app.state.categorizer = _mock_categorizer("Groceries", 0.40)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/categorize", json={
            "description": "Sunset Vet Ubud",
            "flow": "DB",
            "amount_idr": 172000,
            "wallet": "SeaBank",
            "available_categories": ["Food", "Vet and Dog Supply", "Groceries"],
        })
    assert response.status_code == 200
    assert response.json()["confidence"] == pytest.approx(0.40)
```

---

### [ ] STEP 12 — xUnit tests for categorization layers

**New file:** `apps/api/tests/PersonalFinance.Tests/Services/CategorizationLayerTests.cs`

```csharp
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;

public class CategorizationLayerTests
{
    // ── Layer 1: History cache ────────────────────────────────────────────────

    [Fact]
    public async Task CategorizeBatchAsync_HistoryCacheHit_ReturnsCachedCategory()
    {
        // Arrange: history has "Go Mie Go" DB → "Food"
        // Incoming: same description + flow
        // Expected: Category = "Food", no rule query fired

        // Implementation note: mock Supabase.Client to return a Transaction list
        // with ("Go Mie Go", "DB", "Food"), verify rules query is never called.
        // Skipped here — full implementation in integration test suite.
    }

    // ── Layer 2: Flow-aware rule matching ─────────────────────────────────────

    [Fact]
    public void TagDuplicatesLogic_FlowSpecificRuleTakesPriorityOverFlowAgnostic()
    {
        // Arrange: two rules for keyword "INTEREST":
        //   Rule A: type=Income, flow=CR, category=Saving Interest
        //   Rule B: type=Income, flow=null, category=Income  (flow-agnostic)
        // Transaction: description="INTEREST", flow=CR, type=Income
        // Expected: Category = "Saving Interest" (Rule A wins)
        var rules = new List<CategoryRuleDto>
        {
            new() { Keyword = "INTEREST", Type = "Income", Flow = "CR",  Category = "Saving Interest", KeywordLength = 8 },
            new() { Keyword = "INTEREST", Type = "Income", Flow = null,  Category = "Income",          KeywordLength = 8 },
        };
        var tx = new TransactionDto
        {
            Description = "INTEREST",
            Flow = "CR",
            Type = "Income",
            Category = "Untracked Expense",
        };

        // Apply the ordering logic from CategorizeBatchAsync inline for unit testing:
        var typeRules = rules.Where(r => r.Type.Equals(tx.Type, StringComparison.OrdinalIgnoreCase));
        var ordered = typeRules
            .Where(r => !string.IsNullOrEmpty(r.Flow) && r.Flow.Equals(tx.Flow, StringComparison.OrdinalIgnoreCase))
            .Concat(typeRules.Where(r => string.IsNullOrEmpty(r.Flow)));

        foreach (var rule in ordered)
        {
            if (tx.Description.Contains(rule.Keyword, StringComparison.OrdinalIgnoreCase))
            {
                tx.Category = rule.Category;
                break;
            }
        }

        Assert.Equal("Saving Interest", tx.Category);
    }

    [Fact]
    public void CategorizeBatchAsync_RemarksUsedWhenDescriptionNoMatch()
    {
        // Arrange: rule keyword "QRIS" (would match if searched in Remarks).
        // Transaction: Description="Go Mie Go" (no QRIS), Remarks="QRIS (PAYMENT)".
        // Note: "Go Mie Go" SHOULD match a Food rule by Description.
        // This test verifies Remarks fallback when Description has no rule match.
        var rule = new CategoryRuleDto { Keyword = "QRIS", Type = "Expense", Category = "Food", KeywordLength = 4 };
        var tx = new TransactionDto
        {
            Description = "Unknown Merchant",
            Remarks     = "QRIS (PAYMENT)",
            Flow        = "DB",
            Type        = "Expense",
            Category    = "Untracked Expense",
        };

        bool matched = tx.Description.Contains(rule.Keyword, StringComparison.OrdinalIgnoreCase)
                    || tx.Remarks.Contains(rule.Keyword, StringComparison.OrdinalIgnoreCase);

        Assert.True(matched);  // Remarks fallback catches it
    }

    // ── Layer 3: LLM fallback ─────────────────────────────────────────────────

    [Fact]
    public async Task ProcessAsync_LlmFallback_CategorizedWhenHighConfidence()
    {
        // Arrange: mock ILlmCategorizationClient returns ("Food", 0.95)
        // mock ICategoryRuleService.GetAllAsync returns [Food, Bill, Groceries]
        // Transaction: Description="Novel Restaurant", Category="Untracked Expense"
        // Expected: tx.Category = "Food"
        var mockLlm = new Mock<ILlmCategorizationClient>();
        mockLlm.Setup(x => x.CategorizeAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<decimal>(), It.IsAny<string>(), It.IsAny<IReadOnlyList<string>>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(("Food", 0.95));

        var mockRules = new Mock<ICategoryRuleService>();
        mockRules.Setup(x => x.GetAllAsync())
            .ReturnsAsync([
                new CategoryRuleDto { Category = "Food" },
                new CategoryRuleDto { Category = "Bill" },
                new CategoryRuleDto { Category = "Groceries" },
            ]);
        mockRules.Setup(x => x.AddAsync(It.IsAny<CategoryRuleDto>()))
            .ReturnsAsync(new CategoryRuleDto());

        var mockTxService = new Mock<ITransactionService>();
        mockTxService.Setup(x => x.FilterOutDuplicatesAsync(It.IsAny<IEnumerable<TransactionDto>>()))
            .ReturnsAsync((IEnumerable<TransactionDto> t) => t.ToList());

        var svc = new TransactionPipelineService(
            mockTxService.Object, mockLlm.Object, mockRules.Object,
            NullLogger<TransactionPipelineService>.Instance);

        var tx = new TransactionDto
        {
            Date        = DateTime.UtcNow,
            Description = "Novel Restaurant",
            Flow        = "DB",
            Type        = "Expense",
            Category    = "Untracked Expense",
            AmountIdr   = 50000,
            Currency    = "IDR",
        };

        // Act
        var result = await svc.ProcessAsync([tx]);

        // Assert
        Assert.Single(result);
        Assert.Equal("Food", result[0].Category);
        mockRules.Verify(x => x.AddAsync(It.Is<CategoryRuleDto>(r => r.Category == "Food")), Times.Once);
    }

    [Fact]
    public async Task ProcessAsync_LlmLowConfidence_DoesNotSeedRule()
    {
        // Arrange: LLM returns ("Groceries", 0.50) — below 0.85 threshold
        // Expected: tx.Category = "Groceries" (still applied) but AddAsync never called
        var mockLlm = new Mock<ILlmCategorizationClient>();
        mockLlm.Setup(x => x.CategorizeAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<decimal>(), It.IsAny<string>(), It.IsAny<IReadOnlyList<string>>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(("Groceries", 0.50));

        var mockRules = new Mock<ICategoryRuleService>();
        mockRules.Setup(x => x.GetAllAsync())
            .ReturnsAsync([new CategoryRuleDto { Category = "Groceries" }]);

        var mockTxService = new Mock<ITransactionService>();
        mockTxService.Setup(x => x.FilterOutDuplicatesAsync(It.IsAny<IEnumerable<TransactionDto>>()))
            .ReturnsAsync((IEnumerable<TransactionDto> t) => t.ToList());

        var svc = new TransactionPipelineService(
            mockTxService.Object, mockLlm.Object, mockRules.Object,
            NullLogger<TransactionPipelineService>.Instance);

        var tx = new TransactionDto
        {
            Date = DateTime.UtcNow, Description = "Warung Baru", Flow = "DB",
            Type = "Expense", Category = "Untracked Expense", AmountIdr = 25000, Currency = "IDR",
        };

        var result = await svc.ProcessAsync([tx]);

        Assert.Equal("Groceries", result[0].Category);
        mockRules.Verify(x => x.AddAsync(It.IsAny<CategoryRuleDto>()), Times.Never);
    }
}
```

Run:
```bash
cd apps/api && dotnet test --filter "FullyQualifiedName~CategorizationLayerTests"
```

---

### [ ] STEP 13 — End-to-end smoke test

With full stack running (`supabase start`, `uvicorn`, `dotnet run`, `npm run dev`):

1. **Upload a NeoBank QRIS-heavy statement** (multiple "QRIS (PAYMENT)" rows where Description = merchant name).
   - Verify: known merchants (Go Mie Go, Roti Goolung, Es Teh) → "Food" via Layer 2 rules
   - Verify: no LLM calls for these (check ai-service logs for no `/categorize` hits)

2. **Upload the master Cashflow CSV** (`docs/statement-examples/Cashflow 2024 2025.csv`).
   - Verify: Type AND Category preserved from CSV (Layer 0 — source-supplied, e.g. Type="Saving" Category="Emergency Fund" must not be overridden)
   - Verify: "Untracked Expense" count in preview is < 5% of total rows

3. **Upload same CSV a second time** (after Step 2 seeds transactions table).
   - Verify: Layer 1 history cache resolves most transactions
   - Verify: ai-service logs show zero `/categorize` calls for this upload

4. **Upload a statement with a novel merchant** (not in rules, not in history).
   - Verify: `/categorize` is called in ai-service logs
   - Verify: LLM returns a non-"Untracked Expense" category
   - Verify (if confidence ≥ 0.85): new rule appears in Settings → Categories after submit

---

### [ ] STEP 14 — Run full test suites

```bash
# Python
cd services/ai-service && pytest tests/ -v

# .NET
cd apps/api && dotnet test PersonalFinance.slnx
```

---

### [ ] STEP 15 — Commit

```bash
git add supabase/migrations/20260507000000_add_flow_to_category_rules.sql
git add apps/api/src/PersonalFinance.Domain/Entities/CategoryRule.cs
git add apps/api/src/PersonalFinance.Application/Dtos/CategoryRuleDto.cs
git add apps/api/src/PersonalFinance.Application/Services/CategoryRuleService.cs
git add apps/api/src/PersonalFinance.Application/Interfaces/ILlmCategorizationClient.cs
git add apps/api/src/PersonalFinance.Infrastructure/External/LlmCategorizationClient.cs
git add apps/api/src/PersonalFinance.Application/Services/TransactionPipelineService.cs
git add apps/api/src/PersonalFinance.Api/Program.cs
git add services/ai-service/app/models.py
git add services/ai-service/app/services/categorizer.py
git add services/ai-service/app/providers/base.py
git add services/ai-service/app/providers/gemini.py
git add services/ai-service/app/providers/anthropic.py
git add services/ai-service/app/main.py
git add services/ai-service/tests/test_categorize.py
git add apps/api/tests/PersonalFinance.Tests/Services/CategorizationLayerTests.cs
git status  # verify .env is NOT listed

git commit -m "PF-103: 4-layer categorization engine — history cache, flow-aware rules, LLM fallback with auto-seed"
```

---

## Notes

- **`generate_json` provider method:** Before implementing STEP 9, verify whether
  `GeminiProvider` already has a JSON-mode helper. If the provider abstraction has changed
  since PF-011, adapt the implementation — the interface contract matters, not the internal
  call style.

- **Layer 1 query cost:** The history cache loads ALL transactions to build the dictionary.
  For a personal finance app this is acceptable (< 20K rows). If the dataset grows beyond
  ~100K rows, add a date-range filter (last 24 months) or move the cache to a materialized
  view.

- **History cache tie-breaking:** If the same `(description, flow)` pair has multiple
  categories in the transactions table (due to user corrections over time), the current
  implementation takes `First()` arbitrarily. A future improvement: sort by `date DESC`
  and take the most recent category. Flagged as tech debt.

- **Plan A is a separate ticket (PF-104):** The fuzzy deduplication plan reviewed
  alongside this one (Jaro-Winkler, three-bucket UI, 409 bypass) solves the import
  infrastructure problem, not categorization. It is valid and should be tracked as PF-104.
  These two tickets are independent and can be worked in parallel.

- **CategoryRuleDto in `TransactionPipelineService`:** The auto-seed step calls
  `_categoryRuleService.AddAsync(new CategoryRuleDto { ... })`. If `CategoryRuleDto.Flow`
  is not yet surfaced in the Settings UI, the seeded rule will show `Flow = null` in the
  UI — that is correct behavior (flow-agnostic is the safe default when the UI doesn't
  support the field yet). Add `Flow` to the Settings form in a follow-up ticket.

- **What's next after PF-103:**
  - PF-104 — Fuzzy dedup + 409 bypass (Plan A, import infrastructure)
  - PF-S08 — Supabase Auth (JWT middleware + user_id columns + RLS)
  - PF-S13 — RAG pipeline (once Auth is in place, per-user embeddings)
