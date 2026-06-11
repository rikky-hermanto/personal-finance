# Architecture Health Report
**Date:** 2026-06-10
**Focus:** Full-stack — Backend, Frontend, AI Service, Tests & CI, Developer Tooling
**Files read:** ~35 inline + subagent reads across 3 layers + governance scan
**Previous review:** none — this is the baseline review

---

## System Overview (observed, not recycled)

A .NET 10 / React 18 / Python FastAPI full-stack application organized around a five-tier Financial Pyramid. The backend uses Clean Architecture with CQRS/MediatR and supabase-csharp for persistence (EF Core fully removed). The AI service (FastAPI) is a downstream dependency called via typed HTTP clients. RAG Phase 1 (pgvector embeddings) was recently added. All three services have OpenTelemetry instrumentation; the AI service also has Langfuse LLM cost tracking.

**Drift from CLAUDE.md / governance docs:**
- CLAUDE.md says 8 AI endpoints; `main.py` has 10 (`/embed-transactions` + `/search` added for PF-AI003).
- BOARD.md "Ready" section still lists PF-122/124/125/128 as ready — all are Done and in the Done table too. Stale snapshot.
- Governance rule TEST-03 references `UseInMemoryDatabase` — EF Core removed in PF-S07; the rule is permanently unreachable dead text.

---

## Layer Grades

| Layer | Grade | One-line justification |
|-------|-------|------------------------|
| Backend (.NET) | B- | Clean Architecture layers are correct but `TransactionsController` is a 600-line god object with ERR-01 leaks and 4 controllers bypass CQRS by injecting Supabase directly |
| Frontend (React) | C+ | Component org and React Query adoption are growing but TypeScript strict mode is globally off, a wrong API port exists, and DashboardPage never migrated to RQ |
| AI Service (Python) | B | Provider abstraction, forced tool_use, eval harness are all strong; held back by wallet/account_name THINK-05 drift and Gemini missing max_tokens guard |
| Tests & CI | D+ | 20+ backend test files but CI has zero build/test/lint gates (CI-01), all CategoryRuleService tests are skipped, zero frontend tests, E2E covers ~40% of routes |
| Docs & governance | B | STATUS.md accurate and up-to-date; BOARD.md Ready section is stale; TEST-03 rule references deleted EF Core infrastructure |

---

## Strengths

- **IBankSignature Chain of Responsibility** (`apps/api/src/PersonalFinance.Infrastructure/Parsers/BankIdentifier.cs:7–55`): clean dispatch with PDF password exception handling, graceful fallback to LLM, and per-bank logging. Pattern is correct and extensible.
- **TransactionPipelineService layering** (`apps/api/src/PersonalFinance.Application/Services/TransactionPipelineService.cs`): five-stage pipeline (DateNormalizer → DecimalFixer → CurrencyStandardizer → SchemaValidator → DeduplicateCheck) is textbook composable pipeline. Batch LLM suggestion before per-item fallback shows performance awareness.
- **Anthropic forced tool_use** (`services/ai-service/app/providers/anthropic.py:62`): `tool_choice={"type": "tool", "name": "extract_transactions"}` + explicit block validation. No text-fallback possible.
- **temperature=0.0 uniformly enforced** across all four extraction paths (`gemini.py:34,96`, `anthropic.py:59,128`, `journey_advisor.py:57`).
- **Eval harness** (`services/ai-service/evals/eval_extraction.py`): 20 fixtures, F1/field-accuracy/latency/cost scoring, markdown result snapshots. Caught a real enum serialization bug (PF-AI002).
- **Observability depth**: OTel on both .NET and Python, Langfuse cost/latency per LLM call, structured JSON logging — a solo project with production-grade observability.
- **Application/Interfaces catalog**: 21 interfaces, all single-responsibility, in the correct layer. `ILlmExtractionClient`, `ITransactionService`, `IBankIdentifier` are well-shaped.
- **DI registration in Program.cs** (`apps/api/src/PersonalFinance.Api/Program.cs:71–150`): explicit, readable, no auto-scan magic. Service lifetimes are correct.

---

## Architecture Findings

