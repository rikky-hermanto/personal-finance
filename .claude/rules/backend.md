---
description: Rules for .NET backend development
globs: apps/api/**
---

# Backend Development Rules (.NET 9)

## Clean Architecture Layers

**Dependency direction: Domain ← Application ← Infrastructure/Persistence ← Api**

| Layer | Location | Dependencies | Contains |
|-------|----------|-------------|----------|
| Domain | `apps/api/src/PersonalFinance.Domain/` | None | Entities, domain events |
| Application | `apps/api/src/PersonalFinance.Application/` | Domain | Commands, handlers, validators, services, interfaces, DTOs |
| Infrastructure | `apps/api/src/PersonalFinance.Infrastructure/` | Application | Bank parsers, file I/O, external integrations |
| Persistence | `apps/api/src/PersonalFinance.Persistence/` | Domain | DbContext, migrations, DI extension |
| Api | `apps/api/src/PersonalFinance.Api/` | All layers | Controllers, middleware, Program.cs (composition root) |

**Rules:**
- Domain MUST have zero dependencies on other projects
- Application MUST NOT reference Infrastructure, Persistence, or Api
- Controllers MUST NOT use DbContext directly — always go through services or MediatR

## CQRS Pattern (MediatR)

Follow these exact patterns from the existing codebase:

**Command:** `public record Create{Entity}Command({Entity} {Entity}) : IRequest<{Entity}>;`
**Handler:**
```csharp
public class Create{Entity}CommandHandler : IRequestHandler<Create{Entity}Command, {Entity}>
{
    // Inject: AppDbContext, IMediator, IValidator<Create{Entity}Command>
    // 1. Validate via FluentValidation: await _validator.ValidateAndThrowAsync(request)
    // 2. Persist: await _dbContext.{Entities}.AddAsync(entity)
    // 3. SaveChanges: await _dbContext.SaveChangesAsync()
    // 4. Publish event: await _mediator.Publish(new {Entity}CreatedEvent(entity))
    // 5. Return entity
}
```
**Validator:** `public class Create{Entity}CommandValidator : AbstractValidator<Create{Entity}Command>`

All commands and handlers go in `Application/Commands/`.
All validators go in `Application/Validation/`.

## Adding a New Entity (checklist)

1. Entity class → `Domain/Entities/{Entity}.cs`
2. DbSet → `Persistence/AppDbContext.cs` (add property + `OnModelCreating` config)
3. Migration → `dotnet ef migrations add Add{Entity} --project src/PersonalFinance.Persistence --startup-project src/PersonalFinance.Api`
4. DTO → `Application/Dtos/` or `Infrastructure/Dtos/`
5. Command + Handler → `Application/Commands/Create{Entity}Command.cs` and handler
6. Validator → `Application/Validation/Create{Entity}CommandValidator.cs`
7. Domain Event → `Domain/Events/{Entity}CreatedEvent.cs` (implements `INotification`)
8. Service interface + implementation → `Application/Interfaces/` + `Application/Services/`
9. Controller → `Api/Controllers/{Entity}Controller.cs` (`[ApiController]`, `[Route("api/[controller]")]`)
10. DI registration → `Api/Program.cs` (AddScoped)
11. Tests → `tests/PersonalFinance.Tests/Services/{Entity}ServiceTests.cs`

## EF Core Conventions

- Snake_case table naming (configured via `UseSnakeCaseNamingConvention()`)
- DateTime stored as UTC: `DateTime.SpecifyKind(v, DateTimeKind.Utc)` conversion
- NEVER manually edit `Designer.cs` or `Snapshot.cs` migration files
- Connection string env var: `ConnectionStrings__Default`
- Migration commands ALWAYS need both flags: `--project src/PersonalFinance.Persistence --startup-project src/PersonalFinance.Api`

## Testing Conventions

- **Framework:** xUnit + Moq
- **Database:** `UseInMemoryDatabase(Guid.NewGuid().ToString())` for isolation
- **Pattern:** Test class implements `IDisposable`, disposes DbContext
- **Naming:** `MethodName_Condition_ExpectedResult`
- **Structure:** Arrange / Act / Assert with `// Arrange`, `// Act`, `// Assert` comments
- **Reference:** See `apps/api/tests/PersonalFinance.Tests/Services/CategoryRuleServiceTests.cs` for canonical example

## Bank Parser Pattern

- Implement `IBankStatementParser` for new bank formats
- Add bank detection logic in `Infrastructure/Parsers/BankIdentifier.cs` → `IdentifyAsync()`
- Register parser in `Program.cs`: `builder.Services.AddScoped<IBankStatementParser, NewParser>()`
- Return `List<TransactionDto>` with fields: Date, Description, Remarks, Flow (DB/CR), Type, AmountIdr, Currency, Wallet
- Categorization uses longest-keyword-match via `ICategoryRuleService.CategorizeAsync()`
