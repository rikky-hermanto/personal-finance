# Documentation Status Audit — 2026-10-08

## Purpose and evidence boundary

This sync brings current project/reference documents into agreement with implementation while preserving historical proposals, decisions, tests and learning records. It changes documentation only; no application code/configuration, credentials, migrations, deployment, commit/push or remote task state was changed.

The review inventoried 484 application source/configuration files across the API, frontend and AI runtime (excluding managed UI primitives/build artifacts), then traced entry points, feature call sites, persistence, models and test seams. It also inspected timestamped SQL migrations, dependency/start scripts, Dockerfiles/Compose, documentation and local task plans. Reading the inventory is not a runtime test or an assertion that every feature is correct.

## Corrections and primary evidence

| Previous drift | Actual code / documentation correction | Evidence |
|---|---|---|
| RAG unfinished, /ask planned | Embedding/search/rerank/ask/SSE/planner/aggregation exist; formal numeric eval still pending | [FastAPI entry](../../services/ai-service/app/main.py), [retriever](../../services/ai-service/app/services/retriever.py), [aggregator](../../services/ai-service/app/services/aggregator.py) |
| All uploads invoke full cascade | Standard endpoint invokes parser/account resolution/dedup; complete normalization/residual service is called only by experimental CSV endpoint | [TransactionsController](../../apps/api/src/PersonalFinance.Api/Controllers/TransactionsController.cs), [pipeline](../../apps/api/src/PersonalFinance.Application/Services/TransactionPipelineService.cs) |
| Superbank prompt always selected | Normal .NET parser passes bankHint:null; specialized Python prompt requires supplied hint | [LlmPdfParser](../../apps/api/src/PersonalFinance.Infrastructure/Parsers/LlmPdfParser.cs), [Python dispatch](../../services/ai-service/app/services/llm_parser.py) |
| No budgeting | Buckets service/controller/UI/settings/overrides/month close exist; this is not general-purpose bank ringfencing/goal matching | [BucketsService](../../apps/api/src/PersonalFinance.Application/Services/Buckets/BucketsService.cs), [UI](../../apps/frontend/src/components/buckets/BucketsCard.tsx) |
| Realtime absent or async import complete | Transaction INSERT subscriptions implemented; statement-upload status/jobs/webhook still absent | [hook](../../apps/frontend/src/hooks/useRealtimeTransactions.ts), [migration](../../supabase/migrations/20260706000001_add_realtime.sql) |
| Agents/MCP all planned | smolagents and LangGraph endpoints/tools exist; MCP remains planned; source availability does not erase deferred checks | [agents](../../services/ai-service/app/agents/), [PF-AI008 acceptance](../../plans/done/learning/PF-AI008-langgraph-financial-advisor.md) |
| Follow-ups/Scenario Lab omitted | UI/API/service/schema are wired; local board's PF-139 Ready and PF-140 duplicate obsolete row were stale | [chat hook](../../apps/frontend/src/hooks/useChatSession.ts), [macro hooks](../../apps/frontend/src/hooks/useMacroLab.ts), [schema](../../supabase/migrations/20260902000001_macro_scenarios.sql) |
| Desk absent or wholly finished | Foundation, presets and portfolio grain exist; no enabled Pre-Trade/Journal routes or full gate coverage | [DeskService](../../apps/api/src/PersonalFinance.Application/Services/Desk/DeskService.cs), [DeskLayout](../../apps/frontend/src/pages/desk/DeskLayout.tsx) |
| Jev opportunity only | PF-141 implementation/evaluator exist, default remains llm, no live promotion or measured savings | [factory](../../services/ai-service/app/services/categorization_factory.py), [plan](../../plans/in-progress/PF-141-jev-categorizer-todo.md) |
| No frontend tests; missing Dashboard/Spending logging | Desk/macro Vitest and seven Playwright specs exist; both named services have ILogger | [frontend scripts](../../apps/frontend/package.json), [DashboardService](../../apps/api/src/PersonalFinance.Application/Services/DashboardService.cs), [SpendingAnalysisService](../../apps/api/src/PersonalFinance.Application/Services/SpendingAnalysisService.cs) |
| .NET 9/EF/Docker-only setup | net10.0/Supabase SQL; host development requires tools/settings; Compose still has separate Postgres and incomplete container settings | [Program](../../apps/api/src/PersonalFinance.Api/Program.cs), [root scripts](../../package.json), [Compose](../../docker-compose.yml) |
| API reference contained old array/wallet shapes and WeatherForecast | Actual controller inventory has 80 routes plus health/OpenAPI; Python has 15 custom routes. Updated envelopes/types/filters/errors | [endpoint reference](../architecture/API-endpoints.md) |

## Documentation treatment

- STATUS, setup, architecture/C4, backend/frontend, API, sprint map and categorization are current references with explicit source-review date.
- README, ingestion, budgeting and index were corrected; missing screenshot links were removed and diagram/reference destinations repaired.
- Existing interactive/sequence diagrams retain their layouts, with current-state notes and targeted status/prompt/default corrections. Diagram “live” means coded, not an observed running/deployed service.
- Historical ADRs, June architecture/debt reviews, proposal examples and performance records retain original detail with a current-state pointer. Project context is labeled an original proposal, with the manifest summary updated.
- Learning use-case statuses and local board rows were reconciled where code/plans support them. Curriculum/order/preferences and historical progress entries are preserved. PF-AI007 and formal numeric evaluation retain incomplete evidence. PF-AI010 follows its Done plan/baseline. No GitHub closure/sync is claimed.
- The local Supabase guide now uses configuration names/addresses, removes copied credential output and correctly distinguishes local migration from destructive reset.

## Validation and limits

Validation completed: all 44 edited documentation files reread exactly as prepared; 256 local Markdown/HTML destinations resolved; all 80 controller routes and 15 FastAPI routes covered; 12 diagram inline scripts compiled with no syntax errors; Markdown code fences balanced; edited paths excluded application source, schema/configuration and protected agent/Claude files. Diagram browser/visual behavior was not tested.

Command execution was unavailable: exec process-helper setup failed; child-process spawning returned EPERM. The available Node file API enabled source inspection and scoped documentation edits, but no build, lint, unit/integration/E2E, Docker/Supabase runtime or Git working-tree command was run. GitHub was not accessed. No paid provider evaluation was performed.

Potential source issues are documented, not fixed: standard pipeline call gap, bank-hint loss, exception details, permissive tenant policies, PostgREST large-range queries, non-durable embeddings/advisor memory, date/filter limitations, incomplete deployment settings and deferred risk rules. Historical benchmark numbers apply only to their recorded datasets/runs.

## Maintenance rule

Use [STATUS.md](../STATUS.md) as the current capability reference. Update it when behavior or verification changes, then update affected references. Keep planned paths and acceptance history distinguishable from code, avoid stale overall completion percentages, and reconcile GitHub separately before changing remote-linked task closure claims.
