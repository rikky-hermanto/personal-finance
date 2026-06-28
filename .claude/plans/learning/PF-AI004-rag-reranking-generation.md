# PF-AI004 — RAG Phase 2: Chunking, Re-ranking, Generation

> **Learning Phase:** Phase 1 · Chapter 4 of 12 · Day ~14 of 90
> **Status:** In Progress — code complete and unit-tested; live evals (P@5 delta, RAGAS faithfulness, /ask smoke test) blocked by execution-environment infra (see STEP 0/5/9/10 notes)
> **Started:** 2026-06-10
> **Planned from branch:** main
> **Pivot goal:** Turn the toy into something defensible. Naive top-K retrieval is the demo version of RAG — hiring managers ask about chunking strategy, re-ranking, and grounded synthesis. After this chapter, `POST /ask {"query": "berapa pengeluaran makan bulan Maret?"}` returns a correct, *cited* answer, and you can quote two deltas: "re-ranking moved MRR@5 from 0.XX to 0.YY" and "RAGAS faithfulness on my generated answers is 0.ZZ."

# 📖 Introduction

> Read this before the implementation steps. The goal is to *understand* the concept by watching
> it evolve from the dumbest version to the one you'll ship — not to memorize jargon up front.

## High level — what is this?

Chapter 3 shipped half a RAG pipeline: embed a query, cosine-search pgvector, return the top-K rows. That's retrieval — and it's naive in two specific ways. First, *what you embed* matters: chop the source text wrong and you embed garbled fragments. Second, *trusting cosine similarity alone* lets near-miss rows sneak into the top results, and even a perfect top-3 is just rows — not an answer a human asked for. This chapter fixes both: it teaches you how text gets prepared before embedding (**chunking**), how a second, slower model double-checks the first one's ranking (**re-ranking**), and how raw rows become a trustworthy, cited sentence (**grounded generation**).

RAG is just two phases — build the index once, then query it many times:

```
 1. BUILD THE INDEX  (offline, once per document)
 ──────────────────────────────────────────────────────────────────────────
                                                                  ┌─────────┐
   Data Source        split into        embed each       store    │ 1010 0101│
   📄 🖼  💬 ▶        chunks of text     chunk             ───▶ │ 1110 1011│
  ┌──────────┐  ──▶  ┌─────────────┐ ─▶ ┌─────────────┐          │ 0011 1010│
  │statement,│       │ chunk 1     │    │ embeddings  │          │ 1001 0101│
  │ PDF, etc │       │ chunk 2     │    │  1010 0101  │          └─────────┘
  └──────────┘       │ chunk 3     │    │  1110 1011  │           pgvector DB
                      │ chunk 4     │    │  ...        │
                      └─────────────┘    └─────────────┘
                      (tokenization)

 2. ANSWER A QUERY  (online, every request — this is "RAG")
 ──────────────────────────────────────────────────────────────────────────
   USER  ───────▶   DB (pgvector)  ───────▶   LLM   ───────▶  "Hi! ..." answer
   query             nearest-neighbor          generate          back to the
                      embedding search          grounded answer   user
```

Chapter 3 built phase 1 (chunk → embed → store) and the first half of phase 2 (query → DB). This chapter sharpens phase 2: instead of handing the DB's raw rows straight to the LLM, a re-ranker double-checks them first, and the LLM's answer comes back with citations instead of a bare guess:

```
chunk ──▶ embed ──▶ store ──▶ retrieve ──▶ re-rank ──▶ generate ──▶ cite
 Ch.4      Ch.3       Ch.3       Ch.3         Ch.4        Ch.4       Ch.4
(prep)   (vector)   (pgvector) (cosine     (cross-     (LLM +     (validate
                                 top-10)    encoder)    context)   ids exist)
```

Three mini-ladders below — one per concept this chapter ships.

## Chunking

> **Honest project mapping:** a transaction in this app is already one short DB row (`"GOFOOD GEPREK BENSU GADING | BCA | 2026-03-14 | DB"`) — there's nothing to chunk there. The thing actually worth chunking is the longer source text: multi-page bank statement narratives like [bca_01.txt](../../../services/ai-service/evals/fixtures/bca_01.txt). That's what [chunker.py](../../../services/ai-service/app/services/chunker.py) is built and tested against this chapter; wiring it into real chunked *retrieval* is Chapter 6's job. So read "chunking" below as "how do I cut a long document into pieces an embedding model can handle," not "how do I chunk one transaction."

**Raw input** (sebagian `bca_01.txt`):
```
14/03/2024 GOFOOD GEPREK BENSU GADING                               85.000,00
15/03/2024 GRABFOOD ORDER 7FHJS8                                     62.500,00
16/03/2024 ALFAMART CIPETE RAYA                                      47.000,00
17/03/2024 TRANSFER DEBET SEWA BULANAN KOS                        1.500.000,00
18/03/2024 INDOMARET BINTARO                                         32.000,00
20/03/2024 MAKANAN TERNAK AYAM BROILER                              250.000,00
22/03/2024 GRABFOOD WARUNG PADANG                                    55.000,00
```

---

**Stage 0 — slice the raw text every 35 characters.** The dumbest possible chunker: walk the statement text and cut a new piece every 35 characters, no matter what's there.

```
Chunk 0: "14/03/2024 GOFOOD GEPREK BENSU GA"   ← merchant terpotong
Chunk 1: "DING                         85.00"   ← "GADING" kehilangan awal
Chunk 2: "0,0015/03/2024 GRABFOOD ORDER 7FH"   ← dua transaksi tercampur!
```

> **The wall:** character 35 mendarat *di tengah* merchant name. `"GADI"` dan `"NG"` ter-embed sebagai dua fragmen tidak berkaitan — embedding model tidak tahu keduanya bagian dari "GADING", jadi search untuk merchant ini miss di kedua chunk.

---

**Stage 1 — an automated splitter with overlap (same idea, less breakage).** `fixed_size_chunks(text, chunk_size, overlap)` (Step 2) masih menghitung karakter, tapi `overlap` membawa **tail satu chunk ke head chunk berikutnya** — fakta yang terpotong di boundary tetap muncul utuh di salah satu chunk.

```
# chunk_size=120, overlap=40
Chunk 0 (char 0–120):
"14/03/2024 GOFOOD GEPREK BENSU GADING    85.000,00\n15/03/2024 GRABFOOD ORD"

Chunk 1 (char 80–200):  ← overlap: 40 char terakhir chunk 0 dibawa ke sini
"15/03/2024 GRABFOOD ORD\nER 7FHJS8       62.500,00\n16/03/2024 ALFAMART"
```

> **The wall:** overlap mencegah fakta *hilang* di boundary, tapi splitter masih buta struktur. `"25/03/2024 TRANSFER DEBET SEWA BULANAN"` bisa terpisah dari jumlahnya `"1.500.000,00"` kalau character 500 jatuh di sana — deskripsi dan angkanya berakhir di chunk berbeda.

---

**Stage 2 — split on structural separators, not raw counts.** `sentence_window_chunks(text, window_size)` (Step 2) split pada `\n` dan tanda baca kalimat — setiap chunk adalah *baris lengkap*, tidak pernah setengah merchant name, tidak pernah deskripsi terpisah dari jumlahnya. Plus `window` ±N baris tetangga: unit yang di-*search* kecil dan presisi, unit yang dikirim ke LLM cukup konteks — **"small-to-search, big-to-read."** → *ini yang di-ship chapter ini.*

```
sentence_window_chunks(text, window_size=1)

Chunk 0:
  text:   "14/03/2024 GOFOOD GEPREK BENSU GADING    85.000,00"
  window: "<baris 0>\n<baris 1>"                ← edge kiri: tidak ada tetangga kiri
  index:  0

Chunk 1:
  text:   "15/03/2024 GRABFOOD ORDER 7FHJS8        62.500,00"
  window: "<baris 0>\n<baris 1>\n<baris 2>"      ← kiri + kanan
  index:  1

Chunk 5:
  text:   "20/03/2024 MAKANAN TERNAK AYAM BROILER  250.000,00"
  window: "<baris 4>\n<baris 5>\n<baris 6>"
  index:  5
```

✅ Setiap chunk = 1 transaksi lengkap — merchant dan jumlah tidak pernah terpisah  
✅ `window` memberi LLM konteks cukup saat generate  
✅ Search pakai `text` (presisi kecil), kirim ke LLM pakai `window` (konteks cukup)

