# Categorization Pipeline

**Audience:** Developer working on the Personal Finance codebase — adding rules, debugging a mismatch, extending the AI service, or understanding why a transaction landed in the wrong category.

**Scope:** How every transaction gets its `category` value assigned, from file upload to database save. Covers the rule engine, the cold-start problem, LLM fallback, auto-seeding, and the data schema behind all of it.

---

## The Problem This Solves

Bank statements contain raw merchant text like `GRAB-220522-TRF`, `PLN PREPAID 0231941`, or `BI-FAST CR/SALARY`. There is no universal taxonomy. Each bank formats descriptions differently, amounts can be debit or credit for the same concept, and a new user starts with zero history.

The system needs to assign a meaningful category (e.g., "Transportation", "Utilities", "Income") to every transaction — accurately, cheaply, and immediately even for a brand-new user who has never imported before.

---

## Architecture Overview

The pipeline is a **4-layer cascade**. Each layer is tried in order. When a layer produces a confident answer, the remaining layers are skipped. The layers are ordered cheapest-first: cache hits cost a single DB query; LLM calls cost API latency and money.

```
  INCOMING TRANSACTION BATCH
           │
           ▼
  ┌─────────────────────┐
  │   PRE-GATE          │  Source-supplied Type + Category? → keep as-is, skip all layers
  └─────────┬───────────┘
            │ not pre-categorized
            ▼
  ┌─────────────────────┐
  │   LAYER 0           │  Description history cache   (DB query once, O(1) lookups)
  │   Description Cache │
  └─────────┬───────────┘
            │ cache miss
            ▼
  ┌─────────────────────┐
  │   LAYER 1           │  Remarks history cache       (same DB query, O(1) lookups)
  │   Remarks Cache     │
  └─────────┬───────────┘
            │ cache miss
            ▼
  ┌─────────────────────┐
  │   LAYER 2           │  User rules (keyword match, flow-aware, longest-first)
  │   Rule Engine       │
  └─────────┬───────────┘
            │ no rule match
            ▼
  ┌─────────────────────┐
  │   LAYER 2b          │  Preset fallback (same match logic, immutable seeded rules)
  │   Preset Fallback   │
  └─────────┬───────────┘
            │ no preset match
            ▼
  ┌─────────────────────┐
  │   LAYER 3           │  LLM categorization (Gemini via Python AI service)
  │   LLM Fallback      │  → auto-seeds new rule if confidence ≥ 0.85
  └─────────┬───────────┘
            │ still unresolved
            ▼
  ┌─────────────────────┐
  │   LAYER 4           │  Upload preview → user manually assigns category
  │   Manual Review     │  → user creates a rule for next time
  └─────────────────────┘
```

**Result:** At steady state (user has 2–3 months of history), ~85% of transactions resolve at Layer 0/1, ~10% at Layer 2/2b, ~5% at LLM. Manual review is rare.

---

## Upload Flow (End-to-End)

This is the sequence that runs every time a user imports a bank statement.

```
  User uploads file
        │
        ▼
  TransactionsController.UploadPreview()
        │
        ├─► BankIdentifier.IdentifyAsync()     ← sniffs file, returns bank code
        │
        ├─► IBankStatementParser.ParseAsync()  ← extracts raw TransactionDto list
        │       (BCA CSV / NeoBank PDF / LLM PDF / etc.)
        │
        └─► TransactionPipelineService.ProcessAsync()
                │
                ├─ Step 1: DateNormalizer
                ├─ Step 2: DecimalFixer
                ├─ Step 3: CurrencyStandardizer
                ├─ Step 4: SchemaValidator
                ├─ Step 5: CategoryRuleService.CategorizeBatchAsync()   ← Layers 0–2b
                ├─ Step 6: LLM categorization for remaining "Untracked" ← Layer 3
                └─ Step 7: DeduplicateCheck

        ▼
  Return preview JSON to frontend
  (two tables: Ready to Save / Duplicates, each row has assigned category)

  User reviews + clicks Confirm
        │
        ▼
  TransactionsController.SubmitTransactions()
        │
        ├─► EnsureCategoryRulesAsync()   ← persist any rules the user created in the preview
        ├─► ResolveAccountIdsAsync()     ← map Wallet string → account_id UUID
        ├─► AddTransactionsAsync()       ← insert into transactions table
        └─► RegisterFileHashAsync()      ← track file hash to prevent re-import
```

