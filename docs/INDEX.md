# Docs Index — Personal Finance

> **Status links reviewed:** 2026-10-08. Current implementation is recorded in [STATUS.md](STATUS.md); designs, ADRs, historical evaluations and teaching diagrams retain their original scope.
> Topic-oriented map of all docs. Use this when you need to find where something is documented.
> Organized by "what question are you trying to answer?" not by folder structure.

---

## "How does the system work?"

| Topic | File | What it covers |
|-------|------|----------------|
| Architecture overview + event flow | [architecture/architecture-diagram.md](architecture/architecture-diagram.md) | Current service relationships, synchronous upload, chat/agent paths and planned webhook boundaries |
| C4 Container diagram | [architecture/c4-container-diagram.md](architecture/c4-container-diagram.md) | Component relationships at container level |
| AI system — target architecture (interactive) | [ai-features/diagram-ai-system-target.html](ai-features/diagram-ai-system-target.html) | Node-graph of the AI Learning Track (PF-AI001–PF-AI009): live vs. in-progress vs. planned, open in a browser |
| PF-AI006 — advanced RAG patterns | [mentor/advanced-rag-notes.md](mentor/advanced-rag-notes.md) | Measured hybrid comparison; sentence-window/auto-merging deferred |
| Query pipeline — one question end-to-end (interactive) | [ai-features/diagram-query-pipeline-listrik.html](ai-features/diagram-query-pipeline-listrik.html) | Worked trace of “berapa tagihan listrikku di bulan April 2025?” through /ask: plan → route (aggregate vs lookup) → SQL SUM or vector retrieve+rerank (vector is the coded default) → narrate → answer; click a stage to drill in, open in a browser |
| AI feature — statement ingestion (interactive) | [ai-features/diagram-ai-statement-ingestion.html](ai-features/diagram-ai-statement-ingestion.html) | Bank statement file → transactions: upload wizard → bank identifier → direct parsers vs LLM extraction → validation pipeline → Supabase; click a stage to drill in, open in a browser |
| AI feature — transaction categorization (interactive) | [ai-features/diagram-ai-categorization.html](ai-features/diagram-ai-categorization.html) | The four layers (history cache → rules → presets → LLM fallback) plus the experimental ReAct agent (PF-AI007); click a stage to drill in, open in a browser |
| AI feature — portfolio review (interactive) | [ai-features/diagram-ai-portfolio-review.html](ai-features/diagram-ai-portfolio-review.html) | Investment holdings → CQRS command → typed client → 7-section forced-schema review → persisted snapshot; click a stage to drill in, open in a browser |
| AI feature — journey advisor (interactive) | [ai-features/diagram-ai-journey-advisor.html](ai-features/diagram-ai-journey-advisor.html) | Pyramid scores → weakest indicators → three generated quests, with the deterministic fallback when the LLM fails; click a stage to drill in, open in a browser |
| AI feature — chat / grounded Q&A (interactive) | [ai-features/diagram-ai-chat-rag.html](ai-features/diagram-ai-chat-rag.html) | Two lanes over one database: top = indexing (submit → chunk unit → embed → pgvector), bottom = query (plan → SQL aggregation or retrieve+rerank → grounded SSE answer → PF-139 follow-up chips); click a stage to drill in, open in a browser |
| API endpoints reference | [architecture/API-endpoints.md](architecture/API-endpoints.md) | All REST endpoints with curl examples |
| Backend architecture | [architecture/API-backend.md](architecture/API-backend.md) | .NET Clean Architecture layer details |
| Frontend architecture | [architecture/Front-End.md](architecture/Front-End.md) | React component structure, routing, state |
| Supabase migration phases | [architecture/supabase-migration.md](architecture/supabase-migration.md) | 6-phase migration plan, PF-S series tasks |

---

## "How do bank parsers and extraction work?"

