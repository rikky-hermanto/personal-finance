# Internet Presence — Public Blog for the AI Engineering Pivot

## Context

You're 21 days into a documented **90-day backend → AI engineering pivot** (Day 0 = 2026-05-27, target ~2026-08-25), aiming for AI eng roles at async-first companies. You want to build an internet presence by blogging the process — but you don't need to *create* content, you need to *publish* what you've already written. The journey is logged in unusual depth: a day-by-day diary with "interview-ready answer" blocks, four shipped+measured AI milestones, a signature framework, and a teaching method. The work here is **editorial extraction + a sustainable publishing system**, not writing from a blank page. Blogging is also already milestone **Chapter 10 ("Public Presence")** in your own plan, so this closes a loop you set yourself.

**Decisions locked (your answers):**
- **Goal:** Land an AI engineering role — posts are proof-of-skill artifacts for recruiters/hiring managers.
- **Platform:** dev.to / Hashnode only.
- **Language:** English only.
- **Cadence:** Ship one flagship to validate format/voice, then ~1 post/week.

**Outcome:** A live blog series that doubles as a portfolio, a reusable weekly workflow so it survives the learning schedule, and a privacy gate so nothing private ships.

---

## Your positioning (the ownable angle)

> **A 10-year C#/.NET engineer becoming an AI engineer by shipping AI into one real production app — not toy scripts — documented honestly with real metrics.**

Three differentiators almost nobody else has:
1. **The C#→Python translator seat.** Most AI-pivot content is written by Python natives. You translate every new idiom onto a pattern you already own — a genuinely rare lens. (Your learning plans already pair every Python snippet with a C# equivalent.)
2. **Learn-by-shipping-into-production.** Every concept ships as a real feature in [the Personal Finance Platform](README.md), same day. No toy notebooks.
3. **Honest, metric-driven voice.** Failures logged as openly as wins. Real numbers, real retros, real wrong-turns. This reads as senior, not as hype.

---

## Platform setup

**Hashnode as canonical home + dev.to as cross-post mirror.**
- Publish the canonical post on **Hashnode** (free custom subdomain, owns SEO, reads like a portfolio blog), then cross-post to **dev.to** with `canonical_url` pointing back to Hashnode — you get dev.to's built-in technical audience without splitting SEO. (If you'd rather lead with dev.to's bigger feed, just flip which URL is canonical — the post mix doesn't change.)
- Create a **Series** on both platforms — e.g. *"Backend → AI Engineer in 90 Days"* — so posts link into one coherent arc.
- **Bio optimized for hiring:** one-line positioning (above) + link to the GitHub repo + link to the series. This is what a hiring manager reads first.

---

## Three repeatable post archetypes

