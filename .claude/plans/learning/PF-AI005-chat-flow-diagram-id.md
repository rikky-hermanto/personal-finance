# Di Balik Layar — "Berapa pengeluaran makan saya bulan Maret 2025?"

> Dokumen belajar (versi-id) — bukan plan. Ini menjelaskan **apa yang benar-benar terjadi** di pipeline
> saat kamu mengetik satu pertanyaan di halaman Chat, langkah demi langkah, dengan file dan baris kode
> aslinya. Dua bagian: **alur yang jalan hari ini** (PF-AI005 PART 1 — yang kemarin ketahuan ngawur),
> lalu **alur target setelah PART 2** ([PF-AI005-PART2-answer-accuracy-todo.md](PF-AI005-PART2-answer-accuracy-todo.md)).
> Semua angka di sini nyata — dari live run yang tercatat, bukan karangan.

## Peta besar — satu kalimat dulu

Ketikanmu menempuh **4 hop**: browser → FastAPI (Python) → Postgres (pgvector) + model lokal → LLM (Gemini) → balik ke browser sebagai stream token. Tidak ada .NET API di jalur ini — Chat bicara langsung ke AI service di port 8000.

```
┌──────────────┐  POST /ask/stream   ┌───────────────┐        ┌────────────────────┐
│   Browser    │ ──────────────────▶ │  AI Service   │ ─────▶ │ Supabase Postgres  │
│  ChatPage    │                     │  FastAPI      │  SQL   │ pgvector :54322    │
│  (React)     │ ◀────────────────── │  :8000        │ ◀───── │ 4.467 embeddings   │
└──────────────┘   SSE events:       └──────┬────────┘        └────────────────────┘
                   metadata → token* → done │      ▲
                                            ▼      │
                                  ┌──────────────┐ │ embed query (1 call)
                                  │ Gemini 2.5   │ │ ┌──────────────────┐
                                  │ Flash        │ │ │ OpenAI           │
                                  │ (streaming)  │ └─│ text-embedding-  │
                                  └──────────────┘   │ 3-small          │
                                                     └──────────────────┘
```

## Alur hari ini (PART 1) — 9 langkah

### Langkah 1 — Kamu menekan Kirim

[ChatPage.tsx](../../../apps/frontend/src/pages/ChatPage.tsx) `send()` (baris 25–64): teks kamu masuk ke daftar `messages` sebagai bubble user, plus satu bubble assistant **kosong** yang nanti diisi token demi token. Lalu memanggil `streamAsk({ query })`.

Perhatikan yang dikirim: **hanya `query`**. Field `date_from`, `date_to`, `category` ada di [chatApi.ts](../../../apps/frontend/src/api/chatApi.ts) (baris 12–19) tapi tidak pernah diisi — ini lubang #1 yang nanti kita bahas.

### Langkah 2 — Browser membuka koneksi SSE

[chatApi.ts](../../../apps/frontend/src/api/chatApi.ts) pakai `fetchEventSource` (bukan `EventSource` bawaan browser — yang bawaan cuma bisa GET, kita butuh POST berbadan JSON):

```
POST http://localhost:8000/ask/stream
{"query": "Berapa pengeluaran makan saya bulan maret 2025?"}
```

Koneksi ini tetap terbuka; server akan mendorong event satu-satu lewat kabel yang sama.

### Langkah 3 — Pertanyaanmu diubah jadi vektor

[main.py](../../../services/ai-service/app/main.py) `ask_stream()` (baris 285) memanggil `retriever.search(query, top_k=10, ...)` — dan semua filter bernilai `None`.

Di [retriever.py](../../../services/ai-service/app/services/retriever.py) baris 34, kalimatmu dikirim **utuh, apa adanya** ke OpenAI `text-embedding-3-small` dan pulang sebagai 1.536 angka float — koordinat kalimatmu di "ruang makna". Kata "makan", "pengeluaran" ikut membentuk arah vektor ini. Kata "maret 2025"? Ikut juga — tapi embedding menyimpan *topik*, bukan *waktu*. Baris GOFOOD bulan Januari dan baris GOFOOD bulan Maret posisinya nyaris identik di ruang ini. Tanggal di pertanyaanmu praktis menguap di langkah ini.

