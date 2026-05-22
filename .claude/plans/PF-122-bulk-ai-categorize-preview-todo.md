# PF-122 — Bulk AI Categorization in Upload Preview

> **GitHub Issue:** [create before starting]
> **Status:** Completed
> **Started:** —

## Objective

Add a "✦ Suggest (N)" button to the Upload Preview page that sends all Uncategorized transactions
in one bulk LLM call and patches their category chips inline. This directly removes the monthly
friction of manually editing 5–15 residual "Uncategorized" rows that survive the deterministic
pipeline — while making it visually clear which categories were AI-suggested vs. rule-matched,
so the user can review before submitting.

## Acceptance Criteria

- [x] A "✦ Suggest (N)" button appears at the right of the "Ready to Save (N)" section header, only when N uncategorized rows exist; it is hidden when all rows are categorized
- [x] Clicking the button fires one HTTP call to `POST /api/transactions/categorize-preview`, which fires one LLM call to the Python AI service for all uncategorized descriptions at once
- [x] Category chips update inline (no page reload) with the AI-suggested category
- [x] AI-assigned chips show a `✦` sparkle prefix; the row gets a soft violet left border (`border-l-violet-400/50`)
- [x] Editing an AI-assigned row manually removes the sparkle + border (edit = user confirmation)
- [x] A dismissible inline notice appears below the section header: "✦ N categories suggested — review highlighted rows before submitting."
- [x] If the AI service is unreachable, the notice shows: "AI unavailable — categories unchanged. Edit manually." in destructive color; no chips are modified
- [x] During the LLM call (2–4 s): button shows "✦ Suggesting…" + spinner; Uncategorized chips pulse; Submit button is NOT blocked
- [x] `POST /api/transactions/categorize-preview` accepts `{ descriptions[], availableCategories[] }`; if `availableCategories` is empty it loads from `category_rules` via `ICategoryRuleService.GetAllAsync()`
- [x] `.NET` build passes; `dotnet test` passes with new handler tests

## Approach

New MediatR command `CategorizePreviewCommand` + handler in Application layer. The handler
calls `ILlmSuggestionClient.SuggestBatchAsync` (already wired) with the incoming descriptions
and available categories, then maps `MerchantSuggestion` results to a flat
`{ description, category, confidence }` response list. The controller action is ≤ 8 lines.
No changes to the Python AI service — `POST /suggest-categories` already handles bulk.
No changes to `TransactionPipelineService` — this is a UI-triggered on-demand path,
not the automatic upload pipeline.

## Affected Files

| File | Change |
|------|--------|
| `apps/api/src/PersonalFinance.Application/Commands/CategorizePreviewCommand.cs` | **Create** — command record + result DTO + handler |
| `apps/api/src/PersonalFinance.Api/Controllers/TransactionsController.cs` | **Edit** — add `POST categorize-preview` action (≤ 8 lines) |
| `apps/api/tests/PersonalFinance.Tests/Commands/CategorizePreviewCommandHandlerTests.cs` | **Create** — xUnit tests for handler |
| `apps/frontend/src/api/transactionsApi.ts` | **Edit** — add `suggestCategoriesBulk` function |
| `apps/frontend/src/components/TransactionPreview.tsx` | **Edit** — state, button, notice, sparkle chip, row border |

---

## TODO

### [x] STEP 1 — Create `CategorizePreviewCommand` + handler

**New file:** `apps/api/src/PersonalFinance.Application/Commands/CategorizePreviewCommand.cs`