| # | Layer | Finding | Severity | Rule |
|---|-------|---------|----------|------|
| 1 | Backend | `ex.Message` returned directly to clients in TransactionsController | 🔴 | ERR-01 |
| 2 | AI Service | `wallet` field in `EmbedItem` and `SearchResult` — contract drift from PF-125 rename | 🔴 | THINK-05 |
| 3 | Backend | TransactionsController is a 600-line god object; 4+ methods exceed 60 lines of business logic | 🟡 | ARCH-04 |
| 4 | Backend | 4 controllers inject `Supabase.Client` directly, bypassing CQRS | 🟡 | ARCH-05 |
| 5 | Frontend | TypeScript strict mode globally disabled | 🟡 | CODE-04 |
| 6 | Backend | `CategorizeAsync` called inside a `foreach` over uncategorized transactions | 🟡 | PERF-01 |
| 7 | Backend | `IBankSignature.cs` defined in Infrastructure/Parsers not Application/Interfaces | 🟡 | ARCH-02 |
| 8 | AI Service | Gemini: no `max_tokens` enforcement, JSON parse not wrapped | 🟡 | ai-service rules |
| 9 | Tests/CI | CI has zero build/test/lint gates — only @claude mention handler and PR code review | 🔴 | CI-01 |
| 10 | Frontend | `DashboardPage` uses `useState` + `useEffect` fetch, not React Query | 🟡 | frontend.md |
| 11 | Frontend | `accountsApi` hardcodes port 7209 — wrong; should be 7208 | 🟡 | — |
| 12 | Backend | Dead endpoint `UploadPreviewNEW` in TransactionsController:176 | 🟢 | — |
| 13 | Backend | `LiabilitiesController` calls `GetLatestAsync` per liability in a loop (N+1) | 🟡 | PERF-01 |
| 14 | Docs | BOARD.md "Ready" section lists PF-122/124/125/128 — all are already Done | 🟢 | — |
| 15 | Docs | Governance rule TEST-03 references `UseInMemoryDatabase` — deleted with EF Core in PF-S07 | 🟢 | — |

---

### Finding 1: ex.Message returned to clients — ERR-01
- **Location:** `apps/api/src/PersonalFinance.Api/Controllers/TransactionsController.cs:146,151,155,159,233,238,242`
- **What's wrong:** Catch blocks return `new { Message = ex.Message }` and `Detail = ex.Message` directly as HTTP response bodies. The exception message is part of the public API contract.
- **Impact:** Internal state (file paths, Supabase query fragments, stack frames) is visible to anyone calling the upload endpoint. Security and noise risk.
- **Suggested fix:** Return generic user-facing messages only; log the raw exception via `ILogger`. The global `ExceptionMiddlewareExtensions` already does this correctly for unhandled exceptions — apply the same pattern here. `LlmExtractionException` already has a user-safe `UserMessage` property; use that.

---

### Finding 2: wallet/account_name field drift — THINK-05
- **Location:** `services/ai-service/app/models.py:163` (`EmbedItem.wallet`), `models.py:189` (`SearchResult.wallet`), `services/ai-service/app/services/retriever.py:51` (SQL alias `wallet`), `services/ai-service/app/services/embedder.py:28` (internal dataclass `wallet`)
- **What's wrong:** PF-125 renamed `wallet` → `account_name` across the full stack. `TransactionResult` was updated correctly (`account_name: str = ""`). But the RAG layer added afterward re-used the old `wallet` name in both request and response DTOs.
- **Impact:** Any .NET code consuming `/embed-transactions` or `/search` results will find `wallet` as a field name instead of the expected `account_name`. Silent null/empty deserialization depending on client behavior.
- **Suggested fix:** Rename `EmbedItem.wallet` → `account_name` in `models.py:163`, `SearchResult.wallet` → `account_name` in `models.py:189`, `embedder.py` internal dataclass, `retriever.py` SQL alias and mapping, and `main.py:222`. Update the contract table in `.claude/rules/ai-service.md`.

---

### Finding 3: TransactionsController god object — ARCH-04
- **Location:** `apps/api/src/PersonalFinance.Api/Controllers/TransactionsController.cs` — 605 lines total
- **What's wrong:** `UploadPreview()` (69 lines), `SubmitTransactions()` (62 lines), `GetAccountSummaries()` (53 lines), plus private methods `ResolveAccountIdsAsync()` (45 lines) and fuzzy matching helpers (`ScoreBestMatch`, `ScoreCandidate`, `Tokenize`, `Normalize`) — all business logic living in the controller. `PF-130` already tracks the Submit extraction; the account resolution logic is a second undocumented gap.
- **Impact:** Untestable. Account resolution has zero unit test coverage because it's in a controller. Logic will drift silently.
- **Suggested fix:** Extract `ResolveAccountIdsAsync` + scoring helpers into `IAccountResolutionService` in Application/Interfaces. This unblocks unit testing of the fuzzy matching algorithm and reduces the controller to ≤15 lines per action.

