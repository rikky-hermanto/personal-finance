# Fable 5 for Personal Finance — Top 5 Ideas

## Context

Claude **Fable 5** (`claude-fable-5`) just launched — the new top intelligence tier
above Opus, 1M context, **$10 in / $50 out per MTok**. That price is ~2× Opus 4.8 and
~20–30× the Gemini 2.5 Flash currently driving extraction. The project's own cost
discipline ([.claude/rules/ai-service.md](.claude/rules/ai-service.md)) already bans
Opus-tier from the extraction pipeline; Fable is more expensive still.

**The governing rule for where Fable fits:** use it only where (a) superior reasoning
*materially* changes the user's outcome, and (b) call volume is low enough that the
price is irrelevant. That excludes extraction / categorization / high-frequency
narratives and points at the **advisory** surfaces — which happen to be the product's
core (the Financial Pyramid), not a feature.

API note: Fable is a drop-in on the existing [AnthropicProvider](services/ai-service/app/providers/anthropic.py)
— swap the model id to `claude-fable-5` and use **adaptive thinking only**. Fable
removes `temperature` / `top_p` / `top_k` (sending them → 400) and rejects an explicit
`thinking: {type:"disabled"}` (omit the param instead). The extraction rule mandating
`temperature=0.0` ([ai-service.md](.claude/rules/ai-service.md)) is exactly why Fable is
wrong for extraction and fine for advisory generation.

## Scorecard (1–5)

| # | Idea | Type | Pain | Reasoning leverage | Foundation fit | Cost sanity | Verdict |
|---|------|------|------|--------------------|----------------|-------------|---------|
| 1 | Fable-powered Journey Advisor | Product | 5 | 5 | 5 (endpoint exists) | 5 (low freq) | **Go — flagship** |
| 2 | Fable-powered Portfolio Review | Product | 4 | 5 | 5 (endpoint exists) | 5 | **Go** |
| 3 | Fable as the `/ask` RAG answer-gen | Product | 4 | 5 | 4 (PF-AI004 planned) | 4 | **Go (roadmap)** |
| 4 | Fable as LLM-as-judge in the eval harness | Productivity | 4 | 5 | 5 (PF-AI002 exists) | 5 (offline/batch) | **Go — cheap win** |
| 5 | Fable in Claude Code for hard solo-dev work | Productivity | 4 | 5 | 5 | 4 | **Go** |

## The Five

### 1. Upgrade the Journey Advisor (`/journey/advise`) to Fable 5 — flagship
The pyramid is the product. Advice quality *is* product quality, and the target user is
"directionally lost," not illiterate — a pure **aspirin**. Fable's 1M context can ingest
the user's entire financial picture (transactions + assets + investments) in one shot and
reason about *correct order* — e.g. "stop maxing investments while carrying 18% debt; fill
L2 first." This is the single place where a smarter model is felt directly. Low frequency
(users check Journey occasionally) → price is a non-issue.
→ [JourneyAdvisorClient.cs](apps/api/src/PersonalFinance.Infrastructure/External/JourneyAdvisorClient.cs),
[journey_advisor.py](services/ai-service/app/services/journey_advisor.py)

### 2. Upgrade Portfolio Review (`/portfolio-review`) to Fable 5
Reasoning over allocation, concentration risk, and the IDX/bonds/crypto/P2P mix — plus
pyramid-aware ordering (defense before growth). Advisory-grade output vs. generic
summary. Same low-volume, high-value profile as #1.
→ [portfolio_reviewer.py](services/ai-service/app/services/portfolio_reviewer.py)

### 3. Make Fable the answer-generation step of the planned `/ask` RAG endpoint (PF-AI004)
RAG Phase 2 is already on the roadmap. Keep retrieval cheap (embeddings + pgvector from
PF-AI003), and use Fable **only for the final synthesis** over retrieved transaction
context. Free-form Q&A over one's own money is the highest-leverage AI surface, and
synthesis quality is exactly what Fable wins on. Watch volume — gate behind a sensible
rate so a chatty user can't run up the bill.

### 4. Use Fable as an LLM-as-judge in the eval harness (PF-AI002) — the cheapest, smartest first move
Before spending on advisory inference, *measure whether Fable's advice is actually
better.* The eval harness already exists ([evals/](services/ai-service/evals/)). Add a
Fable judge to grade advice/extraction quality and to help author ground truth. Offline,
batchable (Batches API = 50% off), so the premium price barely registers — and it
directly serves the 90-day AI-engineering learning track. This is the data that justifies
(or kills) #1–#3.

### 5. Run Fable 5 in Claude Code (xhigh effort) for the hard solo-dev work
You're a solo dev mid-transition. Point Fable's long-horizon agentic strength at the work
that actually benefits: the PF-130 SubmitTransactions ARCH-04 refactor, the RAG Phase 2
build, and multi-file refactors. Keep routine edits on cheaper models; reach for Fable on
the genuinely hard, cross-cutting tasks.

## Where NOT to use Fable (cost discipline)
- **Bank-statement extraction** — Gemini 2.5 Flash already hits 100% row-F1 (PF-AI002).
  Fable is ~20–30× the price for zero accuracy gain. Hard no.
- **Categorization** (4-layer, PF-103) and **per-transaction Variance/Safe-to-Spend
  narratives** — high frequency, low stakes. Keep cheap.

## Recommended sequence
Start with **#4 (eval judge)** to get a quality baseline, then ship **#1 (advisor)** as
the flagship once the eval shows a real lift. #2 and #3 follow the same provider pattern.

**Next step:** `/pm-brainstorm analyze fable-advisor` for a full go/no-go on #1, or
`/plan fable-eval-judge` to spec #4.
