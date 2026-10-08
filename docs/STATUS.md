# Project Status

> **Code reviewed:** 2026-10-08 (Asia/Makassar)
> Current implementation reference. “Implemented” means source and wiring exist; it does not mean deployed, live-tested today, or production-ready. Historical results retain their original dates.

## Current phase

The local finance workspace now includes Journey, Cashflow, Assets, Investment, transaction Q&A, Buckets budgeting, Trading Desk foundations, and Macro Scenario Lab. The API targets **net10.0**, React is **18**, and FastAPI requires **Python >=3.11.9** (Docker uses 3.12). Persistence is Supabase/PostgREST plus direct asyncpg/pgvector queries for retrieval. EF Core/Persistence is removed.

The latest recorded feature is **PF-141 — opt-in Jev residual categorization** (plan dated 2026-09-27). Implementation and evaluator exist; live evaluation and promotion remain pending. The coded default is `CATEGORIZATION_BACKEND=llm`. No Jev cost/latency improvement is established.

## Implemented product surface

| Area | Coded behavior | Evidence / boundary |
|---|---|---|
| Journey | Home at `/journey`; five-tier presentation, scored indicators, stored snapshots/achievements, generated quests with fallback, Living Garden hero | `JourneyScoringService`, `JourneyController`, Journey pages. Four data-derived indicators: spending/income, liquid savings coverage, DTI, savings rate. Other indicators are unavailable; five tiers do not imply five complete finance products. Placeholder identity remains. |
| Cashflow | Upload/review/submit, account linking and alias learning, file-hash/in-memory/database deduplication, server-paged transactions, CSV export, statements, balances, analysis | `TransactionsController`, `TransactionService`, cashflow pages. See ingestion limitations below. |
| Categorization | User rules, presets, history lookup, bulk preview Suggest; separate normalization/categorization service with merchant batch and residual fallback | `CategoryRuleService`, `TransactionPipelineService`, `CategorizePreviewCommand`. Standard upload does not invoke the full pipeline. |
| Spending / Buckets | Safe-to-Spend with historical savings outflows, variance, Committed/Future/Free budgeting, persisted Future plan and commitment demotions, month-close and variable-income views | `BucketsService` + pure `BucketCalculator`, `BucketsController`, `BucketsCard` in `/cashflow/analysis`; migration `20260804000001_buckets.sql`. Not every envelope/zero-based/50-30-20 method is implemented. |
| Assets | Institutions/accounts, assets, holdings, valuations, liabilities, FX service, net-worth/allocation/history | Accounts/Assets/Liabilities/NetWorth controllers and services; `/assets/*`. |
| Investment | Archetype setups, holdings, AI portfolio review and saved review snapshots | `InvestmentsController`, review command/client, `/investment/*`; no claim of broker execution or audited TWR/XIRR reporting. |
| Transaction chat | `/chat` and shared AI panel; SSE answers, per-answer sources, SQL totals, verification/error states, contextual follow-up suggestions | `chatApi.ts`, `useChatSession.ts`, Python `/ask/stream` and `/ask/followups`. Calls FastAPI directly. UI history is not sent as conversational memory to `/ask`. |
| Trading Desk | Command, Portfolio, Mandate and Reconcile; mandate versioning/presets, multi-portfolio positions and symbol aggregation, NAV/risk/sizing/gate engine | `/desk/*`, `DeskService`, `DeskCalculator`, TS mirror. Pre-Trade and Journal tabs are disabled; state evaluates without a trade plan. Deferred rules remain unresolved. |
| Macro Scenario Lab | Deterministic solver, presets, personal portfolio/spending/liability/runway estimates, comparisons, saved scenarios | `/lab`, `src/lib/macroScenario/`, `useMacroLab`, `MacroScenariosController`; migration `20260902000001_macro_scenarios.sql`. Estimates are assumptions, not validated forecasts. |
| Settings / platform | Appearance/Zen, categories, regional formatting, banks, data controls; health/status page; OTel/LGTM and Langfuse instrumentation | `App.tsx`, `Program.cs`, `observability.py`, Compose/monitoring. Runtime health was not checked in this task. |

