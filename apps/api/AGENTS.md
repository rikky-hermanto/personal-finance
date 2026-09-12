# Codex API instructions

Applies to `apps/api/`; also follow the root `AGENTS.md`.

## Architecture and conventions

- Target .NET 10. The solution is `PersonalFinance.slnx` in this directory.
- Keep project dependencies inward: Domain has no project references; Application references Domain; Infrastructure references Application/Domain; Api composes Application and Infrastructure.
- Persistence uses Supabase/PostgREST. Do not reintroduce EF Core, DbContext, or in-memory EF test fixtures.
- Keep controllers thin; route behavior through MediatR and Application services. Controllers should not access `Supabase.Client` directly.
- Commands/handlers belong in `src/PersonalFinance.Application/Commands/`; validators in `Validation/`; interfaces in `Interfaces/`; shared DTOs in `Dtos/`.
- Follow existing dependency injection, FluentValidation, and domain-event patterns. Preserve required events after successful mutations.
- Entities in `src/PersonalFinance.Domain/Entities/` use PostgREST attributes and snake_case database columns. Schema changes belong in repository-root `supabase/migrations/`.
- Match namespaces to paths, preserve nullable annotations, and use `Async` suffixes except framework methods such as MediatR `Handle` and controller actions.
- Use `ILogger<T>` for diagnostics. Do not return raw exceptions or stack traces to clients; preserve middleware error mapping.

## Parsing and contracts

- Prefer deterministic parsers for structured bank formats. Inspect `src/PersonalFinance.Infrastructure/Parsers/` and the `IBankSignature` registry before adding a bank.
- Preserve the shared transaction validation and deduplication pipeline. Load categorization rules once per operation, not once per row.
- Check `src/PersonalFinance.Application/Dtos/TransactionDto.cs`, the AI HTTP client mapping, and `services/ai-service/app/models.py` together for contract changes.
- Extraction currently uses `AccountName` / `account_name`, not the older Wallet field. Other features can still use wallet-named fields; do not perform a global rename.
- Use decimal money values, explicit currency conversion, and correct date/time semantics. Do not relabel local timestamps as UTC without considering their meaning.

## Validation

Run from `apps/api/`:

```powershell
dotnet build PersonalFinance.slnx
dotnet test PersonalFinance.slnx
# Focused behavior check:
dotnet test PersonalFinance.slnx --filter "FullyQualifiedName~TestMethodName"
```

Tests are in `tests/PersonalFinance.Tests/`, using xUnit/Moq and `MethodName_Condition_ExpectedResult` naming. Prefer pure logic tests or mocked service boundaries. Inspect skipped Supabase integration tests before claiming coverage; do not unskip without the required harness.
