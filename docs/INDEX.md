# Docs Index — Personal Finance

> **Layout reorganized:** 2026-11-10. Current implementation is recorded in [STATUS.md](STATUS.md); designs, ADRs, historical evaluations and teaching diagrams retain their original scope.
> Topic-oriented map of all docs. Use this when you need to find where something is documented.
> Organized by "what question are you trying to answer?" below; the folder map right here shows where each kind of document lives.

## Folder map

The rule: `plans/` holds only tickets (things with a status). Anything still read after its ticket closes lives in `docs/`, and the plan links to it.

| Folder | What belongs there |
|--------|--------------------|
| `architecture/` | How the system works now: API, frontend, C4, ADRs (`adr/`), AI feature diagrams (`ai/`), sequence diagrams (`sequences/`) |
| `features/` | Specs of features that are built or being built, including the Quest Engine v1 design |
| `references/` | Stable lookups: `finance-domain/` (formulas, instruments, tax, **scoring rubric**), best practices, accepted risks, governance, seed data |
| `operations/` | Running and protecting the system: `runbooks/`, AI threat model, AI observability metrics |
| `ideas/` | Raw and unbuilt: ideas, prototypes, screenshots, blogs, PM brainstorms (`brainstorms/`) |
| `records/` | Dated documents that no longer change: battle plans and verdicts, code reviews, security audits, the original sprint plan and project context, one-off specs |
| `mentor/` | The whole AI-engineering learning track: progress, topic docs, quizzes, shared glossary, diagrams, evidence. Its README has the chapter map linking every plan, versi belajar, quiz and diagram |
| `codex/` | Codex and Jev tooling setup (kept apart because skills write reviews and ADR drafts there) |
| `statement-examples/` | Sample bank statements used by the parser scripts |

Learning plans (PF-AIxxx) stay in `plans/<status>/learning/`, and each Indonesian `-id` versi belajar stays beside the plan it translates.

---

## "How does the system work?"