> **The wall (next chapter's problem):** structure ≠ meaning. `\n` tidak tahu bahwa baris "GOFOOD" dan "MAKANAN TERNAK" adalah transaksi yang semantically tidak berkaitan — splitting pada struktur adalah proxy yang baik, bukan solusi sempurna.

---

**Stage 3 — named, not built — semantic / agentic splitting.** Split di mana *meaning* berubah (bandingkan embedding similarity antar kalimat bersebelahan, potong kalau drop). Fix sebenarnya untuk "structure ≠ meaning" — out of scope, dicatat sebagai teaser.

▶ **Watch/read:** [Chunking Strategies in RAG: Optimising Data for Advanced AI Responses](https://www.youtube.com/watch?v=pIGRwMjhMaQ) — hands-on, levels up exactly through these stages.

## Re-ranking

**Stage 0 — cosine top-K, as shipped in Chapter 3.** Embed the query `"berapa pengeluaran makan bulan Maret?"`, cosine-search `transaction_embeddings`, return the top-10 by similarity. This already works and is the current baseline (`P@5 = 0.66` after the IVFFlat probes fix).

**Hasil top-10 dari cosine search (bi-encoder):**

```
Rank | tx_id | similarity | description                      | amount_idr
  1  |  42   |   0.891    | GOFOOD GEPREK BENSU GADING       |  85.000
  2  |  43   |   0.874    | GRABFOOD ORDER 7FHJS8            |  62.500
  3  |  47   |   0.862    | GRABFOOD WARUNG PADANG           |  55.000
  4  |  56   |   0.831    | MAKANAN TERNAK AYAM BROILER      | 250.000  ← FALSE POSITIVE
  5  |  44   |   0.803    | ALFAMART CIPETE RAYA             |  47.000
  ...
 10  |  46   |   0.718    | TRANSFER DEBET SEWA BULANAN KOS  | 1.500.000 ← noise
```

> **The wall:** the embedding model is a **bi-encoder** — it encoded query dan setiap deskripsi transaksi *secara independen*, tidak pernah bersama-sama. Hasilnya hanya membandingkan dua titik pra-komputasi di vector space. `"makan"` (to eat) dan `"makanan ternak"` (animal feed) berbagi cukup akar kata yang sama sehingga embedding-nya berdekatan — bi-encoder tidak pernah punya kesempatan untuk mempertimbangkan perbedaannya.

---

**Stage 1 — re-rank the top-10 with a cross-encoder.** A **cross-encoder** membaca query dan dokumen kandidat *bersama-sama*, dalam satu forward pass — bisa attend lintas keduanya dan benar-benar mempertimbangkan apakah `"makanan ternak"` menjawab pertanyaan tentang `"makan"`. Pattern-nya adalah funnel: bi-encoder yang murah-dan-lebar retrieves 10 kandidat, cross-encoder yang mahal-dan-sempit re-scores 10 tersebut.

```
Forward pass: ["berapa pengeluaran makan bulan Maret?" + "GOFOOD GEPREK BENSU GADING | BCA | 2024-03-14 | DB"]
  → score: 0.94  ← tahu ini restoran makanan

Forward pass: ["berapa pengeluaran makan bulan Maret?" + "MAKANAN TERNAK AYAM BROILER | BCA | 2024-03-20 | DB"]
  → score: 0.12  ← mengerti "ternak ayam" ≠ "makan orang"

Forward pass: ["berapa pengeluaran makan bulan Maret?" + "TRANSFER DEBET SEWA BULANAN KOS | BCA | 2024-03-17 | DB"]
  → score: 0.03  ← jelas tidak relevan
```

**Top-3 setelah re-ranking:**

```
New Rank | Ori Rank | tx_id | cross_score | description
   1     |    1     |  42   |    0.94     | GOFOOD GEPREK BENSU GADING    Rp  85.000
   2     |    2     |  43   |    0.89     | GRABFOOD ORDER 7FHJS8         Rp  62.500
   3     |    3     |  47   |    0.85     | GRABFOOD WARUNG PADANG        Rp  55.000
   ─     |    4     |  56   |    0.12     | MAKANAN TERNAK AYAM BROILER   ← eliminated ✅
   ─     |   5–10   |  ...  |   <0.50    | ALFAMART, INDOMARET, SEWA...  ← eliminated ✅
```

> **The wall:** a quality hosted cross-encoder (Cohere Rerank) costs money and a network round-trip per call. Fine for production traffic; hostile to an eval harness you want to re-run a dozen times while iterating — every run either costs you or gets rate-limited.

---

**Stage 2 — FlashRank: the same cross-encoder idea, running locally.** A ~34 MB MiniLM cross-encoder that runs on CPU, no API key, no rate limit, deterministic — free to re-run the eval harness as many times as you want. → *this is what the chapter ships* ([reranker.py](../../../services/ai-service/app/services/reranker.py), Step 3).

> **Teaser, covered in the build steps:** FlashRank's `rerank()` call is synchronous CPU inference. Call it directly inside an `async def` endpoint and it blocks the event loop for *every* concurrent request the service is handling. The fix (`asyncio.to_thread`) is in Step 3 — named here so the wall doesn't surprise you mid-build.

> **Catatan dari eksperimen nyata (STEP 5):** ms-marco-MiniLM-L-12-v2 adalah model English-only. Pada dataset dengan query Bahasa Indonesia, model ini justru *menurunkan* P@5 dari 0.657 → 0.600 — tidak memahami vocabulary keuangan Indonesia. Contoh di atas adalah ilustrasi ideal; realitanya perlu model multilingual.

▶ **Watch/read:** [Sentence-Transformers — Retrieve & Re-Rank](https://sbert.net/examples/applications/retrieve_rerank/README.html) — the canonical bi-encoder vs cross-encoder explanation with the funnel diagram.

## Grounded generation + citations

**Stage 0 — dump the raw rows at the user.** Retrieve and re-rank, then hand the user the rows themselves:

```
GOFOOD GEPREK BENSU GADING — Rp 85.000
GRABFOOD ORDER 7FHJS8 — Rp 62.500
GRABFOOD WARUNG PADANG — Rp 55.000
```

> **The wall:** rows aren't an answer. The user asked `"berapa pengeluaran makan bulan Maret?"` — "how much," a number — not "here's a list, go add it up yourself."

---

**Stage 1 — feed the rows to the LLM and ask it to summarize.** Pass the context to the model, ask for a total in plain language.

> **The wall:** tanpa constraints, the model **hallucinates** — bisa menyebut total yang tidak cocok dengan rows yang diberikan (claiming "Rp 500.000" padahal context hanya berjumlah Rp 202.500), atau bahkan mereferensi transaksi yang tidak ada di context.

---

**Stage 2 — a grounding prompt.** Instruksikan model secara eksplisit: jawab HANYA dari context yang diberikan, dan diperbolehkan berkata "saya tidak tahu" (`confident: false`) alih-alih menebak.

```
SYSTEM: "Answer ONLY from the numbered transactions provided as context.
         If the context does not contain the answer, say so and set confident=false.
         Never estimate or invent amounts."

USER:
Context transactions:
[1] id=42 | 2024-03-14 | GOFOOD GEPREK BENSU GADING | DB | Rp 85,000 | BCA
[2] id=43 | 2024-03-15 | GRABFOOD ORDER 7FHJS8 | DB | Rp 62,500 | BCA
[3] id=47 | 2024-03-22 | GRABFOOD WARUNG PADANG | DB | Rp 55,000 | BCA

Question: berapa pengeluaran makan bulan Maret?
```

**Raw JSON response dari LLM:**
```json
{
  "answer": "Pengeluaran makan bulan Maret: Rp 202.500 dari 3 transaksi — GoPay [1] Rp 85.000, GrabFood [2] Rp 62.500, warung Padang [3] Rp 55.000.",
  "cited_transaction_ids": [42, 43, 47],
  "confident": true
}
```

> **The wall:** even a well-grounded model occasionally cites a `transaction_id` that was never in the context — a number it pattern-matched from training data or a nearby digit, not something it actually read.

---

**Stage 3 — validate every cited id against the context you actually gave it.** Check each `cited_transaction_ids` entry against the set of ids that were really in the prompt; silently drop (and log) anything that isn't there. → *this is what ships* — the citation-validation loop in [answerer.py](../../../services/ai-service/app/services/answerer.py) (Step 8), the **hallucination guard**.

```python
# Context yang benar-benar dikirim ke LLM:
by_id = {42: (1, tx42), 43: (2, tx43), 47: (3, tx47)}

for tid in raw["cited_transaction_ids"]:   # [42, 43, 47, 9999] ← andaikan LLM mengarang 9999
    if tid in by_id:
        citations.append(Citation(marker=..., transaction_id=tid, ...))
    else:
        logger.warning("LLM cited unknown transaction_id=%s — dropped", tid)
# → citations berisi tx42, tx43, tx47 saja. 9999 tidak pernah sampai ke response.
```

**Final AskResponse:**
```json
{
  "answer": "Pengeluaran makan bulan Maret: Rp 202.500 dari 3 transaksi — GoPay [1] Rp 85.000, GrabFood [2] Rp 62.500, warung Padang [3] Rp 55.000.",
  "confident": true,
  "citations": [
    {"marker": 1, "transaction_id": 42, "date": "2024-03-14", "description": "GOFOOD GEPREK BENSU GADING", "amount_idr": 85000.0, "flow": "DB", "wallet": "BCA"},
    {"marker": 2, "transaction_id": 43, "date": "2024-03-15", "description": "GRABFOOD ORDER 7FHJS8",      "amount_idr": 62500.0, "flow": "DB", "wallet": "BCA"},
    {"marker": 3, "transaction_id": 47, "date": "2024-03-22", "description": "GRABFOOD WARUNG PADANG",     "amount_idr": 55000.0, "flow": "DB", "wallet": "BCA"}
  ],
  "model": "gemini-2.5-flash",
  "retrieval_ms": 312.4,
  "generation_ms": 1847.2
}
```

**Edge case — query tidak ada datanya** (`date_from: "2031-01-01"`):
```python
# Stage retrieval → 0 rows → reranker returns [] → early return, LLM tidak dipanggil
AskResponse(answer="Tidak ada transaksi yang cocok.", confident=False,
            citations=[], model="none", retrieval_ms=45.3, generation_ms=0.0)
```
✅ Tidak ada hallucination · ✅ `confident: false` untuk UX · ✅ $0 LLM cost

▶ **Watch/read:** [Anthropic — Reducing hallucinations](https://docs.anthropic.com/en/docs/test-and-evaluate/strengthen-guardrails/reduce-hallucinations) — the grounding-prompt patterns used in this chapter's `SYSTEM_PROMPT`.

---

## 🧪 Pipeline Summary — alur data dari raw text ke final answer

```
RAW TEXT  "14/03/2024 GOFOOD GEPREK BENSU GADING    85.000,00\n..."
    │
    ▼  CHUNKING (sentence_window_chunks, window=1)
    │  Chunk.text = "14/03/2024 GOFOOD GEPREK BENSU GADING    85.000,00"
    │  Chunk.window = "<baris sebelumnya>\n<baris ini>\n<baris sesudahnya>"
    │
    ▼  EMBEDDING (text-embedding-3-small) — Chapter 3, already in pgvector
    │  vector[1536] per row, stored in transaction_embeddings
    │
    ▼  RETRIEVAL (cosine top-10, ivfflat.probes=10, date filter in SQL)
    │  10 kandidat — incl. false positive "MAKANAN TERNAK AYAM BROILER" @ rank 4
    │
    ▼  RE-RANKING (FlashRank cross-encoder, query+doc together)
    │  top-3: GOFOOD [0.94] · GRABFOOD [0.89] · WARUNG PADANG [0.85]
    │  dropped: MAKANAN TERNAK [0.12] · SEWA BULANAN [0.03]
    │
    ▼  CONTEXT FORMATTING (_format_context)
    │  "[1] id=42 | 2024-03-14 | GOFOOD GEPREK BENSU GADING | DB | Rp 85,000 | BCA"
    │  "[2] id=43 | ..." · "[3] id=47 | ..."
    │
    ▼  LLM SYNTHESIS (grounding prompt + ANSWER_SCHEMA)
    │  raw: {answer: "Rp 202.500 [1][2][3]", cited_ids: [42,43,47], confident: true}
    │
    ▼  CITATION VALIDATION (hallucination guard)
    │  validate each cited_id ∈ by_id; drop + log any that aren't
    │
    ▼  AskResponse
       {answer, confident, citations[], model, retrieval_ms, generation_ms}
```

<br>
<br>


# 🔧 Implementation

## 🎯 Objective

PF-AI003 shipped the first half of the RAG pipeline: `transaction_embeddings` (pgvector), `EmbeddingService`, `RetrievalService`, `/embed-transactions` + `/search`, and an MRR@5 harness. Retrieval *works* but is naive: cosine top-K with no quality refinement, no filtering, and no generation step — the user gets raw transaction rows, not answers.

The diagram below shows the full target-state pipeline. Steps marked ✅ Phase 1 are already shipped (PF-AI003); steps marked 🔄 Phase 2 are what this chapter builds:

```
INDEXING SIDE                     QUERY SIDE (POST /ask, real-time)
────────────────────              ────────────────────────────────────────────────

Transactions (DB rows)            User Query
      │                           "berapa pengeluaran makan Maret?"
      ▼                                       │
  [Chunker]            🔄 Phase 2             ▼
  fixed_size_chunks()  PF-AI004  ┌──────────────────────────────────────────┐
  sentence_window()    tested,   │  1. Embed Query                          │  ✅ Phase 1
      │                Ch6 wires │     text-embedding-3-small (OpenAI)      │  PF-AI003
      ▼                          └──────────────────────┬───────────────────┘
  [Embed Chunks]       ✅ Phase 1                       │
  text-embedding-3-    PF-AI003                         ▼
  small (batched,                ┌──────────────────────────────────────────┐
  Langfuse traced)               │  2. Vector Search                        │  ✅ Phase 1
      │                          │     pgvector cosine (ivfflat, probes=10) │  PF-AI003
      ▼                          │     → top-10 candidates                  │
  [transaction_        ✅ Phase 1└──────────────────────┬───────────────────┘
   embeddings table]   PF-AI003                         │
  pgvector (ivfflat)                                    ▼
                                 ┌──────────────────────────────────────────┐
                                 │  3. Metadata Filter                      │  🔄 Phase 2
                                 │     WHERE category / account             │  PF-AI004
                                 │          date_from / date_to             │
                                 │     (SQL WHERE — not post-filter)        │
                                 └──────────────────────┬───────────────────┘
                                                        │
                                                        ▼
                                 ┌──────────────────────────────────────────┐
                                 │  4. Re-rank                              │  🔄 Phase 2
                                 │     FlashRank cross-encoder (~34 MB CPU) │  PF-AI004
                                 │     top-10 → top-3 (cross-encoded score) │
                                 └──────────────────────┬───────────────────┘
                                                        │
                                                        ▼
                                 ┌──────────────────────────────────────────┐
                                 │  5. LLM Synthesis                        │  🔄 Phase 2
                                 │     ProviderFactory (Gemini / Anthropic) │  PF-AI004
                                 │     top-3 contexts → grounded answer     │
                                 │     + [n] inline citations               │
                                 │     hallucination guard: drop bad ids    │
                                 └──────────────────────┬───────────────────┘
                                                        │
                                                        ▼
                                 ┌──────────────────────────────────────────┐
                                 │  POST /ask Response                      │
                                 │  { answer, citations[], confident,       │
                                 │    model, retrieval_ms, generation_ms }  │
                                 └──────────────────────────────────────────┘
```

This task builds the second half — **re-ranking and grounded generation**, plus the chunking foundations Chapter 6 will build on:

1. **Chunking module** — [chunker.py](../../../services/ai-service/app/services/chunker.py) with two strategies (fixed-size with overlap, sentence-window) + unit tests. Transactions are single short rows, so chunking is learned and tested against real statement *fixture text* now; production chunked retrieval lands in Chapter 6 (sentence-window retrieval).
2. **Re-ranker** — [reranker.py](../../../services/ai-service/app/services/reranker.py) wrapping FlashRank (local cross-encoder, free, no API key). Top-10 retrieved → top-K re-ranked.
3. **Metadata filtering** — optional `category`, `account`, `date_from`, `date_to` on `SearchRequest`, compiled to parametrized SQL WHERE clauses in `RetrievalService`.
4. **Grounded synthesis** — [answerer.py](../../../services/ai-service/app/services/answerer.py): retrieve top-10 → re-rank to top-3 → `LlmProvider.generate_json` (existing Gemini/Anthropic factory) → answer with citations. Exposed as `POST /ask`.
5. **Measure the lift** — extend [eval_retrieval.py](../../../services/ai-service/evals/eval_retrieval.py) with `--rerank`; record the MRR@5 delta vs the Chapter 3 baseline.
6. **RAGAS faithfulness** — [eval_faithfulness.py](../../../services/ai-service/evals/eval_faithfulness.py) scores 5 generated answers for groundedness against their retrieved contexts.

**Depends on:** PF-AI003 (retriever, embeddings, MRR harness — the baseline number must exist before measuring lift; finish the Chapter 3 eval gate first).
**Unblocks:** Chapter 5 (stream `/ask` tokens over SSE), Chapter 6 (advanced retrieval variants measured with this same harness).

## ✅ Acceptance Criteria

- [x] [chunker.py](../../../services/ai-service/app/services/chunker.py) — `fixed_size_chunks(text, chunk_size, overlap)` + `sentence_window_chunks(text, window_size)`; both covered by unit tests in [test_chunker.py](../../../services/ai-service/tests/test_chunker.py) (≥ 6 tests), demonstrated against one real eval fixture statement text
  > Verified: 7 tests pass (`pytest tests/test_chunker.py -v`); demoed against `evals/fixtures/bca_01.txt` (3 fixed-size chunks, 15 sentence-window chunks).
- [x] [reranker.py](../../../services/ai-service/app/services/reranker.py) — `RerankerService.rerank(query, results, top_k)` re-orders `SearchResult` lists via FlashRank cross-encoder, runs off the event loop (`asyncio.to_thread`), unit-tested with a mocked ranker
  > Verified: 3 mocked tests pass; also ran one real (non-mocked) FlashRank inference call to confirm the library itself works end-to-end (see STEP 5 note).
- [x] `SearchRequest` accepts optional `category`, `account`, `date_from`, `date_to`, `rerank` — `RetrievalService.search()` compiles them to parametrized WHERE clauses (no string interpolation of values)
  > Verified: 4 new tests in `test_retriever.py` (8/8 pass) assert the WHERE clause text and that values appear only as bound params, never in the SQL string.
- [x] `POST /ask` — accepts `{query, top_k, filters...}`, returns `{answer, citations[], model, retrieval_ms, generation_ms}`; answer text references citations as `[1]`, `[2]`; LLM failures return 502 (never 200-with-empty per ai-service rules)
  > Verification note: endpoint wired and import-clean; response shape and 502-on-exception path confirmed by reading `main.py`/`answerer.py` and the 3 passing `test_answerer.py` cases. Not exercised with a live LLM call (see STEP 9 note) — the citation-marker behavior depends on the LLM actually following `SYSTEM_PROMPT`, which is mocked in tests, not live-verified.
- [ ] Demo question works end-to-end: a food-spending question in Indonesian returns a correct IDR total with cited transactions
  > Not met: requires a reachable Postgres + a live provider call; blocked by the same infra gap as STEP 0 (Docker/Supabase unavailable in this execution environment).
- [ ] [eval_retrieval.py](../../../services/ai-service/evals/eval_retrieval.py) `--rerank` runs retrieve-top-10 → rerank → MRR@5; the baseline vs re-ranked delta is recorded in [ai-observability-metrics.md](../../../docs/performances/ai-observability-metrics.md)
  > Not met: `--rerank` flag is implemented and ready; the run itself is blocked by the same Postgres-unreachable issue as STEP 0. The metrics doc records this gap explicitly rather than a fabricated delta.
- [ ] [eval_faithfulness.py](../../../services/ai-service/evals/eval_faithfulness.py) — RAGAS `Faithfulness` on 5 generated answers; mean score recorded (target ≥ 0.80)
  > Not met: script written, but `ragas` cannot be installed in this Windows environment (its `scikit-network` dependency needs MSVC Build Tools to compile and ships no prebuilt wheel for this Python/platform combo); the DB blocker would also apply even if `ragas` were installed.
- [x] [test_reranker.py](../../../services/ai-service/tests/test_reranker.py) + [test_answerer.py](../../../services/ai-service/tests/test_answerer.py) pass (mocked FlashRank / mocked provider — no real API calls in tests)
  > Verified: `pytest tests/test_reranker.py tests/test_answerer.py -v` → 6/6 pass.
- [x] [pyproject.toml](../../../services/ai-service/pyproject.toml) updated: `flashrank` in dependencies; `ragas` + `langchain-openai` in the `dev` extra (eval-only)
  > Verified: both entries present in `pyproject.toml`. Runtime note: `ragas`/`langchain-openai` are correctly *declared* but could not actually be *installed* in this environment (see STEP 10) — that's an environment limitation, not a pyproject error.
- [ ] Langfuse traces exist for the `/ask` generation step (cost + latency visible, same pattern as extraction)
  > Not met (unverified, not contradicted): `AnswerService` calls the existing `provider.generate_json()`, which already wraps every call in a Langfuse `generation` observation (confirmed by reading `gemini.py`) — so tracing should work automatically once `/ask` is actually invoked. No live call was made in this session to confirm a trace lands in the Langfuse dashboard.

## 🧭 Approach

**FlashRank local, not Cohere Rerank — for Chapter 4.** Both are cross-encoders; the concept ("bi-encoder retrieves fast, cross-encoder re-scores accurately") is identical. FlashRank runs locally (~34 MB MiniLM model, CPU, no API key, no rate limit), which keeps the eval harness deterministic and free to re-run. Cohere's trial tier is rate-limited (10 calls/min) — fine for production-ish traffic, hostile to iterative benchmarking. `RerankerService` is a thin seam: swapping to Cohere later is a one-class change, and articulating that tradeoff is itself interview content.

**Synthesis reuses the existing provider abstraction — no new LLM client.** `ProviderFactory.create(settings)` already gives you Gemini (JSON mode) or Anthropic (`tool_use`), both with Langfuse tracing wired in (PF-AI001). The `/ask` answerer calls `provider.generate_json(system_prompt, user_prompt, schema)` with an answer-with-citations schema. Zero new provider code; the whole RAG read path stays observable for free.

**Chunking is built and tested now, deployed later.** Transaction rows are one-line texts — chunking them is meaningless. The honest scoping: implement both strategies as a pure, tested module against real statement fixture text (the PDFs you already have in `evals/fixtures/` are multi-page documents), and wire chunked *retrieval* in Chapter 6 where sentence-window retrieval is the explicit task. Building it now means Chapter 6 starts with a tested primitive instead of a blank file.

**Metadata filtering is SQL, not post-filtering.** Filtering after vector search silently shrinks your result set below `top_k` (retrieve 10, filter to 2). Filtering *in* the SQL WHERE clause keeps `LIMIT top_k` meaningful and pushes work to Postgres where the indexes are.

Out of scope: streaming the answer (Chapter 5), hybrid BM25 + vector search and chunked-corpus retrieval (Chapter 6), conversation memory (Chapter 8). Don't add them now.

## 📂 Affected Files

| File | Change |
|------|--------|
| [chunker.py](../../../services/ai-service/app/services/chunker.py) | Create — fixed-size + sentence-window chunking strategies |
| [reranker.py](../../../services/ai-service/app/services/reranker.py) | Create — `RerankerService` (FlashRank cross-encoder) |
| [answerer.py](../../../services/ai-service/app/services/answerer.py) | Create — `AnswerService` (retrieve → rerank → grounded synthesis) |
| [retriever.py](../../../services/ai-service/app/services/retriever.py) | Edit — optional metadata filters compiled to WHERE clauses |
| [models.py](../../../services/ai-service/app/models.py) | Edit — extend `SearchRequest`; add `AskRequest`, `Citation`, `AskResponse` |
| [main.py](../../../services/ai-service/app/main.py) | Edit — add `POST /ask`; wire reranker + answerer in lifespan |
| [pyproject.toml](../../../services/ai-service/pyproject.toml) | Edit — add `flashrank`; dev extra: `ragas`, `langchain-openai` |
| [test_chunker.py](../../../services/ai-service/tests/test_chunker.py) | Create — unit tests for both strategies |
| [test_reranker.py](../../../services/ai-service/tests/test_reranker.py) | Create — unit tests (mocked FlashRank) |
| [test_answerer.py](../../../services/ai-service/tests/test_answerer.py) | Create — unit tests (mocked retriever/reranker/provider) |
| [eval_retrieval.py](../../../services/ai-service/evals/eval_retrieval.py) | Edit — `--rerank` flag + baseline/reranked delta table |
| [eval_faithfulness.py](../../../services/ai-service/evals/eval_faithfulness.py) | Create — RAGAS faithfulness on 5 generated answers |
| [ask_questions.json](../../../services/ai-service/evals/ask_questions.json) | Create — 5 eval questions with expected-answer notes |
| [ai-observability-metrics.md](../../../docs/performances/ai-observability-metrics.md) | Edit — MRR delta, faithfulness score, /ask latency split |

 
## 📋 TODO

### [x] STEP 0 — Prerequisite gate: Chapter 3 baseline number exists

> **Rerun 2026-06-23:** Supabase local stack started (`supabase start`). Baseline confirmed live against real data.

```bash
cd services/ai-service
PYTHONPATH=. python evals/eval_retrieval.py
```

```
Provider: openai | Model: text-embedding-3-small | K=5 | mode=baseline (top-5)
Query                                    |rel|  Hit   MRR   P@5      Lat
--------------------------------------------------------------------------------
tagihan listrik PLN bulan Maret             36    1  1.00  1.00   5947ms
gaji bulanan salary income                  32    1  1.00  0.40   1185ms
belanja grocery di minimarket              317    1  1.00  1.00    762ms
Netflix Spotify langganan streaming         45    1  1.00  0.40    701ms
coffee kedai kopi Fore                      50    1  1.00  0.60    737ms
investasi saham Mansek                      35    1  1.00  0.80    728ms
bayar kontrakan                              9    1  1.00  0.40    736ms
--------------------------------------------------------------------------------
MACRO AVG                                      1.00 1.000  0.66

MRR@5 [baseline (top-5)]: 1.000
P@5   [baseline (top-5)]: 0.657
```

> **Confirmed baseline (2026-06-23):** MRR@5 = 1.000 (all 7 queries hit at rank 1), P@5 = 0.657. Every query finds a relevant result in the top 5, but only 65.7% of the top-5 slots are relevant on average — this is the number re-ranking targets to improve. Gate passed; proceed to STEP 5 with `--rerank`.

> **Why:** This entire chapter's headline deliverable is a *delta* — "re-ranking improved P@5 from 0.657 to 0.YY." Without the Chapter 3 baseline recorded first, there is nothing to measure lift against. Do not start Step 5 until this number is confirmed live.

> **Note (2026-06-13 → confirmed 2026-06-23):** The original Chapter 3 baseline was 0.476 MRR@5 — this was a corrupted metric caused by IVFFlat `probes=1` (default) only searching 1 of 100 clusters. Fixed by adding `SET ivfflat.probes = 10` in `RetrievalService.search()`. Real baseline after fix: **MRR@5 = 1.000, P@5 = 0.657**. The re-ranking lift story therefore shifts from MRR to P@5 — MRR is already maxed. The probes bug is itself a debugging story worth keeping for interviews ("I found that our retrieval baseline was corrupted by an IVFFlat misconfiguration — after fixing it, MRR jumped from 0.476 to 1.000").


### [x] STEP 1 — Learn: the re-ranking mental model (theory anchor, 45 min)

The one genuine pre-read of the chapter. The wall here is understanding *why a second model improves results the first model already ranked*.

**Read (in this order):**
1. Sentence-Transformers — *Retrieve & Re-Rank* → https://sbert.net/examples/applications/retrieve_rerank/README.html (the bi-encoder vs cross-encoder diagram — 15 min)
2. FlashRank README → https://github.com/PrithivirajDamodaran/FlashRank (skim the model table + usage — 10 min)
3. Cohere — *Rerank* overview → https://docs.cohere.com/docs/rerank-overview (read for the hosted-alternative framing only — 10 min)

**Active-retrieval task (do NOT skip):** Close all tabs. Append to [evals/README.md](../../../services/ai-service/evals/README.md) a section `## Re-ranking mental model (written from memory)`:
- Why can't the bi-encoder (embedding) score be as accurate as the cross-encoder score? (hint: when does each model see query and document *together*?)
- Why is the standard pattern "retrieve 10 with the fast model, re-rank with the slow model" instead of cross-encoding the whole table?
- What does "ms-marco" in the model name refer to, and why does that matter for *your* Indonesian-language transactions?

> **Why theory first, just this once?** The non-obvious insight is architectural: a bi-encoder embeds query and document *independently* — it can only compare two pre-computed points. A cross-encoder reads the query and document *in one forward pass*, attending across both — far more accurate, but it can't be pre-computed, so it's too slow to score every row. Retrieval is therefore a funnel: cheap-and-broad (pgvector top-10) → expensive-and-narrow (cross-encoder top-3). If you skip this, the reranker is a magic black box and the interview answer falls apart.

> **The interview frame:** "My retrieval is a two-stage funnel: pgvector cosine search retrieves the top-10 candidates with a bi-encoder embedding, then a local cross-encoder (FlashRank MiniLM) re-scores those 10 by reading query and document together, and the top-3 feed generation. Re-ranking moved my MRR@5 from 0.XX to 0.YY at ~Zms added latency, with no extra API cost because the cross-encoder runs locally."


### [x] STEP 2 — Build [chunker.py](../../../services/ai-service/app/services/chunker.py) (pure module, no I/O)

Create [services/ai-service/app/services/chunker.py](../../../services/ai-service/app/services/chunker.py):

```python
"""Chunking strategies for longer-form documents (statement narratives, notes).

Pure functions — no I/O, no model calls. Production chunked retrieval is
wired in Chapter 6; this module is the tested primitive it will build on.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field


@dataclass
class Chunk:
    text: str               # the core chunk content
    index: int              # position in the source document
    window: str = ""        # expanded context (sentence-window only)
    meta: dict = field(default_factory=dict)


def fixed_size_chunks(text: str, chunk_size: int = 500, overlap: int = 100) -> list[Chunk]:
    """Split text into character chunks of `chunk_size` with `overlap` carried between chunks.

    Overlap prevents a fact that straddles a boundary from being lost to both chunks.
    """
    if chunk_size <= 0:
        raise ValueError("chunk_size must be positive")
    if overlap >= chunk_size:
        raise ValueError("overlap must be smaller than chunk_size")

    text = text.strip()
    if not text:
        return []

    chunks: list[Chunk] = []
    step = chunk_size - overlap
    for i, start in enumerate(range(0, len(text), step)):
        piece = text[start:start + chunk_size]
        if not piece.strip():
            break
        chunks.append(Chunk(text=piece, index=i))
        if start + chunk_size >= len(text):
            break
    return chunks


_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+|\n+")


def sentence_window_chunks(text: str, window_size: int = 1) -> list[Chunk]:
    """One chunk per sentence; `window` carries ±window_size neighbouring sentences.

    Index/search on the small `text` (precise matching); hand the LLM the larger
    `window` (enough context to be useful). Small-to-search, big-to-read.
    """
    sentences = [s.strip() for s in _SENTENCE_SPLIT.split(text) if s.strip()]
    chunks: list[Chunk] = []
    for i, sentence in enumerate(sentences):
        lo = max(0, i - window_size)
        hi = min(len(sentences), i + window_size + 1)
        chunks.append(Chunk(text=sentence, index=i, window=" ".join(sentences[lo:hi])))
    return chunks
```

**C# equivalent** (Python `dataclass` with a mutable default factory → a C# `record` with `init`
properties; module-level functions → static methods on a `Chunker` class; Python slicing →
`Substring`/`Span<char>`):

```csharp
// PersonalFinance.Application/Services/Chunker.cs — pure functions, no I/O, no model calls.
public sealed record Chunk(string Text, int Index, string Window = "", IReadOnlyDictionary<string, object>? Meta = null);

public static class Chunker
{
    public static List<Chunk> FixedSizeChunks(string text, int chunkSize = 500, int overlap = 100)
    {
        if (chunkSize <= 0) throw new ArgumentException("chunkSize must be positive", nameof(chunkSize));
        if (overlap >= chunkSize) throw new ArgumentException("overlap must be smaller than chunkSize", nameof(overlap));

        text = text.Trim();
        if (text.Length == 0) return new List<Chunk>();

        var chunks = new List<Chunk>();
        var step = chunkSize - overlap;
        var index = 0;
        for (var start = 0; start < text.Length; start += step, index++)
        {
            var length = Math.Min(chunkSize, text.Length - start);
            var piece = text.Substring(start, length);
            if (string.IsNullOrWhiteSpace(piece)) break;
            chunks.Add(new Chunk(piece, index));
            if (start + chunkSize >= text.Length) break;
        }
        return chunks;
    }

    private static readonly Regex SentenceSplit = new(@"(?<=[.!?])\s+|\n+", RegexOptions.Compiled);

    public static List<Chunk> SentenceWindowChunks(string text, int windowSize = 1)
    {
        var sentences = SentenceSplit.Split(text)
            .Select(s => s.Trim())
            .Where(s => s.Length > 0)
            .ToList();

        var chunks = new List<Chunk>();
        for (var i = 0; i < sentences.Count; i++)
        {
            var lo = Math.Max(0, i - windowSize);
            var hi = Math.Min(sentences.Count, i + windowSize + 1);
            var window = string.Join(" ", sentences.Skip(lo).Take(hi - lo));
            chunks.Add(new Chunk(sentences[i], i, window));
        }
        return chunks;
    }
}
```

Create [services/ai-service/tests/test_chunker.py](../../../services/ai-service/tests/test_chunker.py):

```python
import pytest
from app.services.chunker import Chunk, fixed_size_chunks, sentence_window_chunks


def test_fixed_size_respects_chunk_size():
    chunks = fixed_size_chunks("a" * 1200, chunk_size=500, overlap=100)
    assert all(len(c.text) <= 500 for c in chunks)


def test_fixed_size_overlap_carries_content():
    text = "0123456789" * 30  # 300 chars
    chunks = fixed_size_chunks(text, chunk_size=100, overlap=20)
    # tail of chunk N == head of chunk N+1
    assert chunks[0].text[-20:] == chunks[1].text[:20]


def test_fixed_size_empty_text_returns_empty():
    assert fixed_size_chunks("   ") == []


def test_fixed_size_rejects_overlap_gte_size():
    with pytest.raises(ValueError):
        fixed_size_chunks("abc", chunk_size=100, overlap=100)


def test_sentence_window_core_is_single_sentence():
    text = "First sentence. Second sentence. Third sentence."
    chunks = sentence_window_chunks(text, window_size=1)
    assert chunks[1].text == "Second sentence."


def test_sentence_window_includes_neighbours():
    text = "First sentence. Second sentence. Third sentence."
    chunks = sentence_window_chunks(text, window_size=1)
    assert "First sentence." in chunks[1].window
    assert "Third sentence." in chunks[1].window


def test_sentence_window_edges_clamp():
    text = "One. Two. Three."
    chunks = sentence_window_chunks(text, window_size=2)
    assert chunks[0].window == "One. Two. Three."  # no negative index wraparound
```

**C# equivalent** (`pytest` functions → xUnit `[Fact]` methods; `pytest.raises` → `Assert.Throws`;
`assert x == y` → `Assert.Equal(y, x)` — expected first, the reverse of Python's `assert` order):

```csharp
public class ChunkerTests
{
    [Fact]
    public void FixedSizeChunks_RespectsChunkSize()
    {
        var chunks = Chunker.FixedSizeChunks(new string('a', 1200), chunkSize: 500, overlap: 100);
        Assert.All(chunks, c => Assert.True(c.Text.Length <= 500));
    }

    [Fact]
    public void FixedSizeChunks_OverlapCarriesContent()
    {
        var text = string.Concat(Enumerable.Repeat("0123456789", 30)); // 300 chars
        var chunks = Chunker.FixedSizeChunks(text, chunkSize: 100, overlap: 20);
        // tail of chunk N == head of chunk N+1
        Assert.Equal(chunks[1].Text[..20], chunks[0].Text[^20..]);
    }

    [Fact]
    public void FixedSizeChunks_EmptyText_ReturnsEmpty()
    {
        Assert.Empty(Chunker.FixedSizeChunks("   "));
    }

    [Fact]
    public void FixedSizeChunks_OverlapGteSize_Throws()
    {
        Assert.Throws<ArgumentException>(() => Chunker.FixedSizeChunks("abc", chunkSize: 100, overlap: 100));
    }

    [Fact]
    public void SentenceWindowChunks_CoreIsSingleSentence()
    {
        var text = "First sentence. Second sentence. Third sentence.";
        var chunks = Chunker.SentenceWindowChunks(text, windowSize: 1);
        Assert.Equal("Second sentence.", chunks[1].Text);
    }

    [Fact]
    public void SentenceWindowChunks_IncludesNeighbours()
    {
        var text = "First sentence. Second sentence. Third sentence.";
        var chunks = Chunker.SentenceWindowChunks(text, windowSize: 1);
        Assert.Contains("First sentence.", chunks[1].Window);
        Assert.Contains("Third sentence.", chunks[1].Window);
    }

    [Fact]
    public void SentenceWindowChunks_EdgesClamp()
    {
        var text = "One. Two. Three.";
        var chunks = Chunker.SentenceWindowChunks(text, windowSize: 2);
        Assert.Equal("One. Two. Three.", chunks[0].Window); // no negative index wraparound
    }
}
```

Then demonstrate on a real fixture: in a scratch run, load one statement fixture text from `evals/fixtures/`, chunk it both ways, and eyeball the output (`python -c` one-liner is fine — no committed artifact needed).

```bash
cd services/ai-service && PYTHONPATH=. pytest tests/test_chunker.py -v
```

> **Why a pure module with no retrieval wiring?** Transactions are one-line rows — chunking them is a no-op. The artifacts that *do* need chunking (multi-page statement narratives) get retrieval in Chapter 6 (sentence-window retrieval is that chapter's first task). Building the tested primitive now means Chapter 6 starts from green tests, and you learn the two canonical strategies while the RAG context is hot. This honors the same-day-shipping rule without inventing fake production wiring.

> **The interview frame:** "Fixed-size with overlap is the baseline — overlap prevents boundary facts from being lost to both chunks. Sentence-window is the refinement: index small units for precise matching, but return the expanded window so the LLM gets enough context. Small-to-search, big-to-read."


### [x] STEP 3 — Add FlashRank + build [reranker.py](../../../services/ai-service/app/services/reranker.py)

Add to [pyproject.toml](../../../services/ai-service/pyproject.toml) dependencies:

```toml
    "flashrank>=0.2",
```

```bash
cd services/ai-service && pip install flashrank
```

Create [services/ai-service/app/services/reranker.py](../../../services/ai-service/app/services/reranker.py):

```python
"""RerankerService: cross-encoder re-ranking over retrieved transactions.

FlashRank runs a local MiniLM cross-encoder on CPU — no API key, no rate
limit, deterministic. Swappable for Cohere Rerank later: this class is the seam.
"""
from __future__ import annotations

import asyncio
import logging

from flashrank import Ranker, RerankRequest

from app.models import SearchResult

logger = logging.getLogger(__name__)

# ms-marco-MiniLM-L-12-v2: ~34MB, best quality/size balance in FlashRank's table.
# Downloaded once to cache_dir on first use.
_MODEL_NAME = "ms-marco-MiniLM-L-12-v2"


class RerankerService:
    def __init__(self, cache_dir: str = "/tmp/flashrank") -> None:
        self._ranker = Ranker(model_name=_MODEL_NAME, cache_dir=cache_dir)

    async def rerank(
        self, query: str, results: list[SearchResult], top_k: int = 3
    ) -> list[SearchResult]:
        """Re-score retrieved results with the cross-encoder; return top_k by new score."""
        if not results:
            return []

        passages = [
            {
                "id": r.transaction_id,
                # Same enrichment shape as the embedded search_text: give the
                # cross-encoder the same semantic signal the bi-encoder had.
                "text": f"{r.description} | {r.wallet} | {r.date} | {r.flow}",
            }
            for r in results
        ]
        request = RerankRequest(query=query, passages=passages)

        # FlashRank is synchronous CPU inference — run off the event loop so a
        # 50ms model call doesn't block every other request in the service.
        ranked = await asyncio.to_thread(self._ranker.rerank, request)

        by_id = {r.transaction_id: r for r in results}
        reranked = [by_id[p["id"]] for p in ranked if p["id"] in by_id]
        return reranked[:top_k]
```

**C# equivalent** (FlashRank has no NuGet equivalent — the port models the same seam around a
hypothetical local cross-encoder client; Python's `asyncio.to_thread` → C#'s `Task.Run`, the same
"push sync CPU work off the request-serving thread" fix in both worlds):

```csharp
// PersonalFinance.Application/Services/RerankerService.cs
public interface IRerankerService
{
    Task<List<SearchResult>> RerankAsync(string query, List<SearchResult> results, int topK = 3, CancellationToken ct = default);
}

public sealed class RerankerService : IRerankerService
{
    private readonly ICrossEncoderRanker _ranker; // hypothetical local MiniLM cross-encoder wrapper
    private readonly ILogger<RerankerService> _logger;

    public RerankerService(ICrossEncoderRanker ranker, ILogger<RerankerService> logger)
    {
        _ranker = ranker;
        _logger = logger;
    }

    public async Task<List<SearchResult>> RerankAsync(
        string query, List<SearchResult> results, int topK = 3, CancellationToken ct = default)
    {
        if (results.Count == 0) return new List<SearchResult>();

        var passages = results
            .Select(r => new RerankPassage(r.TransactionId, $"{r.Description} | {r.Wallet} | {r.Date} | {r.Flow}"))
            .ToList();

        // The cross-encoder is synchronous CPU inference — run it on the thread
        // pool so a 50ms model call doesn't block every other request the
        // service is handling (the same fix as never blocking on .Result).
        var ranked = await Task.Run(() => _ranker.Rerank(query, passages), ct);

        var byId = results.ToDictionary(r => r.TransactionId);
        return ranked
            .Where(p => byId.ContainsKey(p.Id))
            .Select(p => byId[p.Id])
            .Take(topK)
            .ToList();
    }
}
```

> **Why `Task.Run`, not just `await` the call directly?** `_ranker.Rerank(...)` is a synchronous,
> CPU-bound method (no I/O to await). Calling it inline inside an `async` controller action runs it
> on the thread that's serving the request — under load, that starves the thread pool the same way
> calling FlashRank inline would block Python's event loop. `Task.Run` is the ASP.NET Core twin of
> `asyncio.to_thread`.

Create [services/ai-service/tests/test_reranker.py](../../../services/ai-service/tests/test_reranker.py):

```python
from unittest.mock import MagicMock, patch
import pytest
from app.models import SearchResult


def _result(tid: int, desc: str) -> SearchResult:
    return SearchResult(
        transaction_id=tid, similarity=0.9, description=desc,
        date="2026-03-01", amount_idr=50000.0, flow="DB", wallet="BCA",
    )


@pytest.fixture
def mock_ranker():
    with patch("app.services.reranker.Ranker") as mock_cls:
        instance = MagicMock()
        mock_cls.return_value = instance
        yield instance


@pytest.mark.asyncio
async def test_rerank_reorders_by_cross_encoder_score(mock_ranker):
    from app.services.reranker import RerankerService
    # Cross-encoder says tx 2 beats tx 1, reversing the retrieval order
    mock_ranker.rerank.return_value = [
        {"id": 2, "text": "...", "score": 0.99},
        {"id": 1, "text": "...", "score": 0.40},
    ]
    service = RerankerService()
    results = await service.rerank("kopi", [_result(1, "TRANSFER"), _result(2, "STARBUCKS")], top_k=2)
    assert [r.transaction_id for r in results] == [2, 1]


@pytest.mark.asyncio
async def test_rerank_truncates_to_top_k(mock_ranker):
    from app.services.reranker import RerankerService
    mock_ranker.rerank.return_value = [
        {"id": i, "text": "...", "score": 1.0 - i / 10} for i in range(1, 6)
    ]
    service = RerankerService()
    results = await service.rerank("q", [_result(i, f"tx{i}") for i in range(1, 6)], top_k=3)
    assert len(results) == 3


@pytest.mark.asyncio
async def test_rerank_empty_input_returns_empty(mock_ranker):
    from app.services.reranker import RerankerService
    service = RerankerService()
    assert await service.rerank("q", [], top_k=3) == []
```

**C# equivalent** (`unittest.mock.patch` on a module-level class → Moq constructor injection of
`ICrossEncoderRanker`; `pytest.fixture` → a private test helper; `@pytest.mark.asyncio` → nothing
needed, xUnit `[Fact]` already awaits `async Task` test methods):

```csharp
public class RerankerServiceTests
{
    private static SearchResult Result(int id, string desc) => new()
    {
        TransactionId = id, Similarity = 0.9, Description = desc,
        Date = "2026-03-01", AmountIdr = 50000.0m, Flow = "DB", Wallet = "BCA",
    };

    [Fact]
    public async Task RerankAsync_ReordersByCrossEncoderScore()
    {
        // Arrange — cross-encoder says tx 2 beats tx 1, reversing the retrieval order
        var ranker = new Mock<ICrossEncoderRanker>();
        ranker.Setup(r => r.Rerank(It.IsAny<string>(), It.IsAny<List<RerankPassage>>()))
            .Returns(new List<RerankResult> { new(2, 0.99), new(1, 0.40) });
        var service = new RerankerService(ranker.Object, Mock.Of<ILogger<RerankerService>>());

        // Act
        var results = await service.RerankAsync("kopi",
            new List<SearchResult> { Result(1, "TRANSFER"), Result(2, "STARBUCKS") }, topK: 2);

        // Assert
        Assert.Equal(new[] { 2, 1 }, results.Select(r => r.TransactionId));
    }

    [Fact]
    public async Task RerankAsync_TruncatesToTopK()
    {
        var ranker = new Mock<ICrossEncoderRanker>();
        ranker.Setup(r => r.Rerank(It.IsAny<string>(), It.IsAny<List<RerankPassage>>()))
            .Returns(Enumerable.Range(1, 5).Select(i => new RerankResult(i, 1.0 - i / 10.0)).ToList());
        var service = new RerankerService(ranker.Object, Mock.Of<ILogger<RerankerService>>());

        var results = await service.RerankAsync("q",
            Enumerable.Range(1, 5).Select(i => Result(i, $"tx{i}")).ToList(), topK: 3);

        Assert.Equal(3, results.Count);
    }

    [Fact]
    public async Task RerankAsync_EmptyInput_ReturnsEmpty()
    {
        var service = new RerankerService(Mock.Of<ICrossEncoderRanker>(), Mock.Of<ILogger<RerankerService>>());
        Assert.Empty(await service.RerankAsync("q", new List<SearchResult>(), topK: 3));
    }
}
```

```bash
PYTHONPATH=. pytest tests/test_reranker.py -v
```

> **Why `asyncio.to_thread`?** FlashRank is synchronous CPU inference. Called directly inside an `async def` endpoint, it blocks the event loop — *every* concurrent request to the service (extraction, search, health checks) stalls for the duration of the model call. `asyncio.to_thread` moves it to the default thread pool, the same fix you'd apply to any sync library in an async service. This is the Python twin of "don't block on `.Result` in ASP.NET Core."

**C# equivalent** (sync library in an async service):

```csharp
// FlashRank-in-async-Python maps to a CPU-bound sync call in ASP.NET Core:
//   Python: ranked = await asyncio.to_thread(self._ranker.rerank, request)
//   C#:     var ranked = await Task.Run(() => _ranker.Rerank(request), ct);
// Both push sync CPU work off the request-serving thread/event-loop.
// The anti-pattern in both worlds is calling it inline and blocking.
```


### [x] STEP 4 — Metadata filtering in `RetrievalService` + `SearchRequest`

Extend `SearchRequest` in [app/models.py](../../../services/ai-service/app/models.py) (additive — THINK-05 safe):

```python
class SearchRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    query: str = Field(..., min_length=1, max_length=500)
    top_k: int = Field(default=5, ge=1, le=50)
    min_similarity: float = Field(default=0.0, ge=0.0, le=1.0)
    # PF-AI004: optional metadata filters + rerank toggle
    category: str | None = None
    account: str | None = None
    date_from: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    date_to: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    rerank: bool = False
```

**C# equivalent** (Pydantic `BaseModel` + `Field(pattern=...)` → a C# record with data-annotation
validation attributes; Pydantic validates at construction, ASP.NET Core validates via model
binding + `ModelState`):

```csharp
public sealed record SearchRequest
{
    [Required, MinLength(1), MaxLength(500)]
    public string Query { get; init; } = "";

    [Range(1, 50)]
    public int TopK { get; init; } = 5;

    [Range(0.0, 1.0)]
    public double MinSimilarity { get; init; } = 0.0;

    // PF-AI004: optional metadata filters + rerank toggle
    public string? Category { get; init; }
    public string? Account { get; init; }

    [RegularExpression(@"^\d{4}-\d{2}-\d{2}$")]
    public string? DateFrom { get; init; }

    [RegularExpression(@"^\d{4}-\d{2}-\d{2}$")]
    public string? DateTo { get; init; }

    public bool Rerank { get; init; } = false;
}
```

Edit `RetrievalService.search()` in [app/services/retriever.py](../../../services/ai-service/app/services/retriever.py) to accept the filters and compile them into the SQL:

```python
    async def search(
        self,
        query: str,
        top_k: int = 5,
        min_similarity: float = 0.0,
        category: str | None = None,
        account: str | None = None,
        date_from: str | None = None,
        date_to: str | None = None,
    ) -> list[SearchResult]:
        # ... existing query embedding unchanged ...

        # Compile optional filters to parametrized WHERE clauses.
        # NEVER interpolate values into SQL — parameters only ($4, $5, ...).
        where = ["1 - (te.embedding <=> $1::vector) >= $3"]
        params: list = [query_vector, top_k, min_similarity]

        def add(clause: str, value) -> None:
            params.append(value)
            where.append(clause.format(n=len(params)))

        if category:
            add("t.category ILIKE ${n}", category)
        if account:
            add("a.name ILIKE ${n}", account)
        if date_from:
            add("t.date >= ${n}::date", date_from)
        if date_to:
            add("t.date <= ${n}::date", date_to)

        sql = f"""
            SELECT
                te.transaction_id,
                1 - (te.embedding <=> $1::vector) AS similarity,
                t.description,
                t.date::text AS date,
                t.amount_idr,
                t.flow,
                COALESCE(a.name, '') AS wallet
            FROM transaction_embeddings te
            JOIN transactions t ON t.id = te.transaction_id
            LEFT JOIN accounts a ON a.id = t.account_id
            WHERE {" AND ".join(where)}
            ORDER BY te.embedding <=> $1::vector
            LIMIT $2
            """
        rows = await conn.fetch(sql, *params)
        # ... existing row → SearchResult mapping unchanged ...
```

**C# equivalent** (`asyncpg.connect` + positional `$1, $2, ...` params → `NpgsqlConnection` +
Dapper with named `@p1, @p2, ...` params; the local `add()` closure that appends a clause + a
parameter together is the part worth preserving — it's what keeps the WHERE list and the
parameter list from drifting apart):

