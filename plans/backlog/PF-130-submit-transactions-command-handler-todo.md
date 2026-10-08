# PF-130 — Extract SubmitTransactions business logic into SubmitTransactionsCommandHandler

> **GitHub Issue:** _(create when scheduling)_
> **Status:** To Do
> **Started:** —

## Objective

`TransactionsController.SubmitTransactions` is ~60 lines of business logic — 4× the ARCH-04 limit — and `ResolveAccountIdsAsync` (another 50-line private method with Supabase queries and fuzzy scoring) compounds the violation. The controller also has 11 constructor dependencies, which is a symptom of this accumulated logic. This refactor creates `SubmitTransactionsCommandHandler` to own the full "batch submit" side-effect chain, moves `ResolveAccountIdsAsync` into `TransactionService` (the natural owner of all transaction-related Supabase queries), and reduces the controller action to ≤8 lines.

## Acceptance Criteria

- [ ] `TransactionsController.SubmitTransactions` action body is ≤ 10 lines (validate input + `_mediator.Send` + map response)
- [ ] `SubmitTransactionsCommandHandler` owns the full chain: EnsureCategoryRules → ResolveAccountIds → FilterOutDuplicates → AddTransactions → fire-and-forget embed → RegisterFileHash → UpsertAlias
- [ ] `ITransactionService` has `ResolveAccountIdsAsync(List<TransactionDto> transactions)` and `TransactionService` implements it
- [ ] `UploadPreview` calls `_transactionService.ResolveAccountIdsAsync()` (no longer calls the private controller method)
- [ ] Private scoring helpers (`Normalize`, `Tokenize`, `ScoreCandidate`, `ScoreBestMatch`, `_walletStopwords`) are deleted from the controller
- [ ] `SubmitTransactionsCommandHandlerTests.cs` covers: happy path, all-duplicates early return, empty embed items skipped, embed failure logged but response not affected
- [ ] `dotnet build` passes with zero warnings; `dotnet test` green

## Approach

Create `SubmitTransactionsCommand` (record) + `SubmitTransactionsCommandHandler` in `Application/Commands/`. Add `ResolveAccountIdsAsync` to `ITransactionService` and implement it in `TransactionService` by moving the method body and its private scoring helpers verbatim from the controller. Update both `SubmitTransactions` and `UploadPreview` to call the service method. Do not extract `CalculateFileHash` from the controller — it is a pure crypto utility with no Supabase dependency, so it is not a business logic violation. Do not touch any other action methods in the controller.

## Affected Files

| File | Change |
|------|--------|
| `apps/api/src/PersonalFinance.Application/Commands/SubmitTransactionsCommand.cs` | Create — command record + result record |
| `apps/api/src/PersonalFinance.Application/Commands/SubmitTransactionsCommandHandler.cs` | Create — MediatR handler, owns full submit chain |
| `apps/api/src/PersonalFinance.Application/Interfaces/ITransactionService.cs` | Edit — add `ResolveAccountIdsAsync` signature |
| `apps/api/src/PersonalFinance.Application/Services/TransactionService.cs` | Edit — implement `ResolveAccountIdsAsync` + move scoring helpers here |
| `apps/api/src/PersonalFinance.Api/Controllers/TransactionsController.cs` | Edit — slim `SubmitTransactions`; update `UploadPreview`; delete private scoring members |
| `apps/api/tests/PersonalFinance.Tests/Commands/SubmitTransactionsCommandHandlerTests.cs` | Create — xUnit + Moq handler tests |

---

## TODO

### [ ] STEP 1 — Create SubmitTransactionsCommand and result records

Create `apps/api/src/PersonalFinance.Application/Commands/SubmitTransactionsCommand.cs`:

```csharp
using MediatR;
using PersonalFinance.Application.Dtos;

namespace PersonalFinance.Application.Commands;

public record SubmitTransactionsCommand(
    List<TransactionDto> Transactions,
    string? FileHash,
    string? FileName) : IRequest<SubmitTransactionsResult>;

public record SubmitTransactionsResult(
    int ImportedCount,
    List<TransactionDto> Transactions);
```

> **Why:** MediatR commands are `record` types in this codebase (see `CreateAssetCommand`, `DeleteAllTransactionsCommand`). Separating the result record from the command record keeps the return shape explicit and mockable in tests. `SubmitTransactionsRequest` stays in the controller as the HTTP deserialization model — the command is the Application-layer contract.

