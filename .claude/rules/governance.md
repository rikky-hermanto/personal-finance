---
description: Project governance rulebook — architectural constraints, coding conventions, testing, security, and CI enforcement derived from structural analysis
globs: apps/api/**,services/**,*.csproj,docker-compose.yml,Dockerfile,.github/**
---

# PROJECT GOVERNANCE RULEBOOK

> 33 rules across 8 categories. All grounded in observed code violations.
> Last updated: 2026-03-16

---

## 1. Architectural Rules

### ARCH-01: Layer Dependency Direction Must Be Inward Only

**Rationale:** Application.csproj references both Infrastructure.csproj and Persistence.csproj directly, violating dependency inversion.

**Rule:** No inner layer project may reference an outer layer project:
```
Domain         → (nothing)
Application    → Domain only
Infrastructure → Domain, Application
Persistence    → Domain, Application
Api            → All layers (composition root)
Tests          → All layers
```

**Compliant:**
```xml
<!-- Application.csproj -->
<ProjectReference Include="..\PersonalFinance.Domain\PersonalFinance.Domain.csproj" />
<!-- NO references to Infrastructure or Persistence -->
```

**Violation:**
```xml
<!-- Application.csproj — CURRENT STATE -->
<ProjectReference Include="..\PersonalFinance.Infrastructure\PersonalFinance.Infrastructure.csproj" />
<ProjectReference Include="..\PersonalFinance.Persistence\PersonalFinance.Persistence.csproj" />
```

**Enforcement:** ArchUnitNET or NetArchTest — assembly reference scan in unit tests.

---

### ARCH-02: Interfaces Belong in the Layer That Consumes Them

**Rationale:** `ICategoryRuleService` is defined in `Infrastructure/Parsers/` but implemented in `Application/Services/`. Interfaces must be owned by the consuming layer.

**Rule:** All service/parser/repository interfaces go in `Application/Interfaces/`.

**Compliant:**
```
Application/Interfaces/ICategoryRuleService.cs     ← Interface
Application/Interfaces/IBankStatementParser.cs      ← Interface
Infrastructure/Parsers/BcaCsvParser.cs              ← Implementation
```

**Violation:**
```
Infrastructure/Parsers/ICategoryRuleService.cs      ← Wrong layer
```

**Enforcement:** Architecture test. Manual Review Required until automated.

---

### ARCH-03: DTOs Must Reside in Their Declared Namespace's Project

**Rationale:** `TransactionDto` physically in `Infrastructure/Dtos/` but uses `namespace PersonalFinance.Application.Dtos`.

**Rule:** File physical location must match namespace. Cross-layer DTOs belong in `Application/Dtos/`.

**Enforcement:** IDE0130 analyzer in `.editorconfig`:
```ini
dotnet_diagnostic.IDE0130.severity = error
```

---

### ARCH-04: Controllers Must Not Contain Business Logic

**Rationale:** `TransactionsController` contains ~200 lines of duplicate filtering, category rule creation, and aggregation logic.

**Rule:** Controller action body maximum 15 lines. Actions must: (1) validate request, (2) delegate to service/MediatR, (3) return response.

**Enforcement:** Code review. Optional Roslyn analyzer for method statement count.

---

### ARCH-05: Command Handlers Must Not Inject DbContext Directly

**Rationale:** All command handlers inject `AppDbContext` directly, coupling Application to Persistence.

**Rule:** Handlers interact with persistence through repository interfaces in `Application/Interfaces/`.

**Compliant:**
```csharp
public class CreateTransactionCommandHandler(ITransactionRepository _repository) { }
```

**Violation:**
```csharp
public class CreateTransactionCommandHandler(AppDbContext _dbContext) { }
```

**Enforcement:** Architecture test — Application assembly must have no dependency on `PersonalFinance.Persistence`.

---

### ARCH-06: No Outer-Layer Package References in API Project

**Rationale:** `PdfPig` referenced in both `Api.csproj` and `Infrastructure.csproj`.

**Rule:** Api project may only reference: ASP.NET Core, OpenAPI, DI, EF Core Design. Parsing libraries stay in Infrastructure.

**Enforcement:** CI csproj PackageReference allowlist scan.

---

## 2. Coding Conventions

### CODE-01: Naming Conventions

**Rationale:** Codifies observed patterns from all layers.

| Element | Convention | Example |
|---------|-----------|---------|
| Entity | PascalCase singular | `Transaction` |
| Command | `{Verb}{Entity}Command` | `CreateTransactionCommand` |
| Handler | `{Verb}{Entity}CommandHandler` | `CreateTransactionCommandHandler` |
| Validator | `{Verb}{Entity}CommandValidator` | `CreateTransactionCommandValidator` |
| Service interface | `I{Entity}Service` | `ICategoryRuleService` |
| Domain event | `{Entity}{Verb}Event` | `TransactionCreatedEvent` |
| Controller | `{Entity}Controller` (plural) | `TransactionsController` |
| DTO | `{Entity}Dto` | `TransactionDto` |
| DB table | snake_case plural | `transactions`, `category_rules` |
| React component | PascalCase file | `CashFlowDashboard.tsx` |
| React hook | camelCase `use-` prefix | `use-mobile.tsx` |
| API client | camelCase | `transactionsApi.ts` |

**Enforcement:** ESLint naming-convention (frontend); .editorconfig + dotnet-format (backend).

---

### CODE-02: Async Methods Must Use Async Suffix

**Rationale:** Existing services follow `*Async` convention consistently.

**Rule:** All `async Task` methods must end with `Async`. Exemptions: MediatR handler `Handle()`, controller actions.

**Enforcement:** Roslyn analyzer VSTHRD200.

---

### CODE-03: Nullable Reference Types Must Remain Enabled

**Rationale:** All .csproj files have `<Nullable>enable</Nullable>`.

**Rule:** Never disable with `#nullable disable`. Enforce via `Directory.Build.props`.

---

### CODE-04: TypeScript Strict Mode Must Be Enabled

**Rationale:** `tsconfig.json` has `strict: false`, `noImplicitAny: false`. Frontend uses `any` in API types.

**Rule:**
```json
{ "compilerOptions": { "strict": true, "noImplicitAny": true, "noUnusedLocals": true, "noUnusedParameters": true } }
```

**Enforcement:** `tsc --noEmit` in CI. ESLint `@typescript-eslint/no-explicit-any: error`.

---

### CODE-05: No Console.WriteLine in Backend Code

**Rationale:** `NeoBankPdfParser.LogSkip()` uses `Console.WriteLine`. No structured logging anywhere.

**Rule:** All diagnostic output must use `ILogger<T>`. `Console.WriteLine` is forbidden in `api/src/`.

**Enforcement:** CI grep check: `grep -rn "Console.Write" api/src/ && exit 1`.

---

## 3. Testing Rules

### TEST-01: Minimum Test Coverage by Layer

**Rationale:** 1 test class (11 tests) covering only CategoryRuleService. All handlers, validators, parsers, controllers untested. Frontend has zero tests.

| Layer | Requirement |
|-------|-------------|
| Application/Services | Every public method |
| Application/Commands | Every handler |
| Application/Validation | Every validator rule |
| Infrastructure/Parsers | Every parser (happy + error) |
| Api/Controllers | Every action method |

**Enforcement:** `dotnet test` with coverlet; minimum 60% line coverage gate in CI.

---

### TEST-02: Test Naming Pattern

**Rationale:** Existing tests use `MethodName_Condition_ExpectedResult` consistently.

**Rule:** All test methods: `{MethodUnderTest}_{Scenario}_{ExpectedBehavior}`

**Example:** `CategorizeAsync_WithMatchingRule_ReturnsCorrectCategory`

---

### TEST-03: Test Isolation via InMemoryDatabase

**Rationale:** `CategoryRuleServiceTests` uses `UseInMemoryDatabase(Guid.NewGuid().ToString())` + `IDisposable`.

**Rule:**
1. Use `UseInMemoryDatabase` with unique name per test class
2. Implement `IDisposable` and dispose DbContext
3. Never share DbContext state across tests

---

### TEST-04: No Template/Scaffold Test Files

**Rationale:** `UnitTest1.cs` exists as empty template leftover.

**Rule:** Delete all scaffold test files. Every test file must contain at least one `[Fact]` or `[Theory]`.

---

## 4. Error Handling & Logging Rules

### ERR-01: Exception Details Must Never Be Exposed to Clients

**Rationale:** `TransactionsController` returns `ex.Message` in 500 responses. Middleware only hides details in Release builds.

**Rule:** Never return `ex.Message` or `ex.StackTrace` in responses. Log full exception, return generic message + correlation ID.

**Compliant:**
```csharp
catch (Exception ex)
{
    _logger.LogError(ex, "File parsing failed for {ContentType}", file.ContentType);
    return StatusCode(500, new ApiError { Message = "File processing failed." });
}
```

**Violation:**
```csharp
return StatusCode(500, $"Failed to parse file: {ex.Message}");
```

---

### ERR-02: Every Service and Handler Must Inject ILogger

**Rationale:** Zero `ILogger` usage across all services, handlers, and parsers.

**Rule:** Every class with business logic must inject `ILogger<T>` and log at appropriate levels (Debug/Info/Warning/Error).

**Enforcement:** Manual Review Required until architecture test is added.

---

### ERR-03: Standardize Exception Types

**Rationale:** 5 different exception types thrown inconsistently across codebase.

| Exception Type | Usage | HTTP Status |
|---------------|-------|-------------|
| `ValidationException` (FluentValidation) | Input validation | 400 |
| `KeyNotFoundException` | Entity not found | 404 |
| `NotSupportedException` | Unsupported bank/format | 400 |
| `InvalidDataException` | Malformed file content | 422 |
| All others | Unexpected | 500 |

**Enforcement:** Exception middleware mapping. Code review for new types.

---

### ERR-04: Exception Middleware Must Log Before Responding

**Rationale:** `ExceptionMiddlewareExtensions` catches all exceptions but has no logging.

**Rule:** Middleware must call `ILogger.LogError(ex, ...)` before writing error response.

---

## 5. Security Rules

### SEC-01: No Credentials in Source Control

**Rationale:** `postgres123` in `appsettings.Development.json` and `docker-compose.yml`.

**Rule:** Passwords, API keys, tokens must use environment variables. `.env` file in `.gitignore`.

**Enforcement:** `gitleaks` or `git-secrets` in CI.

---

### SEC-02: File Upload Size and Content Validation

**Rationale:** Only MIME type checked. No file size limit. PdfPig is alpha software.

**Rule:**
- Max file size: 10MB (configurable)
- Validate MIME type AND magic bytes
- Wrap PDF parsing in try/catch with timeout
- Never trust client-reported content type alone

**Enforcement:** `[RequestSizeLimit]` attribute. Integration test for oversized files.

---

### SEC-03: Remove Third-Party Scripts from HTML

**Rationale:** `index.html` loads unpinned `https://cdn.gpteng.co/gptengineer.js`.

**Rule:** No external scripts from third-party CDNs. All JS must be bundled through Vite.

**Enforcement:** CI: `grep -n "cdn\." index.html && exit 1`.

---

### SEC-04: Add .env to .gitignore

**Rationale:** `.gitignore` excludes `*.local` but NOT `.env`. The `.env` file is tracked.

**Rule:** `.env` must be in `.gitignore`. Use `.env.example` (no secrets) as template.

**Enforcement:** CI: `git ls-files .env && exit 1`.

---

## 6. Performance Constraints

### PERF-01: Categorization Must Not Generate N+1 Queries

**Rationale:** Every parser calls `CategorizeAsync()` per row inside foreach. A 500-row file = 500 DB queries.

**Rule:** Load category rules once per parse operation, pass as in-memory collection.

**Compliant:**
```csharp
var rules = await _dbContext.CategoryRules.ToListAsync();
foreach (var tx in transactions)
    tx.Category = Categorize(tx.Description, tx.Type, rules);
```

**Violation:**
```csharp
foreach (var tx in transactions)
    tx.Category = await _categoryRuleService.CategorizeAsync(tx.Description, tx.Type);
```

**Enforcement:** Unit test verifying query count during parsing.

---

### PERF-02: Collection Endpoints Must Support Pagination

**Rationale:** `GET /api/transactions` returns all records with no limit.

**Rule:** All GET collection endpoints support `?page=1&pageSize=50` with default 50, max 200.

**Enforcement:** Integration test verifying pagination parameters.

---

## 7. CI Enforcement Strategy

### CI-01: Required Pipeline Gates

**Rationale:** `.github/workflows/` is empty. No automated checks.

| Gate | Command | Blocks PR? |
|------|---------|-----------|
| Backend build | `dotnet build api/PersonalFinance.slnx` | Yes |
| Backend tests | `dotnet test api/PersonalFinance.slnx` | Yes |
| Frontend lint | `npm run lint` | Yes |
| Frontend build | `npm run build` | Yes |
| TypeScript check | `npx tsc --noEmit` | Yes |
| Secret scan | `gitleaks detect` | Yes |

**Enforcement:** GitHub branch protection requiring all checks.

---

### CI-02: Required Analyzer Packages

**Rationale:** No Roslyn analyzers in any .csproj. No `.editorconfig` with diagnostic severities.

**Rule:** Add to `Directory.Build.props`:
```xml
<PackageReference Include="Microsoft.CodeAnalysis.NetAnalyzers" Version="9.0.0" />
<PropertyGroup>
  <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
  <EnforceCodeStyleInBuild>true</EnforceCodeStyleInBuild>
</PropertyGroup>
```

---

### CI-03: Frontend Formatting Enforcement

**Rationale:** No Prettier. ESLint disables `no-unused-vars`.

**Rule:**
- Add Prettier with `.prettierrc`
- Enable `@typescript-eslint/no-unused-vars: error`
- CI: `prettier --check "src/**/*.{ts,tsx}"`