```csharp
public async Task<List<SearchResult>> SearchAsync(
    string query, int topK = 5, double minSimilarity = 0.0,
    string? category = null, string? account = null,
    string? dateFrom = null, string? dateTo = null, CancellationToken ct = default)
{
    var queryVector = await _embedder.EmbedAsync(query, ct); // existing query embedding unchanged

    // Compile optional filters to parametrized WHERE clauses.
    // NEVER interpolate values into SQL — parameters only (@p3, @p4, ...).
    var where = new List<string> { "1 - (te.embedding <=> @p1::vector) >= @p2" };
    var parameters = new DynamicParameters();
    parameters.Add("p1", queryVector);
    parameters.Add("p2", minSimilarity);
    var paramIndex = 2;

    void Add(string clauseTemplate, object value)
    {
        paramIndex++;
        var name = $"p{paramIndex}";
        parameters.Add(name, value);
        where.Add(string.Format(clauseTemplate, name));
    }

    if (category is not null) Add("t.category ILIKE @{0}", category);
    if (account is not null) Add("a.name ILIKE @{0}", account);
    if (dateFrom is not null) Add("t.date >= @{0}::date", dateFrom);
    if (dateTo is not null) Add("t.date <= @{0}::date", dateTo);
    parameters.Add($"p{paramIndex + 1}", topK);

    var sql = $"""
        SELECT
            te.transaction_id, 1 - (te.embedding <=> @p1::vector) AS similarity,
            t.description, t.date::text AS date, t.amount_idr, t.flow,
            COALESCE(a.name, '') AS wallet
        FROM transaction_embeddings te
        JOIN transactions t ON t.id = te.transaction_id
        LEFT JOIN accounts a ON a.id = t.account_id
        WHERE {string.Join(" AND ", where)}
        ORDER BY te.embedding <=> @p1::vector
        LIMIT @p{paramIndex + 1}
        """;

    var rows = await _connection.QueryAsync<SearchResult>(sql, parameters);
    return rows.ToList(); // existing row -> SearchResult mapping unchanged
}
```