---

### [ ] STEP 2 — Add ResolveAccountIdsAsync to ITransactionService

Edit `apps/api/src/PersonalFinance.Application/Interfaces/ITransactionService.cs` — add one method at the end of the interface:

```csharp
/// <summary>
/// Resolves account_id for each transaction that has an AccountName but no AccountId.
/// Queries accounts + institutions from Supabase; uses alias cache first, then fuzzy scoring.
/// Mutates the list in-place.
/// </summary>
Task ResolveAccountIdsAsync(List<TransactionDto> transactions);
```

> **Why:** ARCH-02 requires all interfaces in `Application/Interfaces/`. Adding the method to the existing interface (rather than a new `IAccountResolutionService`) keeps the abstraction flat — `ResolveAccountIdsAsync` is a transaction-concern (linking transactions to their accounts) and has no callers outside of the upload flow.

---

### [ ] STEP 3 — Implement ResolveAccountIdsAsync in TransactionService

Edit `apps/api/src/PersonalFinance.Application/Services/TransactionService.cs`.

Move the entire `ResolveAccountIdsAsync` body, `ScoreBestMatch`, `ScoreCandidate`, `Normalize`, `Tokenize`, and `_walletStopwords` verbatim from `TransactionsController.cs` into `TransactionService`. Change the method from `private` to `public` (to satisfy the interface). The scoring helpers remain `private static`. Confirm `TransactionService` already has `Supabase.Client` injected — the queries `_supabase.From<Account>()` and `_supabase.From<Institution>()` are already used there.

> **Why:** `TransactionService` already executes all account/alias Supabase queries (`ResolveAliasAsync`, `ResolveAliasesBatchAsync`, `UpsertAliasAsync`). Moving account-name resolution here is consistent with the existing responsibility boundary. The private static scoring methods have no external dependencies — they are pure and can be unit tested via the public `ResolveAccountIdsAsync` method.

---

### [ ] STEP 4 — Create SubmitTransactionsCommandHandler

Create `apps/api/src/PersonalFinance.Application/Commands/SubmitTransactionsCommandHandler.cs`:

```csharp
using MediatR;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Application.Commands;

public class SubmitTransactionsCommandHandler
    : IRequestHandler<SubmitTransactionsCommand, SubmitTransactionsResult>
{
    private readonly ICategoryRuleService _categoryRuleService;
    private readonly ITransactionService _transactionService;
    private readonly ILlmSearchClient _searchClient;
    private readonly ILogger<SubmitTransactionsCommandHandler> _logger;

    public SubmitTransactionsCommandHandler(
        ICategoryRuleService categoryRuleService,
        ITransactionService transactionService,
        ILlmSearchClient searchClient,
        ILogger<SubmitTransactionsCommandHandler> logger)
    {
        _categoryRuleService = categoryRuleService;
        _transactionService  = transactionService;
        _searchClient        = searchClient;
        _logger              = logger;
    }

    public async Task<SubmitTransactionsResult> Handle(
        SubmitTransactionsCommand request, CancellationToken cancellationToken)
    {
        await _categoryRuleService.EnsureCategoryRulesAsync(request.Transactions);
        await _transactionService.ResolveAccountIdsAsync(request.Transactions);

        var nonDuplicates = await _transactionService.FilterOutDuplicatesAsync(request.Transactions);
        if (nonDuplicates.Count == 0)
            return new SubmitTransactionsResult(0, []);

        var added = await _transactionService.AddTransactionsAsync(nonDuplicates);

        // Fire-and-forget: embedding is optional enrichment; failure must not break the upload response.
        _ = Task.Run(async () =>
        {
            try
            {
                var items = added
                    .Where(t => t.Id > 0)
                    .Select(t => new EmbedItemRequest(
                        TransactionId: t.Id,
                        Description:   t.Description,
                        Remarks:       t.Remarks ?? "",
                        Category:      t.Category ?? "",
                        Wallet:        t.AccountName ?? ""))
                    .ToList();
                if (items.Count > 0)
                    await _searchClient.EmbedTransactionsAsync(items);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Background embed failed for {Count} transactions", added.Count);
            }
        }, CancellationToken.None);

        if (!string.IsNullOrEmpty(request.FileHash))
            await _transactionService.RegisterFileHashAsync(
                request.FileHash, request.FileName ?? "uploaded_file");

        var first = request.Transactions
            .FirstOrDefault(t => t.AccountId.HasValue && !string.IsNullOrWhiteSpace(t.AccountName));
        if (first != null)
            await _transactionService.UpsertAliasAsync(first.AccountName, first.AccountId!.Value);

        return new SubmitTransactionsResult(added.Count, added);
    }
}
```