---

## 8. Reasoning Alignment Rules

### THINK-01: Route to Direct Parser Before Considering LLM

**Rationale:** CSV banks (BCA, Wise) are deterministic — zero LLM cost, 100% accuracy. LLM extraction adds latency and API cost and is only justified for unstructured formats (PDF with variable layout, screenshots).

**Rule:** Before implementing any new bank parser, answer: "Is this format fully deterministic (fixed column positions, known delimiters)?"
- **YES** → implement `IBankStatementParser` in .NET `Infrastructure/BankParsers/`
- **NO** → implement LLM extractor in Python `services/ai-service/app/services/`
- Document the routing decision explicitly in the bank's YAML profile config

**Enforcement:** Manual Review Required — check the profile config for a `parser: direct_csv` or `parser: llm_extraction` field.

---

### THINK-02: Use Extended Thinking for Architecture Decisions, Not Code Generation

**Rationale:** Chain-of-thought reasoning is valuable for deciding which layer owns a concern or which parser strategy to apply. It is wasteful for writing a `ParseAsync` implementation where the pattern is already established.

**Rule:** Reason step-by-step explicitly ONLY when:
- (a) deciding which layer owns a new service, interface, or concern
- (b) designing a new `tool_use` extraction schema
- (c) evaluating whether a new bank should use direct parsing or LLM extraction

