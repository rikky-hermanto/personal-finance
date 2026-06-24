# Blog Series — Backend → AI Engineer in 90 Days

**Series name:** *Backend → AI Engineer in 90 Days*
**Platform:** Hashnode (canonical) + dev.to (cross-post, `canonical_url` pointing to Hashnode)
**Goal:** Land an AI engineering role — every post is a proof-of-skill artifact for recruiters and hiring managers.
**Voice:** Honest, metric-driven, no hype. Real numbers, real wrong turns. Senior, not hyped.
**Signature:** Every Python snippet gets a C# equivalent — the unique C#→Python translator lens.

---

## Status Board

### 🔜 Backlog

| # | Working Title | Archetype | Source | Notes |
|---|---------------|-----------|--------|-------|
| 1 | *I'm a C# engineer becoming an AI engineer in 90 days. Here's the method.* | Short Take → Deep | `docs/mentor/ai-engineer-learning-tips.md` | Origin/manifesto. Ladder method + C# lens. Every future post links here. |
| 2 | *What "monitor your LLM in production" actually means* | Build Log | `.claude/plans/learning/PF-AI001-ai-observability.md` | Langfuse, OTel-vs-Langfuse boundary, real cost/latency numbers. |
| 3 | *My RAG eval read 0.00 and I almost blamed the wrong thing* | Build Log | `.claude/plans/learning/PF-AI003-rag-embeddings-retrieval.md` | Best narrative in the log — eval ground truth saga, MRR@5=0.476 baseline. |
| 4 | *Embeddings for people who own the database* | Concept Ladder | `.claude/plans/learning/PF-AI003-rag-embeddings-retrieval.md` | Terse bank codes → enrich text → pgvector → ivfflat. C# parallels throughout. |
| 5 | *Re-ranking: when your retriever is confidently wrong* | Concept Ladder | `.claude/plans/learning/PF-AI004-rag-reranking-generation.md` | Bi-encoder vs cross-encoder; FlashRank; English-bias on Bahasa queries finding. |
| 6 | *Citation guards: stopping the LLM from citing rows it never saw* | Build Log | `.claude/plans/learning/PF-AI004-rag-reranking-generation.md` | Grounded generation + hallucination guard. |
| 7 | *The gate, not the loop, is the design* | Short Take → Deep | `docs/architecture/closed-loop-ai-engineering.md` | Flagship #2. Eval-gated self-correcting loops. Systems-level seniority signal. |
| 8+ | Live journey posts | any | PF-AI005 streaming, PF-AI007/008 agents, PF-AI009 MCP | Document as shipped — keeps series current through Phases 2–3. |

### ✏️ Drafting

| # | Working Title | Draft File | Started |
|---|---------------|------------|---------|
| 0 | *The bug my unit tests couldn't catch — so I built an LLM eval harness* | `2026-06-24-eval-harness.md` | 2026-06-24 |

### ✅ Published

| # | Title | Hashnode URL | dev.to URL | Published |
|---|-------|-------------|------------|-----------|
| — | — | — | — | — |

---

## Weekly Workflow

1. **Source** — pick the next row from Backlog; open its `progress.md` entry and PF-AI plan.
2. **Draft** — fill the matching archetype in `_template.md`. Keep every Python snippet's C# parallel.
3. **🔒 Scrub** — run the privacy checklist (below) before saving the draft.
4. **Polish** — one self-edit pass (`/tech-write` for structure/voice).
5. **Publish** — Hashnode first (canonical) → dev.to (`canonical_url` = Hashnode URL) → one LinkedIn/X distribution snippet.
6. **Close** — paste the published URLs into the Published table; log in `docs/mentor/progress.md`; move row to Published.

---

## 🔒 Privacy / Scrub Checklist

**Every draft must pass this before publishing:**

- [ ] No target-company names or role IDs — strip from any progress log quotes; speak in archetypes ("async-first observability companies")
- [ ] No real personal financial data — use anonymized fixtures from `services/ai-service/evals/fixtures/`, never real transactions
- [ ] No secrets or API keys in code snippets
- [ ] No private plan details quoted verbatim
- [ ] All linked GitHub code points to public-safe files only

---

## Positioning (paste into bio)

> **Rikky — Senior Backend Engineer (.NET/C#) pivoting to AI Engineering.** Documenting the 90-day transition by shipping every concept as a real feature — no toy scripts. This series covers AI observability, LLM evaluation, RAG pipelines, agents, and MCP. Everything measured with real numbers.

---

## Post Archetypes

See `_template.md` for the full skeletons.

| Archetype | Shape | Target Length |
|-----------|-------|--------------|
| **Build Log / Deep-Dive** | Shipped milestone → the wall → the fix → the metric | 1200–1800w |
| **Concept Ladder** | Naive → wall → fix, C# parallel at each rung | 1000–1500w |
| **Short Take** | One sharp, quotable insight | 500–800w |

---

## Hiring-Goal Checklist (every post)

Every published post must have:
- [ ] Opening hook that names a concrete, professional problem (not "I learned X today")
- [ ] At least one real metric, benchmark, or code output (no vague claims)
- [ ] C# equivalent for every Python snippet
- [ ] "What this shows I can do" closing line (1–2 sentences, implicitly for hiring managers)
- [ ] Link to the series ("*This is part of my series: Backend → AI Engineer in 90 Days*")
- [ ] Link to the GitHub repo (proof the code is real)
- [ ] Tags: `#ai`, `#python`, `#machinelearning`, `#career` + topic-specific tags