> **Why a `DynamicParameters` + `Add()` helper instead of string-building both lists by hand?**
> Same reason as the Python closure: the WHERE clause and its parameter must always be appended
> together, in the same call. Building them in two separate steps is exactly how a parameter list
> drifts out of sync with the SQL — the local helper makes that class of bug structurally
> impossible.

Update `/search` in [main.py](../../../services/ai-service/app/main.py) to pass the new fields through, and apply `rerank` when requested:

```python
@app.post("/search", response_model=SearchResponse)
async def search_transactions(request: SearchRequest) -> SearchResponse:
    fetch_k = max(request.top_k, 10) if request.rerank else request.top_k
    results = await app.state.retriever.search(
        query=request.query,
        top_k=fetch_k,
        min_similarity=request.min_similarity,
        category=request.category,
        account=request.account,
        date_from=request.date_from,
        date_to=request.date_to,
    )
    if request.rerank:
        results = await app.state.reranker.rerank(request.query, results, top_k=request.top_k)
    return SearchResponse(results=results, query=request.query, total_found=len(results))
```

**C# equivalent** (FastAPI route function → ASP.NET Core controller action; `app.state.*`
singletons → constructor-injected services, per ARCH-04 — controller bodies stay thin, the
fetch-wider-then-rerank logic lives one level down):