So each week is fast (fill a template, don't invent structure):

| Archetype | Shape | Length | Source |
|-----------|-------|--------|--------|
| **Build Log / Deep-Dive** | Milestone shipped → the wall I hit → the fix → the metric | 1200–1800w | a [progress.md](docs/mentor/progress.md) session + its PF-AI plan |
| **Concept Ladder** | Teach one concept "earn the jargon" style (naive → wall → fix), with the C# parallel | 1000–1500w | a ladder from a `.claude/plans/learning/` plan |
| **Short Take** | One sharp, quotable insight | 500–800w | a retro / "interview-ready answer" block |

A reusable template with these three skeletons lives at `docs/ideas/blogs/_template.md` (to be created).

---

## Editorial calendar — first 8 posts

Posts 0–6 are mined from **already-shipped** work (real runway, low risk); 7+ tracks the live journey.

| # | Working title | Archetype | Source | Why it lands |
|---|---------------|-----------|--------|--------------|
| **0 — Flagship** | *The bug my unit tests couldn't catch — so I built an LLM eval harness* | Build Log | [PF-AI002](.claude/plans/learning/PF-AI002-llm-evaluation-framework.md) | Strongest concrete hook (almost shipped corrupted financial data; a real eval caught the `FlowType.DB` serialization bug mocks missed). Demonstrates senior rigor. Fully done = low risk. Intro frames the series; outro converts readers to it. |
| 1 | *I'm a C# engineer becoming an AI engineer in 90 days. Here's the method.* | Short Take→Deep | [ai-engineer-learning-tips.md](docs/mentor/ai-engineer-learning-tips.md) | The origin/manifesto. Establishes the brand, the ladder method, the C# lens. The post every future post links back to. |
| 2 | *What "monitor your LLM in production" actually means* | Build Log | [PF-AI001](.claude/plans/learning/PF-AI001-ai-observability.md) | Langfuse, OTel-vs-Langfuse boundary, real cost/latency numbers. The first question every AI eng interview asks. |
| 3 | *My RAG eval read 0.00 and I almost blamed the wrong thing* | Build Log | [PF-AI003](.claude/plans/learning/PF-AI003-rag-embeddings-retrieval.md) | The best narrative in the whole log — an eval is only as good as its ground truth; the set-based-relevance redesign; honest MRR@5=0.476 baseline. |
| 4 | *Embeddings for people who own the database* | Concept Ladder | [PF-AI003](.claude/plans/learning/PF-AI003-rag-embeddings-retrieval.md) | The embeddings ladder (terse bank codes carry no signal → enrich text → pgvector brute-force → ivfflat), C# parallels throughout. |
| 5 | *Re-ranking: when your retriever is confidently wrong* | Concept Ladder | [PF-AI004](.claude/plans/learning/PF-AI004-rag-reranking-generation.md) | Bi-encoder vs cross-encoder; FlashRank; the real finding that English-bias ranked "cattle feed" above "food delivery" on a Bahasa query. |
| 6 | *Citation guards: stopping the LLM from citing rows it never saw* | Build Log | [PF-AI004](.claude/plans/learning/PF-AI004-rag-reranking-generation.md) | Grounded generation + the hallucination guard that drops cited IDs not in context. Practical, defensible. |
| **7 — Flagship #2** | *The gate, not the loop, is the design* | Short Take→Deep | [closed-loop-ai-engineering.md](docs/architecture/closed-loop-ai-engineering.md) | Your most ownable thought-leadership idea — eval-gated self-correcting loops, the extraction⇄balance-reconciliation example. Signals systems-level seniority. |
| 8+ | Live journey | any | PF-AI005 streaming, PF-AI007/008 agents, PF-AI009 MCP | Document as you ship — keeps the series current through Phases 2–3. |

**Order rationale:** Lead with depth, not a manifesto — cold dev.to/Hashnode readers arrive via tags (`#ai`, `#rag`, `#python`), so post #0 must teach something before it earns the click; its outro then converts them to the series and the origin post (#1).

---

## The weekly workflow (the system that makes it sustainable)

1. **Source** — pick the week's [progress.md](docs/mentor/progress.md) entry / PF-AI plan.
2. **Draft** — fill the matching archetype in `docs/ideas/blogs/_template.md`. Keep every Python snippet's C# parallel — that's the signature.
3. **🔒 Scrub gate (required — see below).**
4. **Polish** — one self-edit pass (invoke the `tech-write` skill for structure/voice).
5. **Publish** — Hashnode (canonical) → dev.to (`canonical_url`) → one LinkedIn/X distribution snippet.
6. **Close the loop** — paste the published URL back into [progress.md](docs/mentor/progress.md) and the calendar; tick Chapter 10 when the flagship is live.

---

## 🔒 Privacy / scrub checklist (do not skip)

The source docs contain private material — every draft must pass this before publishing:
- **No target-company names or role IDs** — [progress.md](docs/mentor/progress.md) names specific companies from your live pipeline. Strip them; speak in archetypes ("async-first observability companies").
- **No real personal financial data** — use the anonymized fixtures in [services/ai-service/evals/fixtures/](services/ai-service/evals/fixtures/), never real transactions.
- **No secrets/keys** — run the `commit` skill's secret scan instinct over any code snippet you paste.
- **Repo-safe** — assume the post is public forever; don't quote private plan details verbatim.

---

## Where it lives in the repo

The `docs/ideas/blogs/` folder is already scaffolded but empty — that's the home.

| Path | Purpose |
|------|---------|
| `docs/ideas/blogs/README.md` | Editorial calendar + status board (Backlog / Drafting / Published + URL) |
| `docs/ideas/blogs/_template.md` | The 3 archetype skeletons |
| `docs/ideas/blogs/YYYY-MM-DD-<slug>.md` | One markdown file per post draft |

---

## What execution looks like (after you approve)

1. Create `docs/ideas/blogs/README.md` (calendar + status board) and `_template.md` (3 archetypes).
2. Draft **Post #0 (the flagship)** end-to-end from PF-AI002 — full markdown, scrubbed, with C# parallels and the real metrics.
3. You set up the Hashnode blog + dev.to account + the Series, paste the flagship, set `canonical_url`, and fill the hiring-optimized bio. (Account creation is yours — I can't make accounts; I produce the publish-ready content + a step-by-step setup checklist.)
4. From then on, run the **weekly workflow** — I draft from the next calendar row each week, you publish.

---

## Verification (how we know it worked)

- `docs/ideas/blogs/README.md` exists with the 8-post calendar and a status board.
- `docs/ideas/blogs/_template.md` exists with the 3 archetypes.
- Flagship draft (`docs/ideas/blogs/<date>-eval-harness.md`) is complete, **passes the scrub checklist**, and includes real metrics + C# parallels.
- A setup checklist lets you publish to Hashnode + dev.to with a working `canonical_url` and an "AI Engineering Pivot" series.
- Once live: the flagship URL is logged back in [progress.md](docs/mentor/progress.md) and Chapter 10 is ticked.
- Hiring-goal check: every post ends with a "what this proves I can do" line + the GitHub repo link; the bio links the series.
