# AI Engineering Use-Case Map — Personal Finance Platform

> **What this doc is:** The companion to [`docs/mentor/ai-engineer-learning-path.md`](../mentor/ai-engineer-learning-path.md).
> The curriculum doc is theory-only — phases, platforms, cadence. This doc answers the other half:
> *for every concept in the curriculum, what feature in the Personal Finance Platform do we build to prove it?*
>
> Every row here maps to a real commit in this repo. No toy scripts. Same-day implementation.
>
> **Progress log:** [`docs/mentor/progress.md`](../mentor/progress.md) — live activity log tracking what's been shipped.
>
> **Filter for every AI feature:** it must either (a) surface an insight the user couldn't compute themselves, or
> (b) reduce a workflow step from manual to automatic. No AI features for their own sake.
>
> **Infrastructure baseline:** pgvector is already in Supabase, FastAPI is live, Gemini + Anthropic SDKs are wired up.
> The AI service today = 8 single-shot LLM endpoints, no retrieval, no streaming, no eval, no Langfuse.
> Everything in Phase 2+ is greenfield build.

---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| ✅ done | Built and committed. Write-up + proof point ready. |
| 🟡 partial | Started or scaffolded; gaps remain. |
| ⚪ idea | Planned, not yet built. Ticket noted if exists. |

---

## Helicopter View — Master Table

The entire 12-week build arc on one page. Columns: which week in the [learning path](../mentor/ai-engineer-learning-path.md) the concept comes from, what we build in this project, where it lives, and what the pivot proof point is.

