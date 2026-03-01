# PersonalFinance API — Claude Code Context

.NET 9 Clean Architecture API with CQRS via MediatR.

## Solution File

`PersonalFinance.slnx` (in this directory)

## Quick Commands (run from `api/` directory)

```
dotnet restore PersonalFinance.slnx
dotnet build PersonalFinance.slnx
dotnet run --project src/PersonalFinance.Api
dotnet test
dotnet test --filter "FullyQualifiedName~TestMethodName"
dotnet ef migrations add <Name> --project src/PersonalFinance.Persistence --startup-project src/PersonalFinance.Api
dotnet ef database update --project src/PersonalFinance.Persistence --startup-project src/PersonalFinance.Api
dotnet ef migrations list --project src/PersonalFinance.Persistence --startup-project src/PersonalFinance.Api
```

## Project Dependency Graph

```
Api → Application → Domain
      Application → (uses interfaces from Infrastructure)
                    Persistence → Domain
```

## Key Files

| Purpose | File |
|---------|------|
| Composition root / DI | `src/PersonalFinance.Api/Program.cs` |
| Database context | `src/PersonalFinance.Persistence/AppDbContext.cs` |
| Entities | `src/PersonalFinance.Domain/Entities/` |
| Commands & handlers | `src/PersonalFinance.Application/Commands/` |
| Validators | `src/PersonalFinance.Application/Validation/` |
| Services & interfaces | `src/PersonalFinance.Application/Services/` + `Interfaces/` |
| Bank parsers | `src/PersonalFinance.Infrastructure/Parsers/` |
| DTOs | `src/PersonalFinance.Infrastructure/Dtos/` |
| Migrations | `src/PersonalFinance.Persistence/Migrations/` |
| Tests | `tests/PersonalFinance.Tests/` |