## AI capabilities and actual wiring

- **Extraction:** Gemini or Anthropic through the provider factory; PDF text via PyMuPDF, image vision, structured extraction. BCA CSV, NeoBank PDF and standard CSV have deterministic parsers. Unmatched readable PDFs fall back to LLM extraction. No dedicated Wise+FX parser or YAML bank-profile loader exists.
- **Superbank:** Python prompt/dispatch exist, but .NET `LlmPdfParser` sends `bankHint: null`. The specialized prompt requires a direct Python caller supplying `bank_hint`; normal bank detection does not select it.
- **RAG (PF-AI003/003b/004):** embeddings, backfill, model-aware retrieval, local FlashRank reranking and grounded `/ask` exist. Embeddings default to Gemini; OpenAI is selectable independently of generation. Each transaction is the indexed unit. Chunking helpers exist; statement-level sentence-window retrieval and auto-merging are deferred.
- **Streaming / routing (PF-AI005 + PART2):** `/ask/stream` routes aggregates to parameterized SQL SUM/COUNT and lookups to vector retrieval/reranking. Arithmetic uses Decimal; existing responses still convert money to JSON numbers. Citation-marker checks do not prove every sentence true. Formal numeric evaluation remains deferred in the July 14 record after quota exhaustion; current quota was not rechecked.
- **Hybrid retrieval (PF-AI006):** vector, PostgreSQL full-text (`bm25` mode name), and RRF hybrid modes exist. Recorded July 24 benchmark favored vector (MRR@5 0.771 vs hybrid 0.750); coded default remains vector. This is corpus-specific historical evidence.
- **Categorizer agent (PF-AI007):** separate `/categorize-agent` endpoint with smolagents rules/history/vocabulary tools. Does not replace upload categorization. Plan remains in progress with partial, quota-limited live smoke evidence.
- **Financial advisor (PF-AI008):** separate `/advisor` LangGraph endpoint, four .NET-backed tools, process-memory sessions, bounded calls/timeouts and fallback. Closed by user acceptance September 15; second-turn/scenario/visual dashboard checks were deferred. React transaction chat does not call this endpoint. Requested dates enter prompts rather than structured tool filters.
- **Categorization evaluator (PF-AI010):** implemented with recorded August 5 baseline in `services/ai-service/evals/results/20260805-categorize-eval.md`; its plan says Done despite the old board's To Do entry.
- **Jev (PF-141):** independent opt-in `/categorize` backend, closed vocabulary, explicit threshold, abstention, bounded timeout and .NET rule-seeding guard. Never allows automatic Jev rule creation. A versioned evaluator with 100 held-out cases plus 20 tuning cases exists; live evaluation, calibrated threshold, rollout and savings evidence remain pending. Bulk preview Suggest and agent endpoint are unaffected.

## Ingestion boundaries

The frontend uses `POST /api/transactions/upload-preview`: parse → resolve accounts → tag duplicates → review → `submit`. BCA/standard/LLM PDF parsers call history/rule/preset categorization; the image path calls extraction directly. Preview Suggest calls its own MediatR command and `/suggest-categories`.

The full `TransactionPipelineService.ProcessAsync` (normalization, batch suggestions, residual categorization, deduplication after parser-level categorization) is called only by the CSV branch of **experimental `upload-preview-new`**. Its PDF/image branch stores a file and returns 202 with no worker/webhook completion. This is not a finished asynchronous import pipeline.

Standard submit starts embeddings through background `Task.Run`; failure is logged without failing import. There is no durable enrichment queue/retry guarantee. Realtime INSERT subscriptions invalidate the transaction query and notify the user; they are not upload processing-status subscriptions.

