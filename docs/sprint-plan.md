# Sprint Implementation Map

> **Code reviewed:** 2026-10-08. The original week-by-week proposal is retained as historical intent in project context/plans. This map describes current implementation, not elapsed-week estimates or GitHub issue closure.

## Sprint 1 — Hybrid parser pipeline

| Original scope | Actual status |
|---|---|
| FastAPI service and .NET HTTP bridge | Implemented: extraction, categorization, reviews, advisors and retrieval |
| Superbank PDF extraction | Generic PDF path implemented; specialized Python prompt exists but normal .NET parser sends no bank hint |
| Screenshot extraction | Implemented for PNG/JPEG/WebP |
| Wise CSV + FX parser | Dedicated parser not implemented; generic CSV mapping is not equivalent |
| YAML bank profiles | Not implemented; registered C# signatures/parsers are the active mechanism |
| Validation/categorization pipeline | Service implemented; full pipeline called only by experimental upload CSV branch |
| Upload → parse → review → persist | Standard synchronous path implemented; account resolution, dedup and background embeddings wired |
| Integration coverage | Tests/specs exist; several Supabase tests skipped; no fresh full-stack run in this sync |

## Sprint 2 — RAG and transaction Q&A

Implemented under PF-AI003/003b/004/005/006: embeddings, pgvector storage, model-aware retrieval, optional full-text/hybrid modes, FlashRank reranking, grounded answers, SSE UI, SQL aggregate routing and transaction INSERT realtime notifications. Vector remains default after the recorded hybrid comparison.

PF-AI005-PART2 code is complete; formal numeric evaluation/metrics remain deferred in its latest record. Sentence-window helpers exist, but statement-level indexing/retrieval and auto-merging remain deferred to PF-AI006-PART2.

## Sprint 3 — Agents

- PF-AI007 smolagents categorizer endpoint and three tools are implemented; learning plan remains in progress with incomplete live smoke validation.
- PF-AI008 LangGraph advisor and four .NET-backed tools are implemented and closed by September 15 user acceptance; deferred live/scenario checks remain recorded.
- Semantic Kernel is not the implemented agent framework; current agents run in Python.
- MCP is the next recorded learning milestone, with no application MCP server in the reviewed code.

## Sprint 4 — Hardening

OTel/LGTM, Langfuse, extraction/retrieval/categorization evaluators and provider error handling exist. These do not establish full production readiness: auth/tenant isolation, prompt-injection/PII guardrails (PF-AI011), response caching, rate limiting and public deployment/CD (PF-AI012) remain planned. No n8n orchestration is wired into application ingestion.

## Features beyond the original sprint proposal

| Feature | Status |
|---|---|
| Assets, liabilities, net worth, investment setups/reviews | Implemented |
| Journey, Living Garden, achievements, deterministic insights | Implemented; some indicators remain unavailable |
| Buckets budgeting | Implemented on Cashflow Analysis; persisted plan/overrides and month-close views |
| Trading Desk PF-133/136/137/138 | Foundation implemented; PF-134 Pre-Trade/Journal and PF-135 rules deferred |
| Contextual chat follow-ups PF-139 | Implemented; optional request with fallback chips |
| Macro Scenario Lab PF-140 | Implemented: personalized scenarios, comparison and database saves |
| Jev categorizer PF-141 | Opt-in backend/evaluator implemented; live evaluation and promotion pending; default remains llm |

Use [STATUS.md](STATUS.md) for current limitations and [Supabase migration](architecture/supabase-migration.md) for Auth/Storage/webhook/realtime boundaries. Historical plans and the local [board](../plans/BOARD.md) retain verification history; GitHub-linked task closure requires separate reconciliation.