---

## Layer-by-Layer Reference

### Pre-Gate: Source-Supplied Preservation

**When it fires:** The imported file is a master CSV that already has explicit `Type` and `Category` columns filled in (not defaults).

**What it does:** If a transaction arrives with both a non-default `Type` AND a non-default `Category` already set, those values are treated as ground truth and no categorization layer runs.

**Why:** A user who pre-categorizes their own CSV export expects those values to survive the import. Overriding them silently would be data loss.

**Source:** `CategoryRuleService.CategorizeBatchAsync()` — pre-gate check at the top of the batch loop.

---

### Layer 0: Description History Cache

**Lookup key:** `(Squash(description), flow)` — description lowercased, whitespace collapsed, paired with flow direction.

**Data source:** A single Supabase query that fetches all previously saved transactions with a non-empty category. This query runs once per batch. All subsequent lookups are in-memory dictionary reads.

**Match rule:** If `(squash(description), flow)` exists in the cache, the most frequently assigned category for that key wins.

**Rationale:** Merchant names are stable. "GRAB JATIM 1245" and "GRAB JAKARTA 9012" both squash to a match against a prior "GRAB *" transaction. The most common past category is a strong signal.

**Example:**
```
Prior transaction in DB:
  description = "GRAB JAKARTA 9012"
  flow        = "DB"
  category    = "Transportation"

Incoming transaction:
  description = "GRAB JATIM 1245"
  flow        = "DB"

Squash("GRAB JAKARTA 9012") = "grab jakarta 9012"
Squash("GRAB JATIM 1245")   = "grab jatim 1245"
→ No exact match (different descriptions)
→ Falls through to Layer 1
```

> Note: Layer 0 requires an exact squash match on the full description string. It does not do substring matching. That is Layer 2's job.

---

### Layer 1: Remarks History Cache

**Lookup key:** `(Squash(remarks), flow)` — same squash logic, applied to the remarks field.

**Data source:** Same Supabase query as Layer 0. Both caches are built in a single pass.

**When it's useful:** Bank-generated remarks are often more stable than descriptions. `SAVING INTEREST`, `BIAYA ADMIN`, `BUNGA DEPOSITO` appear verbatim every month regardless of other transaction details.

**Example:**
```
Prior transaction:
  remarks  = "BIAYA ADMIN"
  flow     = "DB"
  category = "Admin Fee"

Incoming transaction:
  description = "BCA MONTHLY FEE 052026"
  remarks     = "BIAYA ADMIN"
  flow        = "DB"

→ Layer 0: no description match
→ Layer 1: Squash("BIAYA ADMIN", "DB") → HIT → category = "Admin Fee"
```

---

### Layer 2: Rule Engine (User Rules)

Rules are stored in the `category_rules` table. Each rule has:

```
keyword        — substring to search for (e.g., "GRAB", "STARBUCKS", "TRANSFER")
type           — "Expense", "Income", or "Asset Transfer"
category       — the category to assign on match (e.g., "Transportation")
flow           — "CR", "DB", or NULL (NULL = matches either direction)
keyword_length — auto-computed from keyword, used for priority ordering
```

**Match logic:**

1. Load all rules from `category_rules`, ordered by `keyword_length DESC` (longest match wins).
2. Filter rules to those whose `type` matches the transaction's type.
3. Within that filtered set, try in this priority order:
   - **Flow-specific rules** — where `rule.flow == transaction.flow`
   - **Flow-agnostic rules** — where `rule.flow == NULL`
4. For each candidate rule (longest-first), check whether `Squash(rule.keyword)` is a substring of `Squash(transaction.description)`.
5. On match, assign `rule.category`. Stop.
6. If no description match, repeat steps 3–5 against `transaction.remarks`.

**Longest-match priority example:**
```
Rules (ordered by keyword_length DESC):
  keyword="GRAB FOOD"   category="Food & Dining"
  keyword="GRAB"        category="Transportation"

Transaction: description="GRAB FOOD JAKARTA", flow="DB", type="Expense"

→ Try "GRAB FOOD" first (longer) → "grab food" in "grab food jakarta" → HIT
→ category = "Food & Dining"   (not "Transportation" — longer rule wins)
```

