# PersonalFinance API — Claude Code Context

.NET 10 Clean Architecture API with CQRS via MediatR. Persistence via supabase-csharp (PostgREST) — EF Core removed in PF-S07.

## Solution File

`PersonalFinance.slnx` (in this directory)

## Quick Commands (run from `api/` directory)

```
dotnet restore PersonalFinance.slnx
dotnet build PersonalFinance.slnx
dotnet run --project src/PersonalFinance.Api
dotnet test
dotnet test --filter "FullyQualifiedName~TestMethodName"
```

Schema changes go in `supabase/migrations/` — apply with `supabase db push`.

## Project Dependency Graph

```
Api → Application → Domain
Api → Infrastructure → Domain, Application
```

## Key Files

| Purpose | File |
|---------|------|
| Composition root / DI | `src/PersonalFinance.Api/Program.cs` |
| Entities | `src/PersonalFinance.Domain/Entities/` |
| Commands & handlers | `src/PersonalFinance.Application/Commands/` |
| Validators | `src/PersonalFinance.Application/Validation/` |
| Services & interfaces | `src/PersonalFinance.Application/Services/` + `Interfaces/` |
| Bank parsers | `src/PersonalFinance.Infrastructure/Parsers/` |
| DTOs | `src/PersonalFinance.Application/Dtos/` |
| Supabase DI | `src/PersonalFinance.Infrastructure/Supabase/DependencyInjection.cs` |
| Tests | `tests/PersonalFinance.Tests/` |