> **Why:** The handler injects only Application interfaces — no `Supabase.Client`, no `IMediator`, no infrastructure types. This satisfies ARCH-05. The fire-and-forget pattern is preserved verbatim from the controller because embedding must remain non-blocking; the `CancellationToken.None` is intentional (the HTTP request's cancellation token must not cancel background work).

---

### [ ] STEP 5 — Slim TransactionsController.SubmitTransactions and update UploadPreview

Edit `apps/api/src/PersonalFinance.Api/Controllers/TransactionsController.cs`:

**Replace `SubmitTransactions` body** with:
```csharp
[HttpPost("submit")]
public async Task<IActionResult> SubmitTransactions([FromBody] SubmitTransactionsRequest request)
{
    if (request.Transactions is not { Count: > 0 })
        return BadRequest("No transactions to submit.");

    var result = await _mediator.Send(
        new SubmitTransactionsCommand(request.Transactions, request.FileHash, request.FileName));

    if (result.ImportedCount == 0)
        return Ok(new { Message = "All transactions are duplicates. Nothing to import.", Transactions = Array.Empty<object>() });

    return Ok(new { Message = $"{result.ImportedCount} transactions imported successfully.", Transactions = result.Transactions });
}
```

**Update `UploadPreview`** — replace the two `await ResolveAccountIdsAsync(transactions)` calls with:
```csharp
await _transactionService.ResolveAccountIdsAsync(transactions);
```

**Delete** the following private members from the controller (they now live in `TransactionService`):
- `private async Task ResolveAccountIdsAsync(...)` — the full method body
- `private static string Normalize(string s)`
- `private static readonly HashSet<string> _walletStopwords`
- `private static HashSet<string> Tokenize(string s)`
- `private static float ScoreCandidate(...)`
- `private static (Guid? Id, bool IsFuzzy) ScoreBestMatch(...)`

**Keep:**
- `private string CalculateFileHash(Stream stream)` — still used in `UploadPreview`
- Constructor field `_categoryRuleService` — still used in `CategorizePreview` action
- Constructor field `_supabase` — still used by `GetAccountSummaries` and `ResolveAlias`

> **Why:** ARCH-04 caps action bodies at 15 lines. `SubmitTransactions` drops from ~60 to 8 lines. `UploadPreview`'s call to `ResolveAccountIdsAsync` must be updated simultaneously — leaving it pointing at the deleted private method would be a compile error.

---

### [ ] STEP 6 — Write handler tests

Create `apps/api/tests/PersonalFinance.Tests/Commands/SubmitTransactionsCommandHandlerTests.cs`:

```csharp
using Moq;
using Xunit;
using PersonalFinance.Application.Commands;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Application.Dtos;
using Microsoft.Extensions.Logging;

public class SubmitTransactionsCommandHandlerTests
{
    private readonly Mock<ICategoryRuleService> _categoryRules = new();
    private readonly Mock<ITransactionService>  _txService     = new();
    private readonly Mock<ILlmSearchClient>     _searchClient  = new();
    private readonly Mock<ILogger<SubmitTransactionsCommandHandler>> _logger = new();

    private SubmitTransactionsCommandHandler BuildHandler() =>
        new(_categoryRules.Object, _txService.Object, _searchClient.Object, _logger.Object);

    [Fact]
    public async Task Handle_WithValidTransactions_ReturnsImportedCount()
    {
        // Arrange
        var tx = new TransactionDto { Id = 1, Description = "GOPAY", AmountIdr = 50000 };
        _txService.Setup(s => s.FilterOutDuplicatesAsync(It.IsAny<IEnumerable<TransactionDto>>()))
                  .ReturnsAsync([tx]);
        _txService.Setup(s => s.AddTransactionsAsync(It.IsAny<IEnumerable<TransactionDto>>()))
                  .ReturnsAsync([tx]);
        var command = new SubmitTransactionsCommand([tx], FileHash: null, FileName: null);

        // Act
        var result = await BuildHandler().Handle(command, CancellationToken.None);

        // Assert
        Assert.Equal(1, result.ImportedCount);
        Assert.Single(result.Transactions);
    }

    [Fact]
    public async Task Handle_WhenAllDuplicates_ReturnsZeroCount()
    {
        // Arrange
        var tx = new TransactionDto { Description = "DUP" };
        _txService.Setup(s => s.FilterOutDuplicatesAsync(It.IsAny<IEnumerable<TransactionDto>>()))
                  .ReturnsAsync([]);
        var command = new SubmitTransactionsCommand([tx], FileHash: null, FileName: null);

        // Act
        var result = await BuildHandler().Handle(command, CancellationToken.None);

        // Assert
        Assert.Equal(0, result.ImportedCount);
        _txService.Verify(s => s.AddTransactionsAsync(It.IsAny<IEnumerable<TransactionDto>>()), Times.Never);
    }

    [Fact]
    public async Task Handle_WithFileHash_RegistersHash()
    {
        // Arrange
        var tx = new TransactionDto { Id = 1, Description = "TX" };
        _txService.Setup(s => s.FilterOutDuplicatesAsync(It.IsAny<IEnumerable<TransactionDto>>()))
                  .ReturnsAsync([tx]);
        _txService.Setup(s => s.AddTransactionsAsync(It.IsAny<IEnumerable<TransactionDto>>()))
                  .ReturnsAsync([tx]);
        var command = new SubmitTransactionsCommand([tx], FileHash: "abc123", FileName: "bca.csv");

        // Act
        await BuildHandler().Handle(command, CancellationToken.None);

        // Assert
        _txService.Verify(s => s.RegisterFileHashAsync("abc123", "bca.csv"), Times.Once);
    }

    [Fact]
    public async Task Handle_EmbedFailure_DoesNotThrow()
    {
        // Arrange — embed client throws; handler should swallow it
        var tx = new TransactionDto { Id = 1, Description = "TX" };
        _txService.Setup(s => s.FilterOutDuplicatesAsync(It.IsAny<IEnumerable<TransactionDto>>()))
                  .ReturnsAsync([tx]);
        _txService.Setup(s => s.AddTransactionsAsync(It.IsAny<IEnumerable<TransactionDto>>()))
                  .ReturnsAsync([tx]);
        _searchClient.Setup(s => s.EmbedTransactionsAsync(It.IsAny<IReadOnlyList<EmbedItemRequest>>(), It.IsAny<CancellationToken>()))
                     .ThrowsAsync(new HttpRequestException("AI service unreachable"));
        var command = new SubmitTransactionsCommand([tx], FileHash: null, FileName: null);

        // Act — should not throw even though embed fails
        var result = await BuildHandler().Handle(command, CancellationToken.None);

        // Assert
        Assert.Equal(1, result.ImportedCount);
        // Allow background Task.Run to complete
        await Task.Delay(200);
    }
}
```

> **Why:** These four tests cover the four branching behaviors identified in the handler: happy path, all-duplicates early exit, file hash registration, and embed failure isolation. The embed-failure test needs a brief `Task.Delay` because fire-and-forget runs on a background thread — this is the canonical pattern for testing fire-and-forget in xUnit.

---

## Notes

- `CalculateFileHash` stays in the controller — it is a pure `SHA256` utility (no Supabase dependency) used only in `UploadPreview`. Moving it would add noise without governance benefit.
- `GetAccountSummaries` and `ResolveAlias` actions still query `Supabase.Client` directly in the controller — this is a separate ARCH-04 violation, out of scope for this ticket. Track separately if needed.
- The `_walletStopwords` set is Indonesian-specific stop words for account name matching (`"rekening"`, `"tabungan"`, etc.). Add a comment in `TransactionService` when moving it so the business rationale is clear to future readers.
- This ticket does not change any HTTP contracts — the `POST /api/transactions/submit` request/response shape is unchanged.
- Run `dotnet test --filter "FullyQualifiedName~SubmitTransactions"` after Step 6 to verify handler tests in isolation before running the full suite.
