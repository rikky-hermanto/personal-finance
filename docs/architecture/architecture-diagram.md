# Current Architecture

> **Code reviewed:** 2026-10-08. Solid paths below are implemented source wiring. Runtime health, deployment and integration checks were not rerun. Future auth/webhook paths are listed separately.

## System map

```text
React 18 / Vite :8080
  ├─ REST fetch ───────────────────► .NET 10 API :7208
  │                                  ├─ Controllers / MediatR / services
  │                                  ├─ Bank signatures + CSV/PDF parsers
  │                                  ├─ Supabase/PostgREST ────────────┐
  │                                  ├─ HTTP extraction/review/quests ─┼─► FastAPI :8000
  │                                  └─ Post-submit background embed ─┼─► FastAPI
  ├─ SSE chat + follow-ups ──────────────────────────────────────────┘
  │                                        FastAPI
  │                                          ├─ Gemini / Anthropic generation
  │                                          ├─ Gemini / OpenAI embeddings
  │                                          ├─ FlashRank reranking (local)
  │                                          ├─ asyncpg / pgvector ────┐
  │                                          └─ LangGraph tools ─► .NET API
  └─ Supabase Realtime (transaction INSERT) ───────────────────────────┤
                                                                     ▼
                                            Supabase CLI platform
                                            API :54321 / Postgres 17 :54322
                                            Studio :54323 / Storage

.NET + FastAPI ── OTLP ──► Alloy ──► Prometheus / Loki / Tempo ──► Grafana
FastAPI generation/embedding/agent observations ──► Langfuse (configured)

Compose Postgres 16 :5432 remains separate from Supabase Postgres.
```

## Application modules

| UI | Backend / calculation owner |
|---|---|
| Journey / achievements | JourneyScoringService + Python JourneyAdvisor; unavailable indicators retained |
| Cashflow / upload / transactions / statements | TransactionsController, parsers, TransactionService, DashboardService |
| Cashflow Analysis / Buckets | SpendingAnalysisService, BucketsService + pure BucketCalculator |
| Assets / liabilities / net worth | CQRS handlers, ValuationService, NetWorthService, FX service |
| Investment / review snapshots | Investment commands, PortfolioReviewClient → Python reviewer |
| Trading Desk foundation | DeskService / DeskMandateService / pure DeskCalculator + TS mirror |
| Macro Scenario Lab | Browser pure solver/personalization + .NET scenario CRUD |
| Chat + global AI panel | Direct Python routed SSE Q&A + optional contextual suggestions |

## Standard upload path

1. Browser posts multipart `file` to `/api/transactions/upload-preview`.
2. CSV/PDF bank probing selects registered parsers. Images go directly to the AI extraction client. NeoBank PDF is deterministic; unrecognized readable PDFs use generic LLM extraction.
3. BCA/standard/LLM PDF parsers call CategoryRuleService; the controller resolves account names and tags duplicates. Full TransactionPipelineService is not called by this endpoint.
4. User reviews/edits and may request bulk Suggest through `categorize-preview` → `/suggest-categories`.
5. `submit` persists nonduplicates and file hash/alias information, then starts optional background embedding. Failed embeddings do not fail import and are not durably queued.
6. A transaction INSERT realtime event invalidates the transaction query and shows a notification.

Superbank prompt dispatch exists in Python, but the .NET LLM PDF parser passes no bank hint. Source-supplied AccountName is transient; persisted transactions use nullable account_id. Retrieval contracts retain wallet as a display field.

## Query and agent paths

- `/ask` and `/ask/stream` use a planner: aggregates → parameterized SQL SUM/COUNT → narration; lookups → model-filtered vector candidates → local rerank → cited answer. Vector is default; `/search` can explicitly select full-text or hybrid mode.
- Indexed unit is one transaction composed from description, remarks, category and account display text. Fixed-size/sentence-window helper functions are not a statement-level production retriever.
- `/ask/followups` generates self-contained optional chips from the last answer/context. UI message history is local, not stateful backend conversation memory.
- `/categorize-agent` runs smolagents with category-rule, similar-transaction and vocabulary tools; it is a separate debug/demo path.
- `/advisor` runs LangGraph with four HTTP tools back to .NET, bounded model calls/timeouts and MemorySaver keyed by session_id. Memory is lost on process restart. The transaction chat UI does not route here.
- `/categorize` can opt into Jev independently of extraction/embedding providers. Default is llm; Jev abstains and prohibits rule seeding. Its runtime switch does not wire the residual pipeline into standard upload.

## Persistence

SQL migrations define transactions/rules/presets/uploaded_files; accounts/institutions/assets/holdings/valuations/liabilities/FX/quotes; investment setups/holdings/review snapshots; Journey state/indicator snapshots/achievements; transaction_embeddings + full-text index; desk portfolios/positions/mandates/recon/journal/open trades; bucket settings/overrides; saved macro scenarios.

Presence of desk journal/open-trade tables does not mean Journal/Pre-Trade screens or mutation routes exist. No statement_uploads table is defined. App-table RLS is largely permissive; placeholders are not authenticated tenant ownership.

## Planned paths

| Capability | Missing wiring |
|---|---|
| Supabase Auth | JWT validation, frontend login/session forwarding, per-user app policies |
| Event-driven extraction | statement_uploads table, webhook handler/worker, extraction writeback |
| Upload-status realtime | Job status source and subscription; transaction INSERT realtime already exists |
| Durable advisor sessions | Persistent checkpointer and authenticated session ownership |
| Public/container deployment | Current Compose lacks complete Supabase/AI/frontend settings injection |

The experimental `upload-preview-new` stores PDFs/images and returns 202 without a completing worker. Its CSV branch alone invokes the full normalization/categorization pipeline.

See [status](../STATUS.md), [endpoints](API-endpoints.md), [migration scope](supabase-migration.md), [setup](../SETUP.md) and [C4 view](c4-container-diagram.md). Older interactive diagrams may be teaching/target snapshots; their labels are not evidence of deployed behavior.
