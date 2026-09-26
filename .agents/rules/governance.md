# Codex governance rules

Applies across the repository. Read scoped rules for implementation details. This
adapts the Claude governance intent to the actual Supabase architecture; rule IDs
remain useful references, not a claim that every rule has automated CI enforcement.

| ID | Rule |
|---|---|
| ARCH-01 | Project dependencies point inward. Domain has no project references; Application does not reference Infrastructure/Api. |
| ARCH-02 | Cross-layer interfaces belong in Application/Interfaces. Subsystem-private interfaces such as Infrastructure/Parsers/IBankSignature may stay with their implementation. |
| ARCH-03 | Namespaces match paths; shared DTOs belong in Application/Dtos. |
| ARCH-04 | Controllers remain thin, roughly 15 lines of orchestration per action where practical; no business calculations or direct database access. |
| ARCH-05 | Follow existing Supabase-backed Application service boundaries; do not add DbContext/Persistence dependencies. |
| ARCH-06 | External parsing/client concerns belong in Infrastructure. Review package placement against usage; do not report existing API dependencies as absent. |
| CODE-01 | Use established command/handler/validator names, PascalCase components, local hook naming, and snake_case database mappings. |
| CODE-02 | Async Task methods use Async suffix except framework-defined handlers/controller conventions. |
| CODE-03 | Preserve nullable C# annotations. |
| CODE-04 | Prefer precise TypeScript types; current app strict flags are not fully enabled. Do not silently enable project-wide strictness during unrelated work. |
| CODE-05 | Use ILogger for backend diagnostics, not Console.WriteLine. |
| TEST-01 | Cover changed public behavior in services, handlers, validators, parsers, and endpoints with meaningful tests. |
| TEST-02 | C# tests use MethodName_Condition_ExpectedResult. |
| TEST-03 | Isolate tests with mocks/pure logic or a real configured integration harness; never reintroduce EF InMemoryDatabase. |
| TEST-04 | Do not add empty scaffold tests; report existing skipped integration tests accurately. |
| ERR-01 | Do not return raw exception messages/stack traces to clients; log diagnostic details and preserve correlation behavior. |
| ERR-02 | Business logic needs appropriate structured logging through existing logging boundaries. |
| ERR-03 | Preserve middleware mappings for validation, missing resources, unsupported input, invalid data, and unexpected failure; verify actual mappings before changing them. |
| ERR-04 | Log unexpected exceptions before generic error responses. |
| SEC-01/04 | Secrets stay outside source; use placeholder-only env examples. |
| SEC-02 | Preserve upload size limits (currently 10MB where implemented), validate type/content, and bound parsing time. |
| SEC-03 | Application scripts use the Vite bundle; do not add external CDN scripts to the app. |
| PERF-01 | Load category rules once per operation; batch categorization instead of N+1 per-row calls. |
| PERF-02 | Collection APIs need bounded pagination; follow existing default/max conventions (50/200 where applicable). |
| CI-01 | Use ci-check for local readiness; inspect actual workflows before claiming remote enforcement. |
| CI-02/03 | Preserve existing analyzer/lint/format settings; adding new analyzers, Prettier, or warnings-as-errors is a separate scoped change. |

## Judgment rules

- THINK-01: Prefer deterministic parsing when the format is reliable; use LLM extraction
  for unstructured content. A deterministic PDF can also use a direct parser.
- THINK-02: Explain material architecture/schema tradeoffs with concise rationale;
  routine implementation should proceed without an artificial deliberation ritual.
- THINK-03: For extraction schema changes, document each field's type, sanitized
  example, and consumer mapping before editing.
- THINK-04: Diagnose test failures. Change assertions only when the expected behavior
  is demonstrably wrong, and explain the reason.
- THINK-05: Update extraction producer/schema/consumer together. Inspect TransactionDto,
  Python models, and HTTP mapping; AccountName/account_name is the extraction contract,
  while separate features may still expose wallet fields.

For historical rationale/examples, `docs/reference/governance-detail.md` is context;
verify examples against current code before adopting them.