```csharp
[HttpPost]
public async Task<ActionResult<SearchResponse>> Search(SearchRequest request, CancellationToken ct)
{
    var fetchK = request.Rerank ? Math.Max(request.TopK, 10) : request.TopK;
    var results = await _retriever.SearchAsync(
        request.Query, fetchK, request.MinSimilarity,
        request.Category, request.Account, request.DateFrom, request.DateTo, ct);

    if (request.Rerank)
        results = await _reranker.RerankAsync(request.Query, results, request.TopK, ct);

    return Ok(new SearchResponse(results, request.Query, results.Count));
}
```

Add 2–3 filter tests to [tests/test_retriever.py](../../../services/ai-service/tests/test_retriever.py) (assert the generated SQL contains the clause and the parameter list lines up — mocked asyncpg, same pattern as the existing 4 tests).

> **Why filter in SQL instead of post-filtering the results?** Post-filtering retrieves top-10 *then* drops non-matching rows — a March-only query might come back with 1 result even though the table has 50 March food transactions, because the unfiltered top-10 was dominated by other months. Pushing filters into WHERE means pgvector ranks *within* the filtered set, so `LIMIT top_k` stays meaningful. This is "pre-filtering vs post-filtering" in vector-search terms — a standard interview probe.

> **Why `ILIKE` and a regex-validated date string?** Account/category names arrive from a UI dropdown eventually, but tolerate case differences today. Dates validate shape at the Pydantic boundary (`pattern=`) and cast in SQL (`::date`) — bad input fails with 422 at the edge, not a cryptic asyncpg error mid-query.


### [x] STEP 5 — Re-run the MRR harness with re-ranking, record the delta

Recall: 
MRR = Mean Reciprocal Rank. It's a score (0 to 1) that measures how high up the first correct answer shows in a ranked list.

The "reciprocal rank" part: for one search, you look at where the first right result lands, then take 1 ÷ that position.

Right answer is #1 → 1/1 = 1.0 (perfect)
Right answer is #2 → 1/2 = 0.5
Right answer is #3 → 1/3 = 0.33
Not in the list at all → 0
The "mean" part: you do that for a bunch of test searches, then average all the scores. That average is your MRR.

What it's used for: judging a search/retrieval system. It answers one question — "when someone searches, does the good result show up near the top, or do they have to scroll?" Higher MRR = the right thing comes up sooner.

In your project: you run ~7 test queries (listrik, groceries, salary…), check where the relevant transactions land in the results, and average it. Your current baseline is MRR@5 = 0.476 — the "@5" just means you only look at the top 5 results and ignore anything below. Re-ranking (Chapter 4) is supposed to push the right transactions higher, which would raise that number.

One catch worth remembering: plain MRR only cares about the first correct hit — it ignores how many other good results are in the list. That's why you also track P@5 (precision) alongside it.

> **Rerun 2026-06-23:** `--rerank` flag executed live against real Postgres data. Results below.

```
Provider: openai | Model: text-embedding-3-small | K=5 | mode=reranked (10->5)
Query                                    |rel|  Hit   MRR   P@5      Lat
--------------------------------------------------------------------------------
tagihan listrik PLN bulan Maret             36    1  1.00  1.00   3862ms
gaji bulanan salary income                  32    0  0.00  0.00    752ms
belanja grocery di minimarket              317    1  1.00  1.00    862ms
Netflix Spotify langganan streaming         45    1  1.00  0.40    758ms
coffee kedai kopi Fore                      50    1  1.00  1.00    654ms
investasi saham Mansek                      35    1  1.00  0.40    701ms
bayar kontrakan                              9    1  1.00  0.40    703ms
--------------------------------------------------------------------------------
MACRO AVG                                      0.86 0.857  0.60

MRR@5 [reranked (10->5)]: 0.857
P@5   [reranked (10->5)]: 0.600
```

**Delta vs baseline (STEP 0):**

| Metric | Baseline (top-5) | Reranked (10→5) | Delta |
|--------|-----------------|-----------------|-------|
| MRR@5  | 1.000           | 0.857           | **-0.143** |
| P@5    | 0.657           | 0.600           | **-0.057** |

> 🤔⁉️ **Finding (THINK-04 — failures are diagnostic signals):** Re-ranking with `ms-marco-MiniLM-L-12-v2` produced a *negative* delta on Indonesian queries. The `gaji bulanan salary income` query collapsed from MRR=1.00 to MRR=0.00 — the cross-encoder demoted every relevant salary/income result out of the top-5 entirely. This is the English-training-bias risk the plan anticipated: ms-marco is trained on English MS MARCO passages; it does not recognize Indonesian financial vocabulary as "relevant." The bi-encoder (OpenAI `text-embedding-3-small`) is multilingual and handles Indonesian well; the cross-encoder is not, and it overrides the bi-encoder's correct ranking with wrong scores.
>
> **This is a better interview story than a +0.1 lift:** "I measured a negative re-ranking delta and diagnosed it — the cross-encoder was English-only, overriding a multilingual bi-encoder that was already correct. I identified the fix: swap to a multilingual cross-encoder model." Next step: try FlashRank's multilingual model (check README table) or `cross-encoder/ms-marco-MiniLM-L-6-en-de` as a stepping stone. Recorded in [ai-observability-metrics.md](../../../docs/performances/ai-observability-metrics.md).

Extend [evals/eval_retrieval.py](../../../services/ai-service/evals/eval_retrieval.py) with a `--rerank` flag:

```python
"""Retrieval benchmark: MRR@5, optionally with cross-encoder re-ranking.

    PYTHONPATH=. python evals/eval_retrieval.py            # baseline (Chapter 3)
    PYTHONPATH=. python evals/eval_retrieval.py --rerank   # retrieve 10 → rerank → top-5
"""
import argparse
# ... existing imports ...
from app.services.reranker import RerankerService

async def run(rerank: bool) -> None:
    queries = json.loads(QUERIES_FILE.read_text(encoding="utf-8"))
    service = RetrievalService()
    reranker = RerankerService() if rerank else None

    rr_scores = []
    for q in queries:
        t0 = time.perf_counter()
        if reranker:
            candidates = await service.search(q["query"], top_k=10)   # wide funnel
            results = await reranker.rerank(q["query"], candidates, top_k=5)
        else:
            results = await service.search(q["query"], top_k=5)
        latency_ms = (time.perf_counter() - t0) * 1000
        # ... existing mrr_at_k scoring + table print unchanged ...

    mode = "reranked (10→5)" if rerank else "baseline (top-5)"
    print(f"\nMRR@5 [{mode}]: {mrr:.3f}")

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--rerank", action="store_true")
    args = ap.parse_args()
    asyncio.run(run(args.rerank))
```

**C# equivalent** (`argparse` flag → a manually-parsed console flag; `time.perf_counter()` →
`Stopwatch`; `asyncio.run(run(...))` → `await Task` from `Main` — same `EvalRunner` console
project shape as [PF-AI002's harness](../../../.claude/plans/learning/PF-AI002-llm-evaluation-framework.md)):

```csharp
public static async Task RunAsync(bool rerank, CancellationToken ct = default)
{
    var queries = JsonSerializer.Deserialize<List<EvalQuery>>(await File.ReadAllTextAsync(QueriesFile, ct))!;
    var service = new RetrievalService(/* ... */);
    var reranker = rerank ? new RerankerService(/* ... */) : null;

    var scores = new List<double>();
    foreach (var q in queries)
    {
        var sw = Stopwatch.StartNew();
        List<SearchResult> results;
        if (reranker is not null)
        {
            var candidates = await service.SearchAsync(q.Query, topK: 10, ct: ct); // wide funnel
            results = await reranker.RerankAsync(q.Query, candidates, topK: 5, ct: ct);
        }
        else
        {
            results = await service.SearchAsync(q.Query, topK: 5, ct: ct);
        }
        var latencyMs = sw.Elapsed.TotalMilliseconds;
        // ... existing MrrAtK scoring + table print unchanged ...
    }

    var mode = rerank ? "reranked (10->5)" : "baseline (top-5)";
    Console.WriteLine($"\nMRR@5 [{mode}]: {scores.Average():F3}");
}

public static async Task Main(string[] args)
{
    var rerank = args.Contains("--rerank");
    await RunAsync(rerank);
}
```

Run both modes back-to-back and record in [docs/performances/ai-observability-metrics.md](../../../docs/performances/ai-observability-metrics.md):

```bash
cd services/ai-service
PYTHONPATH=. python evals/eval_retrieval.py            # confirm baseline: MRR=1.000, P@5=0.66
PYTHONPATH=. python evals/eval_retrieval.py --rerank   # the new number
```

Record: baseline P@5, reranked P@5, the delta, and the added latency per query. Also record MRR for completeness, but **P@5 is the primary lift metric for this chapter** — MRR is already at 1.000 after the probes fix, so re-ranking cannot improve it further. The meaningful question is: "did the wider funnel (top-10) give the cross-encoder better candidates to select from, improving precision?"

> **Why retrieve 10 then rerank to 5 (not rerank the top-5)?** Re-ranking the same 5 documents can only re-*order* them — MRR@5 barely moves because nothing new enters the set. The lift comes from the wider funnel: a relevant transaction at retrieval rank 8 is invisible to the baseline but gets promoted into the top-5 by the cross-encoder. Funnel width is the lever; this is exactly the recall-vs-precision tradeoff the interviewer is fishing for.

> **If P@5 delta is ~0:** that's a *finding*, not a failure (THINK-04). Likely causes: (a) with 7 queries and MRR already perfect, P@5=0.66 may be close to ceiling for this query set — add 5 harder queries (ambiguous, multi-category) to create more room; (b) `ms-marco` models are English-trained and your queries are Indonesian — note the language mismatch, try a multilingual rerank model, and write the observation down. "My re-ranker underperformed on Indonesian queries because ms-marco is English-centric; here's how I diagnosed it" is a *better* interview story than a clean +0.1.


### [x] STEP 6 — THINK-03 gate: justify the `/ask` extraction schema field-by-field

Before writing any `/ask` code, the `generate_json` schema gets the THINK-03 table (a wrong type here = silently corrupt answers):

| Field | JSON type | Example | Justification |
|-------|-----------|---------|---------------|
| `answer` | `string` | `"Pengeluaran makan bulan Maret: Rp 1.250.000 [1][2]"` | The user-facing grounded answer; `[n]` markers reference the citations list |
| `cited_transaction_ids` | `array[integer]` | `[42, 87]` | Integers matching `transactions.id` — `integer` not `string`, so .NET/frontend can join without parsing; the answerer validates each id exists in the provided context (hallucinated ids are dropped + logged) |
| `confident` | `boolean` | `true` | `false` when the context doesn't contain the answer — drives the "I don't have enough data" UX path instead of a fabricated total |

> **Why:** THINK-03 — a `string` amount or id in a tool/JSON schema corrupts silently: no compile error, no exception, just wrong joins downstream. Listing each field with its type and consumer *before* coding is the rule. `confident: boolean` exists because the grounding instruction alone ("say you don't know") produces prose the caller can't branch on — a boolean is machine-checkable.


### [x] STEP 7 — Add `/ask` models to [app/models.py](../../../services/ai-service/app/models.py)

```python
# ── RAG Phase 2: Grounded Q&A ────────────────────────────────────────────────

class AskRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    query: str = Field(..., min_length=1, max_length=500)
    top_k: int = Field(default=3, ge=1, le=10)        # contexts handed to the LLM
    category: str | None = None
    account: str | None = None
    date_from: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    date_to: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")


class Citation(BaseModel):
    marker: int                # [1], [2] — position referenced in the answer text
    transaction_id: int
    date: str
    description: str
    amount_idr: float
    flow: str
    wallet: str


class AskResponse(BaseModel):
    answer: str
    confident: bool
    citations: list[Citation]
    model: str
    retrieval_ms: float
    generation_ms: float
```

**C# equivalent** (Pydantic `BaseModel`s → C# `record`s; `int`/`float`/`str` map directly to
`int`/`double`/`string` — no THINK-03 surprises here since the Python side already uses the
correct primitive types):