```csharp
using MediatR;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Application.Commands;

public record CategorizePreviewCommand(
    List<string> Descriptions,
    List<string> AvailableCategories
) : IRequest<List<CategorizePreviewResult>>;

public record CategorizePreviewResult(
    string Description,
    string Category,
    double Confidence);

public class CategorizePreviewCommandHandler(
    ILlmSuggestionClient suggestionClient,
    ICategoryRuleService categoryRuleService)
    : IRequestHandler<CategorizePreviewCommand, List<CategorizePreviewResult>>
{
    public async Task<List<CategorizePreviewResult>> Handle(
        CategorizePreviewCommand request,
        CancellationToken ct)
    {
        if (request.Descriptions.Count == 0)
            return [];

        var categories = request.AvailableCategories.Count > 0
            ? request.AvailableCategories
            : (await categoryRuleService.GetAllAsync())
                .Select(r => r.Category)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Order()
                .ToList();

        if (categories.Count == 0)
            return [];

        var suggestions = await suggestionClient.SuggestBatchAsync(
            request.Descriptions, categories, ct);

        // Map MerchantSuggestion back to description-keyed results.
        // SuggestBatchAsync matches on MerchantPattern (= description sent in).
        return suggestions
            .Select(s => new CategorizePreviewResult(
                s.MerchantPattern,
                s.SuggestedCategory,
                s.Confidence))
            .ToList();
    }
}
```

> **Why MediatR command instead of direct controller injection?**
> `TransactionsController` already has 10 constructor injections. Adding `ILlmSuggestionClient`
> as an 11th violates ARCH-04 and continues the known tech debt. A handler keeps the controller
> thin and makes this logic independently testable with Moq.

---

### [x] STEP 2 — Add controller action `POST /api/transactions/categorize-preview`

**File:** `apps/api/src/PersonalFinance.Api/Controllers/TransactionsController.cs`

Add this action after the existing `HealthCheck` action (before `UploadPreview`):

```csharp
[HttpPost("categorize-preview")]
public async Task<IActionResult> CategorizePreview([FromBody] CategorizePreviewRequest request)
{
    if (request.Descriptions is not { Count: > 0 })
        return BadRequest(new { Message = "At least one description is required." });

    var results = await _mediator.Send(
        new CategorizePreviewCommand(request.Descriptions, request.AvailableCategories ?? []));

    return Ok(new { Results = results });
}
```

Add the request DTO at the bottom of the controller file (or in `Application/Dtos/`):

```csharp
public record CategorizePreviewRequest(
    List<string> Descriptions,
    List<string>? AvailableCategories);
```

Build to verify:
```bash
cd apps/api && dotnet build PersonalFinance.slnx
```

> **Why `AvailableCategories` is nullable here but `List<string>` in the command?**
> The HTTP layer accepts null (frontend may omit it); the handler normalises to empty list
> and falls back to DB lookup. This keeps the controller action contract loose while the
> handler contract stays explicit.

---

### [x] STEP 3 — Write handler tests

**New file:** `apps/api/tests/PersonalFinance.Tests/Commands/CategorizePreviewCommandHandlerTests.cs`

```csharp
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using PersonalFinance.Application.Commands;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;

public class CategorizePreviewCommandHandlerTests
{
    private static Mock<ILlmSuggestionClient> SuggestionClient(
        List<MerchantSuggestion>? returns = null)
    {
        var mock = new Mock<ILlmSuggestionClient>();
        mock.Setup(x => x.SuggestBatchAsync(
                It.IsAny<List<string>>(),
                It.IsAny<List<string>>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(returns ?? []);
        return mock;
    }

    private static Mock<ICategoryRuleService> CategoryService(List<string> categories)
    {
        var mock = new Mock<ICategoryRuleService>();
        mock.Setup(x => x.GetAllAsync())
            .ReturnsAsync(categories.Select(c => new CategoryRuleDto { Category = c }).ToList());
        return mock;
    }

    [Fact]
    public async Task Handle_WithSuggestions_ReturnsMappedResults()
    {
        // Arrange
        var suggestions = new List<MerchantSuggestion>
        {
            new("BI-FAST CR TRANSFER", "Transfer", "BI-FAST", 0.92),
            new("KARTU KREDIT/PL BCA CARD", "Transfer", "KARTU KREDIT", 0.88),
        };
        var handler = new CategorizePreviewCommandHandler(
            SuggestionClient(suggestions).Object,
            CategoryService(["Transfer", "Income", "Food"]).Object);

        var command = new CategorizePreviewCommand(
            ["BI-FAST CR TRANSFER", "KARTU KREDIT/PL BCA CARD"],
            ["Transfer", "Income", "Food"]);

        // Act
        var result = await handler.Handle(command, default);

        // Assert
        Assert.Equal(2, result.Count);
        Assert.Equal("Transfer", result[0].Category);
        Assert.Equal(0.92, result[0].Confidence, precision: 2);
    }

    [Fact]
    public async Task Handle_EmptyAvailableCategories_LoadsFromService()
    {
        // Arrange — no categories in request, handler should call GetAllAsync
        var catService = CategoryService(["Transfer", "Food"]);
        var handler = new CategorizePreviewCommandHandler(
            SuggestionClient().Object, catService.Object);

        var command = new CategorizePreviewCommand(["some description"], []);

        // Act
        await handler.Handle(command, default);

        // Assert
        catService.Verify(x => x.GetAllAsync(), Times.Once);
    }

    [Fact]
    public async Task Handle_EmptyDescriptions_ReturnsEmpty()
    {
        var handler = new CategorizePreviewCommandHandler(
            SuggestionClient().Object,
            CategoryService(["Transfer"]).Object);

        var result = await handler.Handle(
            new CategorizePreviewCommand([], ["Transfer"]), default);

        Assert.Empty(result);
    }
}
```

