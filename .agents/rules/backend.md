# Codex backend rules

Scope: `apps/api/**`. Read `apps/api/AGENTS.md` and governance rules.

Use .NET 10, MediatR, FluentValidation, Supabase/PostgREST, inward project references,
Application contracts/DTOs, Infrastructure parsers/clients, and Api composition.
Domain's PostgREST attributes and MediatR dependency are intentional. Controllers use
services/handlers rather than Supabase.Client. Follow actual nearby handlers rather
than inventing an EF repository or a new Persistence project.

New entities need explicit table/key/column mappings, timestamped SQL migrations in
`supabase/migrations/`, validation, DI wiring, and relevant events/tests. Inspect actual
ID types. Record timezone meaning; specifying UTC is not conversion from local time.
Do not put service-role credentials in browser code.

Bank detection uses IBankSignature and ordered matching; keep specific signatures
before fallbacks. Inspect BankProbeContext, CsvTokenizer, BankKeys, and registration
before adding a bank. Reuse existing validation/deduplication and categorize in batches.
Test positive/negative detection, field semantics, locale/date edges, and fallback behavior.

Use xUnit/Moq, Arrange/Act/Assert, and isolated pure logic/service boundaries. Existing
Supabase integration skips do not establish coverage. Build/test commands are in the
API AGENTS.md; new schema files are not authorization to reset or push a database.