## Supabase migration status

| Task / capability | Actual code status |
|---|---|
| PF-S01–S07 — schema + SDK + EF removal | Implemented; timestamped SQL migrations are the schema source |
| PF-S08/S09 — backend/frontend Auth | Not implemented: no JWT authentication registration or login/protected-route flow; placeholder users and permissive app policies remain |
| PF-S10 — Storage | Bucket migration and StorageService implemented; used by experimental endpoint, not standard wizard |
| PF-S11 — event-driven extraction | Not implemented: no `statement_uploads` migration or `/webhooks/process` endpoint |
| PF-S12 — Realtime | Transaction INSERT updates implemented under PF-AI005; original upload-status scope remains pending |
| PF-S13 — RAG | Capability implemented under PF-AI003–006; GitHub issue/project closure not verified |

Development uses Supabase CLI (Postgres 17, API 54321, DB 54322, Studio 54323). Compose still contains standalone Postgres 16 at 5432, also started by `npm start`; it is not the Supabase database. Docker-only configuration is incomplete for current Supabase/AI/realtime requirements. See [SETUP.md](SETUP.md).

## Remaining scope

- Authentication and tenant isolation; AI security/governance and deployment work (PF-AI011/012) remain planned.
- Durable webhook extraction and upload-status realtime completion (PF-S11/S12).
- Trading Desk Pre-Trade/Journal and gated trade-plan persistence (PF-134), deferred risk rules (PF-135).
- Formal numeric evaluation, remaining agent/advisor live checks, Jev evaluation/promotion.
- Dedicated Wise+FX parser, YAML bank profiles, statement-level sentence-window/auto-merging retrieval.
- Full bills/subscription management, savings-goal workflows, debt repayment management, general reporting, standalone FIRE/passive-income/estate/succession/tax planning. Existing liabilities, insights and Journey indicators cover only parts of these domains.
- MCP is the next recorded learning milestone; no application MCP server is implemented in reviewed service code.

## Current debt and verification limits

- TypeScript strictness is disabled. Build runs `vite build`, not a standalone type check. Frontend `Transaction.id` is string while the .NET DTO is int; adapters must be considered before contract changes.
- Backend/AI tests, frontend desk/macro unit tests and seven Playwright specs exist. Broad frontend component coverage and several Supabase integration tests remain absent/skipped. “No frontend tests” is obsolete.
- DashboardService and SpendingAnalysisService now have ILogger. Several legacy services/parsers still use global namespaces.
- Standard upload catches can include exception text; middleware emits detail in DEBUG. Exception leakage is not fully eliminated.
- Some PostgREST consumers request large ranges without paging while local `max_rows=1000`; Dashboard/Spending/Buckets page separately. Requested ranges alone do not establish complete large-dataset coverage.
- Durable advisor memory and complete container environment wiring are unfinished. Permissive RLS does not provide per-user isolation.
- Historical PF-AI008 record: 41 advisor checks passed; full AI suite 193 passed / 1 pre-existing merchant-suggester PII failure; dependency conflicts recorded. PF-141 has a separate offline verification record. These are previous runs, not October 8 results.
- This sync inspected source, migrations, manifests, tests and plans. Shell execution was unavailable (process helper initialization failed; Node spawning returned EPERM), so no build/test/live checks or GitHub reconciliation ran today.

## References

- [Architecture](architecture/architecture-diagram.md), [REST/AI routes](architecture/API-endpoints.md), [backend](architecture/API-backend.md), [frontend](architecture/Front-End.md)
- [Migration scope](architecture/supabase-migration.md), [sprint implementation map](sprint-plan.md), [documentation audit](codex/documentation-status-audit.md)
- [Task board](../.claude/plans/BOARD.md), [learning progress](mentor/progress.md), [PF-141 plan](../.claude/plans/PF-141-jev-categorizer-todo.md)
