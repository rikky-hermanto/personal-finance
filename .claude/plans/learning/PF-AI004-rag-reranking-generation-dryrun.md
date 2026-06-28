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