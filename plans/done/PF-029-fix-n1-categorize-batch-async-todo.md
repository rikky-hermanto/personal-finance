# PF-029 — Fix N+1 query in CategorizeAsync

> **GitHub Issue:** [#37](https://github.com/rikky-hermanto/personal-finance/issues/37)
> **Status:** Done
> **Started:** 2026-05-01

## Objective

`CategorizeAsync(description, type)` is called once per transaction row inside each parser's loop. Every call issues a live Supabase PostgREST query filtered by type. A 500-row BCA file = 500 separate HTTP queries to the DB. Fix by adding `CategorizeBatchAsync` — load all rules once, categorize the full list in-memory. Addresses PERF-01 governance rule.

> **Correction note:** Memory previously recorded this as resolved in PF-S06. It was not — confirmed 2026-05-01. Three parsers still call `CategorizeAsync` inside foreach loops. The service now uses supabase-csharp but the per-call pattern was unchanged from the EF Core version.

## Acceptance Criteria

- [x] `CategorizeBatchAsync(List<TransactionDto>)` added to `ICategoryRuleService`
- [x] Implementation in `CategoryRuleService` loads all rules in a single Supabase query, matches in-memory
- [x] `CategorizeAsync(string, string)` kept intact (still needed for single-item callers)
- [x] All three parsers updated: `BcaCsvParser`, `DefaultCsvParser`, `NeoBankPdfParser`
- [x] `dotnet build` succeeds
- [x] Existing tests pass

## Approach

Add `CategorizeBatchAsync` to the interface and service. Inside, load all `CategoryRule` rows ordered by `keyword_length` descending in one PostgREST call, then loop through transactions in-memory applying the longest-match rule. Update each parser to collect all `TransactionDto`s first, then call the batch method once at the end of `ParseAsync` rather than categorizing mid-loop. `CategorizeAsync(string, string)` stays on the interface for any future single-item use.

Out of scope: adding a new test for this (PF-034 covers handler/service tests; this can be captured there). The build + existing tests passing is sufficient verification here.

## Affected Files

| File | Change |
|------|--------|
| `src/PersonalFinance.Application/Interfaces/ICategoryRuleService.cs` | Add `CategorizeBatchAsync` signature |
| `src/PersonalFinance.Application/Services/CategoryRuleService.cs` | Implement `CategorizeBatchAsync` |
| `src/PersonalFinance.Infrastructure/Parsers/BcaCsvParser.cs` | Replace per-row `CategorizeAsync` call with end-of-parse batch call |
| `src/PersonalFinance.Infrastructure/Parsers/DefaultCsvParser.cs` | Same |
| `src/PersonalFinance.Infrastructure/Parsers/NeoBankPdfParser.cs` | Same |

---

## TODO

### [x] STEP 1 — Add `CategorizeBatchAsync` to `ICategoryRuleService`

In `src/PersonalFinance.Application/Interfaces/ICategoryRuleService.cs`, add one line:

```csharp
Task<List<TransactionDto>> CategorizeBatchAsync(List<TransactionDto> transactions);
```

> **Why:** Interface-first keeps the contract stable before touching any implementation. The method takes ownership of the list and returns it categorized — callers don't need to manage state.

---

### [x] STEP 2 — Implement `CategorizeBatchAsync` in `CategoryRuleService`

In `src/PersonalFinance.Application/Services/CategoryRuleService.cs`, add this method:

```csharp
public async Task<List<TransactionDto>> CategorizeBatchAsync(List<TransactionDto> transactions)
{
    _logger.LogDebug("Batch categorizing {Count} transactions.", transactions.Count);

    var result = await _supabase.From<CategoryRule>()
        .Order("keyword_length", Ordering.Descending)
        .Get();

    var rules = result.Models;

    foreach (var tx in transactions)
    {
        var typeRules = rules.Where(r => r.Type.Equals(tx.Type, StringComparison.OrdinalIgnoreCase));
        foreach (var rule in typeRules)
        {
            if (tx.Description.Contains(rule.Keyword, StringComparison.OrdinalIgnoreCase))
            {
                tx.Category = rule.Category;
                break;
            }
        }
    }

    return transactions;
}
```

> **Why no `.Filter()` on type here:** We load ALL rules once and filter in-memory per transaction. This is the key trade-off: one slightly larger payload (all rules regardless of type) vs. zero extra round-trips. With 106 rules and small payloads, this is always faster. The original `CategorizeAsync` filtered by type at the DB level — correct for single calls but disastrous at scale.
>
> **Why `Ordering.Descending` on `keyword_length`:** Longest keyword wins. "GRABCAR JAKARTA" should match "GRABCAR" before "GRAB". Pre-sorting at the DB level means no in-memory sort needed.

---

### [x] STEP 3 — Update `BcaCsvParser`

In `src/PersonalFinance.Infrastructure/Parsers/BcaCsvParser.cs`:

1. Remove the `CategorizeAsync` call from inside the row-parsing loop (around line 86).
2. Set `Category = "Untracked Expense"` as default (it was already there as the initial value before the per-row call overwrote it).
3. After the loop, add a single batch call before `return`:

```csharp
// After the foreach loop that builds transactions:
await _categoryRuleService.CategorizeBatchAsync(transactions);

_logger.LogInformation("BCA CSV parsing complete. Parsed {Count} transactions.", transactions.Count);
return transactions;
```

> **Why remove the per-row call but keep the default:** Each `TransactionDto` is created with `Category = "Untracked Expense"`. If `CategorizeBatchAsync` finds no matching rule, the default stays. If it finds one, it overwrites. This is functionally identical to the old behavior — just done once at the end.

---

### [x] STEP 4 — Update `DefaultCsvParser`

Same pattern as Step 3 — in `src/PersonalFinance.Infrastructure/Parsers/DefaultCsvParser.cs`:

1. Remove the `CategorizeAsync` call from inside the parsing loop (around line 78).
2. Add `await _categoryRuleService.CategorizeBatchAsync(transactions);` before `return`.

---

### [x] STEP 5 — Update `NeoBankPdfParser`

Same pattern — in `src/PersonalFinance.Infrastructure/Parsers/NeoBankPdfParser.cs`:

1. Remove the `CategorizeAsync` call from inside the parsing loop (around line 112).
2. Add `await _categoryRuleService.CategorizeBatchAsync(transactions);` before `return`.

---

### [x] STEP 6 — Build and verify

```bash
cd apps/api && dotnet build PersonalFinance.slnx
```

Then:

```bash
cd apps/api && dotnet test
```

> **What to check:** Zero build errors, all existing tests green. The change is purely internal — no API contract changes, no DTO changes.

---

## Notes

- `CategorizeAsync(string, string)` is kept on the interface deliberately. It may be useful for single-item categorization in future features (e.g., real-time categorization of a manually entered transaction). Don't remove it.
- The N+1 in `SubmitTransactions` (`GetAllAsync()` called per DTO) is a separate issue — covered in PF-031.
- If parsers are ever made stateless (injected per-request), the batch pattern already aligns with that — rules are fetched fresh per `ParseAsync` call, not cached at service lifetime.
- Update memory file after closing: note that PF-029 memory entry was incorrect and has now been corrected.