Run:
```bash
cd apps/api && dotnet test --filter "FullyQualifiedName~CategorizePreviewCommandHandlerTests"
```

> **Why test `EmptyAvailableCategories_LoadsFromService` explicitly?**
> The DB fallback path is the one that fires when the frontend omits `availableCategories`.
> Without this test, that branch is invisible in CI and would silently break if `GetAllAsync`
> signature changes.

---

### [x] STEP 4 — Add `suggestCategoriesBulk` to frontend API client

**File:** `apps/frontend/src/api/transactionsApi.ts`

Add after `submitTransactions`:

```typescript
export interface BulkSuggestResult {
  description: string;
  category: string;
  confidence: number;
}

export async function suggestCategoriesBulk(
  descriptions: string[],
  availableCategories: string[] = []
): Promise<BulkSuggestResult[]> {
  const res = await fetch(`${BASE_URL}/categorize-preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ descriptions, availableCategories }),
  });
  if (!res.ok) {
    const error: any = new Error('AI categorization failed');
    error.response = res;
    throw error;
  }
  const data = await res.json();
  return data.results as BulkSuggestResult[];
}
```

> **Why pass `availableCategories` from the frontend rather than always loading from DB?**
> The frontend already has the full category list in `CORE_CATEGORIES + customCategories`
> at the time the user clicks "Suggest". Sending it saves one Supabase round-trip in the
> handler and ensures the LLM's options match exactly what the user sees in the combobox.

---

### [x] STEP 5 — Update `TransactionPreview.tsx` — state and AI action

**File:** `apps/frontend/src/components/TransactionPreview.tsx`

**5a. Add import** at the top:
```typescript
import { Loader2, Sparkles } from 'lucide-react';
import * as transactionsApi from '@/api/transactionsApi';
// (transactionsApi already imported — just add Loader2, Sparkles to lucide-react import)
```

**5b. Add three new state variables** after the existing `useState` declarations (around line 162):
```typescript
const [aiSuggestedIds, setAiSuggestedIds] = useState<Set<string>>(new Set());
const [isAiLoading, setIsAiLoading] = useState(false);
const [aiNotice, setAiNotice] = useState<string | null>(null);
```

**5c. Add the bulk AI handler function** after `cancelEdit` (around line 183):
```typescript
const handleBulkAiSuggest = async () => {
  const uncategorized = editedTransactions.filter(
    t => !t.isDuplicate && t.category === 'Uncategorized'
  );
  if (uncategorized.length === 0) return;

  setIsAiLoading(true);
  setAiNotice(null);

  try {
    const allCategories = [...new Set([...CORE_CATEGORIES, ...customCategories])].sort();
    const results = await transactionsApi.suggestCategoriesBulk(
      uncategorized.map(t => t.description),
      allCategories
    );

    if (results.length === 0) {
      setAiNotice('AI returned no suggestions — try editing manually.');
      return;
    }

    const resultMap = new Map(results.map(r => [r.description.toLowerCase(), r]));
    const newAiIds = new Set<string>();

    setEditedTransactions(prev => prev.map(t => {
      if (t.isDuplicate || t.category !== 'Uncategorized') return t;
      const match = resultMap.get(t.description.toLowerCase());
      if (!match) return t;
      newAiIds.add(t.id);
      return { ...t, category: match.category };
    }));

    setAiSuggestedIds(prev => new Set([...prev, ...newAiIds]));
    setAiNotice(
      newAiIds.size > 0
        ? `✦ ${newAiIds.size} ${newAiIds.size === 1 ? 'category' : 'categories'} suggested — review highlighted rows before submitting.`
        : 'AI could not determine categories for remaining rows — edit manually.'
    );
  } catch {
    setAiNotice('AI unavailable — categories unchanged. Edit manually.');
  } finally {
    setIsAiLoading(false);
  }
};
```

**5d. Clear AI state when user manually edits a row.** In `confirmEdit` (around line 169):
```typescript
const confirmEdit = (tx: Transaction) => {
  setEditedIds(prev => new Set([...prev, tx.id]));
  // Remove AI badge when user manually confirms their edit
  setAiSuggestedIds(prev => { const next = new Set(prev); next.delete(tx.id); return next; });
  setEditingId(null);
  setEditSnapshot(null);
};
```

**5e. Derived value** for uncategorized count (after `summary` useMemo, around line 235):
```typescript
const uncategorizedCount = useMemo(
  () => newTransactions.filter(t => t.category === 'Uncategorized').length,
  [newTransactions]
);
```

> **Why check for `'Uncategorized'` (capital U) specifically?**
> The pipeline renames "Untracked Expense" to "Uncategorized" in PF-105. The chip
> text in the DB and DTO is this exact string. If the default changes again, update here.

---

### [x] STEP 6 — Update `TransactionPreview.tsx` — section header + notice

**File:** `apps/frontend/src/components/TransactionPreview.tsx`

**6a. Replace the "Ready to Save" section header** (around line 508–513). Change:

```tsx
<div className="flex items-center justify-between shrink-0">
  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
    <span className="w-2 h-2 rounded-full bg-success"></span>
    Ready to Save ({newTransactions.length})
  </h3>