### Langkah 4 — Postgres mencari 10 tetangga terdekat

Masih [retriever.py](../../../services/ai-service/app/services/retriever.py) (baris 42–91): koneksi asyncpg ke Supabase lokal (port 54322), `SET ivfflat.probes = 10` (perbaikan bug lama PF-AI003 — default `probes=1` cuma menggeledah 1 dari 100 cluster), lalu satu query SQL:

```sql
SELECT ... 1 - (te.embedding <=> $1::vector) AS similarity
FROM transaction_embeddings te
JOIN transactions t ON t.id = te.transaction_id
ORDER BY te.embedding <=> $1::vector   -- jarak cosine, terkecil dulu
LIMIT 10
```

Hasil: **10 transaksi yang deskripsinya paling "semirip makan"** — dari seluruh 4.467 baris, dari Januari 2024 sampai Januari 2026, karena tidak ada `WHERE t.date >= ...`. Klausa filternya *ada* di kode (baris 62–73, dibangun di PF-AI004) — cuma tidak pernah dipakai karena request-nya tidak membawa filter.

### Langkah 5 — Cross-encoder menyaring 10 → 3

[reranker.py](../../../services/ai-service/app/services/reranker.py): FlashRank `ms-marco-MiniLM-L-12-v2` — model ~34 MB yang jalan **lokal di CPU-mu**, bukan API. Dia membaca pertanyaan + tiap kandidat *bersamaan* dalam satu forward pass (itu bedanya cross-encoder dari bi-encoder di Langkah 3) dan menyisakan 3 teratas. Karena inference-nya synchronous, dia dijalankan lewat `asyncio.to_thread` supaya tidak memblokir request lain.

Catatan jujur dari eval: model ini English-only — di query Bahasa Indonesia dia pernah *menurunkan* P@5 (0.657 → 0.600). Jadi penyaringan ini belum tentu memperbaiki urutan untuk pertanyaanmu.

### Langkah 6 — Event `metadata`: sumber dikirim SEBELUM jawaban

[main.py](../../../services/ai-service/app/main.py) baris 309–321: 3 transaksi hasil rerank dikirim ke browser sebagai event `metadata`. Inilah yang muncul sebagai panel "Sumber transaksi" — **sebelum satu kata jawaban pun ada**. Desain sadar dari PART 1: kamu lihat "jawaban akan datang dari sini" duluan.

Tapi ingat artinya yang sebenarnya: ini *kandidat yang diberikan ke LLM*, bukan *bukti yang dipakai LLM*. Panel ini tampil bahkan kalau LLM akhirnya menjawab "tidak ada datanya" — itulah kenapa di screenshot kemarin sumber WSS Batu Bulan nongkrong di bawah jawaban tentang PLN.

### Langkah 7 — Prompt dirakit, Gemini mulai mengarang^H^H^H^Hmenjawab

Ketiga baris konteks diformat bernomor (pola sama dengan [answerer.py](../../../services/ai-service/app/services/answerer.py) `_format_context`):

```
Context transactions:
[1] id=24561 | 2025-03-14 | GOFOOD ... | DB | Rp 55,000 | BCA
[2] id=24580 | 2025-03-20 | GRABFOOD ... | DB | Rp 22,200 | BCA
[3] id=19122 | 2024-01-05 | WSS BATU BULAN 55 | DB | Rp 11,350 | BCA

Question: Berapa pengeluaran makan saya bulan maret 2025?
```

Lalu `provider.stream_generate(...)` — Gemini 2.5 Flash, **teks bebas, tanpa schema** (beda dari `/ask` non-streaming yang pakai `generate_json`). Setiap potongan teks langsung diteruskan sebagai event `token`. Langfuse mencatat panggilan ini (biaya, token, latency) — jejaknya bisa kamu lihat di dashboard.

### Langkah 8 — Token mengalir, kursor berkedip