| Topic | File | What it covers |
|-------|------|----------------|
| Bank profile YAML reference | [features/cashflow-ingestion.md#bank-profiles](features/cashflow-ingestion.md#bank-profiles) | Actual registered bank signatures/parsers; YAML profiles remain planned |
| Validation pipeline + master schema | [features/cashflow-ingestion.md#validation-pipeline](features/cashflow-ingestion.md#validation-pipeline) | Pipeline implementation, actual upload call sites and TransactionDto contract |
| Cold start categorization problem | [ideas/cold-start-problem.md](ideas/cold-start-problem.md) | Why preset seed exists, 4-layer fallback design |
| Categorization pipeline detail | [architecture/categorization-pipeline.md](architecture/categorization-pipeline.md) | History → rules → presets; separate batch/residual path and Jev guard |
| LLM endpoint testing notes | [../services/ai-service/docs/LLM-endpoint-test.md](../services/ai-service/docs/LLM-endpoint-test.md) | Ad hoc test results for LLM extraction endpoints |

---

## "Why was X decided?" (Architecture Decision Records)

| Decision | File | Summary |
|----------|------|---------|
| Why Supabase over self-hosted Postgres | [adr/pivoting-supabase.md](adr/pivoting-supabase.md) | Platform vs infrastructure tradeoff |
| Supabase implementation approach | [adr/supabase-implementation.md](adr/supabase-implementation.md) | SDK choice, migration strategy |
| Supabase ID type change | [adr/pivoting-supabase-id.md](adr/pivoting-supabase-id.md) | UUID vs bigint decision |

---

## "What's the current project state?"

| Topic | File | What it covers |
|-------|------|----------------|
| Current phase + active tasks | [STATUS.md](STATUS.md) | What's working, what's next, known tech debt — updated each sprint |
| Sprint implementation map | [sprint-plan.md](sprint-plan.md) | Original sprint scope mapped to current code and pending checks |
| Documentation audit | [codex/documentation-status-audit.md](codex/documentation-status-audit.md) | Evidence, corrected drift and verification limits |
| Sprint progress log | [mentor/progress.md](mentor/progress.md) | Day-by-day AI learning path progress |

---

## "How do I set up the project locally?"

| Topic | File | What it covers |
|-------|------|----------------|
| Full setup guide | [SETUP.md](SETUP.md) | Docker, Supabase CLI, env vars, first-run checklist |

---

## "Is the finance itself correct?"

| Topic | File | What it covers |
|-------|------|----------------|
| **Manual — how to use the finance skills** | [reference/finance-domain/README.md](reference/finance-domain/README.md) | Which skill for which question, where each sits in the workflow, when it's mandatory, worked examples |
| Finance invariants (always loaded) | [../.claude/rules/finance-domain.md](../.claude/rules/finance-domain.md) | FIN-01…FIN-06 — decimal money, no magic thresholds, TWR vs MWR labelling, green-means-checked, advice boundary, perishable tax rates |
| Formula library | [reference/finance-domain/formulas.md](reference/finance-domain/formulas.md) | Health ratios, live journey breakpoints and their provenance, returns, risk, position sizing, allocation, FIRE math |
| Indonesian instrument mechanics | [reference/finance-domain/instruments-id.md](reference/finance-domain/instruments-id.md) | IDX lots/settlement, SBN/ORI/SR/ST, fund cut-offs, crypto venues, P2P, deposits/LPS, FX |
| Investment tax reference | [reference/finance-domain/tax-id.md](reference/finance-domain/tax-id.md) | Rate per instrument with regulation citation and verification date — crypto moved to 0.21% on 2026-01-01 |

Domain judgment routes to `/cio` (is the finance sound), `/risk-officer` (limits and sizing), and
`/compliance` (regulatory and tax) — see [../.claude/skills/SKILLS-GUIDE.md](../.claude/skills/SKILLS-GUIDE.md).

---

## "Security and compliance?"

| Topic | File | What it covers |
|-------|------|----------------|
| Pre-open-source security audit | [security-reviews/2026-05-31-pre-opensource-audit.md](security-reviews/2026-05-31-pre-opensource-audit.md) | PII + credentials audit results |

---

## "AI learning path?"

| Topic | File | What it covers |
|-------|------|----------------|
| Learning path overview | [mentor/README.md](mentor/README.md) | 90-day backend → AI Engineering roadmap |
| Progress log | [mentor/progress.md](mentor/progress.md) | Day-by-day entries, chapter completions |
| AI engineering use case map | [mentor/ai-engineering-usecase-map.md](mentor/ai-engineering-usecase-map.md) | What to build, when, why |
| Prompt engineering (topic) | [mentor/what-ai-engineering-build/prompt-engineering.md](mentor/what-ai-engineering-build/prompt-engineering.md) | Iteration, testing, versioning — error analysis loop, golden sets + two-tier testing, prompt registries and the templating trap |
| RAG + agents roadmap | [ideas/rag-and-agents-roadmap.md](ideas/rag-and-agents-roadmap.md) | PF-AI003/004 design thinking |
| Loop engineering (interactive) | [mentor/diagram-loop-engineering.html](mentor/diagram-loop-engineering.html) | Node-graph of Addy Osmani's "Loop Engineering": the five primitives + memory, the reference loop, and the three risks; click a group to drill in, open in a browser |
| PF-AI008 — LangGraph advisor sequence | [architecture/sequences/diagram-journey-advisor-sequence.html](architecture/sequences/diagram-journey-advisor-sequence.html) | Implemented graph/tool flow; user acceptance and deferred checks documented separately |

---

## "Feature design specs?"

| Feature | File | Status |
|---------|------|--------|
| Cashflow ingestion — parser, bank profiles, validation pipeline, master schema | [features/cashflow-ingestion.md](features/cashflow-ingestion.md) | Reference doc |
| Cashflow Statement tab | [features/cashflow-statement-tab.md](features/cashflow-statement-tab.md) | Design spec |
| Spending Analysis (PF-108) | [battle-plans/PF-108-spending-analysis-verdict.md](battle-plans/PF-108-spending-analysis-verdict.md) | Verdict — implemented |
| Investment Portfolio (PF-113) | [battle-plans/PF-113-INVESTMENT-Portfolio-builder-thin-MVP.md](battle-plans/PF-113-INVESTMENT-Portfolio-builder-thin-MVP.md) | Thin MVP spec |
| Buckets budgeting | [features/budgeting/README.md](features/budgeting/README.md) | Implemented module plus historical prototype/spec boundaries |
| Jev residual categorization | [../services/ai-service/README.md#residual-transaction-categorization](../services/ai-service/README.md#residual-transaction-categorization) | Opt-in implementation; live evaluation/promotion pending |
| Trading Desk / Macro Lab | [STATUS.md#implemented-product-surface](STATUS.md#implemented-product-surface) | Coded scope and deferred screens/verification |
| Journey quest ideas | [ideas/journey-quest-ideas.md](ideas/journey-quest-ideas.md) | Brainstorm backlog |
| Hybrid AI BYOK plan | [ideas/hybrid-ai-byok-plan.md](ideas/hybrid-ai-byok-plan.md) | Cost strategy design |

---

## "Performance metrics?"

| Topic | File | What it covers |
|-------|------|----------------|
| AI observability metrics | [performances/ai-observability-metrics.md](performances/ai-observability-metrics.md) | Langfuse dashboard targets, token cost tracking |