</div>
```

To:

```tsx
<div className="flex items-center justify-between shrink-0">
  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
    <span className="w-2 h-2 rounded-full bg-success"></span>
    Ready to Save ({newTransactions.length})
  </h3>
  {uncategorizedCount > 0 && (
    <button
      onClick={handleBulkAiSuggest}
      disabled={isAiLoading}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium text-muted-foreground hover:text-foreground border border-border hover:border-foreground/30 transition-colors disabled:opacity-50"
    >
      {isAiLoading ? (
        <><Loader2 className="w-3 h-3 animate-spin" />Suggesting…</>
      ) : (
        <><Sparkles className="w-3 h-3" />Suggest ({uncategorizedCount})</>
      )}
    </button>
  )}
</div>
```

**6b. Add the inline notice** immediately after the header div (before the `<div className="flex-1 min-h-0">`):

```tsx
{aiNotice && (
  <div className={cn(
    "flex items-center justify-between text-[10px] px-1 py-1",
    aiNotice.startsWith('AI unavailable') || aiNotice.startsWith('AI could not')
      ? "text-destructive/70"
      : "text-muted-foreground"
  )}>
    <span>{aiNotice}</span>
    <button
      onClick={() => setAiNotice(null)}
      className="ml-2 text-muted-foreground/50 hover:text-muted-foreground"
    >×</button>
  </div>
)}
```

> **Why inline notice instead of a toast?**
> Toasts are for background async events. This notice is synchronous and directly describes
> rows visible in the same viewport — placing it inline keeps the information adjacent to
> what it refers to and avoids the spatial disconnect of a corner toast.

---

### [x] STEP 7 — Update `TransactionPreview.tsx` — sparkle chip + row border

**File:** `apps/frontend/src/components/TransactionPreview.tsx`

**7a. Update the category chip display** (in `renderRow`, non-editing state, around line 424).
Replace:
```tsx
<span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-secondary text-secondary-foreground">
  {tx.category}