---

### Finding 4: Direct Supabase injection in controllers — ARCH-05
- **Location:** `AccountsController.cs:13`, `AssetsController.cs:15`, `InvestmentsController.cs:13`, `TransactionsController.cs:30`
- **What's wrong:** `Supabase.Client` injected directly. `AccountsController.GetAccountBalances()` performs raw PostgREST queries inline; `AssetsController.GetAssets()` loops holdings inline; `InvestmentsController` queries setups directly.
- **Impact:** Business logic in the API layer, untestable without a live Supabase instance, violates the Application service pattern that works well everywhere else.
- **Suggested fix:** Extract to service interfaces backed by Supabase implementations — `IAccountService`, `IInvestmentSetupService`. Pattern is already established (e.g., `INetWorthService`, `IValuationService`).

---

### Finding 5: TypeScript strict mode off — CODE-04
- **Location:** `apps/frontend/tsconfig.json:12` (`noImplicitAny: false`, `strictNullChecks: false`), `apps/frontend/tsconfig.app.json:18–21`
- **What's wrong:** `strict: false` globally. Known tech debt (PF-052) but the real cost is measured: `transactionsApi.ts:22` has `categoryRuleDto: any`, `StreakHeatmap.tsx` has untyped fetch, `Transaction.ts:3` uses `id: string` while API returns `number`.
- **Impact:** Runtime bugs that TypeScript would catch at compile time. The `id: string` vs `id: number` mismatch is the most likely to cause real bugs when transaction IDs are used in routing or lookups.
- **Suggested fix:** Enable `strict: true` in `tsconfig.app.json`, fix violations one by one starting with `Transaction.id: number`.

---

### Finding 6: CategorizeAsync in foreach — PERF-01
- **Location:** `apps/api/src/PersonalFinance.Application/Services/TransactionPipelineService.cs:164–168`
- **What's wrong:** One HTTP call to the Python AI service per uncategorized transaction. For a 100-row statement with 30 uncategorized transactions, that's 30 serial HTTP round-trips in the fallback path.
- **Impact:** Upload latency degrades linearly with uncategorized transaction count. The batch suggestion at line 141 (`_suggestionClient`) is already the right pattern — the individual fallback defeats it.
- **Suggested fix:** Collect all still-uncategorized transactions after the batch suggest pass, then call a batch categorize endpoint (or reuse `/suggest-categories`) for the remainder. If 1:1 LLM categorize must remain, at least parallelize with `Task.WhenAll`.

---

### Finding 8: Gemini safety gaps — AI service rules
- **Location:** `services/ai-service/app/providers/gemini.py:26–89` (no `max_tokens` parameter), `gemini.py:84` (`json.loads(response.text)` uncaught)
- **What's wrong:** (a) Gemini `extract_structured` does not set a `max_tokens` equivalent — if the model defaults to a short output, large statements silently truncate. (b) If Gemini returns malformed JSON (which happens on edge cases), the `json.loads` on line 84 raises an unhandled `json.JSONDecodeError` that becomes a 500 instead of a user-friendly 502.
- **Suggested fix:** Add `config=types.GenerateContentConfig(max_output_tokens=8192)` to the Gemini call. Wrap `json.loads` in try/except and raise `LlmParseError`.

---

### Finding 9: No CI build/test gates — CI-01
- **Location:** `.github/workflows/claude-code-review.yml`, `.github/workflows/claude.yml`
- **What's wrong:** The only CI workflows are (1) an @claude mention responder and (2) a PR code review. There are no `dotnet build`, `dotnet test`, `npm run lint`, `npm run build`, `tsc --noEmit`, or `gitleaks` gates. PRs can merge broken builds.
- **Impact:** Regressions go undetected until runtime. The codebase has no machine-enforced quality floor.
- **Suggested fix:** Add `ci.yml` with jobs: dotnet-build + test, frontend-lint + build + tsc, and a gitleaks scan. The governance doc (CI-01) specifies exactly this — it's just not wired.

---

## Governance Scan Results