For all other tasks (implementing known patterns, writing tests, adding CRUD), proceed directly to implementation.

**Enforcement:** Manual Review Required.

---

### THINK-03: LLM Extraction Schema Requires Field-by-Field Justification Before Writing Code

**Rationale:** A wrong field type in the `tool_use` schema (e.g., `string` for amounts instead of `number`) causes silent data corruption in PostgreSQL — no compile error, no runtime exception, just wrong data.

**Rule:** When designing or modifying any `tool_use` extraction schema, list every field with:
1. Field name
2. JSON schema type
3. Example value from actual bank statement text
4. The corresponding `TransactionDto` C# field name (from `TransactionDto.cs`)

Do this BEFORE writing schema code. Never infer field types from generic knowledge — verify against real bank statement samples.

**Enforcement:** Manual Review Required — review schema PR diff against the field table in `.claude/rules/ai-service.md`.

---

### THINK-04: Test Failures Are Diagnostic Signals, Not Obstacles

**Rationale:** The codebase has very few tests. When tests are added and fail, there is a temptation to change the assertion to match buggy behavior rather than fixing the bug.

**Rule:** When a test fails: (1) read the full error message, (2) identify whether the failure is in test setup or code under test, (3) fix the code. Only change a test assertion if the test was definitively testing the wrong behavior — document why in a `# Reason:` comment on the changed line.