**Flow-aware example:**
```
Rules:
  keyword="TRANSFER", type="Income", flow="CR",  category="Transfer In"
  keyword="TRANSFER", type="Expense", flow="DB",  category="Transfer Out"
  keyword="TRANSFER", type="Expense", flow=NULL,  category="Transfer"

Transaction: description="TRANSFER TO MOM", flow="DB", type="Expense"

→ Flow-specific match: "TRANSFER" in description, flow="DB" → HIT
→ category = "Transfer Out"
```

**Source:** `CategoryRuleService.CategorizeBatchAsync()` — Layer 2 block.

---

### Layer 2b: Preset Fallback

**What it is:** An identical copy of the Layer 2 match logic, but running against the `category_presets` table instead of `category_rules`.

**Why it exists:** Users start with zero custom rules. Without presets, every first-time transaction would fall through to LLM. Presets cover ~330 common Indonesian merchant and banking patterns seeded via migrations — covering GoPay, Shopee, PLN, BCA fees, salary deposits, ATM withdrawals, and more.

**Immutability:** Users cannot edit presets. They can only create user rules (Layer 2) that shadow a preset for a specific keyword. A user rule for the same keyword always wins over a preset because both run identical priority logic and Layer 2 is tried first.

**Seed migrations:**
```
supabase/migrations/20260510000002_seed_category_presets.sql         ← ~115 base rules
supabase/migrations/20260510000003_seed_category_presets_extended.sql ← ~208 extended rules
```

**Preset examples (selected):**

```
Keyword              Type          Category
───────────────────  ────────────  ─────────────────
GRAB                 Expense       Transportation
GOJEK                Expense       Transportation
STARBUCKS            Expense       Food & Dining
INDOMARET            Expense       Groceries
ALFAMART             Expense       Groceries
SHOPEE               Expense       Shopping
TOKOPEDIA            Expense       Shopping
PLN PREPAID          Expense       Utilities
TELKOMSEL            Expense       Utilities
BPJS                 Expense       Health
TARIKAN ATM          Expense       Withdrawing
BIAYA ADMIN          Expense       Admin Fee
GOPAY                Expense       E-Wallet
SALARY               Income        Income
GAJI                 Income        Income
BUNGA                Income        Income
BI-FAST CR           Income        Transfer         ← flow=CR
TRANSFER             Expense       Transfer         ← flow=DB
AJAIB                Expense       Investment
BIBIT                Expense       Investment
```

---

### Layer 3: LLM Fallback

**When it runs:** A transaction has survived Layers 0–2b without a category match and is still tagged `"Untracked Expense"` or `"Untracked Income"`.

**Orchestrator:** `TransactionPipelineService.ApplyLlmCategorizationAsync()`.

**Two-phase process:**

```
Phase 1: Batch suggestion
  ─────────────────────────────────────────────────────────
  Collect all unresolved descriptions from the batch
       │
       ▼
  POST /suggest-categories (Python AI service)
  { merchants: ["GO MIE GO RESTAURANT", "BAKSO MAS BUDI", ...],
    available_categories: [...16 categories...] }
       │
       ▼
  Returns: [ { merchant_pattern, suggested_keyword, category, confidence }, ... ]
       │
       ▼
  Filter: keep only confidence ≥ 0.85 + pass PII check
       │
       ▼
  Auto-seed: write new CategoryRule for each approved suggestion
  → Future transactions hit Layer 2 instead of LLM


Phase 2: Per-transaction LLM call (for any still unresolved after Phase 1)
  ─────────────────────────────────────────────────────────
  For each remaining "Untracked" transaction:
       │
       ▼
  POST /categorize (Python AI service)
  { description, remarks, flow, amount_idr, wallet,
    available_categories: [...] }
       │
       ▼
  Returns: { category: "Food & Dining", confidence: 0.94 }
       │
       ├─ confidence ≥ 0.85 → auto-seed CategoryRule + apply category
       └─ confidence < 0.85 → apply category only (no rule seeded)
```

**Available categories for LLM constraint:**

The system passes the list of distinct categories already present in the user's rules. If the user has no rules yet (cold start), it falls back to the 16 default categories:

```
"Admin Fee", "Education", "E-Wallet", "Entertainment", "Food & Dining",
"Groceries", "Health", "Income", "Investment", "Saving",
"Shopping", "Transfer", "Transportation", "Travel", "Utilities", "Withdrawing"
```

Constraining the LLM to the user's own category vocabulary prevents it from inventing new category names.