| Rule | Result |
|------|--------|
| CODE-05 (`Console.WriteLine`) | ✅ Clean — 0 matches in `apps/api/src/` |
| ERR-01 (`ex.Message` in responses) | ❌ 6 violations in `TransactionsController.cs:146,151,155,159,233,238` + 2 pattern matches in `TransactionService.cs:32,328` (exception filter — not a client leak, but fragile) |
| CODE-03 (`#nullable disable`) | ✅ Clean — 0 matches |
| ARCH-02 (interfaces in Application/Interfaces) | ❌ 1 violation: `Infrastructure/Parsers/IBankSignature.cs` should be in Application/Interfaces |
| ARCH-01 (no outer→inner imports) | ✅ Clean — Application does not reference Infrastructure; Domain is clean |
| PERF-01 (CategorizeAsync in loop) | ❌ `TransactionPipelineService.cs:164–168` — LLM categorize called per-transaction in fallback foreach |
| CODE-04 (TypeScript strict) | ❌ `strict: false` in both tsconfig.json and tsconfig.app.json |
| THINK-05 (contract field parity) | ❌ `EmbedItem.wallet` and `SearchResult.wallet` in models.py diverge from `.NET AccountName` — not in the contract table in ai-service.md |
| **Stale governance rules** | ⚠️ TEST-03 references `UseInMemoryDatabase` — EF Core removed in PF-S07; rule is permanently unreachable and misleads future reviewers |

---

## Consistency Audit

| Pattern | Consistent? | Gap |
|---------|-------------|-----|
| Supabase via service interface | 60% — Application services use it; AccountsController, AssetsController, InvestmentsController bypass it | 4 controllers inject Supabase directly |
| React Query for data fetching | 80% — most pages migrated; DashboardPage still on useState/useEffect | DashboardPage.tsx not migrated |
| API client centralization | 95% — all fetch in `src/api/`; one exception in StreakHeatmap.tsx | 1 inline fetch remains |
| ILogger<T> in services | ~70% — TransactionsController and TransactionService have it; DashboardService, SpendingAnalysisService do not | PF-051 backlog |
| Namespace declarations | ~90% — some handlers missing namespace (found in Application/Commands) | Missing namespace = global namespace pollution |
| Langfuse tracing in providers | Gemini: full; Anthropic extract_structured: full; Anthropic generate_json: incomplete error branch | `anthropic.py:134` exception path doesn't set trace level |

---

## Test Coverage Gap