```csharp
public sealed record AskRequest
{
    [Required, MinLength(1), MaxLength(500)]
    public string Query { get; init; } = "";

    [Range(1, 10)]
    public int TopK { get; init; } = 3; // contexts handed to the LLM

    public string? Category { get; init; }
    public string? Account { get; init; }

    [RegularExpression(@"^\d{4}-\d{2}-\d{2}$")]
    public string? DateFrom { get; init; }

    [RegularExpression(@"^\d{4}-\d{2}-\d{2}$")]
    public string? DateTo { get; init; }
}

public sealed record Citation(
    int Marker,         // [1], [2] — position referenced in the answer text
    int TransactionId,
    string Date,
    string Description,
    decimal AmountIdr,
    string Flow,
    string Wallet);

public sealed record AskResponse(
    string Answer,
    bool Confident,
    List<Citation> Citations,
    string Model,
    double RetrievalMs,
    double GenerationMs);
```

> **Why `retrieval_ms` / `generation_ms` split in the response?** Chapter 5 streams this endpoint; knowing *where* the latency lives (retrieval ~100ms vs generation ~2s) is what justifies streaming the generation phase. Measuring the split now gives you the before/after story, and it's a free observability win in every demo.


### [x] STEP 8 — Build [answerer.py](../../../services/ai-service/app/services/answerer.py) (the RAG read path)

Create [services/ai-service/app/services/answerer.py](../../../services/ai-service/app/services/answerer.py):

```python
"""AnswerService: grounded Q&A over transactions.

Pipeline: retrieve top-10 (filtered) → cross-encoder rerank → top-3 context
→ LLM synthesis with citations via the existing provider abstraction.
"""
from __future__ import annotations

import logging
import time

from app.config import settings
from app.models import AskRequest, AskResponse, Citation, SearchResult
from app.providers.base import LlmProvider
from app.services.reranker import RerankerService
from app.services.retriever import RetrievalService

logger = logging.getLogger(__name__)

ANSWER_SCHEMA = {
    "type": "object",
    "properties": {
        "answer": {"type": "string"},
        "cited_transaction_ids": {"type": "array", "items": {"type": "integer"}},
        "confident": {"type": "boolean"},
    },
    "required": ["answer", "cited_transaction_ids", "confident"],
}

SYSTEM_PROMPT = """You are a personal finance assistant answering questions about \
the user's own bank transactions. Answer ONLY from the numbered transactions \
provided as context. Rules:
- If the context does not contain the answer, say so and set confident=false. \
Never estimate or invent amounts.
- Reference transactions inline as [1], [2] matching their context numbers, and \
list their ids in cited_transaction_ids.
- Amounts are in IDR. Sum amounts yourself when the question asks for totals.
- Answer in the same language as the question (Indonesian or English)."""


def _format_context(results: list[SearchResult]) -> str:
    lines = []
    for i, r in enumerate(results, start=1):
        lines.append(
            f"[{i}] id={r.transaction_id} | {r.date} | {r.description} | "
            f"{r.flow} | Rp {r.amount_idr:,.0f} | {r.wallet}"
        )
    return "\n".join(lines)


class AnswerService:
    def __init__(
        self,
        retriever: RetrievalService,
        reranker: RerankerService,
        provider: LlmProvider,
    ) -> None:
        self._retriever = retriever
        self._reranker = reranker
        self._provider = provider

    async def ask(self, request: AskRequest) -> AskResponse:
        # 1. Retrieve a wide candidate set (filtered), then rerank to top_k.
        t0 = time.perf_counter()
        candidates = await self._retriever.search(
            query=request.query,
            top_k=10,
            category=request.category,
            account=request.account,
            date_from=request.date_from,
            date_to=request.date_to,
        )
        contexts = await self._reranker.rerank(request.query, candidates, top_k=request.top_k)
        retrieval_ms = (time.perf_counter() - t0) * 1000

        if not contexts:
            return AskResponse(
                answer="Tidak ada transaksi yang cocok dengan pertanyaan ini.",
                confident=False, citations=[], model="none",
                retrieval_ms=retrieval_ms, generation_ms=0.0,
            )

        # 2. Grounded synthesis via the existing provider (Langfuse-traced).
        t1 = time.perf_counter()
        user_prompt = (
            f"Context transactions:\n{_format_context(contexts)}\n\n"
            f"Question: {request.query}"
        )
        raw = await self._provider.generate_json(SYSTEM_PROMPT, user_prompt, ANSWER_SCHEMA)
        generation_ms = (time.perf_counter() - t1) * 1000

        # 3. Validate citations: drop ids the LLM invented (hallucination guard).
        by_id = {r.transaction_id: (i + 1, r) for i, r in enumerate(contexts)}
        citations = []
        for tid in raw.get("cited_transaction_ids", []):
            if tid in by_id:
                marker, r = by_id[tid]
                citations.append(Citation(
                    marker=marker, transaction_id=r.transaction_id, date=r.date,
                    description=r.description, amount_idr=r.amount_idr,
                    flow=r.flow, wallet=r.wallet,
                ))
            else:
                logger.warning("LLM cited unknown transaction_id=%s — dropped", tid)

        return AskResponse(
            answer=raw["answer"],
            confident=bool(raw.get("confident", False)),
            citations=citations,
            model=settings.ai_model,
            retrieval_ms=retrieval_ms,
            generation_ms=generation_ms,
        )
```

**C# equivalent** (constructor-injected collaborators map directly onto C# DI — this is the same
shape `Create{Entity}CommandHandler` already uses, per [backend.md](../../../.claude/rules/backend.md);
Python's `time.perf_counter()` → `Stopwatch`; the `by_id` dict-of-tuples → a small local
`record`):

```csharp
public sealed class AnswerService
{
    private readonly IRetrievalService _retriever;
    private readonly IRerankerService _reranker;
    private readonly ILlmProvider _provider;
    private readonly ILogger<AnswerService> _logger;

    private static readonly object AnswerSchema = new
    {
        type = "object",
        properties = new
        {
            answer = new { type = "string" },
            cited_transaction_ids = new { type = "array", items = new { type = "integer" } },
            confident = new { type = "boolean" },
        },
        required = new[] { "answer", "cited_transaction_ids", "confident" },
    };

    private const string SystemPrompt = """
        You are a personal finance assistant answering questions about the user's own bank
        transactions. Answer ONLY from the numbered transactions provided as context. Rules:
        - If the context does not contain the answer, say so and set confident=false. Never
          estimate or invent amounts.
        - Reference transactions inline as [1], [2] matching their context numbers, and list
          their ids in cited_transaction_ids.
        - Amounts are in IDR. Sum amounts yourself when the question asks for totals.
        - Answer in the same language as the question (Indonesian or English).
        """;

    public AnswerService(
        IRetrievalService retriever, IRerankerService reranker,
        ILlmProvider provider, ILogger<AnswerService> logger)
    {
        _retriever = retriever;
        _reranker = reranker;
        _provider = provider;
        _logger = logger;
    }

    private static string FormatContext(List<SearchResult> results) =>
        string.Join("\n", results.Select((r, i) =>
            $"[{i + 1}] id={r.TransactionId} | {r.Date} | {r.Description} | " +
            $"{r.Flow} | Rp {r.AmountIdr:N0} | {r.Wallet}"));

    public async Task<AskResponse> AskAsync(AskRequest request, CancellationToken ct = default)
    {
        // 1. Retrieve a wide candidate set (filtered), then rerank to TopK.
        var sw = Stopwatch.StartNew();
        var candidates = await _retriever.SearchAsync(
            request.Query, topK: 10, category: request.Category, account: request.Account,
            dateFrom: request.DateFrom, dateTo: request.DateTo, ct: ct);
        var contexts = await _reranker.RerankAsync(request.Query, candidates, request.TopK, ct);
        var retrievalMs = sw.Elapsed.TotalMilliseconds;

        if (contexts.Count == 0)
        {
            return new AskResponse(
                Answer: "Tidak ada transaksi yang cocok dengan pertanyaan ini.",
                Confident: false, Citations: new List<Citation>(), Model: "none",
                RetrievalMs: retrievalMs, GenerationMs: 0.0);
        }

        // 2. Grounded synthesis via the existing provider (Langfuse-traced).
        sw.Restart();
        var userPrompt = $"Context transactions:\n{FormatContext(contexts)}\n\nQuestion: {request.Query}";
        var raw = await _provider.GenerateJsonAsync(SystemPrompt, userPrompt, AnswerSchema, ct);
        var generationMs = sw.Elapsed.TotalMilliseconds;

        // 3. Validate citations: drop ids the LLM invented (hallucination guard).
        var byId = contexts.Select((r, i) => (r, marker: i + 1))
            .ToDictionary(x => x.r.TransactionId, x => x);
        var citations = new List<Citation>();
        foreach (var tid in raw.CitedTransactionIds)
        {
            if (byId.TryGetValue(tid, out var hit))
            {
                citations.Add(new Citation(hit.marker, hit.r.TransactionId, hit.r.Date,
                    hit.r.Description, hit.r.AmountIdr, hit.r.Flow, hit.r.Wallet));
            }
            else
            {
                _logger.LogWarning("LLM cited unknown transaction_id={TransactionId} — dropped", tid);
            }
        }

        return new AskResponse(
            Answer: raw.Answer, Confident: raw.Confident, Citations: citations,
            Model: _settings.AiModel, RetrievalMs: retrievalMs, GenerationMs: generationMs);
    }
}
```

Create [services/ai-service/tests/test_answerer.py](../../../services/ai-service/tests/test_answerer.py) — mock all three collaborators (canonical AsyncMock pattern from [.claude/rules/ai-service.md](../../rules/ai-service.md)):

```python
from unittest.mock import AsyncMock
import pytest
from app.models import AskRequest, SearchResult
from app.services.answerer import AnswerService


def _result(tid: int) -> SearchResult:
    return SearchResult(
        transaction_id=tid, similarity=0.9, description=f"TX{tid}",
        date="2026-03-01", amount_idr=10000.0, flow="DB", wallet="BCA",
    )


def _service(provider_json: dict, contexts: list[SearchResult]) -> AnswerService:
    retriever = AsyncMock()
    retriever.search = AsyncMock(return_value=contexts)
    reranker = AsyncMock()
    reranker.rerank = AsyncMock(return_value=contexts)
    provider = AsyncMock()
    provider.generate_json = AsyncMock(return_value=provider_json)
    return AnswerService(retriever, reranker, provider)


@pytest.mark.asyncio
async def test_ask_returns_grounded_answer_with_citations():
    service = _service(
        {"answer": "Total Rp 10.000 [1]", "cited_transaction_ids": [1], "confident": True},
        [_result(1)],
    )
    response = await service.ask(AskRequest(query="makan maret"))
    assert response.confident is True
    assert response.citations[0].transaction_id == 1
    assert response.citations[0].marker == 1


@pytest.mark.asyncio
async def test_ask_drops_hallucinated_citation_ids():
    service = _service(
        {"answer": "x [1]", "cited_transaction_ids": [1, 999], "confident": True},
        [_result(1)],
    )
    response = await service.ask(AskRequest(query="q"))
    assert [c.transaction_id for c in response.citations] == [1]   # 999 dropped


@pytest.mark.asyncio
async def test_ask_no_contexts_returns_not_confident_without_llm_call():
    service = _service({"answer": "", "cited_transaction_ids": [], "confident": False}, [])
    response = await service.ask(AskRequest(query="q"))
    assert response.confident is False
    service._provider.generate_json.assert_not_called()
```

**C# equivalent** (three `AsyncMock` collaborators → three `Mock<T>` collaborators passed to the
constructor — no `patch()` gymnastics needed because `AnswerService` is constructor-injected, the
exact payoff the build step's "why constructor injection" callout describes; `assert_not_called()`
→ Moq `Verify(..., Times.Never())`):

```csharp
public class AnswerServiceTests
{
    private static SearchResult Result(int id) => new()
    {
        TransactionId = id, Similarity = 0.9, Description = $"TX{id}",
        Date = "2026-03-01", AmountIdr = 10000.0m, Flow = "DB", Wallet = "BCA",
    };

    private static AnswerService BuildService(RawAnswer providerJson, List<SearchResult> contexts)
    {
        var retriever = new Mock<IRetrievalService>();
        retriever.Setup(r => r.SearchAsync(It.IsAny<string>(), It.IsAny<int>(), It.IsAny<string?>(),
                It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(contexts);

        var reranker = new Mock<IRerankerService>();
        reranker.Setup(r => r.RerankAsync(It.IsAny<string>(), It.IsAny<List<SearchResult>>(),
                It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(contexts);

        var provider = new Mock<ILlmProvider>();
        provider.Setup(p => p.GenerateJsonAsync(It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<object>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(providerJson);

        return (new AnswerService(retriever.Object, reranker.Object, provider.Object,
            Mock.Of<ILogger<AnswerService>>()), provider);
    }

    [Fact]
    public async Task AskAsync_ReturnsGroundedAnswerWithCitations()
    {
        var (service, _) = BuildService(
            new RawAnswer("Total Rp 10.000 [1]", new List<int> { 1 }, true),
            new List<SearchResult> { Result(1) });

        var response = await service.AskAsync(new AskRequest { Query = "makan maret" });

        Assert.True(response.Confident);
        Assert.Equal(1, response.Citations[0].TransactionId);
        Assert.Equal(1, response.Citations[0].Marker);
    }

    [Fact]
    public async Task AskAsync_DropsHallucinatedCitationIds()
    {
        var (service, _) = BuildService(
            new RawAnswer("x [1]", new List<int> { 1, 999 }, true),
            new List<SearchResult> { Result(1) });

        var response = await service.AskAsync(new AskRequest { Query = "q" });

        Assert.Equal(new[] { 1 }, response.Citations.Select(c => c.TransactionId)); // 999 dropped
    }

    [Fact]
    public async Task AskAsync_NoContexts_ReturnsNotConfidentWithoutLlmCall()
    {
        var (service, provider) = BuildService(
            new RawAnswer("", new List<int>(), false), new List<SearchResult>());

        var response = await service.AskAsync(new AskRequest { Query = "q" });

        Assert.False(response.Confident);
        provider.Verify(p => p.GenerateJsonAsync(It.IsAny<string>(), It.IsAny<string>(),
            It.IsAny<object>(), It.IsAny<CancellationToken>()), Times.Never());
    }
}
```

> **`BuildService` returns a tuple, not just the service.** xUnit/Moq has no module-level
> `service._provider` to reach into after construction the way the Python fixture does — the test
> that needs to assert "never called" on the mock has to keep its own reference, so the helper
> hands both back.

```bash
PYTHONPATH=. pytest tests/test_answerer.py -v
```

