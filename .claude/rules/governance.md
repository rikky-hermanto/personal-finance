---
description: Project governance rulebook — architectural constraints, coding conventions, testing, security, and CI enforcement derived from structural analysis
globs: apps/api/**,services/**,*.csproj,docker-compose.yml,Dockerfile,.github/**
---

# PROJECT GOVERNANCE RULEBOOK

> 33 rules across 8 categories. Full rationale + compliant/violation examples: [docs/reference/governance-detail.md](../../docs/reference/governance-detail.md)
> Last updated: 2026-03-16

## Rules Quick Reference

| Rule | Category | Constraint |
|------|----------|------------|
| ARCH-01 | Architecture | Layer deps inward only: Domain ← App ← Infra ← Api. No inner layer references outer. |
| ARCH-02 | Architecture | All interfaces in `Application/Interfaces/`. Never define interfaces in Infrastructure. |
| ARCH-03 | Architecture | File physical path must match namespace. Cross-layer DTOs → `Application/Dtos/`. |
| ARCH-04 | Architecture | Controller action body max 15 lines. No business logic in controllers. |
| ARCH-05 | Architecture | Handlers inject repository interfaces (not AppDbContext). Application has zero Persistence deps. |
| ARCH-06 | Architecture | `Api.csproj` references only ASP.NET Core / OpenAPI / DI. Parsing libs stay in Infrastructure. |
| CODE-01 | Convention | Naming: `{Verb}{Entity}Command/Handler/Validator`, `I{Entity}Service`, `{Entity}Controller` (plural), snake_case DB tables, PascalCase React components, `use-` camelCase hooks. |
| CODE-02 | Convention | All `async Task` methods end with `Async`. Exemptions: MediatR `Handle()`, controller actions. |
| CODE-03 | Convention | `<Nullable>enable</Nullable>` always on. Never `#nullable disable`. |
| CODE-04 | Convention | TypeScript `strict: true`, `noImplicitAny: true`, `noUnusedLocals: true`. |
| CODE-05 | Convention | No `Console.WriteLine` in `api/src/`. All output via `ILogger<T>`. |
| TEST-01 | Testing | Every public method in Services, Commands, Validators, Parsers, Controllers must have tests. |
| TEST-02 | Testing | Test method naming: `MethodName_Condition_ExpectedResult`. |
| TEST-03 | Testing | `UseInMemoryDatabase(Guid.NewGuid().ToString())`. Implement `IDisposable`. No shared DbContext. |
| TEST-04 | Testing | Delete all scaffold test files. Every test file needs at least one `[Fact]` or `[Theory]`. |
| ERR-01 | Error | Never return `ex.Message` or `ex.StackTrace` in responses. Log full exception, return generic message + correlation ID. |
| ERR-02 | Error | Every class with business logic injects `ILogger<T>`. |
| ERR-03 | Error | Standard exception → HTTP: `ValidationException`→400, `KeyNotFoundException`→404, `NotSupportedException`→400, `InvalidDataException`→422, others→500. |
| ERR-04 | Error | Exception middleware must call `logger.LogError(ex, ...)` before writing error response. |
| SEC-01 | Security | No credentials in source control. Passwords/keys via env vars. `.env` in `.gitignore`. |
| SEC-02 | Security | File uploads: max 10MB, validate MIME type AND magic bytes, wrap PDF parsing with timeout. |
| SEC-03 | Security | No external CDN scripts in `index.html`. All JS bundled through Vite. |
| SEC-04 | Security | `.env` in `.gitignore`. Use `.env.example` (no real secrets) as template. |
| PERF-01 | Performance | Load category rules once per parse operation. No N+1 — never call `CategorizeAsync()` inside a foreach. |
| PERF-02 | Performance | All GET collection endpoints support `?page=1&pageSize=50`. Default 50, max 200. |
| CI-01 | CI | Required PR gates: `dotnet build`, `dotnet test`, `npm run lint`, `npm run build`, `tsc --noEmit`, `gitleaks detect`. All block merge. |
| CI-02 | CI | Add `Microsoft.CodeAnalysis.NetAnalyzers` to `Directory.Build.props`. `TreatWarningsAsErrors=true`. |
| CI-03 | CI | Add Prettier. `@typescript-eslint/no-unused-vars: error`. CI: `prettier --check "src/**/*.{ts,tsx}"`. |

---

## Reasoning Rules (read in full — these require active judgment, not pattern-matching)

### THINK-01: Route to Direct Parser Before Considering LLM

**Rationale:** CSV banks (BCA, Wise) are deterministic — zero LLM cost, 100% accuracy. LLM extraction adds latency and API cost and is only justified for unstructured formats (PDF with variable layout, screenshots).

**Rule:** Before implementing any new bank parser, answer: "Is this format fully deterministic (fixed column positions, known delimiters)?"
- **YES** → implement `IBankStatementParser` in .NET `Infrastructure/BankParsers/`
- **NO** → implement LLM extractor in Python `services/ai-service/app/services/`
- Document the routing decision explicitly in the bank's YAML profile config

**Enforcement:** Manual Review Required — check the profile config for a `parser: direct_csv` or `parser: llm_extraction` field.

---

### THINK-02: Use Extended Thinking for Architecture Decisions, Not Code Generation

**Rule:** Reason step-by-step explicitly ONLY when:
- (a) deciding which layer owns a new service, interface, or concern
- (b) designing a new `tool_use` extraction schema
- (c) evaluating whether a new bank should use direct parsing or LLM extraction

For all other tasks (implementing known patterns, writing tests, adding CRUD), proceed directly to implementation.

---

### THINK-03: LLM Extraction Schema Requires Field-by-Field Justification Before Writing Code

**Rationale:** A wrong field type in the `tool_use` schema (e.g., `string` for amounts instead of `number`) causes silent data corruption in PostgreSQL — no compile error, no runtime exception, just wrong data.

**Rule:** When designing or modifying any `tool_use` extraction schema, list every field with:
1. Field name
2. JSON schema type
3. Example value from actual bank statement text
4. The corresponding `TransactionDto` C# field name (from `TransactionDto.cs`)

Do this BEFORE writing schema code.

---

### THINK-04: Test Failures Are Diagnostic Signals, Not Obstacles

**Rule:** When a test fails: (1) read the full error message, (2) identify whether the failure is in test setup or code under test, (3) fix the code. Only change a test assertion if the test was definitively testing the wrong behavior — document why with a `# Reason:` comment on the changed line.

---

### THINK-05: Cross-Service Contract Fields Are Frozen Until Both Sides Update

**Rationale:** `TransactionDto` field names are the boundary contract between .NET and Python. Renaming `AmountIdr` on one side without updating the other causes silent null values.

**Rule:** These fields are a shared frozen contract across `TransactionDto.cs` (C#) and `models.py` (Python):

`Date/date` · `Description/description` · `Remarks/remarks` · `Flow/flow` · `Type/type` · `AmountIdr/amount_idr` · `Currency/currency` · `ExchangeRate/exchange_rate` · `Wallet/wallet`

Any rename requires updating **both files in the same commit**. After the change, update the contract table in `.claude/rules/ai-service.md`.