| Phase | Chapter | Concept (from curriculum) | PF Feature | Kegunaan | Endpoint / Artifact | Pivot Proof Point | Status |
|-------|------|--------------------------|------------|----------|--------------------|--------------------|--------|
| 1 | — | Structured output: tool_use + JSON mode | Multi-provider extraction factory | Ekstrak transaksi bank otomatis dari berbagai format file | `providers/factory.py`, `/parse-pdf` | "Function-calling parity across 2 providers, temp=0, max_tokens hard error" | ✅ |
| 1 | — | Multimodal (vision) inputs | Bank Jago screenshot extraction | Parsing screenshot HP menjadi transaksi terstruktur | `main.py /parse-image` | "Multimodal pipeline handling PNG/WebP input" | ✅ |
| 1 | — | Prompt caching | Cache stable system prompts (Anthropic path) | Hemat biaya API dengan cache bagian prompt yang tidak berubah | `providers/anthropic.py` | "Quantified cache hit-rate + cost/latency drop on repeat extractions" | ⚪ |
| 1 | — | XML-tag prompt structuring | Bank prompts with semantic XML tags | Tingkatkan akurasi ekstraksi via struktur prompt yang eksplisit | `prompts/{bank}_v1.py` | "Prompt engineering rigour; before/after accuracy in eval harness" | ⚪ |
| 2 | 1 | AI-specific observability | Langfuse: cost/call, latency, error rate | Monitor biaya & latensi setiap panggilan LLM secara real-time | All providers + `main.py` | "Extraction costs $X/doc, p95 latency Yms" + dashboard screenshot | ✅ |
| 2 | 1 | Prompt versioning + lifecycle | Langfuse prompt registry for bank prompts | Kelola versi prompt secara terpusat & lacak dampaknya ke akurasi | `prompts/` → Langfuse | "Prompt versions tracked, accuracy trends visible across releases" | ⚪ |
| 2 | 2 | LLM eval harness | 20-fixture extraction benchmark (Gemini vs Sonnet) | Ukur & bandingkan akurasi + biaya antar provider LLM | `evals/eval_extraction.py` | "X% field accuracy; Gemini Y% cheaper on structured extraction workloads" | ✅ |
| 2 | 2 | Categorization eval | 106-rule + LLM-fallback accuracy measurement | Validasi seberapa akurat sistem kategorisasi transaksi end-to-end | `evals/eval_categorization.py` | "Categorizer accuracy measured, not assumed" | ⚪ |
| 2 | 2 | CI eval regression (stretch) | Promptfoo / RAGAS gate in GitHub Actions | Cegah regresi prompt secara otomatis sebelum merge ke production | `.github/workflows/` | "Evals run in CI — prompt regressions caught before merge" | ⚪ |
| 2 | 3 | Text embeddings + vector DBs | Embed txns on insert, store in pgvector | Simpan representasi vektor transaksi sebagai fondasi pencarian semantik | Supabase migration + `TransactionCreatedEvent` | "Built RAG retrieval layer; chose embedding model based on cost/quality trade-off" | ✅ |
| 2 | 3 | Semantic search | Natural-language transaction search | Cari transaksi pakai kalimat biasa ("belanja Maret"), bukan filter manual | `POST /search`, `.NET /api/transactions/search?q=` | "MRR X on 10 handwritten test queries; semantic search > keyword filters" | 🟡 |
| 2 | 3 | Embedding drift guard | `embedding_model_version` column + re-embed job | Cegah korupsi hasil similarity search saat model embedding diupgrade | Supabase migration | "Production-aware: model upgrades don't silently corrupt similarity results" | ✅ |
| 2 | 3 | RAG as self-improving system | Semantic categorization fallback (k-NN over labelled txns) | Kategorisasi otomatis berbasis kemiripan data historis; makin akurat seiring data tumbuh | `services/categorizer.py` | "RAG made a 106-rule engine self-improving without retraining" | ⚪ (PF-118) |
| 2 | 4 | Re-ranking | Cohere/FlashRank reranker on top-10 retrieved | Reorder hasil RAG agar dokumen paling relevan muncul di atas | `POST /ask` reranking step | "Reranking lifted MRR from X to Y — named technique + measured delta" | 🟡 |
| 2 | 4 | Grounded synthesis + citations | "Ask your finances" Q&A with cited answer | Jawab pertanyaan keuangan dengan data transaksi nyata + sitasi sumber | `POST /ask` | "RAG answer with source transactions cited; hallucination rate ~0 on grounded queries" | 🟡 |
| 2 | 4 | Chunking strategies | Sentence-window + fixed-size on advisory text | Pecah teks narasi panjang tanpa kehilangan konteks antar kalimat | `services/chunker.py` | "Named chunking strategies; chose sentence-window for advisory corpus" | 🟡 |
| 2 | 4–5 | Guardrails: PII + output validation | Guardrail layer on `/ask` (PII scrub, advice disclaimer, output validation) | Cegah kebocoran PII & angka tanpa sumber pada jawaban advisor keuangan | `services/guardrails.py`, `POST /ask` | "Financial advisor can't leak PII or emit an unvalidated number — guardrails first-class, not a Phase-4 afterthought" | ⚪ (PF-122) |
| 2 | 5 | SSE streaming | Token-by-token streamed chat UI | Chat AI responsif — jawaban muncul token per token, tidak menunggu selesai | `POST /ask` (streaming) + `/chat` React page | "Streaming from FastAPI → React; no buffering, correct SSE error handling" | ⚪ |
| 2 | 5 | Real-time status (Supabase Realtime) | Replace polling upload status with Realtime | Status proses upload & AI tampil live tanpa polling berulang | Upload wizard + `/status` page | "Eliminated polling; event-driven upload status updates via Realtime" | ⚪ (PF-S12) |
| 2 | 6 | Advanced RAG: hybrid search | pgvector + `tsvector` full-text hybrid retrieval | Gabungkan pencarian vektor + full-text untuk akurasi retrieval lebih tinggi | `/search` hybrid mode | "Hybrid search beat dense-only by X MRR points — measured, not assumed" | ⚪ |
| 2 | 6 | Advanced RAG: sentence-window + auto-merging | LlamaIndex-style chunking on advisory corpus | Eksperimen 3 teknik RAG lanjutan; pilih pemenang berdasarkan data eval | Retrieval pipeline | "Three advanced RAG variants benchmarked; winner chosen by eval data" | 🟡 |
| 2 | 6 / 8 | RAG + agent faithfulness eval | RAGAS faithfulness on `/ask` + tool-call accuracy on agents | Ukur faithfulness jawaban RAG & akurasi tool-call agen, bukan cuma ekstraksi | `evals/eval_faithfulness.py`, `evals/eval_agent.py` | "I eval agents and RAG, not just extraction — faithfulness X, tool-call accuracy Y" | 🟡 |
| 3 | 7 | Tool-calling loops (smolagents) | Transaction Categorizer Agent | Agen TAO loop yang kategorisasi transaksi dengan reasoning trace di Langfuse | `app/agents/categorizer_agent.py` | "TAO loop: 5 test txns categorized with reasoning trace in Langfuse" | ⚪ |
| 3 | 7 | Agent with uncertainty handling | Self-correcting Upload Processing Agent | Pipeline upload yang eksplisit soal ketidakpastian & minta konfirmasi user | `app/agents/upload_agent.py`, `POST /agent/process-upload` | "Agent re-routes on low-confidence identification; no silent failures" | ⚪ (PF-119) |
| 3 | 8 | LangGraph: state + routing + memory | Financial Health Advisor (multi-step) | Saran keuangan multi-langkah berbasis data live user dengan memori sesi | LangGraph graph, tools wired to data layer | "Multi-step agent: analyze → gaps → recommend → drilldown; checkpointer memory; tool-failure fallback" | ⚪ |
| 3 | 8 | Agentic reasoning on core product engine | Journey Quest Agent | Buat quest keuangan yang dihitung dari data transaksi aktual, bukan aturan statis | `app/agents/quest_agent.py` | "Agent quantifies quests from live txn history, not static rules" | ⚪ (PF-121) |
| 3 | 8 | Autonomous (non-reactive) agent | Monthly Financial Review Agent | Laporan keuangan bulanan otomatis: anomali + narasi + 3 action items | Scheduled run (post auth) | "Autonomous month-end report: anomaly detection + narrative + 3 action items" | ⚪ (PF-120, needs PF-S08) |
| 3 | 9 | Model Context Protocol | Personal-finance MCP server | Ekspos data keuangan ke Claude Desktop atau MCP client mana pun | MCP server (Python SDK) | "Claude Desktop / any MCP client can query my finance data live" | ⚪ |
| 3 | 9 | Multi-agent + MCP orchestration | LangGraph agent calling MCP server as a tool | Orkestrasi dua agen via protokol interoperabilitas standar | 2-agent workflow | "Multi-agent orchestration over a standard interop protocol" | ⚪ |

---

## Interview-Ready Minimum (Hero Features)