</span>
```

With:
```tsx
<span
  className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-secondary text-secondary-foreground"
  title={aiSuggestedIds.has(tx.id) ? 'Suggested by AI — tap edit to change' : undefined}
>
  {aiSuggestedIds.has(tx.id) && (
    <span className="mr-1 text-muted-foreground/50">✦</span>
  )}
  {isAiLoading && tx.category === 'Uncategorized'
    ? <span className="animate-pulse">Uncategorized</span>
    : tx.category}
</span>
```

**7b. Add AI row border to the `<tr>` className logic** (around line 353–358):
```tsx
<tr key={tx.id} className={cn(
  "hover:bg-accent transition-colors border-l-2",
  isEditing  && "bg-accent/40 border-l-primary",
  isInvalid  && !isEditing && "border-l-destructive",
  isEdited   && !isEditing && !isInvalid && "border-l-success/60",
  aiSuggestedIds.has(tx.id) && !isEditing && !isEdited && !isInvalid && "border-l-violet-400/50",
  !isEditing && !isEdited && !isInvalid && !aiSuggestedIds.has(tx.id) && "border-l-transparent",
)}>
```

> **Why violet specifically?** The app's functional color palette uses green (income), red
> (expense), blue/primary (editing), green (success/edited). Violet is the only standard
> Tailwind hue not already claimed by a semantic meaning — it reads as "AI/AI-related"
> without conflicting with the existing color grammar.

---

### [x] STEP 8 — Build + smoke test

```bash
# Backend
cd apps/api && dotnet build PersonalFinance.slnx && dotnet test

# Frontend
cd apps/frontend && npm run build && npm run lint
```

Then with full stack running (`supabase start`, AI service, .NET API, `npm run dev`):

1. Upload a BCA CSV with transactions that will produce "Uncategorized" rows in the preview
2. Verify "✦ Suggest (9)" button appears at top-right of the "Ready to Save" section
3. Click it — verify spinner, Uncategorized chips pulse for ~2–4 s
4. Verify chips update with category names + sparkle prefix
5. Verify violet left borders on AI-assigned rows
6. Edit one AI row → verify sparkle + border disappear on save
7. Dismiss notice with × → verify it disappears
8. Submit → verify submit succeeds normally

---

## Notes

- `SuggestBatchAsync` returns `MerchantSuggestion(MerchantPattern, ...)`. The `MerchantPattern`
  field is the description string that was sent in — the frontend matches on this to update
  the right row. Case-insensitive lookup in `handleBulkAiSuggest` handles any casing drift.

- The Python `/suggest-categories` endpoint sanitizes descriptions internally (strips long
  numeric sequences). The `MerchantPattern` in the response is the sanitized form, not the
  original. The frontend does `.toLowerCase()` comparison which catches most mismatches,
  but if descriptions are heavily sanitized the match may miss. This is acceptable — a miss
  leaves the row "Uncategorized", which is the current state anyway.

- `CORE_CATEGORIES` in `TransactionPreview.tsx` (line 21–37) is a hardcoded list that may
  diverge from the user's actual `category_rules` over time. The `suggestCategoriesBulk`
  call passes both `CORE_CATEGORIES` + `customCategories` — the LLM suggestion is constrained
  to what's visible in the combobox. This is intentional: don't let the LLM invent categories
  the user hasn't seen.

- This ticket is independent of PF-103 (4-layer pipeline). Layer 3 runs automatically at
  upload time. This button is an on-demand retry path for the residual rows Layer 3 missed.
  Both can coexist — the button just re-runs the batch suggestion on the remaining gaps.

- **Next after PF-122:** If categorization accuracy is consistently high (< 3 rows uncategorized
  per upload), the button will naturally become invisible most of the time. At that point,
  consider promoting it to a tooltip hint on the "Uncategorized" badge instead of a section
  header button.
