---
description: Rules for .NET backend development
globs: apps/api/**
---

# Backend Development Rules (.NET 10)

## Clean Architecture Layers

**Dependency direction: Domain ← Application ← Infrastructure ← Api**

| Layer | Location | Dependencies | Contains |
|-------|----------|-------------|----------|
| Domain | `apps/api/src/PersonalFinance.Domain/` | Supabase.Postgrest (attributes/BaseModel only) | Entities, domain events |
| Application | `apps/api/src/PersonalFinance.Application/` | Domain | Commands, handlers, validators, services, interfaces, DTOs |
| Infrastructure | `apps/api/src/PersonalFinance.Infrastructure/` | Application | Bank parsers, Supabase DI + StorageService, external HTTP clients (AI service) |
| Api | `apps/api/src/PersonalFinance.Api/` | All layers | Controllers, middleware, Program.cs (composition root) |

> The **Persistence project was deleted in PF-S07** (EF Core fully removed). All data access goes through the `supabase-csharp` SDK (PostgREST), exposed to handlers behind Application-layer interfaces with Supabase-backed implementations.

**Rules:**
- Domain MUST have zero dependencies on other projects (Supabase.Postgrest attribute/model package is the only external dep)
- Application MUST NOT reference Infrastructure or Api
- Controllers MUST NOT touch `Supabase.Client` directly — always go through services or MediatR

## CQRS Pattern (MediatR)

Follow these exact patterns from the existing codebase:

**Command:** `public record Create{Entity}Command({Entity} {Entity}) : IRequest<{Entity}>;`
**Handler:**
```csharp
public class Create{Entity}CommandHandler : IRequestHandler<Create{Entity}Command, {Entity}>
{
    // Inject: Supabase.Client (or a repository-style I{Entity}Service), IMediator, IValidator<Create{Entity}Command>
    // 1. Validate via FluentValidation: await _validator.ValidateAndThrowAsync(request)
    // 2. Persist via PostgREST: var result = await _supabase.From<{Entity}>().Insert(entity)
    //    (reads: await _supabase.From<{Entity}>().Filter(...).Get(); updates: .Update(); deletes: .Delete())
    // 3. Publish event: await _mediator.Publish(new {Entity}CreatedEvent(saved))
    // 4. Return the saved entity (result.Models.First())
}
```
**Validator:** `public class Create{Entity}CommandValidator : AbstractValidator<Create{Entity}Command>`

All commands and handlers go in `Application/Commands/`.
All validators go in `Application/Validation/`.

## Adding a New Entity (checklist)

1. Entity class → `Domain/Entities/{Entity}.cs` — inherit `BaseModel` (Supabase.Postgrest.Models), annotate with `[Table("snake_case_name")]`, `[PrimaryKey("id", shouldInsert: false)]`, `[Column("snake_case")]` matching the DB schema
2. SQL migration → `supabase/migrations/{yyyyMMddHHmmss}_add_{entity}.sql` (CREATE TABLE + indexes + RLS policy) — apply via `supabase db push`
3. DTO → `Application/Dtos/`
4. Command + Handler → `Application/Commands/Create{Entity}Command.cs` and handler
5. Validator → `Application/Validation/Create{Entity}CommandValidator.cs`
6. Domain Event → `Domain/Events/{Entity}CreatedEvent.cs` (implements `INotification`)
7. Service interface + implementation → `Application/Interfaces/I{Entity}Service.cs` + `Application/Services/{Entity}Service.cs`
8. Controller → `Api/Controllers/{Entity}Controller.cs` (`[ApiController]`, `[Route("api/[controller]")]`)
9. DI registration → `Api/Program.cs` (AddScoped); Supabase client itself comes from `AddSupabase()` in `Infrastructure/Supabase/DependencyInjection.cs`
10. Tests → `tests/PersonalFinance.Tests/Commands/Create{Entity}CommandHandlerTests.cs` and/or `Services/{Entity}ServiceTests.cs`

## Supabase Data Conventions

- All persistence via `supabase-csharp` SDK: `supabase.From<T>().Filter(...).Get()` / `.Insert()` / `.Update()` / `.Delete()`
- Snake_case column names declared explicitly via `[Column("snake_case")]` attributes on entities (no naming-convention magic)
- DateTime values stored as UTC — normalize with `DateTime.SpecifyKind(v, DateTimeKind.Utc)` before insert when source kind is ambiguous
- Schema changes go in `supabase/migrations/` as timestamped SQL files (`{yyyyMMddHHmmss}_description.sql`) — never alter the schema ad hoc
- Apply migrations: `supabase db push` · Rebuild local DB from scratch: `supabase db reset`
- Env vars: `Supabase__Url`, `Supabase__AnonKey`, `Supabase__ServiceRoleKey` (server ops, bypasses RLS); `ConnectionStrings__Default` remains only for the NpgSql health check
- NEVER expose the service role key to the frontend

## Testing Conventions

- **Framework:** xUnit + Moq
- **Pattern:** Moq for Supabase-dependent services; pure-logic tests (no DB) for validators, parsers, dedup logic. `UseInMemoryDatabase` is **gone** — EF Core was removed in PF-S07; do not reintroduce it
- **Naming:** `MethodName_Condition_ExpectedResult`
- **Structure:** Arrange / Act / Assert with `// Arrange`, `// Act`, `// Assert` comments
- **Reference:** `tests/PersonalFinance.Tests/Commands/CreateAssetCommandHandlerTests.cs` (validator testing, no DB) and `tests/PersonalFinance.Tests/Services/DeduplicationTests.cs` (pure logic)
- **Known gap:** several service tests (e.g. `CategoryRuleService`) are `[Fact(Skip = "Requires Supabase integration")]` — integration harness tracked in PF-034. Don't "fix" them by un-skipping without that harness

## Bank Parser Pattern

- Implement `IBankStatementParser` for new deterministic bank formats (see THINK-01: direct parser before LLM)
- Bank detection uses the `IBankSignature` Chain of Responsibility registry in `Infrastructure/Parsers/BankIdentifier.cs` (PF-124) — add a new `IBankSignature` implementation for the bank's fingerprint; `BankIdentifier` iterates the chain and returns the first match. The old monolith `IdentifyAsync()` is gone
- Register parser + signature in `Program.cs`: `builder.Services.AddScoped<IBankStatementParser, NewParser>()`
- Return `List<TransactionDto>` with fields: Date, Description, Remarks, Flow (DB/CR), Type, AmountIdr, Currency, AccountName (renamed from `Wallet` in PF-125) — the frozen cross-service contract lives in `.claude/rules/ai-service.md`; check it before adding/renaming fields
- All parsed output runs through the 5-stage validation pipeline (`ITransactionPipelineService`): DateNormalizer → DecimalFixer → CurrencyStandardizer → SchemaValidator → DeduplicateCheck
- Categorization uses longest-keyword-match via `ICategoryRuleService.CategorizeAsync()` — load rules once per parse, never per row (PERF-01)