**PII filter (Phase 1):** The merchant suggester rejects any keyword that matches:
```
\d{7,}                  — 7+ consecutive digits (account numbers)
(\+62|08\d{2})\d+       — Indonesian phone numbers
\bA\/N\b                — "atas nama" (person name marker)
\bREK\b                 — "rekening" (account marker)
```

This prevents the system from auto-seeding rules like `keyword="08123456789"`.

**Source files:**
- `apps/api/src/PersonalFinance.Application/Services/TransactionPipelineService.cs`
- `services/ai-service/app/services/categorizer.py`
- `services/ai-service/app/services/merchant_suggester.py`

---

### Layer 4: Manual Review

**When it applies:** The upload preview returns a transaction with category `"Untracked Expense"` or `"Untracked Income"`.

**What the user can do:**
1. Edit the category directly in the preview table.
2. Optionally attach a `CategoryRuleDto` to the transaction (a new rule for this keyword).

**What happens on submit:** `EnsureCategoryRulesAsync()` persists any `CategoryRuleDto` attached to transactions in the batch. These rules are added to `category_rules` and take effect for the next import.

---

## Cold Start: A New User's First Import

A new user has an empty `category_rules` table and an empty `transactions` table. Here is what the cascade looks like on their very first import:

```
Layer 0 (Description cache)    → MISS   — no prior transactions exist
Layer 1 (Remarks cache)        → MISS   — no prior transactions exist
Layer 2 (User rules)           → MISS   — no user rules exist
Layer 2b (Presets)             → HIT    — for ~90% of common Indonesian merchants
Layer 3 (LLM)                  → runs for the remaining ~10% novel transactions
  └─ auto-seeds rules for confident results (confidence ≥ 0.85)
Layer 4 (Manual)               → user fixes any remaining edge cases
```

**After first import:**
- Preset rules handled the bulk of common transactions immediately.
- LLM auto-seeded new custom rules for novel merchants.
- The user's `category_rules` table now has entries even though the user never wrote a rule manually.

