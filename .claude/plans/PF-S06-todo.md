# PF-S06 — Rewrite CQRS handlers + services — DbContext → supabase-csharp

> **GitHub Issue:** [#69](https://github.com/rikky-hermanto/personal-finance/issues/69)
> **Status:** Done
> **Phase:** 2 — Replace EF Core with supabase-csharp
> **Depends on:** PF-S05 (entities must have `[Table]`/`[Column]` attributes)

## Objective

Replace every `AppDbContext` reference in command handlers and services with the `supabase-csharp` PostgREST fluent API. This is the change that makes the frontend see live data — currently the API reads from the old EF Core PostgreSQL connection instead of Supabase. It also absorbs the N+1 fix (PF-039) and dashboard aggregation rewrite (PF-040).

## Acceptance Criteria

- [ ] All 4 command handlers updated: `AppDbContext` → `Supabase.Client`
- [ ] `CategoryRuleService` updated: all DB calls use `_supabase.From<CategoryRule>()`
- [ ] `TransactionService` updated: all DB calls use `_supabase.From<Transaction>()`
- [ ] `AddTransactionsAsync` uses bulk insert — one `Insert(list)` call, not one per row (N+1 fix)
- [ ] `CategorizeAsync` loads all matching rules in a single call, then matches in memory (N+1 fix)
- [ ] `FilterOutDuplicatesAsync` queries Supabase and matches in memory
- [ ] No `using PersonalFinance.Persistence` imports remain in Application layer
- [ ] `dotnet build` passes with 0 errors
- [ ] Category Rules page shows data from Supabase in the browser

## PostgREST API Patterns (supabase-csharp v1.1.1)

```csharp
// Inject in constructor
private readonly Supabase.Client _supabase;

// Get all
var result = await _supabase.From<CategoryRule>().Get();
var list = result.Models;

// Get all with filter + order
var result = await _supabase.From<CategoryRule>()
    .Filter("type", Supabase.Postgrest.Constants.Operator.ILike, type)
    .Order("keyword_length", Supabase.Postgrest.Constants.Ordering.Descending)
    .Get();

// Get single by id
var result = await _supabase.From<CategoryRule>()
    .Filter("id", Supabase.Postgrest.Constants.Operator.Equals, id.ToString())
    .Single();

// Insert single — returns inserted entity with DB-generated id
var result = await _supabase.From<CategoryRule>().Insert(entity);
var inserted = result.Models.First();

// Bulk insert — returns all inserted rows
var result = await _supabase.From<Transaction>().Insert(entities);
var inserted = result.Models;

// Update via Set chain
await _supabase.From<CategoryRule>()
    .Filter("id", Supabase.Postgrest.Constants.Operator.Equals, id.ToString())
    .Set(x => x.Keyword, newKeyword)
    .Set(x => x.Type, newType)
    .Set(x => x.Category, newCategory)
    .Set(x => x.KeywordLength, newKeyword.Length)
    .Update();

// Delete
await _supabase.From<CategoryRule>()
    .Filter("id", Supabase.Postgrest.Constants.Operator.Equals, id.ToString())
    .Delete();
```

**Key differences from EF Core:**
- No `SaveChangesAsync()` — each call commits immediately (PostgREST = REST over Postgres)
- No `FindAsync()` — use `.Filter("id", Operator.Equals, id.ToString()).Single()`
- No LINQ `.Where()/.OrderBy()/.Contains()` — use `.Filter()/.Order()/.In()`
- `ILike` for case-insensitive string match (replaces `.ToLower() == x.ToLower()`)
- `Operator.In` for IN-clause (replaces `.Contains()` in LINQ)

## Affected Files

| File | Change |
|------|--------|
| `Application/Commands/CreateCategoryRuleCommandHandler.cs` | `AppDbContext` → `Supabase.Client`, `AddAsync/SaveChanges` → `Insert()` |
| `Application/Commands/UpdateCategoryRuleCommandHandler.cs` | `AppDbContext` → `Supabase.Client`, `FindAsync/SaveChanges` → `Filter().Set().Update()` |
| `Application/Commands/DeleteCategoryRuleCommandHandler.cs` | `AppDbContext` → `Supabase.Client`, `FindAsync/Remove/SaveChanges` → `Filter().Delete()` |
| `Application/Commands/CreateTransactionCommandHandler.cs` | `AppDbContext` → `Supabase.Client`, `AddAsync/SaveChanges` → `Insert()` |
| `Application/Services/CategoryRuleService.cs` | Replace all `_dbContext.*` with `_supabase.From<CategoryRule>()` |
| `Application/Services/TransactionService.cs` | Replace all `_dbContext.*` with `_supabase.From<Transaction>()`, fix N+1 |

## TODO

### [ ] STEP 1 — Rewrite `CreateCategoryRuleCommandHandler.cs`

Remove `using PersonalFinance.Persistence` and `using Microsoft.EntityFrameworkCore`.
Inject `Supabase.Client` instead of `AppDbContext`.

```csharp
using FluentValidation;
using MediatR;
using PersonalFinance.Application.Commands;
using PersonalFinance.Domain.Entities;

public class CreateCategoryRuleCommandHandler : IRequestHandler<CreateCategoryRuleCommand, CategoryRule>
{
    private readonly Supabase.Client _supabase;
    private readonly IValidator<CreateCategoryRuleCommand> _validator;
    private readonly IMediator _mediator;

    public CreateCategoryRuleCommandHandler(Supabase.Client supabase, IMediator mediator, IValidator<CreateCategoryRuleCommand> validator)
    {
        _supabase = supabase;
        _validator = validator;
        _mediator = mediator;
    }

    public async Task<CategoryRule> Handle(CreateCategoryRuleCommand request, CancellationToken cancellationToken)
    {
        await _validator.ValidateAndThrowAsync(request, cancellationToken);

        var result = await _supabase.From<CategoryRule>().Insert(request.CategoryRule);
        var inserted = result.Models.First();

        await _mediator.Publish(new CategoryRuleCreatedEvent(inserted), cancellationToken);
        return inserted;
    }
}
```

---

### [ ] STEP 2 — Rewrite `UpdateCategoryRuleCommandHandler.cs`

```csharp
using MediatR;
using PersonalFinance.Application.Commands;
using PersonalFinance.Domain.Entities;
using Supabase.Postgrest.Constants;

public class UpdateCategoryRuleCommandHandler : IRequestHandler<UpdateCategoryRuleCommand, CategoryRule?>
{
    private readonly Supabase.Client _supabase;

    public UpdateCategoryRuleCommandHandler(Supabase.Client supabase)
    {
        _supabase = supabase;
    }

    public async Task<CategoryRule?> Handle(UpdateCategoryRuleCommand request, CancellationToken cancellationToken)
    {
        // Check existence before updating
        var existing = await _supabase.From<CategoryRule>()
            .Filter("id", Operator.Equals, request.Id.ToString())
            .Single();
        if (existing == null) return null;

        await _supabase.From<CategoryRule>()
            .Filter("id", Operator.Equals, request.Id.ToString())
            .Set(x => x.Keyword, request.Rule.Keyword)
            .Set(x => x.Type, request.Rule.Type)
            .Set(x => x.Category, request.Rule.Category)
            .Set(x => x.KeywordLength, request.Rule.Keyword.Length)
            .Update();

        existing.Keyword = request.Rule.Keyword;
        existing.Type = request.Rule.Type;
        existing.Category = request.Rule.Category;
        return existing;
    }
}
```

---

### [ ] STEP 3 — Rewrite `DeleteCategoryRuleCommandHandler.cs`

```csharp
using MediatR;
using PersonalFinance.Application.Commands;
using PersonalFinance.Domain.Entities;
using Supabase.Postgrest.Constants;

public class DeleteCategoryRuleCommandHandler : IRequestHandler<DeleteCategoryRuleCommand, bool>
{
    private readonly Supabase.Client _supabase;

    public DeleteCategoryRuleCommandHandler(Supabase.Client supabase)
    {
        _supabase = supabase;
    }

    public async Task<bool> Handle(DeleteCategoryRuleCommand request, CancellationToken cancellationToken)
    {
        var existing = await _supabase.From<CategoryRule>()
            .Filter("id", Operator.Equals, request.Id.ToString())
            .Single();
        if (existing == null) return false;

        await _supabase.From<CategoryRule>()
            .Filter("id", Operator.Equals, request.Id.ToString())
            .Delete();
        return true;
    }
}
```

---

### [ ] STEP 4 — Rewrite `CreateTransactionCommandHandler.cs`

```csharp
using FluentValidation;
using MediatR;
using PersonalFinance.Domain.Entities;

public class CreateTransactionCommandHandler : IRequestHandler<CreateTransactionCommand, Transaction>
{
    private readonly Supabase.Client _supabase;
    private readonly IMediator _mediator;
    private readonly IValidator<CreateTransactionCommand> _validator;

    public CreateTransactionCommandHandler(Supabase.Client supabase, IMediator mediator, IValidator<CreateTransactionCommand> validator)
    {
        _supabase = supabase;
        _mediator = mediator;
        _validator = validator;
    }

    public async Task<Transaction> Handle(CreateTransactionCommand request, CancellationToken cancellationToken)
    {
        await _validator.ValidateAndThrowAsync(request, cancellationToken);

        var result = await _supabase.From<Transaction>().Insert(request.Transaction);
        var inserted = result.Models.First();

        await _mediator.Publish(new TransactionCreatedEvent(inserted), cancellationToken);
        return inserted;
    }
}
```

---

### [ ] STEP 5 — Rewrite `CategoryRuleService.cs`

Key changes:
- Inject `Supabase.Client` instead of `AppDbContext`
- Remove `using Microsoft.EntityFrameworkCore` and `using PersonalFinance.Persistence`
- `CategorizeAsync` loads all rules once, matches in memory (fixes N+1)
- `GetAllAsync` / `GetByIdAsync` use PostgREST queries

```csharp
using MediatR;
using PersonalFinance.Application.Commands;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Domain.Entities;
using Supabase.Postgrest.Constants;

public class CategoryRuleService : ICategoryRuleService
{
    private readonly Supabase.Client _supabase;
    private readonly IMediator _mediator;

    public CategoryRuleService(Supabase.Client supabase, IMediator mediator)
    {
        _supabase = supabase;
        _mediator = mediator;
    }

    public async Task<string> CategorizeAsync(string description, string type)
    {
        // Load all rules for this type once — fixes N+1 (PF-039)
        var result = await _supabase.From<CategoryRule>()
            .Filter("type", Operator.ILike, type)
            .Order("keyword_length", Ordering.Descending)
            .Get();

        foreach (var rule in result.Models)
        {
            if (description.Contains(rule.Keyword, StringComparison.OrdinalIgnoreCase))
                return rule.Category;
        }

        return "Untracked Category";
    }

    public async Task<List<CategoryRuleDto>> GetAllAsync()
    {
        var result = await _supabase.From<CategoryRule>()
            .Order("keyword_length", Ordering.Descending)
            .Get();
        return result.Models.Select(MapToDto).ToList();
    }

    public async Task<CategoryRuleDto?> GetByIdAsync(int id)
    {
        var rule = await _supabase.From<CategoryRule>()
            .Filter("id", Operator.Equals, id.ToString())
            .Single();
        return rule == null ? null : MapToDto(rule);
    }

    public async Task<CategoryRuleDto> AddAsync(CategoryRuleDto ruleDto)
    {
        var rule = MapToEntity(ruleDto);
        var created = await _mediator.Send(new CreateCategoryRuleCommand(rule));
        return MapToDto(created);
    }

    public async Task<CategoryRuleDto?> UpdateAsync(int id, CategoryRuleDto ruleDto)
    {
        var rule = MapToEntity(ruleDto);
        var updated = await _mediator.Send(new UpdateCategoryRuleCommand(id, rule));
        return updated == null ? null : MapToDto(updated);
    }

    public async Task<bool> DeleteAsync(int id)
    {
        return await _mediator.Send(new DeleteCategoryRuleCommand(id));
    }

    private static CategoryRuleDto MapToDto(CategoryRule entity) => new()
    {
        Id = entity.Id,
        Keyword = entity.Keyword,
        Type = entity.Type,
        Category = entity.Category,
        KeywordLength = entity.KeywordLength
    };

    private static CategoryRule MapToEntity(CategoryRuleDto dto) => new()
    {
        Id = dto.Id,
        Keyword = dto.Keyword,
        Type = dto.Type,
        Category = dto.Category
    };
}
```

> **Why no `KeywordLength` in `MapToEntity`?** The setter is a no-op — the getter computes from `Keyword.Length`. No need to set it explicitly when building a local entity object.

---

### [ ] STEP 6 — Rewrite `TransactionService.cs`

Key changes:
- Inject `Supabase.Client`
- `AddTransactionsAsync`: bulk insert via `Insert(list)` — one DB round-trip (fixes N+1)
- `FilterOutDuplicatesAsync`: load candidate transactions from Supabase then match in memory
- `GetTransactionsWithBalanceAsync`: use `.Filter()` + `.Order()`
- `GetTransactionByIdAsync`: use `.Filter("id", ...).Single()`
- Remove all `DbUpdateException` catch — no longer relevant (PostgREST throws `PostgrestException`)

```csharp
using FluentValidation;
using MediatR;
using PersonalFinance.Application.Dtos;
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Domain.Entities;
using Supabase.Postgrest.Constants;

public class TransactionService : ITransactionService
{
    private readonly Supabase.Client _supabase;
    private readonly IMediator _mediator;

    public TransactionService(Supabase.Client supabase, IMediator mediator)
    {
        _supabase = supabase;
        _mediator = mediator;
    }

    public async Task<List<TransactionDto>> AddTransactionsAsync(IEnumerable<TransactionDto> transactionDtos)
    {
        var entities = transactionDtos.Select(MapToEntity).ToList();

        // Bulk insert — one DB round-trip (N+1 fix for PF-039)
        var result = await _supabase.From<Transaction>().Insert(entities);

        return result.Models.Select(MapToDto).ToList();
    }

    public async Task<List<TransactionDto>> FilterOutDuplicatesAsync(IEnumerable<TransactionDto> transactionDtos)
    {
        var dtoList = transactionDtos.ToList();
        var wallets = dtoList.Select(t => t.Wallet).Distinct().ToList();

        // Load existing transactions for these wallets — then dedup in memory
        var result = await _supabase.From<Transaction>()
            .Filter("wallet", Operator.In, wallets)
            .Get();

        var existingKeySet = new HashSet<string>(
            result.Models.Select(t => $"{t.Date:u}|{t.Description}|{t.Flow}|{t.Type}|{t.Wallet}")
        );

        return dtoList
            .Where(t => !existingKeySet.Contains($"{t.Date:u}|{t.Description}|{t.Flow}|{t.Type}|{t.Wallet}"))
            .ToList();
    }

    public async Task<List<TransactionDto>> GetTransactionsWithBalanceAsync(string? wallet)
    {
        var query = _supabase.From<Transaction>()
            .Order("date", Ordering.Ascending)
            .Order("id", Ordering.Ascending);

        if (!string.IsNullOrEmpty(wallet))
            query = query.Filter("wallet", Operator.Equals, wallet);

        var result = await query.Get();

        var runningBalance = 0m;
        return result.Models.Select(t =>
        {
            runningBalance += t.Flow == "CR" ? t.AmountIdr : -t.AmountIdr;
            var dto = MapToDto(t);
            dto.Balance = runningBalance;
            return dto;
        }).ToList();
    }

    public async Task<TransactionDto?> GetTransactionByIdAsync(int id)
    {
        var entity = await _supabase.From<Transaction>()
            .Filter("id", Operator.Equals, id.ToString())
            .Single();
        return entity == null ? null : MapToDto(entity);
    }

    private static Transaction MapToEntity(TransactionDto dto) => new()
    {
        Date = dto.Date,
        Description = dto.Description,
        Remarks = dto.Remarks,
        Flow = dto.Flow,
        Type = dto.Type,
        Category = dto.Category,
        Wallet = dto.Wallet,
        AmountIdr = dto.AmountIdr,
        Currency = dto.Currency,
        ExchangeRate = dto.ExchangeRate
    };

    private static TransactionDto MapToDto(Transaction t) => new()
    {
        Id = t.Id,
        Date = t.Date,
        Description = t.Description,
        Remarks = t.Remarks,
        Flow = t.Flow,
        Type = t.Type,
        Category = t.Category,
        Wallet = t.Wallet,
        AmountIdr = t.AmountIdr,
        Currency = t.Currency,
        ExchangeRate = t.ExchangeRate
    };
}
```

> **Why no `Id` in `MapToEntity` for INSERT?** `[PrimaryKey("id", shouldInsert: false)]` tells the Postgrest client to exclude `id` from INSERT payloads. Setting it on the C# object before insert is harmless but the field won't be sent. The returned `result.Models` contains the DB-assigned id.

> **Why wallet-only filter in `FilterOutDuplicatesAsync`?** PostgREST `.Filter()` calls chain as AND. Filtering by all 5 dedup fields with `In` operators would require complex query composition. Loading by wallet (the most selective filter in practice) and deduplicating in memory gives the same correctness guarantee with simpler code.

---

### [ ] STEP 7 — Build verification

```bash
cd apps/api && dotnet build PersonalFinance.slnx
```

Expected: **0 errors**. If `AppDbContext` is still referenced anywhere in Application layer, the build will fail (Persistence project references are still there until PF-S07, but Application should no longer import them).

---

### [ ] STEP 8 — Smoke test in browser

1. Start Supabase local: `supabase start`
2. Start API: `cd apps/api && dotnet run --project src/PersonalFinance.Api`
3. Start frontend: `cd apps/frontend && npm run dev`
4. Open `http://localhost:8080/categories`
5. Verify category rules table loads data  
 