[ChatPage.tsx](../../../apps/frontend/src/pages/ChatPage.tsx) `onToken` (baris 38–47): tiap token ditempel ke bubble assistant terakhir. Time-to-first-token ~150 ms setelah generation mulai — inilah nilai jual PART 1 dibanding `/ask` yang bikin kamu menatap layar ~3 detik.

### Langkah 9 — Event `done`, koneksi ditutup

Server kirim `done`, [chatApi.ts](../../../apps/frontend/src/api/chatApi.ts) langsung `controller.abort()` — kalau tidak, library-nya reconnect dan **re-POST pertanyaanmu**, artinya bayar LLM dua kali untuk jawaban yang sama.

### Garis waktu (angka p50 dari live run 2026-07-03)

```
0 ms                ~900 ms              ~1.050 ms                        ~3.700 ms
│                   │                    │                                │
├── embed + pgvector + rerank ──────────▶│                                │
│   (retrieval ~887 ms)                  ├── token pertama (~150 ms) ──▶ ├── done
│                                        │   "metadata" tampil di sini    │   (generation ~2.683 ms)
│                                   Sumber transaksi                 jawaban lengkap
│                                   muncul duluan                    di bubble
```

## Kenapa jawabannya bisa ngawur — tiga lubang, satu contoh nyata

Untuk pertanyaan **"berapa TOTAL"**, pipeline di atas salah alat di tiga titik sekaligus:

```
  "Berapa pengeluaran makan saya bulan maret 2025?"
          │
          ▼
  ① Tanggal menguap ─────── embedding menyimpan topik, bukan waktu; filter SQL ada
          │                  tapi tidak pernah diisi → pencarian melintasi 2 tahun data
          ▼
  ② Sampel ≠ populasi ───── top-10 → rerank → 3 baris. Maret 2025 bisa punya puluhan
          │                  transaksi Food; LLM cuma pernah melihat 3 (atau yang
          │                  kesasar dari Januari 2024)
          ▼
  ③ LLM disuruh berhitung ─ jumlah-jumlahan dilakukan model, bukan SQL — dan di
                             streaming TIDAK ADA guard: /ask punya validasi
                             cited_transaction_ids (answerer.py:93-105),
                             /ask/stream meneruskan teks mentah begitu saja
```

**Bukti dari data nyata sesi ini:**
- Pertanyaan persis ini pernah dijawab `/ask` (live, 2026-07-03): *"Total pengeluaran makan Anda pada bulan Maret 2025 adalah **Rp 77.200** dari transaksi [1] dan [2]."* Kedengarannya benar — dan sitasinya valid. Tapi Rp 77.200 itu **jumlah 2 baris yang kebetulan ter-retrieve**, bukan total Maret 2025 yang sebenarnya. Kalau bulan itu punya 15 transaksi Food, 13 lainnya tidak pernah masuk hitungan. Jawaban yang *faithful terhadap konteks* belum tentu *benar terhadap database* — RAGAS faithfulness 0.90 pun tidak menangkap ini, karena yang dinilai kesetiaan pada konteks, bukan kelengkapan konteksnya.
- Versi lebih parahnya kejadian di UI test 2026-07-08: April 2024 punya **43 transaksi Food senilai Rp 2.309.954** (SQL langsung), tapi chat menjawab *"Semua transaksi yang tersedia berasal dari bulan Januari 2024"* — karena 3 kandidat yang kebetulan lolos rerank semuanya baris Januari.

## Alur target setelah PART 2 — nomor dihitung Postgres, bukan Gemini