| Topic | File | What it covers |
|-------|------|----------------|
| Architecture overview + event flow | [architecture/architecture-diagram.md](architecture/architecture-diagram.md) | Current service relationships, synchronous upload, chat/agent paths and planned webhook boundaries |
| System design — whole platform (interactive) | [architecture/diagram-system-design.html](architecture/diagram-system-design.html) | Interview-style high-level design on one canvas: React app, .NET API (parsers, Journey scoring), FastAPI AI service, LLM providers, Supabase (Auth, Postgres, Realtime, Storage) and observability, with labelled sync/async/planned edges; open in a browser |
| Recommended coding workflow (interactive) | [architecture/diagram-recommended-workflow.html](architecture/diagram-recommended-workflow.html) | How to run coding work with current Claude models: size the task, take the lightest safe route, check during the build, review independently, then sign off. Cards show what is already in the setup and what is a recommended change; open in a browser |
| C4 Container diagram | [architecture/c4-container-diagram.md](architecture/c4-container-diagram.md) | Component relationships at container level |
| AI system — target architecture (interactive) | [architecture/ai/diagram-ai-system-target.html](architecture/ai/diagram-ai-system-target.html) | Node-graph of the AI Learning Track (PF-AI001–PF-AI009): live vs. in-progress vs. planned, open in a browser |
| PF-AI006 — advanced RAG patterns | [mentor/topics/advanced-rag-notes.md](mentor/topics/advanced-rag-notes.md) | Measured hybrid comparison; sentence-window/auto-merging deferred |
| Query pipeline — one question end-to-end (interactive) | [architecture/ai/diagram-query-pipeline-listrik.html](architecture/ai/diagram-query-pipeline-listrik.html) | Worked trace of “berapa tagihan listrikku di bulan April 2025?” through /ask: plan → route (aggregate vs lookup) → SQL SUM or vector retrieve+rerank (vector is the coded default) → narrate → answer; click a stage to drill in, open in a browser |
| AI feature — statement ingestion (interactive) | [architecture/ai/diagram-ai-statement-ingestion.html](architecture/ai/diagram-ai-statement-ingestion.html) | Bank statement file → transactions: upload wizard → bank identifier → direct parsers vs LLM extraction → validation pipeline → Supabase; click a stage to drill in, open in a browser |
| AI feature — transaction categorization (interactive) | [architecture/ai/diagram-ai-categorization.html](architecture/ai/diagram-ai-categorization.html) | The four layers (history cache → rules → presets → LLM fallback) plus the experimental ReAct agent (PF-AI007); click a stage to drill in, open in a browser |
| AI feature — portfolio review (interactive) | [architecture/ai/diagram-ai-portfolio-review.html](architecture/ai/diagram-ai-portfolio-review.html) | Investment holdings → CQRS command → typed client → 7-section forced-schema review → persisted snapshot; click a stage to drill in, open in a browser |
| AI feature — journey advisor (interactive) | [architecture/ai/diagram-ai-journey-advisor.html](architecture/ai/diagram-ai-journey-advisor.html) | Pyramid scores → weakest indicators → three generated quests, with the deterministic fallback when the LLM fails; click a stage to drill in, open in a browser |
| AI feature — chat / grounded Q&A (interactive) | [architecture/ai/diagram-ai-chat-rag.html](architecture/ai/diagram-ai-chat-rag.html) | Two lanes over one database: top = indexing (submit → chunk unit → embed → pgvector), bottom = query (plan → SQL aggregation or retrieve+rerank → grounded SSE answer → PF-139 follow-up chips); click a stage to drill in, open in a browser |
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
| Why Supabase over self-hosted Postgres | [architecture/adr/pivoting-supabase.md](architecture/adr/pivoting-supabase.md) | Platform vs infrastructure tradeoff |
| Supabase implementation approach | [architecture/adr/supabase-implementation.md](architecture/adr/supabase-implementation.md) | SDK choice, migration strategy |
| Supabase ID type change | [architecture/adr/pivoting-supabase-id.md](architecture/adr/pivoting-supabase-id.md) | UUID vs bigint decision |
| Free LLM API tiers | [architecture/adr/free-llm-api-tiers.md](architecture/adr/free-llm-api-tiers.md) | Which free provider tiers the AI service can rely on |
| Deployment strategy (battle plan verdict) | [records/battle-plans/PF-105-deployment-strategy-verdict.md](records/battle-plans/PF-105-deployment-strategy-verdict.md) | Two competing proposals and the synthesis |
| Categorization engine (battle plan) | [records/battle-plans/PF-103-categorization-planAvsplanB.md](records/battle-plans/PF-103-categorization-planAvsplanB.md) | Plan A vs Plan B for the 4-layer engine |
| Assets management (battle plan) | [records/battle-plans/PF-107-assets-management-verdict.md](records/battle-plans/PF-107-assets-management-verdict.md) | Team A vs Team B verdict |

---

## "What's the current project state?"

