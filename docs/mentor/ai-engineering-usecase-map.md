# AI Engineering Use-Case Map — Personal Finance Platform

> **Updated:** 2026-07-05 · **Status source of truth:** the [Master Table](#helicopter-view--master-table) below. When a UC ships, flip its row there (and only there) — detail sections carry facts and sequencing, not status.
>
> **You are here:** Chapters 1–4 CLOSED (PF-AI001 → PF-AI004 all Done, 2026-07-03). Next up: **Chapter 5 — SSE streaming (UC-2.11 / [PF-AI005](../../.claude/plans/learning/PF-AI005-streaming-sse-todo.md))**.
>
> **What this doc is:** The companion to [`docs/mentor/ai-engineer-learning-path.md`](../mentor/ai-engineer-learning-path.md).
> The curriculum doc is curriculum-only — phases, platforms, cadence. This doc answers the other half:
> *for every concept in the curriculum, what feature in the Personal Finance Platform do we build to prove it?*
>
> Every row here maps to a real commit in this repo. No toy scripts. Same-day implementation.
>
> **Progress log:** [`docs/mentor/progress.md`](../mentor/progress.md) — live activity log tracking what's been shipped.
>
> **Filter for every AI feature:** it must either (a) surface an insight the user couldn't compute themselves, or
> (b) reduce a workflow step from manual to automatic. No AI features for their own sake.
>
> **Infrastructure baseline (as of 2026-07-05):** pgvector live with 4,467 embedded transactions; Langfuse tracing on every LLM call; 20-fixture extraction eval published (Row F1 1.000); `/search` + `/ask` (RAG with FlashRank rerank + citations) live-verified with RAGAS faithfulness 0.900. Still greenfield: streaming, guardrails, agents, MCP.

---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| ✅ done | Built and committed. Write-up + proof point ready. |
| 🟡 partial | Started or scaffolded; gaps remain. |
| ⚪ idea | Planned, not yet built. Ticket noted if exists. |

Status lives **only** in the Master Table below. Phase-heading glyphs (🎯 focus, ⏸️ parked) mark attention, not completion.

---

## Helicopter View — Master Table

The entire 12-chapter build arc on one page (chapters are paced by progress, not calendar weeks — see the [learning path](../mentor/ai-engineer-learning-path.md)). Columns: which phase/chapter the concept comes from, the UC id used everywhere else in this doc, what we build, kegunaan (one-line user value, in Indonesian), where it lives, the pivot proof point, and status.

| Phase | Chapter | UC | Concept (from curriculum) | PF Feature | Kegunaan | Endpoint / Artifact | Pivot Proof Point | Status |
|-------|------|----|--------------------------|------------|----------|--------------------|--------------------|--------|
| 1 | — | 1.1 | Structured output: tool_use + JSON mode | Multi-provider extraction factory | Ekstrak transaksi bank otomatis dari berbagai format file | `providers/factory.py`, `/parse-pdf` | "Function-calling parity across 2 providers, temp=0, max_tokens hard error" | ✅ |
| 1 | — | 1.2 | Multimodal (vision) inputs | Bank Jago screenshot extraction | Parsing screenshot HP menjadi transaksi terstruktur | `main.py /parse-image` | "Multimodal pipeline handling PNG/WebP input" | ✅ |
| 1 | — | 1.3 | Prompt caching | Cache stable system prompts (Anthropic path) | Hemat biaya API dengan cache bagian prompt yang tidak berubah | `providers/anthropic.py` | "Quantified cache hit-rate + cost/latency drop on repeat extractions" | ⚪ |
| 1 | — | 1.4 | XML-tag prompt structuring | Bank prompts with semantic XML tags | Tingkatkan akurasi ekstraksi via struktur prompt yang eksplisit | `prompts/{bank}_v1.py` | "Prompt engineering rigour; before/after accuracy in eval harness" | ⚪ |
| 2 | 1 | 2.1 | AI-specific observability | Langfuse: cost/call, latency, error rate | Monitor biaya & latensi setiap panggilan LLM secara real-time | All providers + `main.py` | "Extraction costs $0.00029/doc (Gemini 2.5 Flash); `/ask` p50 retrieval ~887ms, generation ~2.7s — Langfuse dashboard live" | ✅ |
| 2 | 1 | 2.2 | Prompt versioning + lifecycle | Langfuse prompt registry for bank prompts | Kelola versi prompt secara terpusat & lacak dampaknya ke akurasi | `prompts/` → Langfuse | "Prompt versions tracked, accuracy trends visible across releases" | ⚪ |
| 2 | 2 | 2.3 | LLM eval harness | 20-fixture extraction benchmark (Gemini vs Sonnet) | Ukur & bandingkan akurasi + biaya antar provider LLM | `evals/eval_extraction.py` | "Row F1 1.000, all-field accuracy 0.997 on 20 fixtures; $0.00029/doc — measured, not guessed" | ✅ |
| 2 | 2 | 2.4 | Categorization eval | 106-rule + LLM-fallback accuracy measurement | Validasi seberapa akurat sistem kategorisasi transaksi end-to-end | `evals/eval_categorization.py` | "Categorizer accuracy measured, not assumed" | ⚪ |
| 2 | 2 | 2.5 | CI eval regression (stretch) | Promptfoo / RAGAS gate in GitHub Actions | Cegah regresi prompt secara otomatis sebelum merge ke production | `.github/workflows/` | "Evals run in CI — prompt regressions caught before merge" | ⚪ |
| 2 | 3 | 2.6 | Text embeddings + vector DBs | Embed txns on insert, store in pgvector | Simpan representasi vektor transaksi sebagai fondasi pencarian semantik | Supabase migration + `/embed-transactions` | "Built RAG retrieval layer; chose embedding model based on cost/quality trade-off" | ✅ |
| 2 | 3 | 2.6 | Semantic search | Natural-language transaction search | Cari transaksi pakai kalimat biasa ("belanja Maret"), bukan filter manual | `POST /search` (Python live; .NET proxy route pending) | "MRR@5 1.000, P@5 0.657 after diagnosing the IVFFlat probes=1 bug that faked a 0.476 baseline" | ✅ |
| 2 | 3 | 2.8 | Embedding drift guard | `model` column on `transaction_embeddings` + re-embed plan | Cegah korupsi hasil similarity search saat model embedding diupgrade | Supabase migration | "Production-aware: model upgrades don't silently corrupt similarity results" | ✅ |
| 2 | 3 | 2.7 | RAG as self-improving system | Semantic categorization fallback (k-NN over labelled txns) | Kategorisasi otomatis berbasis kemiripan data historis; makin akurat seiring data tumbuh | `services/categorizer.py` | "RAG made a 106-rule engine self-improving without retraining" | ⚪ (PF-118) |
| 2 | 4 | 2.9 | Re-ranking | FlashRank cross-encoder on top-10 retrieved | Reorder hasil RAG agar dokumen paling relevan muncul di atas | `/search?rerank=true`, `/ask` pipeline | "Measured a **negative** rerank delta (MRR@5 1.000→0.857, P@5 −0.057), diagnosed it (EN-only cross-encoder vs multilingual bi-encoder), kept the simpler pipeline — measurement over resume-driven complexity" | ✅ |
| 2 | 4 | 2.9 | Grounded synthesis + citations | "Ask your finances" Q&A with cited answer | Jawab pertanyaan keuangan dengan data transaksi nyata + sitasi sumber | `POST /ask` | "RAGAS faithfulness 0.900; live-verified on 4,467 txns incl. adversarial canary; citation-hallucination guard in `answerer.py`" | ✅ |
| 2 | 4 | 2.10 | Chunking strategies | Fixed-size + sentence-window in `chunker.py` | Pecah teks narasi panjang tanpa kehilangan konteks antar kalimat | `services/chunker.py` | "Named chunking strategies; chose sentence-window for advisory corpus" | 🟡 |
| 2 | 4–5 | 2.15 | Guardrails: PII + output validation | Guardrail layer on `/ask` (PII scrub, advice disclaimer, output validation) | Cegah kebocoran PII & angka tanpa sumber pada jawaban advisor keuangan | `services/guardrails.py`, `POST /ask` | "Financial advisor can't leak PII or emit an unvalidated number — guardrails first-class, not a Phase-4 afterthought" | ⚪ (PF-122) |
| 2 | 5 | 2.11 | SSE streaming | Token-by-token streamed chat UI | Chat AI responsif — jawaban muncul token per token, tidak menunggu selesai | `POST /ask` (streaming) + `/chat` React page | "Streaming from FastAPI → React; no buffering, correct SSE error handling" | ⚪ (PF-AI005) |
| 2 | 5 | 2.12 | Real-time status (Supabase Realtime) | Replace polling upload status with Realtime | Status proses upload & AI tampil live tanpa polling berulang | Upload wizard + `/status` page | "Eliminated polling; event-driven upload status updates via Realtime" | ⚪ (PF-S12) |
| 2 | 5 | 2.13 | Streaming as a pattern | Stream portfolio review + journey advice | Narasi AI di Investment & Journey muncul token per token | `/portfolio-review`, `/journey/advise` (streaming) | "Streaming applied consistently across advisory endpoints — a pattern, not a one-off" | ⚪ |
| 2 | 6 | 2.14 | Advanced RAG: hybrid search | pgvector + `tsvector` full-text hybrid retrieval | Gabungkan pencarian vektor + full-text untuk akurasi retrieval lebih tinggi | `/search` hybrid mode | "Hybrid search vs dense-only — measured, not assumed" | ⚪ (PF-AI006) |
| 2 | 6 | 2.14 | Advanced RAG: sentence-window + auto-merging | Advanced chunk-retrieval variants on advisory corpus | Eksperimen 3 teknik RAG lanjutan; pilih pemenang berdasarkan data eval | Retrieval pipeline | "Three advanced RAG variants benchmarked; winner chosen by eval data" | 🟡 |
| 2 | 6 / 8 | 2.16 | RAG + agent faithfulness eval | RAGAS faithfulness on `/ask` + tool-call accuracy on agents | Ukur faithfulness jawaban RAG & akurasi tool-call agen, bukan cuma ekstraksi | `evals/eval_faithfulness.py`, `evals/eval_agent.py` | "Faithfulness 0.900 measured (eval caught 3 real bugs); agent tool-call eval pending first agent" | 🟡 |
| 3 | 7 | 3.1 | Tool-calling loops (smolagents) | Transaction Categorizer Agent | Agen TAO loop yang kategorisasi transaksi dengan reasoning trace di Langfuse | `app/agents/categorizer_agent.py` | "TAO loop: 5 test txns categorized with reasoning trace in Langfuse" | ⚪ (PF-AI007) |
| 3 | 7 | 3.2 | Agent with uncertainty handling | Self-correcting Upload Processing Agent | Pipeline upload yang eksplisit soal ketidakpastian & minta konfirmasi user | `app/agents/upload_agent.py`, `POST /agent/process-upload` | "Agent re-routes on low-confidence identification; no silent failures" | ⚪ (PF-119) |
| 3 | 8 | 3.3 | LangGraph: state + routing + memory | Financial Health Advisor (multi-step) | Saran keuangan multi-langkah berbasis data live user dengan memori sesi | LangGraph graph, tools wired to data layer | "Multi-step agent: analyze → gaps → recommend → drilldown; checkpointer memory; tool-failure fallback" | ⚪ (PF-AI008) |
| 3 | 8 | 3.4 | Agentic reasoning on core product engine | Journey Quest Agent | Buat quest keuangan yang dihitung dari data transaksi aktual, bukan aturan statis | `app/agents/quest_agent.py` | "Agent quantifies quests from live txn history, not static rules" | ⚪ (PF-121) |
| 3 | 8 | 3.5 | Autonomous (non-reactive) agent | Monthly Financial Review Agent | Laporan keuangan bulanan otomatis: anomali + narasi + 3 action items | Scheduled run (post auth) | "Autonomous month-end report: anomaly detection + narrative + 3 action items" | ⚪ (PF-120, needs PF-S08) |
| 3 | 9 | 3.6 | Model Context Protocol | Personal-finance MCP server | Ekspos data keuangan ke Claude Desktop atau MCP client mana pun | MCP server (Python SDK) | "Claude Desktop / any MCP client can query my finance data live" | ⚪ (PF-AI009) |
| 3 | 9 | 3.7 | Multi-agent + MCP orchestration | LangGraph agent calling MCP server as a tool | Orkestrasi dua agen via protokol interoperabilitas standar | 2-agent workflow | "Multi-agent orchestration over a standard interop protocol" | ⚪ |

---

## Interview-Ready Minimum (Hero Features)

> **Read this before you schedule anything.** This map is 27 use cases at 3.5 focused hrs/day over 12 chapters. Slippage is expected, not a failure — so decide *now* what "minimum viable interview-ready" means and protect those items first. The market rewards 2–3 deep, well-measured systems over 27 shallow features; this is doubly true for the Staff roles (Grafana #141, Datadog #150 — internal JD-tracker refs).

**The 3 hero features — go deep, measure everything, these carry the interview:**

| # | Hero feature | UCs | Why it's the hero |
|---|--------------|-----|-------------------|
| H1 | **Eval harness with published numbers** | UC-2.3 (+2.4) | Answers the #1 screen question: "how do you know it's correct?" The published table — Row F1 1.000, $0.00029/doc — *is* the artifact. ✅ banked |
| H2 | **`/ask` RAG with *measured* reranking** | UC-2.6, UC-2.9, UC-2.14 | RAG is the #1 applied skill. The measured delta is banked — and it's **negative**: rerank hurt MRR@5 (1.000→0.857), you diagnosed why, and kept the simpler pipeline. That story beats any hypothetical lift. UC-2.14 hybrid remains the open depth play. |
| H3 | **MCP server + one LangGraph agent** | UC-3.6, UC-3.3 | Frontier signal. Few candidates have shipped MCP; it's named in Grafana/Datadog/Anthropic JDs. |

**Must-ship floor (if everything else slips, ship at least this chain):**
UC-2.1 (Langfuse) ✅ → UC-2.3 (eval) ✅ → UC-2.6 (retrieval) ✅ → UC-2.9 (grounded `/ask`) ✅ → **UC-2.15 (guardrails)** → **UC-3.6 (MCP)**.
Four of six are banked. The remaining floor is guardrails + MCP — everything else is depth and differentiation on top.

**Stretch / cut first under time pressure:** UC-1.3, UC-1.4, UC-2.5, UC-2.10 (advisory-corpus application), UC-2.13, UC-3.4, UC-3.5, UC-3.7.

---

## Build Sequence Diagram

The order is forced — each row is a prerequisite for the next. This is why the curriculum sequences the way it does.

```
Phase 1 (done, minus polish) ───────────────────────────────────────────
  tool_use + JSON mode parity  →  multi-provider factory  ✅
  vision inputs                →  /parse-image            ✅
  [polish: prompt caching, XML structuring]               ⚪

Phase 2, Chapter 1 ─────────────────────────────────────────────────────
  Langfuse tracing             →  real numbers quoted in interviews  ✅

Phase 2, Chapter 2 ─────────────────────────────────────────────────────
  eval harness (fixtures)      →  Row F1 1.000, $0.00029/doc published  ✅
  ↓ feeds
  Chapter 6 (advanced RAG evals), Phase 3 agent evals

Phase 2, Chapters 3–4 (CLOSED 2026-07-03) ─────────────────────────────
  embeddings + pgvector        →  /search  ✅ MRR@5 1.000, P@5 0.657
  ↓
  FlashRank reranker           →  measured NEGATIVE delta, diagnosed, kept simple  ✅
  ↓
  /ask grounded Q&A            →  faithfulness 0.900, citations, live-verified  ✅
  ↓ reused by
  semantic categorization fallback  (UC-2.7)
  hybrid search / auto-merging      (UC-2.14)
  UC-3.1 smolagents (lookup_similar_transactions tool)
  UC-3.6 MCP (search_transactions_semantic tool)

Phase 2, Chapter 5  ← YOU ARE HERE ────────────────────────────────────
  SSE streaming (PF-AI005)     →  /ask streams token-by-token to React /chat
  Supabase Realtime            →  upload status no longer polls

Phase 2, Chapter 6 ─────────────────────────────────────────────────────
  advanced RAG variants        →  eval harness measures the lift; winner ships

Phase 3, Chapters 7–8 ──────────────────────────────────────────────────
  smolagents (TAO loop, simple) →  Categorizer Agent + Upload Agent
  ↓
  LangGraph (state machine)    →  Financial Health Advisor + Quest Agent
  ↓
  both logged to Langfuse      →  traces are demo material

Phase 3, Chapter 9 ─────────────────────────────────────────────────────
  MCP server                   →  wraps data layer + /search retriever
  ↓
  2-agent + MCP workflow        →  LangGraph agent uses MCP as tool (stretch)

Chapters 10–12 ─────────────────────────────────────────────────────────
  blog post + Loom             →  proof artifacts go public
  cert (Databricks / AI-102)   →  signal booster
  applications                 →  5–10 high-fit roles
```

---

## Ticket Map

The PF-AI series is the delivery vehicle for this map (one ticket per chapter). The older PF-1xx tickets cover product features that ride on the AI layer.

| Ticket | Feature | UC | Status |
|--------|---------|----|--------|
| [PF-AI001](../../.claude/plans/learning/PF-AI001-ai-observability.md) | Langfuse observability | UC-2.1 | ✅ Done 2026-06-01 |
| [PF-AI002](../../.claude/plans/learning/PF-AI002-llm-evaluation-framework.md) | Extraction eval harness | UC-2.3 | ✅ Done 2026-06-05 |
| [PF-AI003](../../.claude/plans/learning/PF-AI003-rag-embeddings-retrieval.md) (+003b) | Embeddings + `/search` retrieval | UC-2.6, UC-2.8 | ✅ Done 2026-06-15 |
| [PF-AI004](../../.claude/plans/learning/PF-AI004-rag-reranking-generation.md) | Chunking + rerank + `/ask` | UC-2.9, UC-2.10, UC-2.16 (RAG half) | ✅ Done 2026-07-03 |
| [PF-AI005](../../.claude/plans/learning/PF-AI005-streaming-sse-todo.md) | SSE streaming + production UX | UC-2.11, UC-2.13 | To Do — next up |
| [PF-AI006](../../.claude/plans/learning/PF-AI006-advanced-rag-patterns-todo.md) | Advanced RAG patterns | UC-2.14 | To Do |
| [PF-AI007](../../.claude/plans/learning/PF-AI007-tool-calling-agents-smolagents-todo.md) | smolagents Categorizer Agent | UC-3.1, UC-2.16 (agent half) | To Do |
| [PF-AI008](../../.claude/plans/learning/PF-AI008-langgraph-financial-advisor.md) | LangGraph Financial Health Advisor | UC-3.3 | To Do |
| [PF-AI009](../../.claude/plans/learning/PF-AI009-mcp-personal-finance-server-todo.md) | MCP server | UC-3.6 | To Do |
| PF-118 | Semantic categorization fallback | UC-2.7 | Ready ⚠️ board also lists it Obsolete — reconcile |
| PF-119 | Upload Processing Agent | UC-3.2 | ⚠️ board shows Done but no agent code exists — verify |
| PF-120 | Monthly Financial Review Agent | UC-3.5 | Blocked on PF-S08 (auth) ⚠️ board double-lists — reconcile |
| PF-121 | Journey Quest Agent | UC-3.4 | Ready |
| PF-122 | Guardrails on advisory path | UC-2.15 | Ready ⚠️ board also lists it Obsolete — reconcile |
| PF-S13 | RAG pipeline (original ticket) | — | Superseded by PF-AI003/PF-AI004 — close on board |

---

## Phase 1 — GenAI Foundations & API Engineering 🟡

**Core done; two polish items (UC-1.3, UC-1.4) remain open.** The done items are proof artifacts to write up, not features to build from scratch.

---

### UC-1.1 — Multi-provider structured extraction

**Feature:** Anthropic `tool_use` and Gemini JSON mode behind a unified `ProviderFactory`. Both force structured output with no free-text parsing. Provider swapped via `AI_PROVIDER` env var.

**Pivot proof point:** "I implemented function-calling parity across two providers. Temperature is always 0.0 for extraction. `stop_reason == max_tokens` is treated as a hard error — a truncated extraction is worse than a failure."

**Builds on:** `providers/factory.py`, `providers/anthropic.py`, `providers/gemini.py`, `services/llm_parser.py`, `config.py`.

**Shipped:** document in case study; benchmark numbers now available from UC-2.3 ([eval results](../../services/ai-service/evals/results/20260605-eval-results.md)).

---

### UC-1.2 — Vision (multimodal) extraction

**Feature:** Bank Jago screenshots sent directly to Claude vision (`/parse-image`). No text layer to extract — image sent as base64 to the LLM vision API.

**Pivot proof point:** "Multimodal input handling — text path vs. vision path, with the architectural reason each bank uses which."

**Builds on:** `main.py` `/parse-image`, `providers/anthropic.py`.

**Shipped:** document the vision-vs-PyMuPDF routing decision in the blog post.

---

### UC-1.3 — Anthropic prompt caching

**Feature:** Mark the stable part of the Anthropic extraction prompt (system message + few-shot bank examples) as cacheable using the `cache_control` beta parameter. On repeat extraction calls with the same bank, the cached prefix is served from Anthropic's KV cache. (Verified 2026-07-05: `cache_control` not yet present anywhere in the AI service.)

**Pivot proof point:** Quantified cache hit-rate + before/after cost/latency on repeat extractions. Shows you understand the economics of prompt caching — a common cost-efficiency interview question.

**Builds on:** `providers/anthropic.py` → add `cache_control: {"type": "ephemeral"}` to the appropriate message blocks; `prompts/journey_advisor_v1.py` for the structural pattern.

**Next:** 1–2 hours. Measure cache hits in the Langfuse dashboard (UC-2.1, live).

---

### UC-1.4 — XML-tag prompt structuring

**Feature:** Refactor bank extraction prompts to use XML tags (`<statement>`, `<examples>`, `<output_format>`) for clearer boundary demarcation. Run the eval harness (UC-2.3, live) before and after — quantify accuracy delta.

**Pivot proof point:** "Prompt engineering is not intuition — I ran a controlled experiment with an eval harness and measured the accuracy impact of restructuring."

**Builds on:** `prompts/{bank}_v1.py` files (`superbank_v1.py` exists); pattern from `prompts/journey_advisor_v1.py`; UC-2.3 harness to measure effect.

**Next:** the eval harness prerequisite now exists, so this is unblocked. Caveat: extraction accuracy is already at Row F1 1.000 on the current fixtures — a before/after delta may need harder fixtures to be visible.

---

## Phase 2 — Application Layer: Observability, Eval, RAG, Streaming 🎯

**Chapters 1–6. The critical path. Chapters 1–4 closed 2026-07-03; Chapter 5 is next.**

---

### Chapter 1 — AI-Specific Observability

> "You can't quote numbers you haven't measured." — curriculum

---

#### UC-2.1 — Langfuse tracing on every LLM call

**Shipped (PF-AI001, 2026-06-01):** Langfuse wired into both providers (`gemini.py`, `anthropic.py` via `app/observability`) — every LLM call produces a span with input/output tokens, cost estimate, latency, model, endpoint, provider, error flag. Dashboard live with cost/day, calls/day, latency percentiles, error rate. `/ask` traces verified end-to-end via the Langfuse public API (nested GENERATION observation with cost_usd, tokens, latency).

**Pivot proof point:** "My extraction pipeline costs $0.00029 per document; `/ask` runs at p50 ~887ms retrieval + ~2.7s generation" — with a dashboard URL to show during interviews. This converts the OTel infrastructure into an AI-specific narrative.

**Builds on:** `providers/anthropic.py`, `providers/gemini.py`, `providers/base.py`, `main.py`; complements the existing OTel/Alloy/Grafana stack (Langfuse for AI-specific spans, OTel for service-level metrics).

---

#### UC-2.2 — Prompt versioning in Langfuse

**Feature:** Register bank extraction prompts in the Langfuse prompt registry. Pull from Langfuse at runtime (rather than hard-coded files) so prompt changes are tracked with version, author, and timestamp. Trend accuracy across prompt versions using the UC-2.3 eval results.

**Pivot proof point:** "Prompt lifecycle management — I can show you how accuracy changed across 3 prompt versions, and roll back a bad prompt in 30 seconds."

**Builds on:** `prompts/journey_advisor_v1.py` (existing pattern), Langfuse prompt management API — Langfuse itself is already live (UC-2.1).

**Next:** ~1 hour, unblocked.

---

### Chapter 2 — LLM Evaluation Framework

> "How do you know your extraction is correct?" — top-3 AI Eng interview question

---

#### UC-2.3 — Extraction eval harness

**Shipped (PF-AI002, 2026-06-05):** `services/ai-service/evals/` with 20 anonymized fixtures + ground-truth JSON, `eval_extraction.py` CLI runner (`--provider gemini|anthropic --compare`), row-level F1 + field-level accuracy in `scoring.py`. Published results: **Row F1 1.000 (precision/recall 1.000), critical-field accuracy 1.000, all-field accuracy ~0.997, $0.00029/doc on Gemini 2.5 Flash** — see [`evals/results/20260605-eval-results.md`](../../services/ai-service/evals/results/20260605-eval-results.md). The eval caught a real enum-serialization bug.

**Pivot proof point:** "Row F1 1.000 on 20 fixtures; Gemini 2.5 Flash at $0.00029/doc — measured, not guessed." This is the answer to the top-3 interview question.

**Builds on:** `models.py` (frozen `TransactionDto` contract defines the fields to eval), `llm_parser.py`, `providers/*.py`. The eval uses the same code paths as production — no special test mode.

---

#### UC-2.4 — Categorization accuracy eval

**Feature:** Extend the eval harness to cover the categorizer. Create `eval_categorization.py`: a labeled set of 50 transaction descriptions with expected categories, run through the 106-rule matcher + LLM fallback. Report: rule-hit rate, LLM-fallback rate, accuracy per category bucket.

**Pivot proof point:** "The categorizer accuracy is measured, not assumed. Rule hit-rate is X%, LLM fallback handles Y% of transactions, overall accuracy Z%." Ties into the 4-layer categorization already shipped (PF-103).

**Builds on:** `services/categorizer.py`, existing category preset seed data (`supabase/migrations/20260510000002_seed_category_presets.sql`).

**Next:** ~1–2 hours, unblocked (harness runner exists).

---

#### UC-2.5 — Promptfoo/RAGAS regression in CI (stretch)

**Feature:** Wire the eval harness as a CI gate in GitHub Actions. On every PR touching `prompts/` or `providers/`, run `eval_extraction.py` and fail the build if accuracy drops below a threshold (e.g. < 85%). Optionally add the RAGAS faithfulness metric (now live in `eval_faithfulness.py`) as a second gate on `/ask`.

**Pivot proof point:** "Evals run in CI — prompt regressions are caught before merge, not in production." Directly closes the CI-01 governance gap and shows prod-grade AI engineering discipline.

**Builds on:** UC-2.3 harness ✚ UC-2.16 faithfulness eval (both live), `.github/workflows/`, CI-01 gate policy from `governance.md`.

**Next:** ~1 hour to wire.

---

### Chapters 3–4 — RAG: Embeddings, Retrieval, Reranking, Generation

> RAG is the #1 applied AI skill in current JDs. **Both chapters closed 2026-07-03.**

---

#### UC-2.6 — Natural-language transaction search

**Shipped (PF-AI003 + PF-AI003b, 2026-06-15):** `transaction_embeddings` table (`vector(1536)`, ivfflat cosine index) via [`20260606000001_transaction_embeddings.sql`](../../supabase/migrations/20260606000001_transaction_embeddings.sql); `embedder.py` (OpenAI `text-embedding-3-small`, batched, provider toggle); `retriever.py` (pgvector cosine via asyncpg); `POST /embed-transactions` + `POST /search`; backfill script; 11 unit tests; `eval_retrieval.py` MRR runner with 10 handwritten queries. 4,467 transactions embedded. .NET side: `ILlmSearchClient`/`LlmSearchClient` typed client shipped; embeddings fire on transaction submit.

**Measured:** MRR@5 **1.000**, P@5 **0.657** — after diagnosing that the initial 0.476 "baseline" was an IVFFlat `probes=1` bug (`SET ivfflat.probes = 10`), not a model problem. That diagnosis is itself a proof point.

**Remaining gap:** the planned `.NET GET /api/transactions/search?q=` proxy route was never exposed — `LlmSearchClient.SearchAsync` has no caller. Wire it when the frontend needs search UI (natural fit alongside the UC-2.11 `/chat` page).

**Pivot proof point:** "End-to-end RAG retrieval pipeline, MRR@5 1.000 on 10 test queries. Chose `text-embedding-3-small` over local Ollama on cost/quality at this data volume — and caught an index-tuning bug masquerading as poor retrieval."

---

#### UC-2.7 — Semantic categorization fallback

**Feature:** When no keyword rule matches a transaction description, fall back to k-NN over already-categorized transactions (using the vectors from UC-2.6, now live). Borrow the most-similar transaction's category. The 106 rules handle cold-start; every new categorization makes the system smarter.

**Pivot proof point:** "RAG made a rules-based engine self-improving without retraining. The system gets better as data grows — an emergent property of the vector layer."

**Builds on:** `services/categorizer.py` + the live `retriever.py` from UC-2.6. No new migration needed — vectors already exist.

**Next (PF-118):** ~2–3 hours, fully unblocked. (Board note: PF-118 appears in both Ready and Obsolete — reconcile before starting.)

---

#### UC-2.8 — Embedding drift guard

**Shipped (with PF-AI003, 2026-06-15):** the `transaction_embeddings` table carries a `model` text column (default `'text-embedding-3-small'`) on every row from day one — the doc originally spec'd this as `embedding_model_version`; the shipped name is `model`.

**Remaining gap:** the `reembed_all.py` re-embed script (gated on a version check) is not yet written — the column makes it possible; write it when the first model upgrade actually looms.

**Pivot proof point:** "I knew the landmine before writing the first vector: when embedding model versions change, old and new vectors are not comparable — similarity search returns garbage. Cheap to add at the start; extraordinarily expensive to bolt on after 50,000 embeddings exist. I built the mitigation first."

**Staff framing:** This is the judgment-over-coding signal a Staff loop screens for — designing around a failure mode *before* it can occur. Pair it in interviews with your TL track record of catching architectural landmines early.

---

#### UC-2.9 — "Ask your finances" grounded Q&A

**Shipped (PF-AI004, 2026-07-03):** `POST /ask` live — `answerer.py` pipeline: retrieve top-10 → FlashRank cross-encoder rerank → top-3 context → grounded synthesis with citations + a citation-hallucination guard in the system prompt. Metadata filters (account, date range, category). Errors map to 502 `llm_parse_error`. Live-verified against 4,467 embedded transactions on all 5 `ask_questions.json` fixtures — every answer correct or correctly refused, including the adversarial "sewa 2031" canary. RAGAS faithfulness **0.900** (gpt-4o-mini judge); the eval surfaced and fixed 3 real bugs (citation marker-vs-id, asyncpg date binding, fixture year mismatch).

**The rerank story (tell this one):** FlashRank *hurt* retrieval — P@5 0.657→0.600, MRR@5 1.000→0.857. Diagnosed: an English-only ms-marco cross-encoder overriding a correct multilingual bi-encoder ranking. "I measured a negative result, explained it, and kept the simpler pipeline" is a stronger interview answer than any hypothetical lift.

**Not built (deliberate simplification):** the originally planned 3-way context-assembly routing (aggregated summaries for spending questions / tier scores for journey questions / vector retrieval for lookups) — current implementation is a single retrieval path. Revisit if aggregate questions ("how much on food in March?") prove weak in practice; `journey_advisor.py` still covers the journey path separately.

**Builds on:** `services/answerer.py`, `services/reranker.py`, `services/retriever.py`, `evals/eval_faithfulness.py`.

---

#### UC-2.10 — Chunking on long-form advisory text

**Partially shipped (PF-AI004):** `services/chunker.py` implements both strategies — fixed-size-with-overlap and sentence-window — with unit tests.

**Remaining gap:** applying them to a real long-form corpus (portfolio review output, journey advice history) with indexed chunks and window-expansion at query time. Transactions themselves are too short to need chunking, so the interview story needs the advisory corpus.

**Pivot proof point:** "Named two chunking strategies with architectural rationale. Fixed-size for structured tables; sentence-window for advisory narratives to preserve context across chunk boundaries."

**Builds on:** `services/chunker.py` (live), `services/portfolio_reviewer.py`, `services/journey_advisor.py`. Reused by UC-2.14.

---

#### UC-2.15 — Guardrails on the advisory path

*(Numbered out of reading order — UC-2.15/2.16 were added later; sections are ordered by chapter, not by ID.)*

**Feature:** A guardrail layer wrapping `POST /ask` and the advisory endpoints — three checks, all cheap to add now that `/ask` is live:
1. **PII redaction** — scrub account numbers, names, and card fragments from anything sent to the LLM *and* from logged Langfuse spans.
2. **Output validation** — every numeric claim in the answer must trace to a retrieved transaction or a computed aggregate; reject and regenerate if the model emits a number with no source. (The citation-hallucination guard in `answerer.py` is the seed of this — extend it from citations to numbers.)
3. **Financial-advice disclaimer + scope guard** — refuse out-of-scope requests ("should I buy this stock?") and append a standing not-financial-advice disclaimer.

**Pivot proof point:** "My advisor can't leak PII or state a number it can't ground. On a product that gives financial advice, guardrails are first-class — not a Phase-4 afterthought." Directly answers the safety/alignment probe Anthropic (and increasingly every fintech) runs in the loop.

**Builds on:** new `services/guardrails.py`, `POST /ask` (live), Langfuse redaction hooks (UC-2.1, live). Advances PF-122.

**Next:** ~2–3 hours, fully unblocked — and it's on the must-ship floor. (Board note: PF-122 appears in both Ready and Obsolete — reconcile.)

---

### Chapter 5 — Streaming + Production UX ← next up (PF-AI005)

> Every modern AI product streams. This is the pattern, not a feature.

---

#### UC-2.11 — SSE streaming chat

**Feature:** Convert `POST /ask` (currently plain JSON response) to a streaming endpoint using `sse-starlette` (`EventSourceResponse`). On the React side, consume via `EventSource` API or `@microsoft/fetch-event-source`. Add a minimal `/chat` route to the frontend — input box, streamed response rendering token-by-token. (Good moment to also wire the dormant .NET search proxy from UC-2.6.)

**Pivot proof point:** "Streaming from FastAPI to React: `StreamingResponse` + `EventSource`, correct error handling for dropped connections, no buffering." Shows you know the production pattern, not just the concept.

**Builds on:** `main.py` `/ask` (live, non-streaming); `apps/frontend/src/pages/` new `Chat.tsx`; `apps/frontend/src/App.tsx` new route.

**Next (PF-AI005):** Chapter 5 core, ~3–4 hours. Plan ready: [PF-AI005-streaming-sse-todo.md](../../.claude/plans/learning/PF-AI005-streaming-sse-todo.md).

---

#### UC-2.12 — Realtime upload/status (replace polling)

**Feature:** Replace the polling-based upload status in the 4-step upload wizard and the `/status` dashboard with Supabase Realtime subscriptions. On upload start, subscribe to the transaction row's `status` column via the `@supabase/supabase-js` Realtime channel. Status badge updates live without polling.

**Pivot proof point:** "Applied streaming to an existing workflow — eliminated polling. Event-driven status is also required for the future webhook-triggered AI pipeline (PF-S11/PF-S12)."

**Builds on:** Upload wizard component, `/status` page, Supabase Realtime (PF-S12). `@supabase/supabase-js` planned for PF-S09 but can be installed earlier.

**Next:** Chapter 5 secondary, ~2–3 hours.

---

#### UC-2.13 — Stream portfolio review + journey advice

**Feature:** Convert `/portfolio-review` and `/journey/advise` to streaming endpoints so the frontend receives AI narrative token-by-token. Shows streaming generalized beyond just the chat use case.

**Pivot proof point:** "Streaming is an architectural pattern applied consistently across advisory endpoints — not a one-off implementation."

**Builds on:** `services/portfolio_reviewer.py`, `services/journey_advisor.py`; frontend Investment and Journey pages consume the stream.

**Next:** Chapter 5, after UC-2.11 proves the pattern. ~2 hours.

---

### Chapter 6 — Advanced RAG Patterns

> "What advanced RAG techniques have you used?" — Comes up in every serious AI Eng loop.

---

#### UC-2.14 — Hybrid + sentence-window + auto-merging retrieval

**Feature:** Three experiments, each measured against the (corrected) Chapter 3 baseline of MRR@5 1.000 / P@5 0.657:
1. **Hybrid search:** combine pgvector cosine similarity with Postgres `tsvector` full-text search (BM25-style). Weighted fusion score.
2. **Sentence-window retrieval:** index small chunks (single sentences) but return the surrounding window at query time — the chunker half already exists in `chunker.py` (UC-2.10).
3. **Auto-merging retrieval:** hierarchical chunks; when ≥N child chunks of the same parent are retrieved, replace them with the parent.

Run the eval harness against each variant. Pick the winning combination as the production default. Note: with MRR@5 already at 1.000 on the current query set, the headroom is in **P@5** and in harder/multilingual queries — expand `search_queries.json` first or the experiments can't show lift.

**Pivot proof point:** "I evaluated three advanced RAG techniques on my own fixtures against a strong baseline. I shipped the winning combination — not the most impressive-sounding one." (You already have the companion story: the FlashRank rerank experiment that *lost* to the baseline.)

**Builds on:** live `retriever.py` + `eval_retrieval.py`, `chunker.py`, new `tsvector` Postgres column, LlamaIndex utilities for sentence-window/auto-merging (or implement manually — either is defensible).

**Next (PF-AI006):** Chapter 6 full chapter. Numbers go into the blog post.

---

#### UC-2.16 — Faithfulness + agent eval (beyond extraction)

**RAG half shipped (PF-AI004, 2026-07-01):** RAGAS faithfulness measured live on `/ask` with a gpt-4o-mini judge — mean **0.900** (target ≥0.80; per-question 1.00/1.00/1.00/0.50/1.00) via `evals/eval_faithfulness.py` (+ a hand-rolled variant). The eval caught 3 real bugs before any user could.

**Agent half pending:** tool-call accuracy (did the agent call the right tool with the right args?) + a trajectory check over 10 fixture scenarios, logged to Langfuse — build alongside the first agent (UC-3.1 / PF-AI007) as `evals/eval_agent.py`.

**Pivot proof point:** "I eval agents and RAG, not just extraction. Faithfulness 0.900 on grounded Q&A — and the eval caught three real bugs. So when you ask 'how do you eval an agent?' I have a real answer with numbers."

**Builds on:** UC-2.3 harness (runner reused), `/ask` (live), the agents from UC-3.1 / UC-3.3, RAGAS, Langfuse traces.

---

## Phase 3 — Specialization: Agents, Orchestration, MCP 🎯

**Chapters 7–9. The Tier 3 → Tier 4 jump.**

---

### Chapter 7 — First Agent (smolagents)

> Start with the smallest API surface. smolagents in one day → LangGraph as "industrial smolagents."

---

#### UC-3.1 — Transaction Categorizer Agent

**Feature:** smolagents `ToolCallingAgent` with three tools:
- `search_existing_rules(description)` — queries the 106 keyword rules
- `lookup_similar_transactions(description)` — pgvector k-NN via the live `retriever.py` (UC-2.6)
- `suggest_category(description, similar_txns, rules_result)` — LLM synthesis

Input: uncategorized transaction description. Output: suggested category + confidence + reasoning trace. Every tool call logged to Langfuse — the trace is demo material.

**Pivot proof point:** "Thought-Action-Observation loop on a real problem. Traces are visible in Langfuse — you can step through the agent's reasoning for any transaction."

**Builds on:** New `app/agents/` directory, new optional endpoint in `main.py`, `services/categorizer.py`, live UC-2.6 pgvector search.

**Next (PF-AI007):** Chapter 7 core, ~3–4 hours. Build `eval_agent.py` (UC-2.16 agent half) alongside it.

---

#### UC-3.2 — Upload Processing Agent

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

**Next (PF-119):** Chapter 7 secondary, ~4 hours. ⚠️ The board currently shows PF-119 as Done but no agent code exists in the repo — verify/reset the ticket before scheduling.

---

### Chapter 8 — LangGraph: State, Routing, Multi-Step

> "LangGraph is in the dominant position in current AI Eng JDs." — curriculum

---

#### UC-3.3 — Financial Health Advisor Agent

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

**Next (PF-AI008):** Chapter 8 core, ~1 day.

---

#### UC-3.4 — Journey Quest Agent

**Feature:** Upgrade the existing quest generation from a single LLM call on tier state to a multi-step reasoning loop:
1. Read all 5 tier indicator scores
2. Identify the weakest prerequisite blocking the next level
3. Pull recent transactions to explain *why* that indicator is weak
4. Generate a quantified quest: "Add Rp 1.8M to emergency fund to reach 3-month coverage" (computed from actual balance)
5. Suggest a concrete behavioural change based on recent spending patterns

**Pivot proof point:** "Agentic reasoning on the product's core scoring engine. Quests are now data-driven and quantified — not generic suggestions."

**Builds on:** Existing quest generation logic + `JourneyScoringService.cs`. New `app/agents/quest_agent.py`. The existing `/journey/advise` endpoint is a proto-agent — extend its loop depth rather than building from scratch. Ticket PF-121 depends on PF-119 (Upload Agent).

**Next (PF-121):** Chapter 8 secondary, ~3 hours.

---

#### UC-3.5 — Monthly Financial Review Agent

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

**Next (PF-120, gated on PF-S08 auth):** design now, implement after auth ships.

---

### Chapter 9 — Model Context Protocol

> "MCP is Anthropic's tool/agent interop standard, adopted across the industry." — curriculum

---

#### UC-3.6 — Personal-finance MCP server

**Feature:** Build an MCP server using the Python SDK exposing these tools:
- `get_transactions(account?, start_date?, end_date?, category?)` — filtered transactions
- `get_pyramid_scores()` — all 5 tier scores + indicators
- `get_cashflow_summary(period?)` — income, expenses, net cashflow
- `search_transactions_semantic(query)` — reuses the live UC-2.6 pgvector retriever

Test from Claude Desktop: connect to the MCP server, list tools, invoke `get_pyramid_scores`, invoke `search_transactions_semantic("how much did I spend on coffee last month")`.

**Pivot proof point:** "I have an MCP server that any MCP client can connect to and query my real finance data. Named in Anthropic, Grafana, and Datadog JDs as a desired capability — I didn't just read the spec, I shipped a server."

**Builds on:** New MCP server (`services/mcp-server/` or within `services/ai-service/`), MCP Python SDK (`modelcontextprotocol/python-sdk`), existing data layer + live UC-2.6 retriever.

**Staff framing:** Frame this as an interop/platform decision, not a demo — why a standard protocol over a bespoke API, and what it means for a team to expose capabilities once and have any client consume them. That platform-thinking, tied to your architecture/TL background, is the Staff-level read at Grafana and Datadog.

**Next (PF-AI009):** Chapter 9 core, ~4–6 hours. On the must-ship floor.

---

#### UC-3.7 — 2-agent + MCP workflow (stretch)

**Feature:** Inside the LangGraph Financial Health Advisor (UC-3.3), wire one of the tools to call the MCP server rather than the data layer directly. A second sub-agent handles the MCP interaction. Demonstrates multi-agent orchestration over a standard protocol.

**Pivot proof point:** "Agent A calls Agent B via MCP. The interop boundary is explicit, the protocol is standard, and the workflow is inspectable in Langfuse."

**Builds on:** UC-3.3 (LangGraph agent) + UC-3.6 (MCP server). Anthropic MCP Series from Academy.

**Next:** Chapter 9 stretch, ~2 hours after both UC-3.3 and UC-3.6 are working.

---

## Phase 4 — Advanced Fine-Tuning & MLOps ⏸️

**Parked for month 4+. No target JD in the current pipeline (Grafana, GitLab, Datadog, Anthropic, Intercom) requires fine-tuning or SageMaker. Revisit only if a specific JD demands it.**

These are noted for completeness, not for scheduling:

- **Guardrails at scale** — *basic guardrails moved forward to UC-2.15 (Chapter 4–5).* What remains for Phase 4: adversarial/jailbreak testing, a formal red-team pass, structured PII-leak benchmarking. Activates only for a safety-heavy role.
- **Eval at scale** — *RAG faithfulness shipped in UC-2.16.* What remains for Phase 4: extend to a 100+ fixture set, add drift detection using the UC-2.8 `model` column guard, and CI-gate the faithfulness metric. Activates if you're applying to an AI evaluation-heavy role.
- **Fine-tuning (only if a JD asks)** — after sufficient labelled transaction data accumulates, fine-tune a small classification model for the categorizer. The categorizer's RAG fallback (UC-2.7) is good enough for the interview narrative and probably for production.
- **MLOps / SageMaker / Bedrock** — AWS- or Azure-specific deployment patterns. Defer unless targeting an explicitly cloud-stack company.

---

## Chapters 10–12 — Positioning & Proof

**These chapters don't add features — they convert the built features into interview-ready artifacts.** (In flight early: PF-131 intro blog draft exists; Hashnode Pro 301 blocker flagged.)

---

### Blog post: "Building a Production LLM Pipeline for Indonesian Bank Statement Parsing"

Draws on: UC-1.1 (tool_use vs JSON mode decision), UC-1.3 (prompt caching), UC-2.3 (Row F1 1.000 / $0.00029-per-doc benchmark), UC-2.6–2.9 (RAG architecture, the IVFFlat probes bug, the negative rerank result), UC-3.6 (MCP server), UC-2.1 (Langfuse cost/latency numbers).

Content: the decisions (not the code). Why `tool_use` over JSON mode. Why three-tier deduplication. What the eval showed. Why the reranker lost to the baseline and what that says about measuring instead of assuming. The embedding drift landmine you avoided.

Platform: dev.to (free, good SEO) or personal blog. Link from GitHub README.

---

### Demo Loom (3 minutes)

| Segment | Duration | Uses |
|---------|----------|------|
| Upload BCA PDF → transactions appear with categories | 0:30 | UC-1.1, upload pipeline |
| Financial Journey → pyramid scores, Living Garden | 0:30 | existing |
| Langfuse / Grafana trace → cost, latency, token count | 0:30 | UC-2.1 ✅ |
| RAG chat → "how much on food in March?" → streamed answer | 0:30 | UC-2.11, UC-2.9 ✅ (streaming pending) |
| Agent → "improve my financial health" → multi-step recommendation | 0:30 | UC-3.3 |
| Claude Desktop → MCP tools invoked live | 0:30 | UC-3.6 |

---

### STAR Stories (5 prepared before Chapter 11 interviews)

| Story | Draws on |
|-------|----------|
| `tool_use` vs JSON mode decision — architecture trade-off | UC-1.1 |
| Three-tier deduplication design — reliability engineering | existing (PF-090) |
| The reranker that made retrieval worse — measurement over resume-driven complexity | UC-2.9 (measured: MRR@5 1.000→0.857) |
| RAG pipeline: retrieval eval, the IVFFlat probes bug, faithfulness 0.900 | UC-2.6, UC-2.9, UC-2.16 |
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
| [`services/ai-service/evals/results/`](../../services/ai-service/evals/results/20260605-eval-results.md) | Published eval numbers (extraction benchmark) |