```
  "Berapa pengeluaran makan saya bulan maret 2025?"
          │
          ▼
  ┌─────────────────────────────────────────────────────┐
  │ QueryPlanner (1 panggilan generate_json, temp 0)     │   ← baru (STEP 2)
  │ {intent: "aggregate", categories: ["Food"],          │
  │  date_from: "2025-03-01", date_to: "2025-03-31",     │
  │  flow: "DB"}                                          │
  │ · kategori dipilih dari daftar NYATA di DB (menu),   │
  │   bukan dikarang — "makan" dipetakan ke "Food"       │
  └───────────────┬─────────────────────────────────────┘
                  │
        ┌─────────┴──────────┐
        ▼ aggregate           ▼ lookup ("kapan terakhir bayar PLN?")
  ┌──────────────────┐   ┌─────────────────────────────────┐
  │ AggregationService│   │ Jalur PART 1 (embed→retrieve→   │
  │ SQL: SUM + COUNT  │   │ rerank→stream) — TAPI sekarang  │
  │ atas SELURUH tabel│   │ filter tanggal dari planner     │
  │ WHERE Food, Maret │   │ benar-benar dipakai, dan setelah│
  │ 2025 (parametrized│   │ stream selesai marker [n]       │
  │ Decimal, no float)│   │ divalidasi → verified: true/false│
  └────────┬─────────┘   └─────────────────────────────────┘
           ▼
  Rp X.XXX.XXX dari N transaksi  ── angka SUDAH JADI ──▶ Gemini cuma merangkai
           │                                              kalimat di sekitarnya
           ▼                                              ("jangan ubah angkanya")
  done payload: {total_idr: X, count: N, verified: true}
           │
           ▼
  UI menampilkan angka DARI PAYLOAD (hasil SQL) — bukan dari prosa.
  Kalaupun Gemini bandel menulis "Rp 999.999", yang tampil tetap angka SQL.
```

Prinsip yang dibawa pulang: **uang mengalir di sekitar LLM, bukan melewatinya.** Model boleh memilih *apa* yang di-query (intent, tanggal, kategori dari menu tertutup) dan boleh membungkus hasilnya jadi kalimat — tapi antara dua ujung itu, angkanya dihitung Postgres dengan `SUM()` yang tidak punya imajinasi.

## Ringkasan satu tabel

| Langkah | Komponen | File | Biaya/latensi | Nasib di PART 2 |
|---|---|---|---|---|
| Kirim query | `ChatPage.send()` | [ChatPage.tsx](../../../apps/frontend/src/pages/ChatPage.tsx) | — | tetap; bubble dapat badge `verified` + sumber per-pesan |
| Koneksi SSE | `fetchEventSource` | [chatApi.ts](../../../apps/frontend/src/api/chatApi.ts) | — | payload `done` bertambah kaya (`total_idr`, `verified`) |
| *(baru)* Rencana query | `QueryPlanner` | query_planner.py (STEP 2) | +1 panggilan LLM kecil (~300–600 ms) | **titik routing** aggregate/lookup |
| Embed pertanyaan | OpenAI embedding | [retriever.py:34](../../../services/ai-service/app/services/retriever.py#L34) | ~100–200 ms, $ kecil | hanya jalur lookup |
| Cari 10 terdekat | pgvector cosine | [retriever.py:75-91](../../../services/ai-service/app/services/retriever.py#L75-L91) | bagian dari ~887 ms | jalur lookup, kini berfilter tanggal |
| *(baru)* Hitung total | `AggregationService` | aggregator.py (STEP 3) | 1 query SQL, ~ms | **jalur aggregate — sumber angka** |
| Saring 10 → 3 | FlashRank lokal | [reranker.py](../../../services/ai-service/app/services/reranker.py) | ~50 ms CPU | jalur lookup |
| Kirim sumber | event `metadata` | [main.py:309-321](../../../services/ai-service/app/main.py#L309-L321) | — | label jujur: dikutip vs dipertimbangkan |
| Generate jawaban | Gemini 2.5 Flash stream | [main.py:329-338](../../../services/ai-service/app/main.py#L329-L338) | ~2,7 dtk, tercatat di Langfuse | narasi saja; angka dari SQL |
| Guard | *(tidak ada di stream)* | — | — | **validasi marker post-stream → `verified`** |

**Bacaan lanjut:** ladder lengkap tiga konsepnya (kenapa top-K tidak bisa menghitung, query understanding, streaming yang tidak bisa bohong) ada di [PF-AI005-PART2-answer-accuracy-todo.md](PF-AI005-PART2-answer-accuracy-todo.md) bagian 📖 Introduction; istilah-istilah RAG di [glossary-rag-id.md](glossary-rag-id.md).