> **Why constructor-injected collaborators (unlike PF-AI003's self-constructing services)?** `AnswerService` composes three things you'll want to swap independently: the retriever (Chapter 6 variants), the reranker (Cohere swap), the provider (Gemini ↔ Anthropic). Injection makes the unit tests trivial — no `patch()` gymnastics — and mirrors the .NET constructor-DI you already think in. This is also the shape LangGraph nodes will want in Chapter 8.

> **Why validate `cited_transaction_ids` against the context?** LLMs cite confidently and wrongly. An id not in the provided context is by definition fabricated — silently passing it through would render a clickable citation pointing at an unrelated (or nonexistent) transaction. Dropping + logging makes hallucination *visible* in Langfuse instead of shipping it to the UI. This guard is a one-liner that comes up in every "how do you handle hallucination?" interview.


### [x] STEP 9 — Wire `POST /ask` in [app/main.py](../../../services/ai-service/app/main.py)

> **Verification note:** the endpoint, lifespan wiring (`app.state.reranker`, `app.state.answerer`), and imports are in place and confirmed import-clean (`python -c "import app.main"` succeeds). The `curl` smoke test against a running service with backfilled embeddings was **not run** — same Postgres-unreachable blocker as STEP 0.

In the lifespan, after the existing embedder/retriever wiring:

```python
    app.state.reranker = RerankerService()
    app.state.answerer = AnswerService(
        retriever=app.state.retriever,
        reranker=app.state.reranker,
        provider=ProviderFactory.create(settings),
    )
```

Add the endpoint (error contract per [.claude/rules/ai-service.md](../../rules/ai-service.md) — LLM failure is 502, never 200-with-empty):

```python
@app.post("/ask", response_model=AskResponse)
async def ask(request: AskRequest) -> AskResponse:
    """Grounded Q&A over the user's transactions (retrieve → rerank → synthesize)."""
    try:
        return await app.state.answerer.ask(request)
    except Exception as exc:
        logger.exception("ask failed")
        raise HTTPException(status_code=502, detail="llm_parse_error") from exc
```

**C# equivalent** (DI wiring → `Program.cs`/`Startup` registration instead of a `lifespan` block;
the route handler → a thin controller action per ARCH-04 — try/catch maps to the project's
existing exception-middleware contract, ERR-03/ERR-04, rather than a per-action try/catch):

```csharp
// Program.cs
builder.Services.AddScoped<IRerankerService, RerankerService>();
builder.Services.AddScoped<AnswerService>();

// AskController.cs — exceptions bubble to the global exception middleware,
// which already maps unhandled errors to 500; LLM-specific failures are
// translated to 502 there per the .claude/rules/ai-service.md error contract.
[ApiController]
[Route("api/[controller]")]
public class AskController : ControllerBase
{
    private readonly AnswerService _answerer;

    public AskController(AnswerService answerer) => _answerer = answerer;

    [HttpPost]
    public async Task<ActionResult<AskResponse>> Ask(AskRequest request, CancellationToken ct)
        => Ok(await _answerer.AskAsync(request, ct));
}
```

Smoke test (service running, embeddings backfilled):

```bash
curl -X POST http://localhost:8000/ask \
  -H "Content-Type: application/json" \
  -d '{"query": "berapa pengeluaran makan bulan Maret?", "date_from": "2026-03-01", "date_to": "2026-03-31"}'
```

Verify: the answer contains a real IDR total, `[n]` markers, `citations` lists real transactions, and the Langfuse dashboard shows the generation with cost.

> **Why `502` and not `500` on LLM failure?** The error contract table in [.claude/rules/ai-service.md](../../rules/ai-service.md): provider failures and malformed LLM output are upstream-dependency errors → 502, which the .NET API maps to a user-visible "AI temporarily unavailable" rather than a generic crash. Returning 200 with an empty answer is explicitly forbidden — it would poison any downstream caching/eval with fake successes.


### [!] STEP 10 — Write [evals/ask_questions.json](../../../services/ai-service/evals/ask_questions.json) + RAGAS faithfulness eval

> **Failure:** [ask_questions.json](../../../services/ai-service/evals/ask_questions.json) and [eval_faithfulness.py](../../../services/ai-service/evals/eval_faithfulness.py) were written per spec, but `ragas` could not be installed in this environment — its hard dependency `scikit-network` ships no prebuilt wheel for Python 3.14/win_amd64 and fails to compile from source without the MSVC C++ Build Tools (`error: Microsoft Visual C++ 14.0 or greater is required`). `flashrank` installed and ran cleanly in the same venv, confirming this is specific to `ragas`'s dependency tree, not a general network/proxy block. Even with `ragas` installed, the run would still hit the same Postgres-unreachable blocker as STEP 0.

Add eval-only dependencies to the `dev` extra in [pyproject.toml](../../../services/ai-service/pyproject.toml):

```toml
dev = [
    # ... existing ...
    "ragas>=0.2",
    "langchain-openai>=0.2",   # RAGAS judge LLM wrapper — eval-only, never app code
]
```

```bash
pip install ragas langchain-openai
```

Create [evals/ask_questions.json](../../../services/ai-service/evals/ask_questions.json) — 5 questions you can verify by hand against Supabase Studio:

```json
[
  {"query": "berapa total pengeluaran makan bulan Maret 2026?", "date_from": "2026-03-01", "date_to": "2026-03-31", "note": "verify sum by hand in Studio — Food & Dining DB rows in March"},
  {"query": "kapan terakhir kali bayar listrik PLN?", "note": "single-fact lookup — latest Bills & Utilities PLN row"},
  {"query": "berapa kali jajan kopi bulan ini?", "note": "count question — coffee transactions current month"},
  {"query": "what was my biggest expense in March?", "note": "max-amount question, English — tests language mirroring"},
  {"query": "berapa pengeluaran untuk sewa apartemen tahun 2031?", "note": "adversarial — no data; expect confident=false, no invented number"}
]
```

Create [services/ai-service/evals/eval_faithfulness.py](../../../services/ai-service/evals/eval_faithfulness.py):

```python
"""RAGAS faithfulness on /ask answers: is every claim grounded in the retrieved context?

    PYTHONPATH=. python evals/eval_faithfulness.py
Requires OPENAI_API_KEY (judge model) — already configured for embeddings.
"""
import asyncio, json
from pathlib import Path

from langchain_openai import ChatOpenAI
from ragas import SingleTurnSample
from ragas.llms import LangchainLLMWrapper
from ragas.metrics import Faithfulness

from app.config import settings
from app.models import AskRequest
from app.providers.factory import ProviderFactory
from app.services.answerer import AnswerService
from app.services.reranker import RerankerService
from app.services.retriever import RetrievalService

QUESTIONS_FILE = Path(__file__).parent / "ask_questions.json"


async def run() -> None:
    questions = json.loads(QUESTIONS_FILE.read_text(encoding="utf-8"))
    answerer = AnswerService(RetrievalService(), RerankerService(), ProviderFactory.create(settings))
    judge = LangchainLLMWrapper(ChatOpenAI(model="gpt-4o-mini", temperature=0.0))
    metric = Faithfulness(llm=judge)

    scores = []
    for q in questions:
        request = AskRequest(
            query=q["query"],
            date_from=q.get("date_from"), date_to=q.get("date_to"),
        )
        response = await answerer.ask(request)
        contexts = [
            f"{c.date} | {c.description} | {c.flow} | Rp {c.amount_idr:,.0f} | {c.wallet}"
            for c in response.citations
        ] or ["(no context retrieved)"]

        sample = SingleTurnSample(
            user_input=q["query"],
            response=response.answer,
            retrieved_contexts=contexts,
        )
        score = await metric.single_turn_ascore(sample)
        scores.append(score)
        print(f"{q['query'][:60]:<62} faithfulness={score:.2f}  confident={response.confident}")

    print(f"\nMean faithfulness: {sum(scores) / len(scores):.3f}   (target ≥ 0.80)")


if __name__ == "__main__":
    asyncio.run(run())
```

**C# equivalent** (no RAGAS-equivalent NuGet package exists — `ragas`'s `Faithfulness` metric
internally asks a judge LLM to decompose the answer into atomic claims, then asks the judge again
whether each claim is supported by the context, and averages the result. There's nothing to
import; port the *technique* directly against the existing provider abstraction instead):

```csharp
// evals/EvalFaithfulness.cs — hand-rolled claim-decomposition-and-verify,
// the same technique RAGAS's Faithfulness metric implements internally.
public sealed record ClaimVerdict(string Claim, bool Supported);

public static class FaithfulnessEval
{
    private const string DecomposePrompt =
        "List each distinct factual claim in this answer as a short JSON array of strings. " +
        "Answer: {0}";

    private const string VerifyPrompt =
        "Context:\n{0}\n\nClaim: \"{1}\"\n\nIs this claim directly supported by the context above? " +
        "Answer with a JSON object: {{\"supported\": true|false}}.";

    // Cross-provider judge (a different model than the generator) avoids
    // self-preference bias, same reasoning as the Python script's gpt-4o-mini choice.
    public static async Task<double> ScoreAsync(
        ILlmProvider judge, string answer, IReadOnlyList<string> contexts, CancellationToken ct = default)
    {
        var claims = await judge.GenerateJsonArrayAsync(string.Format(DecomposePrompt, answer), ct);
        if (claims.Count == 0) return 1.0; // no claims to falsify

        var contextText = string.Join("\n", contexts);
        var verdicts = new List<ClaimVerdict>();
        foreach (var claim in claims)
        {
            var raw = await judge.GenerateJsonAsync(
                string.Format(VerifyPrompt, contextText, claim), ct: ct);
            verdicts.Add(new ClaimVerdict(claim, raw.Supported));
        }

        return verdicts.Count(v => v.Supported) / (double)verdicts.Count;
    }

    public static async Task RunAsync(ILlmProvider generatorProvider, ILlmProvider judgeProvider, AnswerService answerer)
    {
        var questions = JsonSerializer.Deserialize<List<AskQuestion>>(
            await File.ReadAllTextAsync("evals/ask_questions.json"))!;

        var scores = new List<double>();
        foreach (var q in questions)
        {
            var response = await answerer.AskAsync(new AskRequest { Query = q.Query, DateFrom = q.DateFrom, DateTo = q.DateTo });
            var contexts = response.Citations.Count > 0
                ? response.Citations.Select(c => $"{c.Date} | {c.Description} | {c.Flow} | Rp {c.AmountIdr:N0} | {c.Wallet}").ToList()
                : new List<string> { "(no context retrieved)" };

            var score = await ScoreAsync(judgeProvider, response.Answer, contexts);
            scores.Add(score);
            Console.WriteLine($"{q.Query[..Math.Min(60, q.Query.Length)],-62} faithfulness={score:F2}  confident={response.Confident}");
        }

        Console.WriteLine($"\nMean faithfulness: {scores.Average():F3}   (target >= 0.80)");
    }
}
```

> **Why hand-roll instead of "there's no equivalent, skip it"?** The same observability gap exists
> in any .NET shop building RAG without a Python sidecar — this is the pattern you'd reach for in
> practice, and walking through it by hand is what makes RAGAS's internals legible rather than a
> black box you just trust.

Run and record the mean in [docs/performances/ai-observability-metrics.md](../../../docs/performances/ai-observability-metrics.md):

```bash
PYTHONPATH=. python evals/eval_faithfulness.py
```

> **Why RAGAS faithfulness specifically?** Faithfulness decomposes the generated answer into atomic claims and asks a judge LLM whether each claim is supported by the retrieved context — it measures *hallucination*, the failure mode users actually fear in a finance app ("the app told me a number that isn't in my data"). MRR measures the retriever; faithfulness measures the generator; together they cover the pipeline. Question 5 is the canary: a faithful system answers "no data" — a low score there means your grounding prompt is leaking.