**After second import (next month's statement):**
- Layer 0/1 cache resolves recurring merchants instantly (no rule needed, no LLM).
- Layer 2 resolves any merchant the LLM auto-seeded last month.
- LLM only runs for genuinely new merchants.

**Steady state (after 3–4 months):**
```
Layer 0/1 resolves:  ~85% of transactions
Layer 2/2b resolves: ~10% of transactions
LLM resolves:        ~5%  of transactions
Manual:              < 1% of transactions
```

---

## The `Squash()` Function

Used in Layers 0, 1, and 2 to normalize text before comparison:

```csharp
private static string Squash(string? s)
    => string.IsNullOrWhiteSpace(s)
        ? string.Empty
        : Regex.Replace(s.Trim().ToLowerInvariant(), @"\s+", " ");
```

- Trims leading/trailing whitespace
- Lowercases everything
- Collapses multiple spaces into one

This means `"BIAYA   ADMIN"` matches `"biaya admin"`, and `"STARBUCKS JAKARTA"` contains `"starbucks"`.

---

## Data Schema

### `category_rules` table (user-defined rules)

```
Column           Type          Notes
───────────────  ────────────  ──────────────────────────────────────────────
id               integer       PK
keyword          varchar(100)  substring to match in description or remarks
type             varchar(50)   "Expense", "Income", or "Asset Transfer"
category         varchar(100)  the category to assign on match
keyword_length   integer       auto-computed = keyword.Length; used for ORDER BY
flow             varchar(5)    "CR", "DB", or NULL (any direction)
```

`keyword_length` is always computed from `keyword` on INSERT/UPDATE inside the `CategoryRule` domain entity. It is never set directly by callers — this keeps priority ordering consistent.

### `category_presets` table (seeded defaults, immutable)

Identical schema to `category_rules`. Users cannot modify presets — Layer 2 (user rules) always runs before Layer 2b (presets), so a user rule for the same keyword silently overrides the preset.

### `transactions` table (relevant categorization columns)

```
Column     Type          Notes
─────────  ────────────  ────────────────────────────────────────────────────
category   varchar(100)  assigned by the pipeline; "Untracked Expense" = unresolved
type       varchar(15)   "Expense", "Income", "Asset Transfer"
flow       varchar(5)    "CR" (credit) or "DB" (debit)
```

---

## Key Interfaces

### `ICategoryRuleService` (Application layer)

```csharp
Task<string> CategorizeAsync(string description, string type);
Task<List<TransactionDto>> CategorizeBatchAsync(List<TransactionDto> transactions);
Task<List<CategoryRuleDto>> GetAllAsync();
Task<CategoryRuleDto?> GetByIdAsync(int id);
Task<CategoryRuleDto> AddAsync(CategoryRuleDto rule);
Task<CategoryRuleDto?> UpdateAsync(int id, CategoryRuleDto rule);
Task<bool> DeleteAsync(int id);
Task<bool> DeleteAllAsync();
Task EnsureCategoryRulesAsync(List<TransactionDto> transactions);
```

`CategorizeBatchAsync` is the main entry point. It runs Layers 0, 1, 2, and 2b. Layer 3 (LLM) is orchestrated separately by `TransactionPipelineService`.

### `ILlmCategorizationClient` (Infrastructure layer)

```csharp
Task<(string Category, double Confidence)> CategorizeAsync(
    string description,
    string remarks,
    string flow,
    decimal amountIdr,
    string wallet,
    IReadOnlyList<string> availableCategories);
```

The HTTP client to the Python AI service `/categorize` endpoint. Returns the category name and a 0.0–1.0 confidence score.

---

## REST API (Category Rules)

These endpoints let users manage Layer 2 rules directly.

| Method     | Path                        | What it does                               |
|------------|-----------------------------|--------------------------------------------|
| `GET`      | `/api/category-rules`       | List all user rules, ordered by length DESC |
| `POST`     | `/api/category-rules`       | Create a new rule                          |
| `PUT`      | `/api/category-rules/{id}`  | Update an existing rule                    |
| `DELETE`   | `/api/category-rules/{id}`  | Delete a rule                              |
| `DELETE`   | `/api/category-rules/reset` | Delete all user rules (reset to presets)   |
| `GET`      | `/api/category-rules/export`| Download rules as CSV                      |
| `POST`     | `/api/category-rules/import`| Upload rules from CSV                      |

Presets (`category_presets`) are read-only and have no management endpoints. They are applied automatically in Layer 2b.

---

## Adding a New Category Rule

**Via API:**
```bash
curl -X POST http://localhost:7208/api/category-rules \
  -H "Content-Type: application/json" \
  -d '{
    "keyword": "NETFLIX",
    "type": "Expense",
    "category": "Entertainment",
    "flow": "DB"
  }'
```

`keyword_length` is computed server-side — do not pass it in the request.

**Via migration (for presets):**

Add a row to the next `seed_category_presets_*.sql` migration file following the existing pattern:
```sql
INSERT INTO category_presets (keyword, type, category, keyword_length, flow)
VALUES ('NETFLIX', 'Expense', 'Entertainment', 7, 'DB');
```

`keyword_length` must be set explicitly in SQL since there is no domain entity on the migration path.

---

## Worked Examples

### Example 1: Steady-state hit (Layer 0)

```
Prior transaction (DB):
  description = "GRAB-220522-TRF9012"
  flow        = "DB"
  category    = "Transportation"

Incoming transaction:
  description = "GRAB-220623-TRF1234"
  flow        = "DB"

Layer 0 key: Squash("GRAB-220522-TRF9012") = "grab-220522-trf9012"
             Squash("GRAB-220623-TRF1234") = "grab-220623-trf1234"
→ Exact squash mismatch → Layer 0 MISS

Layer 2 (rule engine):
  User has rule: keyword="GRAB", type="Expense", flow="DB", category="Transportation"
  "grab" in "grab-220623-trf1234" → HIT
→ category = "Transportation"
```

> Note: In this case the descriptions differ month-to-month (timestamp suffix), so Layer 0 misses. Layer 2 catches it via the "GRAB" keyword rule. After a few months, if descriptions stabilize, Layer 0 starts hitting.

---

### Example 2: Cold start + LLM auto-seed

```
First-ever import. Transactions table is empty.

Incoming:
  description = "WARUNG MAKAN SEJATI 88"
  flow        = "DB"
  type        = "Expense"

Layer 0: MISS (no history)
Layer 1: MISS (no history)
Layer 2: MISS (no user rules)
Layer 2b (presets): No preset for "WARUNG MAKAN SEJATI 88"
  → Try "WARUNG MAKAN" → not in presets
  → Try "WARUNG" → HIT if preset exists, else MISS
  (Assume "WARUNG" is in extended presets → HIT → "Food & Dining")

If preset covers it: category = "Food & Dining" immediately.

If NOT covered:
→ Layer 3 LLM call:
  POST /categorize { description: "WARUNG MAKAN SEJATI 88", ... }
  Response: { category: "Food & Dining", confidence: 0.93 }
  → confidence ≥ 0.85 → auto-seed:
     CategoryRule { keyword: "WARUNG MAKAN SEJATI 88", type: "Expense",
                    flow: "DB", category: "Food & Dining" }
→ category = "Food & Dining"

Next month, same merchant:
→ Layer 2: keyword "WARUNG MAKAN SEJATI 88" matches → HIT immediately
   (no LLM needed, cost = zero)
```

---

### Example 3: Flow-ambiguous transfer

```
Transaction A:
  description = "TRANSFER BCA 9012"
  flow        = "DB"
  type        = "Expense"

Transaction B:
  description = "TRANSFER BCA 9012"
  flow        = "CR"
  type        = "Income"

Rules:
  keyword="TRANSFER BCA", type="Expense", flow="DB",  category="Transfer Out"
  keyword="TRANSFER BCA", type="Income",  flow="CR",  category="Transfer In"

Transaction A → type="Expense", flow="DB" → "Transfer Out"
Transaction B → type="Income",  flow="CR" → "Transfer In"
```

Flow-awareness prevents salary transfers and outgoing payments from landing in the same bucket.

---

## Performance Characteristics

| Layer          | Data source           | Latency        | Typical hit rate (steady state) |
|----------------|-----------------------|----------------|---------------------------------|
| Pre-gate       | In-memory check       | < 1ms          | ~5% (pre-categorized imports)   |
| Layer 0        | In-memory dict        | < 1ms          | ~65%                            |
| Layer 1        | In-memory dict        | < 1ms          | ~10%                            |
| Layer 2        | In-memory list        | < 5ms          | ~10%                            |
| Layer 2b       | In-memory list        | < 5ms          | ~5%                             |
| Layer 3 (LLM)  | HTTP → Python service | 2–4s per batch | ~5%                             |
| Layer 4        | User input            | manual         | < 1%                            |

**Batch optimization:** Layers 0 and 1 share a single Supabase query that fetches all categorized transactions. The batch is resolved with no additional queries — no N+1 problem.

**LLM batching:** Phase 1 (batch suggestion) sends all unresolved descriptions in a single request to the AI service. Only transactions that still lack a category after Phase 1 trigger individual `/categorize` calls.

---

## Source File Map

```
apps/api/src/PersonalFinance.Application/
  Services/
    CategoryRuleService.cs          ← Layers 0, 1, 2, 2b implementation
    TransactionPipelineService.cs   ← Layer 3 orchestration + pipeline stages
  Interfaces/
    ICategoryRuleService.cs         ← ICategoryRuleService interface
  Dtos/
    CategoryRuleDto.cs              ← API contract for rules
    TransactionDto.cs               ← Processing unit (carries CategoryRuleDto)

apps/api/src/PersonalFinance.Domain/
  Entities/
    CategoryRule.cs                 ← DB entity, auto-computes keyword_length
    CategoryPreset.cs               ← DB entity for presets

apps/api/src/PersonalFinance.Infrastructure/
  External/
    LlmCategorizationClient.cs      ← HTTP client to POST /categorize
    LlmSuggestionClient.cs          ← HTTP client to POST /suggest-categories

apps/api/src/PersonalFinance.Api/
  Controllers/
    CategoryRulesController.cs      ← CRUD endpoints for user rules
    TransactionsController.cs       ← upload-preview + submit endpoints

services/ai-service/app/services/
  categorizer.py                    ← LLM single-transaction categorization
  merchant_suggester.py             ← Batch pattern extraction + PII filter

supabase/migrations/
  20260510000002_seed_category_presets.sql          ← ~115 base preset rules
  20260510000003_seed_category_presets_extended.sql ← ~208 extended preset rules
```

---

## Further Reading

- [validation-pipeline.md](validation-pipeline.md) — the 5 normalization stages that run before categorization
- [bank-profiles-reference.md](bank-profiles-reference.md) — bank parser configs and how raw descriptions are produced
- [API-endpoints.md](API-endpoints.md) — full endpoint reference including category rules and transaction submission
- [AI service rules](.claude/rules/ai-service.md) — LLM extraction patterns, error contracts, and provider abstraction