| Topic | File | What it covers |
|-------|------|----------------|
| Current phase + active tasks | [STATUS.md](STATUS.md) | What's working, what's next, known tech debt — updated each sprint |
| Sprint implementation map | [records/sprint-plan.md](records/sprint-plan.md) | Original sprint scope mapped to current code and pending checks |
| Documentation audit | [documentation-status-audit.md](../_archive/2026-10-13/docs/codex/documentation-status-audit.md) | Archived 2026-10-13 — evidence, corrected drift and verification limits |
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
| **Manual — how to use the finance skills** | [reference/finance-domain/README.md](references/finance-domain/README.md) | Which skill for which question, where each sits in the workflow, when it's mandatory, worked examples |
| Finance invariants (always loaded) | [../.claude/rules/finance-domain.md](../.claude/rules/finance-domain.md) | FIN-01…FIN-06 — decimal money, no magic thresholds, TWR vs MWR labelling, green-means-checked, advice boundary, perishable tax rates |
| Formula library | [reference/finance-domain/formulas.md](references/finance-domain/formulas.md) | Health ratios, live journey breakpoints and their provenance, returns, risk, position sizing, allocation, FIRE math |
| Financial Pyramid scoring rubric | [reference/finance-domain/scoring-rubric.md](references/finance-domain/scoring-rubric.md) | Source of truth for tier indicators, breakpoints and the Cleared/Mastered thresholds (moved here from `ideas/`) |
| Indonesian instrument mechanics | [reference/finance-domain/instruments-id.md](references/finance-domain/instruments-id.md) | IDX lots/settlement, SBN/ORI/SR/ST, fund cut-offs, crypto venues, P2P, deposits/LPS, FX |
| Investment tax reference | [reference/finance-domain/tax-id.md](references/finance-domain/tax-id.md) | Rate per instrument with regulation citation and verification date — crypto moved to 0.21% on 2026-01-01 |

Domain judgment routes to `/cio` (is the finance sound), `/risk-officer` (limits and sizing), and
`/compliance` (regulatory and tax) — see [../ai/MAP.md](../ai/MAP.md).

---

## "Security and compliance?"

| Topic | File | What it covers |
|-------|------|----------------|
| Pre-open-source security audit | [records/security-reviews/2026-05-31-pre-opensource-audit.md](records/security-reviews/2026-05-31-pre-opensource-audit.md) | PII + credentials audit results |
| AI threat model | [operations/ai-threat-model.md](operations/ai-threat-model.md) | Prompt injection, data exposure and governance risks for the AI paths |
| Accepted risks | [reference/accepted-risks.md](references/accepted-risks.md) | Risks knowingly left open and why |
| Cashflow pilot runbook | [operations/runbooks/pf-s08-cashflow-pilot.md](operations/runbooks/pf-s08-cashflow-pilot.md) | Turning on auth, AI chat and agents for the owner account |
| Loop engineering runbook | [operations/runbooks/loop-engineering.md](operations/runbooks/loop-engineering.md) | Running the epic → plan → execute → verify loop |
| BankIdentifier code reviews | [records/code-reviews/BankIdentifier-review.md](records/code-reviews/BankIdentifier-review.md) | Review and design-pattern notes behind PF-124 |
| Full-stack architecture baseline | [records/archreview-20260610-full-stack-baseline.md](records/archreview-20260610-full-stack-baseline.md) | The 2026-06-10 architecture review |
| Original project context | [records/PROJECT_CONTEXT.md](records/PROJECT_CONTEXT.md) | March 2026 problem statement and proposal (historical) |

---

## "AI learning path?"