> **Read this before you schedule anything.** This map is 27 use cases at 3.5 focused hrs/day over 12 weeks. Slippage is expected, not a failure — so decide *now* what "minimum viable interview-ready" means and protect those items first. The market rewards 2–3 deep, well-measured systems over 27 shallow features; this is doubly true for the Staff roles (Grafana #141, Datadog #150).

**The 3 hero features — go deep, measure everything, these carry the interview:**

| # | Hero feature | UCs | Why it's the hero |
|---|--------------|-----|-------------------|
| H1 | **Eval harness with published numbers** | UC-2.3 (+2.4) | Answers the #1 screen question: "how do you know it's correct?" The Gemini-vs-Sonnet cost/accuracy table *is* the artifact. |
| H2 | **`/ask` RAG with *measured* reranking + hybrid lift** | UC-2.6, UC-2.9, UC-2.14 | RAG is the #1 applied skill. The measured MRR delta — not "I added a reranker" — is what separates you. |
| H3 | **MCP server + one LangGraph agent** | UC-3.6, UC-3.3 | Frontier signal. Few candidates have shipped MCP; it's named in Grafana/Datadog/Anthropic JDs. |

**Must-ship floor (if everything else slips, ship at least this chain):**
UC-2.1 (Langfuse) → UC-2.3 (eval) → UC-2.6 (retrieval) → UC-2.9 (grounded `/ask`) → UC-2.15 (guardrails) → UC-3.6 (MCP).
That sequence alone makes you credible for all five target roles. Everything else is depth and differentiation on top.

**Stretch / cut first under time pressure:** UC-1.3, UC-1.4, UC-2.5, UC-2.10, UC-2.13, UC-3.4, UC-3.5, UC-3.7.

---

## Build Sequence Diagram

The order is forced — each row is a prerequisite for the next. This is why the curriculum sequences the way it does.

```
Phase 1 (already done) ─────────────────────────────────────────────────
  tool_use + JSON mode parity  →  multi-provider factory  ✅
  vision inputs                →  /parse-image            ✅
  [polish: prompt caching, XML structuring]               ⚪

Phase 2, Chapter 1 ─────────────────────────────────────────────────────────
  Langfuse tracing             →  quote real numbers in interviews  ✅

Phase 2, Chapter 2 ─────────────────────────────────────────────────────────
  eval harness (fixtures)      →  accuracy + cost benchmark published  ✅
  ↓ feeds
  Phase 2 Chapter 6 (advanced RAG evals), Phase 3 agent evals

Phase 2, Chapters 3–4 ─────────────────────────────────────────────────────
  embeddings + pgvector        →  /search (natural-language txn search)  🟡 MRR@5=0.476 baseline
  ↓
  reranker added               →  /ask  (grounded Q&A with citations)  🟡 built, measured lift pending
  ↓ both reused by
  semantic categorization fallback  (UC-2.7)
  sentence-window / hybrid search   (UC-2.14)
  UC-3.1 smolagents (lookup_similar_transactions tool)
  UC-3.6 MCP (search_transactions_semantic tool)

Phase 2, Chapter 5 ─────────────────────────────────────────────────────────
  SSE streaming                →  /ask streams token-by-token to React /chat
  Supabase Realtime            →  upload status no longer polls

Phase 2, Chapter 6 ─────────────────────────────────────────────────────────
  advanced RAG variants        →  eval harness measures the lift; winner ships

Phase 3, Chapters 7–8 ─────────────────────────────────────────────────────
  smolagents (TAO loop, simple) →  Categorizer Agent + Upload Agent
  ↓
  LangGraph (state machine)    →  Financial Health Advisor + Quest Agent
  ↓
  both logged to Langfuse      →  traces are demo material

Phase 3, Chapter 9 ─────────────────────────────────────────────────────────
  MCP server                   →  wraps data layer + /search retriever
  ↓
  2-agent + MCP workflow        →  LangGraph agent uses MCP as tool (stretch)

Chapters 10–12 ─────────────────────────────────────────────────────────────
  blog post + Loom             →  proof artifacts go public
  cert (Databricks / AI-102)   →  signal booster
  applications                 →  5–10 high-fit roles
```

---

## Ticket Map

| Ticket | Feature | Depends on | UC |
|--------|---------|------------|----|
| PF-S13 | RAG pipeline — embeddings + `/search` | PF-S07 ✅ | UC-2.6, UC-2.7, UC-2.8 |
| PF-118 | Semantic categorization fallback | PF-S13 | UC-2.7 |
| PF-119 | Upload Processing Agent | PF-S08 (auth) | UC-3.2 |
| PF-120 | Monthly Financial Review Agent | PF-S08 (auth) | UC-3.5 |
| PF-121 | Journey Quest Agent | PF-119 | UC-3.4 |

---

## Phase 1 — GenAI Foundations & API Engineering ✅

**Status:** Largely done. These are proof artifacts to write up, not features to build from scratch.

---

### UC-1.1 — Multi-provider structured extraction ✅

**Feature:** Anthropic `tool_use` and Gemini JSON mode behind a unified `ProviderFactory`. Both force structured output with no free-text parsing. Provider swapped via `AI_PROVIDER` env var.

**Pivot proof point:** "I implemented function-calling parity across two providers. Temperature is always 0.0 for extraction. `stop_reason == max_tokens` is treated as a hard error — a truncated extraction is worse than a failure."

**Builds on:** `providers/factory.py`, `providers/anthropic.py`, `providers/gemini.py`, `services/llm_parser.py`, `config.py`.

**Status:** ✅ done — document in case study, add benchmark numbers from Chapter 2 eval.

---

### UC-1.2 — Vision (multimodal) extraction ✅

**Feature:** Bank Jago screenshots sent directly to Claude vision (`/parse-image`). No text layer to extract — image sent as base64 to the LLM vision API.

**Pivot proof point:** "Multimodal input handling — text path vs. vision path, with the architectural reason each bank uses which."

**Builds on:** `main.py` `/parse-image`, `providers/anthropic.py`.

**Status:** ✅ done — document the vision-vs-PyMuPDF routing decision in the blog post.

---

### UC-1.3 — Anthropic prompt caching ⚪

**Feature:** Mark the stable part of the Anthropic extraction prompt (system message + few-shot bank examples) as cacheable using the `cache_control` beta parameter. On repeat extraction calls with the same bank, the cached prefix is served from Anthropic's KV cache.

**Pivot proof point:** Quantified cache hit-rate + before/after cost/latency on repeat extractions. Shows you understand the economics of prompt caching — a common cost-efficiency interview question.

**Builds on:** `providers/anthropic.py` → add `cache_control: {"type": "ephemeral"}` to the appropriate message blocks; `prompts/journey_advisor_v1.py` for the structural pattern.

**Status:** ⚪ idea — 1–2 hours. Pair with UC-2.1 Langfuse: measure cache hits in the dashboard.

---

### UC-1.4 — XML-tag prompt structuring ⚪

**Feature:** Refactor bank extraction prompts to use XML tags (`<statement>`, `<examples>`, `<output_format>`) for clearer boundary demarcation. Run the Chapter 2 eval harness before and after — quantify accuracy delta.

**Pivot proof point:** "Prompt engineering is not intuition — I ran a controlled experiment with an eval harness and measured the accuracy impact of restructuring."

**Builds on:** Future `prompts/{bank}_v1.py` files; pattern from `prompts/journey_advisor_v1.py`; Chapter 2 eval harness (UC-2.3) to measure effect.

**Status:** ⚪ idea — implement after UC-2.3 eval harness exists so the improvement is measurable.

---

## Phase 2 — Application Layer: Observability, Eval, RAG, Streaming 🎯

**Chapters 1–6. The critical path. Every gap the market cares about.**

---

### Chapter 1 — AI-Specific Observability

> "You can't quote numbers you haven't measured." — curriculum

---

#### UC-2.1 — Langfuse tracing on every LLM call ⚪

**Feature:** Add Langfuse SDK to the Python AI service. Wrap all provider calls (`GeminiProvider`, `AnthropicProvider`) with `langfuse.trace()` so every LLM call produces a span with: input tokens, output tokens, cost estimate, latency, model, endpoint, provider, error flag.

Create a Langfuse dashboard with: cost/day, calls/day, latency p50/p95 per endpoint, error rate, token distribution.

**Pivot proof point:** "My extraction pipeline costs $X per document and runs in Yms p95" — with a dashboard URL to show during interviews. This converts all the OTel infrastructure already built into an AI-specific narrative.

**Builds on:** `providers/anthropic.py`, `providers/gemini.py`, `providers/base.py`, `main.py`; complements the existing OTel/Alloy/Grafana stack (don't replace it — Langfuse for AI-specific spans, OTel for service-level metrics).

**Note:** Run Langfuse self-hosted via Docker — add to `docker-compose.yml`. Works with the existing LGTM stack on separate ports.

**Status:** ⚪ idea — ~1–2 hours. First task of Chapter 1.

---

#### UC-2.2 — Prompt versioning in Langfuse ⚪

**Feature:** Register bank extraction prompts in the Langfuse prompt registry. Pull from Langfuse at runtime (rather than hard-coded files) so prompt changes are tracked with version, author, and timestamp. Trend accuracy across prompt versions using the Chapter 2 eval results.

**Pivot proof point:** "Prompt lifecycle management — I can show you how accuracy changed across 3 prompt versions, and roll back a bad prompt in 30 seconds."

**Builds on:** `prompts/journey_advisor_v1.py` (existing pattern), Langfuse prompt management API.

**Status:** ⚪ idea — implement in Chapter 1 alongside UC-2.1. ~1 hour.

---

### Chapter 2 — LLM Evaluation Framework

> "How do you know your extraction is correct?" — top-3 AI Eng interview question

---

#### UC-2.3 — Extraction eval harness ⚪

**Feature:** Create `services/ai-service/evals/` directory. Collect 20 anonymized bank statement samples — mix of BCA CSV, NeoBank PDF, screenshot variants. Write ground-truth JSON for each (every field in `TransactionDto`). Build `eval_extraction.py` that:
1. Runs all fixtures through both `GeminiProvider` and `AnthropicProvider`
2. Computes field-level accuracy (% correct per field across all fixtures)
3. Records: accuracy, cost per doc, latency per doc, error rate
4. Outputs a benchmark table

Write findings to `docs/eval-results.md`.

**Pivot proof point:** "X% field-level accuracy on 20 fixtures. Gemini 2.5 Flash is Y% cheaper than Sonnet 4.6 for this workload — measured, not guessed." This is the answer to the top-3 interview question.

**Builds on:** `models.py` (frozen `TransactionDto` contract defines the fields to eval), `llm_parser.py`, `providers/*.py`. The eval uses the same code paths as production — no special test mode needed.

**Status:** ⚪ idea — Chapter 2 core task. ~3–4 hours for harness + fixtures.

---

#### UC-2.4 — Categorization accuracy eval ⚪

**Feature:** Extend the eval harness to cover the categorizer. Create `eval_categorization.py`: a labeled set of 50 transaction descriptions with expected categories, run through the 106-rule matcher + LLM fallback. Report: rule-hit rate, LLM-fallback rate, accuracy per category bucket.

**Pivot proof point:** "The categorizer accuracy is measured, not assumed. Rule hit-rate is X%, LLM fallback handles Y% of transactions, overall accuracy Z%." Ties into the PF-105/PF-122 work already shipped.

**Builds on:** `services/categorizer.py`, existing category preset seed data (`supabase/migrations/20260510000002_seed_category_presets.sql`).

**Status:** ⚪ idea — Chapter 2 secondary task. ~1–2 hours.

---

#### UC-2.5 — Promptfoo/RAGAS regression in CI (stretch) ⚪

**Feature:** Wire the eval harness as a CI gate in GitHub Actions. On every PR touching `prompts/` or `providers/`, run `eval_extraction.py` and fail the build if accuracy drops below a threshold (e.g. < 85%). Optionally add RAGAS faithfulness metric for the `/ask` endpoint as a future gate.

**Pivot proof point:** "Evals run in CI — prompt regressions are caught before merge, not in production." Directly closes the CI-01 governance gap and shows prod-grade AI engineering discipline.

**Builds on:** UC-2.3 eval harness, `.github/workflows/`, CI-01 gate policy from `governance.md`.

**Status:** ⚪ idea — stretch for Chapter 2. ~1 hour to wire once the harness exists.

---

### Chapters 3–4 — RAG: Embeddings, Retrieval, Reranking, Generation

> pgvector is already in your schema. RAG is the #1 applied AI skill in current JDs.

---

#### UC-2.6 — Natural-language transaction search ⚪

**Feature:** Embed `description + category + amount` as a single string on every transaction insert. Store the vector in a new `embedding` column (pgvector `vector(768)` or `vector(1536)` depending on model). Build `POST /search` in FastAPI: embed the query → cosine similarity search (`<=>`) → return top-K transactions ranked by relevance. Wire `.NET GET /api/transactions/search?q=` as a proxy.

Write 10 handwritten test queries with expected matches. Measure MRR.

**Pivot proof point:** "End-to-end RAG retrieval pipeline, MRR 0.X on 10 test queries. Chose `text-embedding-3-small` over local Ollama based on cost/quality trade-off at this data volume."

**Builds on:** New Supabase migration (vector col + HNSW index + `embedding_model_version` — the landmine fix from day one). Hook into `TransactionCreatedEvent` for online embedding. New typed client in `Infrastructure/External/EmbeddingSearchClient.cs`. `main.py` new `/search` endpoint.

**Status:** ⚪ idea (PF-S13) — Chapter 3 core. ~1 day.

---

#### UC-2.7 — Semantic categorization fallback ⚪

**Feature:** When no keyword rule matches a transaction description, fall back to k-NN over already-categorized transactions (using the same vectors from UC-2.6). Borrow the most-similar transaction's category. The 106 rules handle cold-start; every new categorization makes the system smarter.

**Pivot proof point:** "RAG made a rules-based engine self-improving without retraining. The system gets better as data grows — an emergent property of the vector layer."

**Builds on:** `services/categorizer.py` + pgvector query reused from UC-2.6. No new migration needed — vectors already exist.

**Status:** ⚪ idea (PF-118) — implement Chapter 3 after UC-2.6 vectors are stored. ~2–3 hours.

---

#### UC-2.8 — Embedding drift guard ⚪

**Feature:** Store `embedding_model_version` (e.g. `"text-embedding-3-small-2024-01-01"`) alongside every vector row from day one. Build a `reembed_all.py` migration script that re-embeds all rows when the model changes, gated behind a version check.

**Pivot proof point:** "I knew the landmine before writing the first vector: when embedding model versions change, old and new vectors are not comparable — similarity search returns garbage. Cheap to add at the start; extraordinarily expensive to bolt on after 50,000 transaction embeddings exist. I built the mitigation first."

**Builds on:** Same migration as UC-2.6 (one extra column). `reembed_all.py` script in `evals/` or `scripts/`.

**Staff framing:** This is the judgment-over-coding signal a Staff loop screens for — designing around a failure mode *before* it can occur, not patching it after 50k embeddings exist. Pair it in interviews with your TL track record of catching architectural landmines early.

**Status:** ⚪ idea — 30 minutes, do it in the same migration as UC-2.6. Never skip this.

---

#### UC-2.9 — "Ask your finances" grounded Q&A ⚪

**Feature:** `POST /ask` endpoint with two context-assembly paths — not uniform heavy RAG:
- **Spending questions** ("how much on food in March?") — pass aggregated category summaries as context. No vector retrieval needed; the summary is already computed.
- **Journey/goal questions** ("how close am I to a 3-month emergency fund?") — pass current tier scores + quest state as context. `journey/advise` is already 70% of this.
- **Specific transaction lookups** ("find that Tokopedia payment last month") — full vector retrieval path from UC-2.6, reranked to top-3.

All paths converge on grounded synthesis: top-3 context chunks → LLM → cited answer. Metadata filters: account, date range, category.

**Pivot proof point:** "Grounded synthesis with citations. I chose context-assembly strategy based on question type — aggregated summaries for spending trends, vector retrieval for specific lookups. Hallucination rate near-zero because context is always real user data."

**Builds on:** `services/journey_advisor.py` (proto-RAG, extend it), new `services/insights.py`, reranker (Cohere free tier or FlashRank local), UC-2.6 retriever for the lookup path.

**Status:** ⚪ idea — Chapter 4 core. ~1 day.

---

#### UC-2.10 — Chunking on long-form advisory text ⚪

**Feature:** Apply fixed-size-with-overlap and sentence-window chunking strategies to portfolio review output and journey advice history (these can grow long). Index chunks separately; retrieve the expanded window at query time.

**Pivot proof point:** "Named two chunking strategies with architectural rationale. Fixed-size for structured tables; sentence-window for advisory narratives to preserve context across chunk boundaries."

**Builds on:** `services/portfolio_reviewer.py`, `services/journey_advisor.py`, advice history (if stored). Reused by UC-2.14.

**Status:** ⚪ idea — Chapter 4 secondary. ~1–2 hours.

---

#### UC-2.15 — Guardrails on the advisory path ⚪

**Feature:** A guardrail layer wrapping `POST /ask` and the advisory endpoints — three checks, all cheap to add once `/ask` exists:
1. **PII redaction** — scrub account numbers, names, and card fragments from anything sent to the LLM *and* from logged Langfuse spans.
2. **Output validation** — every numeric claim in the answer must trace to a retrieved transaction or a computed aggregate; reject and regenerate if the model emits a number with no source.
3. **Financial-advice disclaimer + scope guard** — refuse out-of-scope requests ("should I buy this stock?") and append a standing not-financial-advice disclaimer.

**Pivot proof point:** "My advisor can't leak PII or state a number it can't ground. On a product that gives financial advice, guardrails are first-class — not a Phase-4 afterthought." Directly answers the safety/alignment probe Anthropic (and increasingly every fintech) runs in the loop.

**Builds on:** PF-122 (partial PII work already started), new `services/guardrails.py`, `POST /ask` (UC-2.9), Langfuse redaction hooks (UC-2.1).

**Status:** ⚪ idea (advances PF-122) — Chapter 4–5, rides on UC-2.9. ~2–3 hours.

---

### Chapter 5 — Streaming + Production UX

> Every modern AI product streams. This is the pattern, not a feature.

---

#### UC-2.11 — SSE streaming chat ⚪

**Feature:** Convert `POST /ask` to a streaming endpoint using `sse-starlette` (`EventSourceResponse`). On the React side, consume via `EventSource` API or `@microsoft/fetch-event-source`. Add a minimal `/chat` route to the frontend — input box, streamed response rendering token-by-token.

**Pivot proof point:** "Streaming from FastAPI to React: `StreamingResponse` + `EventSource`, correct error handling for dropped connections, no buffering." Shows you know the production pattern, not just the concept.

**Builds on:** `main.py` `/ask` → convert to `StreamingResponse`; `apps/frontend/src/pages/` new `Chat.tsx`; `apps/frontend/src/App.tsx` new route.

**Status:** ⚪ idea — Chapter 5 core. ~3–4 hours.

---

#### UC-2.12 — Realtime upload/status (replace polling) ⚪

**Feature:** Replace the polling-based upload status in the 4-step upload wizard and the `/status` dashboard with Supabase Realtime subscriptions. On upload start, subscribe to the transaction row's `status` column via the `@supabase/supabase-js` Realtime channel. Status badge updates live without polling.

**Pivot proof point:** "Applied streaming to an existing workflow — eliminated polling. Event-driven status is also required for the future webhook-triggered AI pipeline (PF-S11/PF-S12)."

**Builds on:** Upload wizard component, `/status` page, Supabase Realtime (PF-S12 partially). `@supabase/supabase-js` planned for PF-S09 but can be installed earlier.

**Status:** ⚪ idea (advances PF-S12) — Chapter 5 secondary. ~2–3 hours.

---

#### UC-2.13 — Stream portfolio review + journey advice ⚪

**Feature:** Convert `/portfolio-review` and `/journey/advise` to streaming endpoints so the frontend receives AI narrative token-by-token. Shows streaming generalized beyond just the chat use case.

**Pivot proof point:** "Streaming is an architectural pattern applied consistently across advisory endpoints — not a one-off implementation."

**Builds on:** `services/portfolio_reviewer.py`, `services/journey_advisor.py`; frontend Investment and Journey pages consume the stream.

**Status:** ⚪ idea — Chapter 5 after UC-2.11 proves the pattern. ~2 hours.

---

### Chapter 6 — Advanced RAG Patterns

> "What advanced RAG techniques have you used?" — Comes up in every serious AI Eng loop.

---

#### UC-2.14 — Hybrid + sentence-window + auto-merging retrieval ⚪

**Feature:** Three experiments, each measured against the Chapter 3 MRR baseline:
1. **Hybrid search:** combine pgvector cosine similarity with Postgres `tsvector` full-text search (BM25-style). Weighted fusion score.
2. **Sentence-window retrieval:** index small chunks (single sentences) but return the surrounding window at query time for richer context.
3. **Auto-merging retrieval:** hierarchical chunks; when ≥N child chunks of the same parent are retrieved, replace them with the parent.

Run the eval harness against each variant. Pick the winning combination as the production default.

**Pivot proof point:** "I evaluated three advanced RAG techniques on my own fixtures. Hybrid search lifted MRR from X to Y. Sentence-window improved faithfulness score from A to B. I shipped the winning combination — not the most impressive-sounding one."

**Builds on:** UC-2.6 retriever + eval harness (UC-2.3), new `tsvector` Postgres column, LlamaIndex utilities for sentence-window/auto-merging (or implement manually — either is defensible).

**Status:** ⚪ idea — Chapter 6 full week. Numbers go into the blog post.

---

#### UC-2.16 — Faithfulness + agent eval (beyond extraction) ⚪

**Feature:** Extend the Chapter 2 harness past extraction to cover the generative and agentic paths — the parts this map ships but doesn't yet measure:
1. **RAG faithfulness (Chapter 6):** add RAGAS faithfulness + answer-relevancy metrics on `/ask` over a labelled query set. Catches ungrounded synthesis that the MRR retrieval metric can't see.
2. **Agent eval (Chapter 8, once UC-3.1 / UC-3.3 exist):** tool-call accuracy (did the agent call the right tool with the right args?) + a trajectory check over 10 fixture scenarios, logged to Langfuse.

**Pivot proof point:** "I eval agents and RAG, not just extraction. Faithfulness X on grounded Q&A; tool-call accuracy Y on the categorizer agent. So when you ask 'how do you eval an agent?' I have a real answer with numbers." Closes the gap between building five agents and measuring none.

**Builds on:** UC-2.3 harness (reuse the runner), `/ask` (UC-2.9), the agents from UC-3.1 / UC-3.3, RAGAS, Langfuse traces.

**Status:** ⚪ idea — RAG faithfulness Chapter 6 (~2 h); agent eval Chapter 8 alongside UC-3.3 (~2–3 h).

---

## Phase 3 — Specialization: Agents, Orchestration, MCP 🎯

**Chapters 7–9. The Tier 3 → Tier 4 jump.**

---

### Chapter 7 — First Agent (smolagents)

> Start with the smallest API surface. smolagents in one day → LangGraph as "industrial smolagents."

---

#### UC-3.1 — Transaction Categorizer Agent ⚪

**Feature:** smolagents `ToolCallingAgent` with three tools:
- `search_existing_rules(description)` — queries the 106 keyword rules
- `lookup_similar_transactions(description)` — pgvector k-NN from UC-2.6
- `suggest_category(description, similar_txns, rules_result)` — LLM synthesis

Input: uncategorized transaction description. Output: suggested category + confidence + reasoning trace. Every tool call logged to Langfuse — the trace is demo material.

**Pivot proof point:** "Thought-Action-Observation loop on a real problem. Traces are visible in Langfuse — you can step through the agent's reasoning for any transaction."

**Builds on:** New `app/agents/` directory, new optional endpoint in `main.py`, `services/categorizer.py`, UC-2.6 pgvector search.

**Status:** ⚪ idea — Chapter 7 core. ~3–4 hours.

---

#### UC-3.2 — Upload Processing Agent ⚪

**Feature:** Replace the fixed linear pipeline with a self-correcting agent loop that knows when it's uncertain and stops rather than silently failing.

**Current pipeline (linear, brittle):**
```
Upload → BankIdentifier → Parser → ValidationPipeline → Categorize → Save
```

**Agent pipeline (self-correcting):**
```
identify(file) → confidence score
  IF confidence < 0.8 → try alternate identification strategy
parse(bank, file) → inspect output quality (completeness, date consistency, amount range)
  IF quality check fails → re-extract with different prompt / escalate to user
categorize(batch=True) → flag low-confidence items for human review
STOP → human-in-the-loop preview (preserved)
```

Human-in-the-loop preview stays. The agent improves pre-processing with explicit uncertainty handling before the user sees results.

**Pivot proof point:** "Agent replaced a brittle linear pipeline. Failure modes are explicit — the agent knows what it doesn't know and asks for help rather than silently producing bad data."

**Builds on:** New `app/agents/upload_agent.py`, new `POST /agent/process-upload` endpoint in `main.py`; `Infrastructure/Parsers/BankIdentifier.cs` stays, confidence scoring is new.

**Status:** ⚪ idea (PF-119) — Chapter 7 secondary. ~4 hours.

---

### Chapter 8 — LangGraph: State, Routing, Multi-Step

> "LangGraph is in the dominant position in current AI Eng JDs." — curriculum

---

#### UC-3.3 — Financial Health Advisor Agent ⚪

**Feature:** LangGraph `StateGraph` with:
- **State:** `{pyramid_scores, recent_transactions, spending_by_category, conversation_history}`
- **Tools:** `get_cashflow_summary`, `get_pyramid_scores`, `get_spending_by_category`, `get_investment_summary`
- **Graph:** `analyze_state` → `identify_gaps` → `generate_recommendations` → conditional edge to `drilldown` or `END`
- **Memory:** LangGraph `MemorySaver` checkpointer for within-session continuity
- **Error handling:** tool failures route to a `fallback_response` node, not a crash

Test with: "I want to improve my financial health, where should I start?" → expect a personalized, tool-grounded, multi-step recommendation using the user's actual pyramid scores and transactions.

**Pivot proof point:** "Multi-step agent with conditional routing, state, memory, and error handling. The headline LangGraph pattern — and I built it on a real product, not a tutorial."

**Builds on:** Deepens `services/journey_advisor.py` and the existing `.NET JourneyAdvisorClient`. New LangGraph graph wired to the personal-finance data layer.

**Staff framing:** Don't present this as "I wired a graph." Present the *decision* — why a state machine over a single mega-prompt, where the failure boundaries sit, how memory scope is bounded. That decision-narrative, backed by your 3 consecutive TL roles, is what reads as Staff rather than senior-IC.

**Status:** ⚪ idea — Chapter 8 core. ~1 day.

---

#### UC-3.4 — Journey Quest Agent ⚪

**Feature:** Upgrade the existing quest generation from a single LLM call on tier state to a multi-step reasoning loop:
1. Read all 5 tier indicator scores
2. Identify the weakest prerequisite blocking the next level
3. Pull recent transactions to explain *why* that indicator is weak
4. Generate a quantified quest: "Add Rp 1.8M to emergency fund to reach 3-month coverage" (computed from actual balance)
5. Suggest a concrete behavioural change based on recent spending patterns

**Pivot proof point:** "Agentic reasoning on the product's core scoring engine. Quests are now data-driven and quantified — not generic suggestions."

**Builds on:** Existing quest generation logic + `JourneyScoringService.cs`. New `app/agents/quest_agent.py`. The existing `/journey/advise` endpoint is a proto-agent — extend its loop depth rather than building from scratch. Ticket PF-121 depends on PF-119 (Upload Agent).

**Status:** ⚪ idea (PF-121) — Chapter 8 secondary. ~3 hours.

---

#### UC-3.5 — Monthly Financial Review Agent ⚪

**Feature:** Autonomous month-end run (triggered by cron or manual endpoint):
- Pulls transactions for the month
- Compares category spend vs prior month (% change, absolute delta)
- Computes journey-score delta (was tier movement positive or negative this month?)
- Flags anomalies: new recurring charges, category spikes > 30%
- Generates a narrative summary + 3 specific action items
- (Future) Delivers via email or in-app notification

**Pivot proof point:** "Autonomous agent — not reactive but scheduled. Demonstrates the pattern for non-interactive AI workflows."

**Prerequisite:** PF-S08 (Supabase Auth) — without user identity, the agent can't scope data. Target PF-120 post-auth.

**Builds on:** New `app/agents/review_agent.py`. Pulls data via the same typed HttpClients already used by .NET handlers. Anomaly detection is statistical (category delta > 30%, new merchant not seen in prior 3 months) — no separate ML model needed.

**Status:** ⚪ idea (PF-120, gated on PF-S08 auth) — design now, implement after auth ships.

---

### Chapter 9 — Model Context Protocol

> "MCP is Anthropic's tool/agent interop standard, adopted across the industry." — curriculum

---

#### UC-3.6 — Personal-finance MCP server ⚪

**Feature:** Build an MCP server using the Python SDK exposing these tools:
- `get_transactions(account?, start_date?, end_date?, category?)` — filtered transactions
- `get_pyramid_scores()` — all 5 tier scores + indicators
- `get_cashflow_summary(period?)` — income, expenses, net cashflow
- `search_transactions_semantic(query)` — reuses the UC-2.6 pgvector retriever

Test from Claude Desktop: connect to the MCP server, list tools, invoke `get_pyramid_scores`, invoke `search_transactions_semantic("how much did I spend on coffee last month")`.

**Pivot proof point:** "I have an MCP server that any MCP client can connect to and query my real finance data. Named in Anthropic, Grafana, and Datadog JDs as a desired capability — I didn't just read the spec, I shipped a server."

**Builds on:** New MCP server (`services/mcp-server/` or within `services/ai-service/`), MCP Python SDK (`modelcontextprotocol/python-sdk`), existing data layer + UC-2.6 retriever.

**Staff framing:** Frame this as an interop/platform decision, not a demo — why a standard protocol over a bespoke API, and what it means for a team to expose capabilities once and have any client consume them. That platform-thinking, tied to your architecture/TL background, is the Staff-level read at Grafana and Datadog.

**Status:** ⚪ idea — Chapter 9 core. ~4–6 hours.

---

#### UC-3.7 — 2-agent + MCP workflow ⚪ (stretch)

**Feature:** Inside the LangGraph Financial Health Advisor (UC-3.3), wire one of the tools to call the MCP server rather than the data layer directly. A second sub-agent handles the MCP interaction. Demonstrates multi-agent orchestration over a standard protocol.

**Pivot proof point:** "Agent A calls Agent B via MCP. The interop boundary is explicit, the protocol is standard, and the workflow is inspectable in Langfuse."

**Builds on:** UC-3.3 (LangGraph agent) + UC-3.6 (MCP server). Anthropic MCP Series from Academy.

**Status:** ⚪ idea — Chapter 9 stretch. ~2 hours after both UC-3.3 and UC-3.6 are working.

---

## Phase 4 — Advanced Fine-Tuning & MLOps ⏸️

**Parked for month 4+. No target JD in the current pipeline (Grafana, GitLab, Datadog, Anthropic, Intercom) requires fine-tuning or SageMaker. Revisit only if a specific JD demands it.**

These are noted for completeness, not for scheduling:

- **Guardrails at scale** — *basic guardrails moved forward to UC-2.15 (Chapter 4–5).* What remains for Phase 4: adversarial/jailbreak testing, a formal red-team pass, structured PII-leak benchmarking. Activates only for a safety-heavy role.
- **Eval at scale** — *RAG/agent faithfulness moved forward to UC-2.16.* What remains for Phase 4: extend to a 100+ fixture set, add drift detection using the UC-2.8 `embedding_model_version` guard, and CI-gate the faithfulness metric. Activates if you're applying to an AI evaluation-heavy role.
- **Fine-tuning (only if a JD asks)** — after sufficient labelled transaction data accumulates, fine-tune a small classification model for the categorizer. The categorizer's RAG fallback (UC-2.7) is good enough for the interview narrative and probably for production.
- **MLOps / SageMaker / Bedrock** — AWS- or Azure-specific deployment patterns. Defer unless targeting an explicitly cloud-stack company.

---

## Chapters 10–12 — Positioning & Proof

**These weeks don't add features — they convert the built features into interview-ready artifacts.**

---

### Blog post: "Building a Production LLM Pipeline for Indonesian Bank Statement Parsing"

Draws on: UC-1.1 (tool_use vs JSON mode decision), UC-1.3 (prompt caching), UC-2.3 (eval benchmark table), UC-2.6–2.9 (RAG architecture), UC-3.6 (MCP server), UC-2.1 (Langfuse cost/latency numbers).

Content: the decisions (not the code). Why `tool_use` over JSON mode. Why three-tier deduplication. What the eval showed about Gemini vs Sonnet for this workload. How RAG made the categorizer self-improving. The embedding drift landmine you avoided.

Platform: dev.to (free, good SEO) or personal blog. Link from GitHub README.

---

### Demo Loom (3 minutes)

| Segment | Duration | Uses |
|---------|----------|------|
| Upload BCA PDF → transactions appear with categories | 0:30 | UC-1.1, upload pipeline |
| Financial Journey → pyramid scores, Living Garden | 0:30 | existing |
| Langfuse / Grafana trace → cost, latency, token count | 0:30 | UC-2.1 |
| RAG chat → "how much on food in March?" → streamed answer | 0:30 | UC-2.11, UC-2.9 |
| Agent → "improve my financial health" → multi-step recommendation | 0:30 | UC-3.3 |
| Claude Desktop → MCP tools invoked live | 0:30 | UC-3.6 |

---

### STAR Stories (5 prepared before Chapter 11 interviews)

| Story | Draws on |
|-------|----------|
| `tool_use` vs JSON mode decision — architecture trade-off | UC-1.1 |
| Three-tier deduplication design — reliability engineering | existing (PF-090) |
| PyMuPDF 40–60% token cost reduction — cost-conscious AI engineering | existing |
| RAG pipeline: retrieval + reranking + measured eval lift | UC-2.6, UC-2.9, UC-2.14 |
| Agent + MCP system — orchestration + interop | UC-3.3, UC-3.6 |

---

### Certification (Chapter 10 — pick one)

| Option | Cost | Signal |
|--------|------|--------|
| Databricks GenAI Engineer Associate | ~$200 | RAG, eval, deployment, guardrails — highest signal for AI Eng roles |
| Azure AI Engineer Associate (AI-102) | ~$165 | Azure OpenAI, AI Search — best if targeting Azure-stack companies |

See `/mentor cert Databricks Generative AI Engineer` for full ROI breakdown.

---

## Cross-links

| Doc | Purpose |
|-----|---------|
| [`docs/mentor/ai-engineer-learning-path.md`](../mentor/ai-engineer-learning-path.md) | Curriculum: phases, platforms, courses, cadence |
| [`.agents/skills/mentor/learning-path.md`](../../.agents/skills/mentor/learning-path.md) | Task-level curriculum: what to ship today |
| [`docs/mentor/progress.md`](../mentor/progress.md) | Live activity log |