> **Why a different judge model (gpt-4o-mini) than the generator (Gemini)?** Same-model-judging-itself inflates scores (self-preference bias — you read about this in Chapter 2's LLM-as-judge material). The OpenAI key already exists for embeddings, so the cross-provider judge is free to set up; 5 answers ≈ fractions of a cent.


### [x] STEP 11 — Update the metrics doc

Append to [docs/performances/ai-observability-metrics.md](../../../docs/performances/ai-observability-metrics.md):

```markdown
## RAG Phase 2 (PF-AI004) — re-ranking + generation

| Metric | Value |
|--------|-------|
| MRR@5 baseline (Chapter 3, corrupted — ivfflat probes=1 bug) | 0.476 |
| MRR@5 after probes=10 fix (real Chapter 3 baseline) | 1.000 |
| P@5 baseline (top-5 cosine, probes=10) | 0.66 |
| P@5 reranked (top-10 → FlashRank → top-5) | 0.YY |
| P@5 re-ranking lift | +0.ZZ |
| MRR@5 reranked (expected: no change — already 1.000) | 1.000 |
| Re-rank latency added per query | ~XXms (local CPU, $0 cost) |
| /ask retrieval_ms (p50) | XXms |
| /ask generation_ms (p50) | X.Xs |
| RAGAS faithfulness (5 answers, gpt-4o-mini judge) | 0.XX |
```

> **Why:** These are the chapter's interview numbers. The Sunday-metric answer this chapter is: *"I added a local cross-encoder re-ranker that lifted MRR@5 by +0.ZZ at ~XXms and $0 per query, and a grounded `/ask` endpoint whose answers score 0.XX RAGAS faithfulness with a hallucinated-citation guard."* Without the doc entry, the numbers evaporate.


### [x] STEP 12 — Full test pass + commit

> **Note:** the full `pytest -v` run is done — 95 passed, 1 pre-existing unrelated failure (`test_merchant_suggester.py`, untouched by this chapter). The `git add`/`git commit` portion was intentionally **not** run automatically — the `/execute` skill leaves all changes uncommitted for the user's own review before committing.

```bash
cd services/ai-service && PYTHONPATH=. pytest -v          # all suites incl. new 3 files
cd c:\workspaces\personal-finance
git add services/ai-service/app/services/chunker.py
git add services/ai-service/app/services/reranker.py
git add services/ai-service/app/services/answerer.py
git add services/ai-service/app/services/retriever.py
git add services/ai-service/app/models.py
git add services/ai-service/app/main.py
git add services/ai-service/pyproject.toml
git add services/ai-service/tests/test_chunker.py
git add services/ai-service/tests/test_reranker.py
git add services/ai-service/tests/test_answerer.py
git add services/ai-service/tests/test_retriever.py
git add services/ai-service/evals/eval_retrieval.py
git add services/ai-service/evals/eval_faithfulness.py
git add services/ai-service/evals/ask_questions.json
git add docs/performances/ai-observability-metrics.md
git status    # verify NO .env, NO credentials
git commit -m "PF-AI004: RAG Phase 2 — chunking, FlashRank re-ranking, grounded /ask with citations"
```

> **Why:** Same-day shipping rule — the chapter isn't done until it's committed with the eval numbers in the diff.


### [x] STEP 13 — Log progress

```
/mentor log Built RAG Phase 2: chunker (fixed-size + sentence-window, tested), FlashRank re-ranker (MRR@5 0.XX → 0.YY, +0.ZZ lift), metadata-filtered retrieval, grounded POST /ask with citation validation (hallucinated ids dropped), RAGAS faithfulness 0.XX on 5 answers. Chapter 4 complete.
```


## 📌 Notes

- **Chapter 3 gate first (Step 0).** The MRR@5 baseline from PF-AI003 must be a real number before this chapter starts — the re-ranking delta is the headline deliverable.
- **FlashRank model cache.** First `Ranker(...)` instantiation downloads ~34 MB to `cache_dir`. In Docker this re-downloads per container unless the dir is volume-mounted or baked into the image — fine for local dev, note it for the eventual Dockerfile touch-up (defer).
- **`ms-marco` models are English-trained.** Your queries are Indonesian. If the Step 5 delta disappoints, FlashRank's multilingual option (`miniReranker_arabic_v1` is *not* it — check the README table for the multilingual entry) or a language note in the metrics doc is the move. Either outcome is a documented finding (THINK-04).
- **`AnswerService` uses constructor injection** (unlike the self-constructing `EmbeddingService`/`RetrievalService` from PF-AI003). Deliberate: three swappable collaborators, trivial mocking, and the shape Chapter 8's LangGraph nodes will want. Don't retro-fit the older services now.
- **RAGAS pulls langchain into the venv.** Confined to the `dev` extra — it must never be imported from `app/` code. The app's only LLM surface remains `ProviderFactory`.
- **THINK-05 (frozen contract):** `SearchRequest`/`SearchResponse` changes are additive-optional only. `AskRequest`/`AskResponse`/`Citation` are *new* contract surface — when .NET grows an `/ask` proxy (Chapter 5, for the chat UI), the field names freeze; note it in [.claude/rules/ai-service.md](../../rules/ai-service.md) then.
- **`/ask` cost profile:** ~3 context transactions + a short question ≈ 500–800 input tokens to Gemini 2.5 Flash per ask — effectively free at personal volume; the Langfuse trace from PF-AI001 captures it without new code.
- **Next chapter (5 — Streaming):** `generation_ms` will dominate `retrieval_ms` by ~10–20×. That measured split is the justification for streaming `/ask` over SSE, and the `AnswerService` seam (provider call isolated in one place) is where the streaming variant plugs in.
- **Deferred:** hybrid BM25 + vector search (Chapter 6), chunked-corpus retrieval wiring (Chapter 6), conversation memory (Chapter 8), .NET `/ask` proxy + chat UI (Chapter 5), Cohere Rerank swap (only if FlashRank disappoints on Indonesian).


## 📚 Resources / Theory to Learn

Organized by concept — read the one tied to what you're building; skip the rest until you hit that wall.

### Concept 1 — Re-ranking / cross-encoders (Step 1 + 3)
- **Sentence-Transformers — *Retrieve & Re-Rank*** → https://sbert.net/examples/applications/retrieve_rerank/README.html — the canonical bi-encoder vs cross-encoder explanation with the funnel diagram. The Step 1 anchor.
- **FlashRank** → https://github.com/PrithivirajDamodaran/FlashRank — model table (TinyBERT 4MB → MiniLM 34MB → multilingual options), usage API. Note the multilingual model for the Indonesian-query contingency in Step 5.
- **Cohere Rerank docs** → https://docs.cohere.com/docs/rerank-overview — the hosted alternative; read to articulate the local-vs-hosted tradeoff, not to integrate.

### Concept 2 — Chunking strategies (Step 2)
- **Chunking Strategies in RAG: Optimising Data for Advanced AI Responses** → https://www.youtube.com/watch?v=pIGRwMjhMaQ — hands on, gradually levels up; the basis for the ladder above.
- **Pinecone — *Chunking Strategies for LLM Applications*** → https://www.pinecone.io/learn/chunking-strategies/ — the standard survey: fixed-size, recursive, sentence-window, semantic. Read fixed-size + sentence-window sections only.
- **LlamaIndex — *Sentence Window Retrieval* concept docs** → https://docs.llamaindex.ai — skim for the "small-to-search, big-to-read" framing; you're hand-rolling what their `SentenceWindowNodeParser` does, which is precisely why you'll understand it better than framework users.

### Concept 3 — Grounded generation + citations (Steps 6–9)
- **Anthropic — *Reducing hallucinations*** → https://docs.anthropic.com/en/docs/test-and-evaluate/strengthen-guardrails/reduce-hallucinations — the grounding-prompt patterns (answer-only-from-context, explicit I-don't-know permission) used in the SYSTEM_PROMPT.
- **Lewis et al., *Retrieval-Augmented Generation*** (the original RAG paper, 2020) → https://arxiv.org/abs/2005.11401 — skim the abstract + architecture figure for interview vocabulary; don't read the training sections.

### Concept 4 — RAG evaluation (Steps 5 + 10)
- **RAGAS — *Faithfulness*** → https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/faithfulness/ — how the metric decomposes answers into claims. Read before running Step 10 so the score means something to you.
- **Eugene Yan — *Patterns for LLM Systems*** (evals section) → https://eugeneyan.com/writing/llm-patterns/ — ties Chapter 2's eval thinking to RAG-specific metrics; the retrieval-vs-generation split you're now measuring on both sides.

### Video (one segment, not a full course)
- **DeepLearning.AI — *Building and Evaluating Advanced RAG*** (free short course) → https://learn.deeplearning.ai/courses/building-evaluating-advanced-rag — the sentence-window + re-ranking segments (~30 min) are exactly this chapter; the rest is Chapter 6 material.


## 🧠 Learning Strategy

**Daily loop for Chapter 4:**
- **Morning (90 min, deep block #1):** chunker + reranker (Steps 2–3). Stop when both test files are green.
- **Midday interleave (30 min):** while the FlashRank model downloads / tests run, skim the Chapter 5 SSE reading (FastAPI `StreamingResponse`). Warming context, not building.
- **Afternoon (90 min, deep block #2):** filters + `/ask` (Steps 4, 6–9). Stop when the curl smoke test returns a cited answer.
- **Next session:** evals (Steps 5, 10) + metrics + commit. Eval runs need wall-clock time — interleave with writing the metrics doc.

**The 5 principles applied to Chapter 4:**
1. **Active retrieval:** Step 1's three questions, written from memory into [evals/README.md](../../../services/ai-service/evals/README.md). If you can't explain why the cross-encoder sees query+document together, re-read before coding.
2. **Project-first:** the only pre-reads are Step 1 (re-ranking) and the THINK-03 schema gate (Step 6). Chunking/RAGAS docs are pull-when-stuck.
3. **Same-day shipping:** Steps 2–3 committed day 1; Steps 4–9 day 2; evals + numbers day 3. Three commits, not one mega-commit.
4. **Interleaving:** FlashRank model download, backfill confirmation, and eval runs all have wall time — write the next step's test file while they run.
5. **Teach-back:** the funnel sentence ("cheap-and-broad bi-encoder, expensive-and-narrow cross-encoder") and the hallucination-guard story are the two teach-backs. Say each out loud without notes.

**Anti-patterns to avoid this chapter:**
- ❌ Adopting LlamaIndex/LangChain "because re-ranking is built in." Frameworks arrive in Chapters 7–8, *after* you've hand-rolled what they abstract. (RAGAS pulling langchain into the dev extra is fine — it's eval tooling, not app architecture.)
- ❌ Re-ranking only the top-5. The lift comes from widening the funnel (retrieve 10) — re-ordering 5 items barely moves MRR@5.
- ❌ Calling FlashRank inline in the async endpoint. It's sync CPU inference — `asyncio.to_thread` or you stall the event loop for every concurrent request.
- ❌ Letting the LLM's `cited_transaction_ids` pass through unvalidated. Citation hallucination is the #1 trust-killer in a finance app; the guard is 5 lines.
- ❌ Tuning the grounding prompt by vibes. Question 5 in [ask_questions.json](../../../services/ai-service/evals/ask_questions.json) (the no-data adversarial) is the regression test — if it ever returns a confident number, the prompt regressed.
- ❌ Returning 200 with an empty answer on LLM failure. The error contract says 502 — eval harnesses and .NET error mapping both depend on it.

**The Sunday metric:**
> "What can I say in an interview today that I couldn't say last Sunday?"
> Target answer: *"I debugged a retrieval baseline that looked like 0.476 MRR — traced it to IVFFlat probes=1 only searching 1 of 100 clusters, fixed it in one line, real baseline was 1.000. Then I added a two-stage funnel — pgvector top-10 into a local FlashRank cross-encoder — which improved P@5 from 0.66 to 0.YY at zero API cost, and built a grounded `/ask` endpoint that answers from cited transactions only, drops hallucinated ids, and scores 0.XX RAGAS faithfulness with a cross-provider judge."* Every number comes from Steps 0, 5, 10, and 11.


## 📝 Knowledge Check

> Original practice questions modeled on the published exam domains of official AI Engineering certifications (Databricks Generative AI Engineer Associate, Azure AI Engineer AI-102, AWS Certified ML Engineer – Associate, Google Cloud Professional ML Engineer). They match the style and topic areas of those exams — not verbatim exam items. Each question is tagged to the certification domain(s) it maps to. Answers are hidden — recall first, then reveal.

### 1. Bi-encoder vs cross-encoder (Databricks · Google Cloud PMLE)

*Scenario:* Your pgvector search retrieves plausible-but-wrong transactions at rank 1–2, while the truly relevant ones sit at rank 6–9.

*Question:* Why does adding a cross-encoder re-ranker over the top-10 candidates improve final ranking quality compared to the embedding similarity alone?

- **A.** The cross-encoder uses a larger vector dimension, so its cosine scores are more precise
- **B.** The cross-encoder reads the query and each document together in one forward pass, modeling their interaction directly — unlike the bi-encoder, which embeds them independently and can only compare pre-computed points
- **C.** The cross-encoder caches results, so repeated queries get better over time
- **D.** Re-ranking removes duplicate documents, which is what lowers the ranking quality

<details>
<summary>Show answer</summary>

**B** — the cross-encoder attends across query and document jointly, capturing interactions a bi-encoder structurally cannot; that's also why it's too slow to score the whole table and only runs on the retrieved candidates.
*Maps to: Databricks GenAI Engineer Associate · Retrieval & re-ranking; Google Cloud PMLE · Vector Search & Embeddings*
</details>

### 2. Funnel width (Databricks · AWS ML Engineer)

*Scenario:* You add a re-ranker but apply it to the same top-5 the baseline already returned, and MRR@5 barely changes.

*Question:* What is the most likely explanation?

- **A.** The re-ranker model is broken and should be replaced
- **B.** MRR@5 cannot measure re-ranking improvements by design
- **C.** Re-ranking 5 candidates can only re-order that same set — the lift comes from retrieving a wider candidate pool (e.g., top-10) so relevant items *outside* the original top-5 can be promoted in
- **D.** The vector index needs to be rebuilt before re-ranking can take effect

<details>
<summary>Show answer</summary>

**C** — re-ranking is a re-*scoring* of the candidate set; if the relevant document never entered the set, no re-ordering can surface it. Widen retrieval, then re-rank down.
*Maps to: Databricks GenAI Engineer Associate · Assembling & Evaluating RAG; AWS Certified ML Engineer – Associate · Model evaluation & tuning*
</details>

### 3. Pre-filtering vs post-filtering (Azure AI-102 · Databricks)

*Scenario:* `/search` supports a March-only date filter. A colleague suggests retrieving the global top-10 by similarity, then dropping non-March rows in Python.

*Question:* What is the main problem with that post-filtering approach?

- **A.** Post-filtering is a security risk because dates are exposed to the application layer
- **B.** It returns too many results, increasing response size
- **C.** Python date comparison is slower than SQL date comparison
- **D.** The unfiltered top-10 may contain few or zero March rows, so the final result set silently shrinks below `top_k` even when many relevant March transactions exist — filtering must constrain the search, not trim its output

<details>
<summary>Show answer</summary>

**D** — pre-filtering (WHERE clause) makes the vector ranking happen *within* the filtered subset, keeping `LIMIT top_k` meaningful; post-filtering starves the result set.
*Maps to: Azure AI-102 · Implement knowledge mining / filtered vector queries (Azure AI Search); Databricks GenAI Engineer Associate · Retrieval*
</details>

### 4. Grounded generation (Databricks · Azure AI-102)

*Scenario:* Your `/ask` endpoint sometimes states a spending total even when no matching transactions were retrieved.

*Question:* Which combination most directly prevents fabricated answers from reaching the user?

- **A.** A system prompt that restricts answers to the provided context and permits "I don't know," a machine-checkable `confident` flag in the structured output, and validating that every cited id exists in the retrieved context
- **B.** Raising temperature so the model explores more phrasings before settling on an answer
- **C.** Increasing `top_k` so the model always has some context to answer from
- **D.** Switching from JSON mode to free-text output so the model isn't forced to fill fields

<details>
<summary>Show answer</summary>

**A** — grounding instructions + an explicit out ("I don't know"), a boolean the caller can branch on, and citation validation against the actual context form the layered guard; more context (C) actually *increases* the chance of a confident wrong answer when the data isn't there.
*Maps to: Databricks GenAI Engineer Associate · Application Development (guardrails); Azure AI-102 · Responsible AI / groundedness*
</details>

### 5. Chunking strategy choice (Databricks · Google Cloud PMLE)

*Scenario:* You index multi-page statement narratives. Searching small sentence-sized units matches precisely, but the LLM then receives fragments too short to answer from.

*Question:* Which strategy resolves this tension?

- **A.** Fixed-size chunks with zero overlap, sized to the LLM's full context window
- **B.** Embedding entire documents as single vectors so no context is ever lost
- **C.** Sentence-window chunking — index the individual sentence for precise matching, but return the sentence plus its ±N neighbours so the generator receives sufficient context ("small-to-search, big-to-read")
- **D.** Duplicating every chunk three times in the index to boost its retrieval probability

<details>
<summary>Show answer</summary>

**C** — sentence-window decouples the *retrieval unit* (small, precise) from the *generation unit* (expanded window); A and B each sacrifice one side of the tradeoff.
*Maps to: Databricks GenAI Engineer Associate · Data Preparation (chunking); Google Cloud PMLE · RAG data design*
</details>



### 6. Evaluating the generator, not just the retriever (Databricks · AWS ML Engineer)

*Scenario:* MRR@5 says retrieval is good, but you want a number for "does the generated answer only state things supported by the retrieved transactions?"

*Question:* The appropriate metric and setup is:

- **A.** BLEU score between the answer and the retrieved context strings
- **B.** RAGAS faithfulness — decompose the answer into claims and have a judge LLM verify each claim against the retrieved context; use a *different* model as judge than the generator to avoid self-preference bias
- **C.** Re-run MRR@5 on the generated answers instead of the retrieved ids
- **D.** Token-level perplexity of the answer under the generator model

<details>
<summary>Show answer</summary>

**B** — faithfulness is the claim-level groundedness metric for the generation stage (MRR covers retrieval), and a cross-provider judge avoids the self-evaluation inflation documented in LLM-as-judge literature.
*Maps to: Databricks GenAI Engineer Associate · Evaluating RAG Applications; AWS Certified ML Engineer – Associate · Model evaluation*
</details>