| Area | Has tests? | Risk if untested |
|------|-----------|-----------------|
| TransactionsController (UploadPreview, SubmitTransactions) | No | Core feature path; 600-line method with business logic |
| AccountsController | No | Direct Supabase queries, account balance calculation |
| ResolveAccountIdsAsync / fuzzy matching | No | Account auto-mapping logic has no verification |
| CategoryRuleService | ❌ 8 skipped (PF-034) | Rules engine is product-critical; wrong categorization = wrong pyramid scores |
| DashboardService | No | Aggregation logic; silent calculation bugs |
| SpendingAnalysisService | No | Safe-to-Spend indicator depends on this |
| JourneyScoringService | No | **Highest risk** — this is the product's core engine |
| BcaCsvParser / NeoBankPdfParser | No (PF-035) | Parser regressions go undetected until production upload |
| EmbedItem wallet→account_name contract | No | The THINK-05 drift went undetected; needs a contract test |
| Frontend (any) | None | Zero component test coverage; PF-038 backlog |
| E2E: cashflow/transactions | No | Transaction list is the primary data view |
| E2E: investment/* | No | Entire investment module untested |

---

## Tech Debt Ledger

| Item | Status | Notes |
|------|--------|-------|
| TypeScript strict mode disabled (PF-052) | **Still present** | tsconfig.app.json:18 `strict: false` |
| Partial ILogger coverage (PF-051) | **Still present** | DashboardService, SpendingAnalysisService still missing it |
| Many CategoryRuleService tests are `[Fact(Skip)]` | **Still present** | PF-034 integration harness not built |
| No frontend tests (PF-038) | **Still present** | Zero test files in frontend src/ |
| `Transaction.ts id: string` vs API `id: number` | **Still present** | `src/types/Transaction.ts:3` |
| `TransactionService.cs` missing namespace | **Still present** | Global namespace pollution |
| `upload-preview-new` dead endpoint | **Still present** | `TransactionsController:176–248`; PF-S11 stub |
| IBankIdentifier ARCH-02 | **Fixed** — update CLAUDE.md | PF-124 complete; IBankIdentifier is in Application/Interfaces now |
| ex.Message leak | **Worse than documented** | ExceptionMiddleware fix was done (PF-028) but TransactionsController still leaks at 6 sites |
| **NEW** wallet/account_name THINK-05 drift in RAG layer | **New — not in CLAUDE.md** | EmbedItem + SearchResult + embedder.py + retriever.py still use `wallet` |
| **NEW** No CI build/test/lint gates (CI-01) | **New — not tracked** | No `ci.yml` at all |
| **NEW** PERF-01: CategorizeAsync in foreach | **New** | TransactionPipelineService:164 LLM fallback path |
| **NEW** Wrong API port in accountsApi | **New** | accountsApi uses 7209 instead of 7208 |

---

## Top 3 Highest-Leverage Improvements

1. **Add CI pipeline (ci.yml)** — Zero CI gates is the single biggest quality risk. One broken build can stall development. A GitHub Actions workflow with `dotnet build + test`, `npm lint + build + tsc`, and gitleaks takes ~2 hours to write and eliminates the whole class of "it worked locally" regressions. **Effort: S. Impact: Critical.**

2. **Fix wallet→account_name THINK-05 drift** — Five files need renaming (models.py, embedder.py, retriever.py, main.py). Small change but the `/embed-transactions` and `/search` endpoints are the foundation of RAG Phase 2. If PF-AI004 builds on broken field names, the whole RAG pipeline ships broken. **Effort: S. Impact: High.**

3. **Extract TransactionsController business logic** — `ResolveAccountIdsAsync` + scoring helpers → `IAccountResolutionService`; `SubmitTransactions` bulk → `SubmitTransactionsCommandHandler` (already tracked as PF-130). This unlocks unit testing of the most complex untested logic in the codebase and brings the controller to ARCH-04 compliance. **Effort: M. Impact: High (testability + safety for PF-S08 auth wiring).**

---

## Developer Tooling & Automation Recommendations

*This section addresses the user's specific ask about missing tools, Claude skills, and day-to-day automation.*

### Missing / underused Claude skills

| Skill | What it does | When to use it |
|-------|-------------|----------------|
| `/ci-check` | Runs dotnet build + test + lint locally and reports what's broken | Before every commit; replaces mental "did I break anything?" |
| `/kanban-sync` | Syncs BOARD.md with GitHub Issues/Projects state | After closing/moving tickets; BOARD.md is currently stale |
| `/chores` | Housekeeping — stale plans, dead files, tech debt markers | Monthly; would catch the BOARD.md Ready section staleness |
| `/run` | Launches the app and lets you observe behavior | After UI changes; currently the workflow is `npm run dev` manually |
| `/verify` | Runs the app and confirms a specific change works | After implementing a feature to get a "SHIP IT / SEND BACK" verdict before PRs |
| `/fewer-permission-prompts` | Scans transcripts and adds allowlisted Bash/MCP calls to settings.json | Once; reduces the permission prompt count on `dotnet test`, `npm run lint` etc. |
| `/po-review` | Lead PO review of a developed feature — catches UX gaps | After feature completion before creating the PR |

### MCP servers worth evaluating (PF-042)

| MCP server | Value for this project |
|------------|----------------------|
| **Supabase MCP** | Direct `supabase.query()` from Claude — replace manual Studio trips for schema inspection, RLS policy checks, seed data verification. High value given Supabase is the primary data store. |
| **GitHub MCP** | Create/close issues, update project board fields, add labels — eliminates the manual BOARD.md sync step. `kanban-sync` would auto-update GitHub Projects directly. |
| **Linear MCP** | Only if you move from GitHub Projects; skip for now. |

### Day-to-day commands worth automating

| Command | Current friction | Automation |
|---------|-----------------|------------|
| `dotnet test` before commit | Manual | Add to `/commit` flow via `ci-check` skill |
| BOARD.md sync | Manual after every ticket close | `/kanban-sync` — it already exists |
| Check if all services are healthy | Manual browser to /status | `/run` or a hook that pings /health after `npm start` |
| "What should I work on next?" | Reading BOARD.md | `/arch-review` + BOARD.md gives the answer; could also use `/braindump` for sprint planning |
| Supabase migration apply | `supabase db push` after migration creation | Could add a `db-migrate` skill trigger |

### Suggested hooks for settings.json
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash(git commit*)",
        "hooks": [{ "type": "command", "command": "cd apps/api && dotnet build PersonalFinance.slnx --no-restore -q" }]
      }
    ]
  }
}
```
This catches build-breaking commits before they land. Use `/update-config` to wire this up.

---

*Report saved. Next review should populate "Delta since last review" from this file.*
