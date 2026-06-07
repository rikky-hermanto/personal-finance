# Docs Index — Personal Finance

> Topic-oriented map of all docs. Use this when you need to find where something is documented.
> Organized by "what question are you trying to answer?" not by folder structure.

---

## "How does the system work?"

| Topic | File | What it covers |
|-------|------|----------------|
| Architecture overview + event flow | [architecture/architecture-diagram.md](architecture/architecture-diagram.md) | Full system diagram, upload→AI→DB event pipeline |
| C4 Container diagram | [architecture/c4-container-diagram.md](architecture/c4-container-diagram.md) | Component relationships at container level |
| API endpoints reference | [architecture/API-endpoints.md](architecture/API-endpoints.md) | All REST endpoints with curl examples |
| Backend architecture | [architecture/API-backend.md](architecture/API-backend.md) | .NET Clean Architecture layer details |
| Frontend architecture | [architecture/Front-End.md](architecture/Front-End.md) | React component structure, routing, state |
| Supabase migration phases | [architecture/supabase-migration.md](architecture/supabase-migration.md) | 6-phase migration plan, PF-S series tasks |

---

## "How do bank parsers and extraction work?"

| Topic | File | What it covers |
|-------|------|----------------|
| Bank profile YAML reference | [design/bank-profiles-reference.md](design/bank-profiles-reference.md) | YAML schema for each bank, parser routing |
| Validation pipeline + master schema | [design/validation-pipeline.md](design/validation-pipeline.md) | 5-stage pipeline, TransactionDto field spec |
| Cold start categorization problem | [design/cold-start-problem.md](design/cold-start-problem.md) | Why preset seed exists, 4-layer fallback design |
| Categorization pipeline detail | [design/categorization-pipeline.md](design/categorization-pipeline.md) | Rule-match → presets → history cache → LLM |
| LLM endpoint testing notes | [design/LLM-endpoint-test.md](design/LLM-endpoint-test.md) | Ad hoc test results for LLM extraction endpoints |

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
| Sprint progress log | [mentor/progress.md](mentor/progress.md) | Day-by-day AI learning path progress |

---

## "How do I set up the project locally?"

| Topic | File | What it covers |
|-------|------|----------------|
| Full setup guide | [SETUP.md](SETUP.md) | Docker, Supabase CLI, env vars, first-run checklist |

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
| RAG + agents roadmap | [ideas/rag-and-agents-roadmap.md](ideas/rag-and-agents-roadmap.md) | PF-AI003/004 design thinking |

---

## "Feature design specs?"

| Feature | File | Status |
|---------|------|--------|
| Cashflow ingestion — parser, bank profiles, validation pipeline, master schema | [features/cashflow-ingestion.md](features/cashflow-ingestion.md) | Reference doc |
| Cashflow Statement tab | [features/cashflow-statement-tab.md](features/cashflow-statement-tab.md) | Design spec |
| Spending Analysis (PF-108) | [design/PF-108-spending-analysis-verdict.md](design/PF-108-spending-analysis-verdict.md) | Verdict — implemented |
| Investment Portfolio (PF-113) | [design/PF-113-INVESTMENT-Portfolio-builder-thin-MVP.md](design/PF-113-INVESTMENT-Portfolio-builder-thin-MVP.md) | Thin MVP spec |
| Journey quest ideas | [ideas/journey-quest-ideas.md](ideas/journey-quest-ideas.md) | Brainstorm backlog |
| Hybrid AI BYOK plan | [design/hybrid-ai-byok-plan.md](design/hybrid-ai-byok-plan.md) | Cost strategy design |

---

## "Performance metrics?"

| Topic | File | What it covers |
|-------|------|----------------|
| AI observability metrics | [performances/ai-observability-metrics.md](performances/ai-observability-metrics.md) | Langfuse dashboard targets, token cost tracking |