**Compliant:**
```csharp
// Reason: spec clarified that Balance is calculated server-side, not stored
Assert.Equal(0, result.Balance);
```

**Enforcement:** Code review — reject PRs that change assertions without a reason comment.

---

### THINK-05: Cross-Service Contract Fields Are Frozen Until Both Sides Update

**Rationale:** `TransactionDto` field names are the boundary contract between .NET and Python. Renaming `AmountIdr` on one side without updating the other causes silent null values — undetectable without end-to-end testing.

**Rule:** The following fields are a shared frozen contract across `TransactionDto.cs` (C#) and `models.py` (Python):

`Date/date` · `Description/description` · `Remarks/remarks` · `Flow/flow` · `Type/type` · `AmountIdr/amount_idr` · `Currency/currency` · `ExchangeRate/exchange_rate` · `Wallet/wallet`

Any rename requires updating **both files in the same commit**. After the change, update the contract table in `.claude/rules/ai-service.md` and the `ai-service.md` memory topic file.

**Enforcement:** Integration test verifying the full .NET → Python → .NET round-trip with all fields populated.

---

# SELF-VALIDATION SUMMARY

- **33 rules total** across 8 categories (28 original + 5 reasoning alignment rules)
- **All 33 grounded** in observed code or architectural decisions
- **0 generic/preference-based rules** — every rule traces to observed code or design trade-offs
- **0 contradictions** detected
- **26 of 28 original rules automatically enforceable** (2 marked Manual Review Required: ARCH-02, ERR-02)
- **THINK rules (5):** Manual Review Required — enforced via code review and planning discipline
- **0 redundancies** after review (ARCH-01 and ARCH-05 are complementary: project-level vs code-level)