| Topic | File | What it covers |
|-------|------|----------------|
| Learning path overview | [mentor/README.md](mentor/README.md) | 90-day backend → AI Engineering roadmap |
| Progress log | [mentor/progress.md](mentor/progress.md) | Day-by-day entries, chapter completions |
| Chapter map (plan · versi belajar · quiz · diagram) | [mentor/README.md#chapter-map](mentor/README.md#chapter-map) | One row per PF-AIxxx plan, linking everything that belongs to it |
| AI engineering use case map | [mentor/ai-engineering-usecase-map.md](mentor/ai-engineering-usecase-map.md) | What to build, when, why |
| Prompt engineering (topic) | [mentor/topics/03-prompt-engineering.md](mentor/topics/03-prompt-engineering.md) | Iteration, testing, versioning — error analysis loop, golden sets + two-tier testing, prompt registries and the templating trap |
| RAG + agents roadmap | [ideas/rag-and-agents-roadmap.md](ideas/rag-and-agents-roadmap.md) | PF-AI003/004 design thinking |
| Loop engineering (interactive) | [mentor/resources/diagram-loop-engineering.html](mentor/resources/diagram-loop-engineering.html) | Node-graph of Addy Osmani's "Loop Engineering": the five primitives + memory, the reference loop, and the three risks; click a group to drill in, open in a browser |
| PF-AI008 — LangGraph advisor sequence | [architecture/sequences/diagram-journey-advisor-sequence.html](architecture/sequences/diagram-journey-advisor-sequence.html) | Implemented graph/tool flow; user acceptance and deferred checks documented separately |
| PF-AI011 — AI security use-case sequences | [architecture/sequences/diagram-ai-security-governance-sequence.html](architecture/sequences/diagram-ai-security-governance-sequence.html) | Design for PF-AI011 (merged 2026-10-21): six sequences — direct injection, indirect via transfer memo, output guard, PII masking, red-team eval, secrets check |

---

## "Feature design specs?"

| Feature | File | Status |
|---------|------|--------|
| Cashflow ingestion — parser, bank profiles, validation pipeline, master schema | [features/cashflow-ingestion.md](features/cashflow-ingestion.md) | Reference doc |
| Cashflow Statement tab | [features/cashflow-statement-tab.md](features/cashflow-statement-tab.md) | Design spec |
| Spending Analysis (PF-108) | [records/battle-plans/PF-108-spending-analysis-verdict.md](records/battle-plans/PF-108-spending-analysis-verdict.md) | Verdict — implemented |
| Investment Portfolio (PF-113) | [records/battle-plans/PF-113-INVESTMENT-Portfolio-builder-thin-MVP.md](records/battle-plans/PF-113-INVESTMENT-Portfolio-builder-thin-MVP.md) | Thin MVP spec |
| Buckets budgeting | [features/budgeting/README.md](features/budgeting/README.md) | Implemented module plus historical prototype/spec boundaries |
| Jev residual categorization | [../services/ai-service/README.md#residual-transaction-categorization](../services/ai-service/README.md#residual-transaction-categorization) | Opt-in implementation; live evaluation/promotion pending |
| Trading Desk / Macro Lab | [STATUS.md#implemented-product-surface](STATUS.md#implemented-product-surface) | Coded scope and deferred screens/verification |
| Cash reconciliation (ATM breakdown) | [ideas/brainstorms/pm-cash-reconciliation-analysis.md](ideas/brainstorms/pm-cash-reconciliation-analysis.md) · [prerequisites graph (interactive)](ideas/brainstorms/diagram-cash-reconciliation-prerequisites.html) | No-Go for now (2026-10-24); prerequisites mapped, open the graph in a browser |
| Journey quests, level by level | [ideas/brainstorms/pm-journey-quests-analysis.md](ideas/brainstorms/pm-journey-quests-analysis.md) · [new-user journey (interactive)](ideas/brainstorms/diagram-journey-quests-new-user.html) · [Quest Engine v1 design](features/quest-engine-v1-design.md) · [engine HLD (interactive)](features/diagram-quest-engine-v1.html) | Go, phased (2026-10-25), CIO guardrails; the diagram walks a new user from day 1 through the monthly loop to a level boss, open it in a browser |
| Journey quest ideas | [ideas/journey-quest-ideas.md](ideas/journey-quest-ideas.md) | Brainstorm backlog (raw pool; superseded as a design source by the analysis above) |
| Quest Engine v1 design | [features/quest-engine-v1-design.md](features/quest-engine-v1-design.md) · [diagram (interactive)](features/diagram-quest-engine-v1.html) | Implemented in PF-152 |
| Hybrid AI BYOK plan | [ideas/hybrid-ai-byok-plan.md](ideas/hybrid-ai-byok-plan.md) | Cost strategy design |

---

## "Performance metrics?"

| Topic | File | What it covers |
|-------|------|----------------|
| AI observability metrics | [operations/ai-observability-metrics.md](operations/ai-observability-metrics.md) | Langfuse dashboard targets, token cost tracking |
