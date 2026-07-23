# PF-AI006 — Advanced RAG Patterns: Hybrid Search, Sentence-Window, Auto-Merging (Versi Belajar)

> ⚠️ **RE-SCOPE (2026-07-23): tiket ini sekarang cuma mencakup Hybrid Search (Masalah 1).** Sentence-window (Masalah 2) dan auto-merging (Masalah 3) dipindah ke [PF-AI006-PART2](PF-AI006-PART2-sentence-window-automerging-todo.md) — deferred, karena butuh data source baru (teks naratif statement PDF) untuk usecase yang belum jadi kebutuhan produk. Bagian-bagian tentang dua teknik itu di bawah tetap dipertahankan sebagai materi belajar.

> **Ini bukan plan baru.** Ini adalah tulisan ulang dari [PF-AI006-advanced-rag-patterns-todo.md](PF-AI006-advanced-rag-patterns-todo.md), disusun ulang supaya urutannya mengikuti cara otak belajar hal baru — bukan urutan implementasi. Semua fakta, angka, kode, dan jebakan yang disebutkan di sini diambil apa adanya dari file asli. File asli tetap jadi rujukan resmi untuk TODO steps, acceptance criteria, dan quiz — dokumen ini cuma versi "supaya nyantol dulu di kepala."
>
> **Urutan baca:** masalah dulu → baru konsep → baru cara kerja → baru kode → baru optimisasi → baru best practice → baru kesalahan umum → baru ringkasan. Jangan loncat ke bagian Implementasi kalau tiga bagian pertama belum kebayang, nanti kodenya kelihatan seperti sihir.
>
> **Ketemu istilah asing di tengah baca?** Semua istilah baru dijelaskan pas pertama kali muncul, dan tiap istilah di-link langsung ke definisinya di [Glossary RAG](glossary-rag-id.md) — tinggal klik, tidak perlu scroll balik.
>
> **Prasyarat:** chapter ini baru boleh dimulai setelah angka baseline Chapter 4 tercatat di metrics doc (P@5 + RAGAS faithfulness) — STEP 0 di file asli adalah gerbangnya. Tanpa baseline, tabel perbandingan yang jadi "headline" chapter ini kehilangan baris pertamanya.

---

## Apa Masalah yang Ingin Diselesaikan?

Setelah Chapter 4 (PF-AI004), jalur `/ask` sudah lumayan matang: retrieval [cosine](glossary-rag-id.md#cosine-similarity) top-10 → [re-rank](glossary-rag-id.md#re-ranking) ke top-3 → jawaban ber-[sitasi](glossary-rag-id.md#citations) yang tervalidasi. Baseline-nya tercatat: [MRR@5](glossary-rag-id.md#mrr-5) = 1.000, [P@5](glossary-rag-id.md#p-5) = 0.66. Tapi "lumayan matang" di sini artinya masih *cosine top-K di atas satu tabel embedding datar* — dan ada tiga lubang nyata yang belum tertutup:

**Masalah 1 — query kata-kunci eksak justru titik lemah vector search.** Coba query nyata dari project ini: *"tagihan listrik PLN"*. Yang user mau jelas: transaksi yang deskripsinya memuat kata **PLN** persis. Tapi [embedding](glossary-rag-id.md#embedding) tidak berpikir begitu — dia melihat "tagihan" sebagai sinyal kuat, sehingga tagihan air, tagihan internet, dan tagihan kartu kredit bisa ikut naik ke posisi atas, sementara baris PLN yang eksak malah tidak dijamin nomor satu. Pencarian makna itu hebat untuk parafrase, tapi untuk merek dan istilah persis (PLN, OVO, GoPay), pencocokan kata kunci gaya lama justru lebih bisa diandalkan.

**Masalah 2 — `chunker.py` dari Chapter 4 masih nganggur di rak.** `sentence_window_chunks()` sudah dibangun, sudah lulus test, tapi belum dicolok ke mana-mana. Akibatnya `/ask` cuma bisa menjawab dari baris transaksi — padahal statement bank PDF (1–5 halaman teks per file) sudah mengalir lewat pipeline ekstraksi setiap bulan. Teks naratif itu tidak pernah di-index, jadi pertanyaan tentang isi statement-nya sendiri tidak bisa dijawab sama sekali.

**Masalah 3 — kalau teks statement di-index per kalimat, hasilnya bisa berupa serpihan.** Query gaya rangkuman seperti *"ringkas semua transaksi belanja online bulan ini"* bisa mengambil 4 kalimat yang ternyata berasal dari **paragraf yang sama**. LLM menerima 4 serpihan yang saling tumpang tindih, padahal jawaban terbaiknya ya paragraf itu sendiri, utuh.

Dan ada satu masalah meta yang menyatukan semuanya: **eval set yang ada tidak bisa melihat perbedaannya.** 10 query eval dari Chapter 3–4 memang ditulis untuk vector search — semuanya parafrase semantik. Kalau teknik baru diuji pakai set itu, hasilnya bakal "seri terus", dan kamu bisa salah menyimpulkan tekniknya tidak berguna. Chapter ini menambahkan 5 query adversarial supaya tiap teknik punya kasus di mana dia memang seharusnya menang.

Target chapter ini: tiga teknik retrieval lanjutan — masing-masing bisa dinyalakan sendiri-sendiri, masing-masing diukur dengan harness yang sama — lalu pemenangnya jadi default produksi.

---

## Konsep Sederhananya

Tiga konsep baru, tiga analogi:

1. **[Hybrid search](glossary-rag-id.md#hybrid-search)** — pakai dua juri yang keahliannya beda: juri makna (vector search, jago parafrase) dan juri kata kunci ([BM25](glossary-rag-id.md#bm25), jago pencocokan eksak). Masalahnya, keduanya memberi nilai dengan skala yang beda total — yang satu 0–1, yang satu nggak punya batas atas. Cara adil menggabungkannya bukan menjumlahkan nilai, tapi menjumlahkan **peringkat**: itulah **[RRF](glossary-rag-id.md#rrf)** (Reciprocal Rank Fusion).

2. **[Sentence-window retrieval](glossary-rag-id.md#sentence-window-retrieval)** — kartu katalog perpustakaan: yang kamu *cari* adalah kartu kecil yang ringkas (satu kalimat), tapi yang kamu *baca* adalah bukunya (kalimat itu plus tetangga-tetangganya). Konsep "kecil untuk dicari, besar untuk dibaca" sudah dikenalkan di Chapter 4 sebagai [chunking](glossary-rag-id.md#sentence-window-chunking) — chapter ini yang benar-benar menyalakan listriknya: tabel baru, backfill, dan retriever produksi.

3. **[Auto-merging](glossary-rag-id.md#auto-merging)** — aturan keluarga: kalau mayoritas anak dari satu keluarga sama-sama kepilih, undang saja orang tuanya. Ketika ≥ separuh kalimat dari satu paragraf sama-sama muncul di hasil pencarian, itu bukti paragrafnya yang relevan — sistem mengganti serpihan-serpihan kalimat itu dengan satu paragraf utuh.

Posisinya di pipeline yang sudah ada (semua yang bertanda 🔄 adalah tambahan chapter ini):

```
BASELINE CHAPTER 4                          TAMBAHAN CHAPTER 6
─────────────────────────                   ──────────────────────────────────────

User Query                                  [Vector search] ───────────────┐
    │                                                                      │
    ▼                                       [BM25 search]  ──▶ [RRF merge] ┤  🔄 Hybrid
[Embed query]                                 tsvector di      k=60        │     search
    │                                         description                  ▼
    ▼                                                             daftar gabungan
[Vector search]   pgvector top-10                                 (lanjut ke rerank
    │                                                              + /ask yang sama)
    ▼
[Rerank]          FlashRank top-3           [Sentence-window index]   🔄
    │                                         statement_chunks:
    ▼                                         cari chunk_text kecil,
[LLM + sitasi]    POST /ask                   kembalikan window_text

MRR@5=1.000 · P@5=0.66                      [Auto-merging]            🔄
                                              hierarki parent_id:
                                              serpihan → paragraf utuh

                                            [Eval] +5 query adversarial
                                            [Winner] jadi default produksi
```

> **Cara baca `MRR@5=1.000 · P@5=0.66`:** MRR@5 (Mean Reciprocal Rank) itu rata-rata dari 1/posisi kemunculan dokumen relevan pertama — 1.000 berarti jawaban relevan pertama *selalu* nongol di peringkat #1, bukan "100% benar" seperti persentase. P@5 (Precision@5) itu proporsi murni — 0.66 = dari 5 hasil top-K, rata-rata ~66% (3,3 dari 5) benar-benar relevan, sisanya noise. Range dua-duanya 0.0–1.0; makin ke 1.0 makin bagus, makin ke 0.0 makin buruk.

---

## Cara Kerjanya

Bagian ini menjelaskan tiap konsep dengan cara yang sama seperti belajar naik tangga: mulai dari versi paling sederhana yang masih jalan, lihat di mana dia mentok, baru pahami kenapa versi berikutnya dibutuhkan.

### Hybrid Search — dua juri, satu daftar

**Vector search saja (baseline Chapter 3–4).** Embed query, cari [cosine similarity](glossary-rag-id.md#cosine-similarity) tertinggi di `transaction_embeddings`, ambil top-10. Untuk query parafrase — *"makan siang di kantor"* padahal deskripsinya "WARUNG", "RESTO", "MAKAN" — ini juara, karena embedding memang menangkap kedekatan makna.

Cocok untuk parafrase, buntu untuk kata kunci eksak: query *"tagihan listrik PLN"* tidak dijamin mengangkat baris ber-PLN ke posisi teratas, karena bagi ruang vektor, semua "tagihan" itu bertetangga. Yang dibutuhkan di kasus ini justru pencocokan kata yang persis — dan itu bukan keahlian embedding.

**[BM25](glossary-rag-id.md#bm25) — juri kata kunci klasik.** Ini algoritme scoring dari dunia search engine lama: dokumen dapat skor tinggi kalau kata query muncul persis di dalamnya, dibobot frekuensi kata dan kelangkaannya di seluruh koleksi. Tidak paham sinonim sama sekali — justru itu kekuatannya untuk merek dan istilah eksak. Di PostgreSQL, ini didekati dengan [tsvector](glossary-rag-id.md#tsvector): kolom `description_tsv` yang otomatis dihitung dari `description` (pakai [generated column](glossary-rag-id.md#generated-column), bukan trigger), di-index dengan [GIN](glossary-rag-id.md#gin-index), dicari dengan [`plainto_tsquery`](glossary-rag-id.md#tsquery), dan diranking dengan [`ts_rank`](glossary-rag-id.md#ts-rank). Config yang dipakai `'simple'` (tokenisasi per kata, tanpa stemming) — deskripsi bank Indonesia itu pendek dan sudah "telanjang" (`BELANJA MAKAN`, `TRANSFER PLN`, `OVO KOPI`), jadi pencocokan token eksak sudah cukup, dan config `'indonesian'` belum tentu terpasang di instance Supabase.

Sekarang ada dua daftar ranking — dan di sinilah jebakan halusnya: skor keduanya **tidak bisa dijumlahkan**. Cosine similarity itu 0–1; `ts_rank` itu bobot log-frekuensi yang tak berbatas dan berubah-ubah tergantung query. Rumus gabungan macam `0.7 * vector + 0.3 * bm25` kelihatan masuk akal, tapi diam-diam salah satu juri bisa mendominasi total atau lenyap sama sekali — dan kamu tidak akan tahu kapan, karena skalanya bergeser per query.

**[RRF](glossary-rag-id.md#rrf) — gabungkan posisi, bukan skor.** Reciprocal Rank Fusion membuang skor mentah sepenuhnya dan cuma melihat *peringkat*: dokumen di posisi `rank` pada sebuah daftar menyumbang `1/(k + rank)`, dijumlahkan dari semua daftar tempat dia muncul. Posisi itu selalu 1, 2, 3, … di daftar mana pun — tidak perlu normalisasi apa-apa. Konstanta k=60 datang dari paper aslinya (Cormack et al., SIGIR 2009), di-tuning di benchmark TREC dan terbukti awet. Hitungannya gampang dicek: dokumen yang ranking #1 di *kedua* daftar dapat `2/61`; yang ranking #1 di satu daftar saja dapat `1/61` — yang disepakati dua juri selalu menang. Merge-nya dilakukan di Python, bukan SQL, karena dua daftar itu datang dari dua tipe query yang beda (`<=>` vs `ts_rank`). → *Ini yang dipakai chapter ini.*

Tangga berikutnya (di luar scope plan ini — sekadar teaser): *learned fusion* — bobot gabungan yang dilatih dari data relevansi, bukan konstanta.

▶ **Baca untuk konsep ini:** [pgvector hybrid search README](https://github.com/pgvector/pgvector#hybrid-search) — contoh SQL RRF-nya adalah jangkar kode untuk STEP 3.

### Sentence-Window Retrieval — dari primitive jadi jalur produksi

**Modul teruji yang belum dicolok.** `sentence_window_chunks()` dari Chapter 4 adalah fungsi murni: masuk teks, keluar daftar chunk ber-[window](glossary-rag-id.md#window). Tidak ada tabel yang menyimpannya, tidak ada endpoint yang memanggilnya. Sementara itu teks mentah statement PDF (hasil ekstraksi PyMuPDF) tiap bulan lewat begitu saja — dipakai sekali untuk ekstraksi transaksi, lalu dilupakan.

Kenapa tidak embed saja satu dokumen utuh jadi satu vector? Karena presisinya hancur: satu embedding untuk 5 halaman teks adalah "rata-rata makna" dari ratusan kalimat — kalimat relevan yang kamu cari tenggelam di dalamnya, dan query spesifik cuma dapat kemiripan yang samar-samar.

Kebalikannya — index per kalimat — presisinya bagus, tapi ada lubang yang gampang kebayang (file asli menjadikannya soal Knowledge Check): search menemukan kalimat "Bayar PLN Rp 250.000" dengan tepat, tapi LLM yang cuma menerima kalimat telanjang itu bisa menjawab "konteks tidak cukup" — tanggal dan detail di sekitarnya ada di kalimat-kalimat tetangga yang tidak ikut terkirim.

**`statement_chunks` — satu baris, dua wajah.** Solusinya menyimpan *dua representasi* untuk tiap chunk: `chunk_text` (satu kalimat — kecil, presisi, ini yang di-embed dan dicari) dan `window_text` (kalimat itu ±2 tetangganya, `window_size=2` — ini yang dikembalikan ke LLM). Script backfill mengambil semua PDF lama dari Supabase Storage, ekstrak teks, potong pakai `sentence_window_chunks()`, embed batch-an 50, lalu insert. `DocumentRetriever` baru mencari di `chunk_text` tapi mengembalikan `window_text` — "kecil untuk dicari, besar untuk dibaca" yang akhirnya jalan beneran. → *Ini yang dipakai chapter ini.*

▶ **Baca untuk konsep ini:** [LlamaIndex — Sentence Window Retrieval](https://docs.llamaindex.ai/en/stable/examples/node_postprocessor/MetadataReplacementDemo/) — kamu meng-hand-roll persis apa yang framework ini abstraksikan; diagram `index_node` vs `window_node`-nya adalah mental model-nya.

### Auto-Merging — melebar hanya kalau ada bukti

**Sentence-window selalu melebar ±N, apa pun sinyalnya.** Setiap chunk yang ketemu dibawa bersama window-nya — tidak peduli chunk itu sendirian atau datang berombongan. Untuk query pinpoint ("berapa bayar PLN?") ini pas.

Kedengarannya sudah beres — sampai ketabrak query gaya rangkuman: *"ringkas semua transaksi belanja online bulan ini"* mengambil 4 kalimat yang semuanya berasal dari paragraf yang sama. Empat window yang saling tumpang tindih, isi yang berulang-ulang, dan LLM harus menjahit sendiri paragraf yang sebenarnya sudah utuh di dokumen aslinya.

**Kelompokkan per orang tua, hitung rasionya.** Saat indexing, tiap 5 kalimat (`PARA_SIZE=5`) digabung jadi satu baris parent (level 1 = paragraf; level 0 = kalimat) — [hierarki](glossary-rag-id.md#chunk-hierarchy) lewat kolom `parent_id`, dan tiap anak menyimpan `sibling_count` (total saudara se-parent). Saat retrieval, `AutoMergingRetriever` mengambil kandidat lebar dulu (`top_k * 3`), mengelompokkan per `parent_id`, lalu menghitung [rasio](glossary-rag-id.md#sibling-threshold): `kalimat se-parent yang terambil ÷ sibling_count`. Rasio ≥ `merge_threshold` (0.5) → serpihan-serpihan itu diganti satu chunk parent; di bawah itu → biarkan sendiri-sendiri. Terakhir de-dup dan potong ke top_k. → *Ini yang dipakai chapter ini.*

Arahnya beda dengan sentence-window, dan ini poin interview yang enak: **sentence-window selalu melebar; auto-merging cuma melebar kalau ada bukti** (saudara-saudaranya ikut terambil). Skema tabelnya sudah menyediakan level 2 (halaman) untuk promosi bertingkat — belum dipakai chapter ini.

▶ **Baca untuk konsep ini:** [LlamaIndex — Auto-Merging Retriever](https://docs.llamaindex.ai/en/stable/examples/retrievers/auto_merging_retriever/) — fokus ke konsep sibling-threshold dan bentuk hierarki node-nya, bukan kode framework-nya.

### Eval — query adversarial, supaya perbedaannya kelihatan

**Eval set warisan (10 query semantik).** Jalankan hybrid vs vector di set ini dan hasilnya nyaris pasti seri — bukan karena tekniknya sama bagus, tapi karena semua query-nya parafrase makna: BM25 tidak pernah diberi panggung. Kesimpulan "hybrid tidak membantu" dari set ini adalah kesimpulan yang salah dari eval yang buta.

**5 [query adversarial](glossary-rag-id.md#adversarial-queries)** — masing-masing dirancang supaya satu modalitas *seharusnya* menang, sehingga tabel perbandingan akhirnya benar-benar memperlihatkan perbedaannya:

| Query | Dirancang untuk |
|-------|-----------------|
| `"tagihan listrik PLN"` | BM25 menang — merek eksak ada verbatim di deskripsi |
| `"makan siang di kantor"` | vector menang — deskripsi asli bilang "WARUNG", "RESTO", "MAKAN" |
| `"pengeluaran akhir Maret dan awal April"` | melintasi dua bulan — filter tanggal saja tidak cukup |
| `"all coffee spending this year"` | query English di data Indonesia — uji embedding multilingual |
| `"transfer yang aneh atau mencurigakan"` | tidak ada jawabannya di data — sistem harus berani bilang tidak tahu |

Harness `eval_retrieval.py` diperluas dengan flag `--mode` (dan `--all`), lalu semua varian diukur dengan set yang sama: `vector`, `bm25`, `hybrid`, `vector+rerank`, `hybrid+rerank`, `sentence_window` — MRR@5, P@5, dan latency p50 per varian masuk ke metrics doc. → *Pemenangnya jadi `search_mode` default produksi.*

### Alur data lengkap (mode hybrid, jalur utama)

Contoh di bawah hipotetis — posisi rank-nya ilustratif untuk memperlihatkan mekanismenya, bukan hasil terukur:

```
USER QUERY  "tagihan listrik PLN"
    │
    ├──▶  VECTOR SEARCH (pgvector cosine top-10, probes=10)
    │       rank 1: TAGIHAN INTERNET INDIHOME   ← "tagihan" mirip, tapi salah merek
    │       rank 4: TRANSFER PLN POSTPAID       ← yang benar, kejauhan
    │
    ├──▶  BM25 SEARCH (plainto_tsquery('simple', query), ts_rank, top-10)
    │       rank 1: TRANSFER PLN POSTPAID       ← token "PLN" eksak
    │
    ▼
RRF MERGE (k=60, di Python)
    │   TRANSFER PLN POSTPAID: 1/(60+4) + 1/(60+1) = disepakati dua juri → naik ke #1
    │
    ▼
RERANK (FlashRank — funnel Chapter 4, tidak berubah)
    │
    ▼
LLM + SITASI (POST /ask — grounding + hallucination guard Chapter 4, tidak berubah)
    │
    ▼
EVAL (MRR@5 + P@5 per varian, 15 query termasuk 5 adversarial)
```

---

## Implementasi

Sekarang baru masuk ke kodenya. File yang dibuat/diubah — semua berpusat di service AI Python:

| File | Perubahan |
|------|-----------|
| [{ts}_advanced_rag.sql](../../../supabase/migrations/) | Baru — kolom `description_tsv` + GIN index + tabel `statement_chunks` |
| [models.py](../../../services/ai-service/app/models.py) | Diedit — `search_mode` di `SearchRequest` |
| [retriever.py](../../../services/ai-service/app/services/retriever.py) | Diedit — mode `bm25` + `hybrid` (RRF) |
| [doc_retriever.py](../../../services/ai-service/app/services/doc_retriever.py) | Baru — `DocumentRetriever` di atas `statement_chunks` |
| [auto_merger.py](../../../services/ai-service/app/services/auto_merger.py) | Baru — `AutoMergingRetriever` (sibling-threshold merge) |
| [backfill_statement_chunks.py](../../../services/ai-service/scripts/backfill_statement_chunks.py) | Baru — PDF → chunk → embed → insert (idempotent, `--dry-run`) |
| [main.py](../../../services/ai-service/app/main.py) | Diedit — wiring kedua retriever baru di lifespan |
| [search_queries.json](../../../services/ai-service/evals/search_queries.json) | Diedit — +5 query adversarial |
| [eval_retrieval.py](../../../services/ai-service/evals/eval_retrieval.py) | Diedit — flag `--mode` + `--all` + tabel perbandingan |

**Search mode** — field baru di `SearchRequest`, sengaja *additive-optional*: default-nya tetap `"vector"`, jadi semua pemanggil lama tidak terpengaruh sampai pemenang eval ditetapkan.

```python
search_mode: Literal["vector", "bm25", "hybrid"] = "vector"
```

> **Buat kamu yang biasa C#:** `Literal["vector", "bm25", "hybrid"]` itu setara enum dengan validasi otomatis — Pydantic menolak nilai di luar tiga itu di layer request, seperti model binding + enum di ASP.NET yang menolak nilai tak dikenal sebelum menyentuh handler.

**RRF** — fungsi murni ~12 baris, tanpa I/O, jadi gampang di-test tanpa database:

```python
def _rrf_merge(vector_ids: list[int], bm25_ids: list[int], k: int = 60) -> list[int]:
    """RRF(d) = Σ_list 1 / (k + rank(d, list)) — k=60 dari Cormack et al. SIGIR 2009."""
    scores: dict[int, float] = {}
    for rank, id_ in enumerate(vector_ids, start=1):
        scores[id_] = scores.get(id_, 0.0) + 1.0 / (k + rank)
    for rank, id_ in enumerate(bm25_ids, start=1):
        scores[id_] = scores.get(id_, 0.0) + 1.0 / (k + rank)
    return sorted(scores, key=lambda x: scores[x], reverse=True)
```

Di `RetrievalService.search()`, mode `hybrid` mengambil **top_k penuh dari masing-masing daftar** dulu, baru merge dan potong:

```python
if search_mode == "hybrid":
    vector_ids = [r.transaction_id for r in await self._search_vector(conn, query, top_k, ...)]
    bm25_ids   = await self._search_bm25(conn, query, top_k, ...)
    merged_ids = _rrf_merge(vector_ids, bm25_ids)[:top_k]
    return await self._fetch_results_by_ids(conn, merged_ids)
```

Jalur BM25-nya sendiri satu query SQL — `plainto_tsquery` (bukan `to_tsquery`, yang error kalau disodori kalimat biasa) plus `ts_rank` untuk urutannya:

```sql
WHERE t.description_tsv @@ plainto_tsquery('simple', $1)
ORDER BY ts_rank(t.description_tsv, plainto_tsquery('simple', $1)) DESC
LIMIT $2
```

**DocumentRetriever** — inti "dua wajah"-nya ada di SELECT: yang diranking `embedding` milik `chunk_text`, yang dibawa pulang `window_text`:

```python
sql = """
    SELECT id, upload_id, chunk_text, window_text, chunk_index,
           parent_id, sibling_count,
           1 - (embedding <=> $1::vector) AS similarity
    FROM statement_chunks
    WHERE ($3::text IS NULL OR upload_id = $3)
    ORDER BY embedding <=> $1::vector
    LIMIT $2
"""
async with self._pool.acquire() as conn:
    await conn.execute("SET ivfflat.probes = 10")   # pelajaran Chapter 3 — jangan lupa di tabel baru
    rows = await conn.fetch(sql, query_vec, top_k, upload_id)
```

**AutoMergingRetriever** — logika merge-nya murni in-memory setelah satu kali search (karena `sibling_count` sudah di-denormalisasi ke tiap baris anak):

```python
candidates = await self._retriever.search_documents(query, top_k=top_k * 3, ...)

by_parent: dict[str | None, list[ChunkResult]] = defaultdict(list)
for c in candidates:
    by_parent[c.parent_id].append(c)

for parent_id, children in by_parent.items():
    if parent_id is None:
        merged.extend(children)          # yatim — biarkan apa adanya
        continue
    ratio = len(children) / children[0].sibling_count
    if ratio >= merge_threshold:         # 0.5 — separuh keluarga hadir
        parent = await self._retriever.get_chunk_by_id(parent_id)
        merged.append(parent or ...)     # promosi ke paragraf utuh
    else:
        merged.extend(children)
```

**Backfill** — idempotent (cek `WHERE upload_id = $1` dulu, skip yang sudah ter-index), embedding batch-an 50, dan selalu punya `--dry-run` supaya bisa lihat daftar PDF + jumlah chunk sebelum ada satu baris pun masuk database.

Semua kode lengkap (migration SQL utuh, test mocked untuk ketiga service, harness `--all`) ada di file asli: [PF-AI006-advanced-rag-patterns-todo.md](PF-AI006-advanced-rag-patterns-todo.md), STEP 2–6.

---

## Optimisasi

Keputusan tuning nyata yang diambil di plan chapter ini, dengan alasan konkretnya:

1. **[RRF](glossary-rag-id.md#rrf), bukan weighted sum.** `alpha * vector + (1-alpha) * bm25` butuh dua skor yang sebanding — padahal cosine itu 0–1 dan [`ts_rank`](glossary-rag-id.md#ts-rank) tak terbatas dan bergeser per query. RRF menghapus masalah skala sepenuhnya dengan cuma memakai posisi ranking; k=60 dipakai apa adanya dari paper-nya, bukan angka yang perlu di-tuning ulang untuk korpus sekecil ini.

2. **Config [tsvector](glossary-rag-id.md#tsvector) `'simple'`, bukan `'indonesian'`.** Instance Supabase (managed maupun lokal) belum tentu punya kamus stemming Indonesia, dan deskripsi bank yang pendek-pendek (`BELANJA MAKAN WARTEG`) tidak butuh stemming — token eksak sudah cukup. Kalau `'indonesian'` ternyata terpasang (`SELECT cfgname FROM pg_ts_config;`), tinggal ganti satu kata.

3. **Ambil `top_k` penuh dari tiap daftar sebelum merge, bukan `top_k/2`.** Membagi jatah justru mematikan sifat saling-melengkapi dua juri itu: dokumen yang rank #8 di vector tapi #1 di [BM25](glossary-rag-id.md#bm25) (keyword-exact hit) lenyap kalau BM25 cuma diambil 5. Lebar dulu, merge, baru potong.

4. **[Generated column](glossary-rag-id.md#generated-column), bukan trigger.** `GENERATED ALWAYS AS ... STORED` menjaga `description_tsv` sinkron di tiap INSERT/UPDATE tanpa kode aplikasi dan tanpa satu trigger pun yang harus dirawat. Kolomnya tidak muncul di `SELECT *` supabase-csharp — tidak masalah, karena yang membacanya cuma service Python via asyncpg.

5. **`sibling_count` di-denormalisasi ke tiap baris anak.** Kalau angka itu cuma ada di baris parent, tiap cek merge butuh join atau lookup ekstra. Ditaruh di anak, keputusan merge jadi hitungan in-memory murni setelah satu kali search — nol round-trip tambahan per cluster.

6. **Merge RRF di Python, bukan SQL.** Dua daftar ranking datang dari dua tipe query yang beda (operator `<=>` vs `ts_rank`) dan memang harus diambil terpisah — penggabungannya baru terjadi setelah keduanya di tangan, lewat `_rrf_merge()` yang berupa fungsi murni (bonusnya: bisa di-unit-test tanpa database).

7. **Kandidat lebar (`top_k * 3`) sebelum auto-merge.** Logika threshold butuh melihat cukup banyak saudara supaya rasionya bermakna — pelajaran yang sama dengan [funnel](glossary-rag-id.md#funnel) rerank Chapter 4: corong yang terlalu sempit dari awal tidak menyisakan apa-apa untuk diputuskan.

8. **[`ivfflat`](glossary-rag-id.md#ivfflat) untuk `statement_chunks`: `lists=50`, `probes=10`.** Korpusnya ribuan chunk (bukan jutaan), 50 cluster cukup; dan `probes=10` dipasang dari hari pertama — bug probes Chapter 3 (lihat bagian Kesalahan Umum) tidak perlu kejadian dua kali.

---

## Best Practice

Aturan yang dipegang selama membangun chapter ini, dan kenapa masing-masing penting:

- **[`plainto_tsquery`](glossary-rag-id.md#tsquery) untuk input user, selalu.** `to_tsquery` menuntut format operator (`&`, `:*`) dan melempar error pada kalimat natural seperti "tagihan listrik PLN bulan lalu". Input user itu kalimat, bukan ekspresi boolean.
- **Field API baru harus additive-optional.** `search_mode` default `"vector"` — perilaku semua pemanggil lama tidak berubah satu bit pun sampai eval selesai dan pemenangnya *sengaja* dijadikan default. Fitur baru tidak boleh diam-diam mengubah perilaku yang sudah jalan.
- **Script backfill: idempotent + `--dry-run`.** Cek dulu apa yang sudah ter-index (aman dijalankan ulang kalau terputus), dan selalu bisa dilihat apa yang *akan* terjadi sebelum ada satu baris pun ditulis.
- **Desain eval harus [adversarial](glossary-rag-id.md#adversarial-queries).** Tiap modalitas butuh query di mana dia seharusnya menang; set yang homogen membuat dua teknik yang berbeda kelihatan identik. Ini kebalikan dari "teaching to the test" — kamu sengaja bikin soal yang menguji kelemahan masing-masing.
- **Hand-roll dulu, framework belakangan.** LlamaIndex dan LangChain punya ketiga teknik ini siap pakai — dan keduanya baru masuk di Chapter 7–8, *setelah* kamu membangun sendiri apa yang mereka abstraksikan. Kursus DeepLearning.AI-nya dibaca untuk paham konsep, bukan di-copy kodenya.
- **Logika keputusan = fungsi murni.** `_rrf_merge()` dan aritmetika threshold [auto-merging](glossary-rag-id.md#auto-merging) sengaja tanpa I/O — bisa di-unit-test tanpa mock database sama sekali. Bagian yang paling mudah salah justru bagian yang paling murah di-test.
- **Rationale keputusan di commit body, bukan komentar kode.** Mode pemenang dan delta eval-nya dicatat di pesan commit — komentar "kenapa hybrid" di kode akan basi begitu angka berikutnya keluar; git log tidak.
- **`SET ivfflat.probes` ikut pindah ke jalur kode baru.** Setting [`ivfflat.probes`](glossary-rag-id.md#ivfflat) berlaku per koneksi, dan `DocumentRetriever` mengambil koneksinya sendiri dari pool lewat jalur kode terpisah — jadi jalur search baru harus mengeluarkan `SET`-nya sendiri, bukan berharap mewarisi dari jalur lama.

---

## Kesalahan Umum

> Chapter ini belum dibangun (status: To Do), jadi belum ada bug "kejadian betulan" dari sesi build — bagian ini akan di-update setelah chapter jalan. Tapi plan-nya sudah memetakan jebakan-jebakan yang paling mungkin menggigit; sebagian adalah kelanjutan langsung dari bug *nyata* Chapter 3–4:

1. **`to_tsquery` disodori kalimat biasa.** Format operator wajibnya (`kata & kata`) membuat query natural seperti "tagihan listrik PLN bulan lalu" langsung error. Gejalanya baru muncul di runtime dengan input user sungguhan — pakai [`plainto_tsquery`](glossary-rag-id.md#tsquery) sejak awal.

2. **"Menghemat" dengan mengambil `top_k/2` dari tiap daftar.** Niatnya membatasi total kandidat, hasilnya justru membunuh dokumen yang paling berharga: keyword-exact hit yang rank #1 di [BM25](glossary-rag-id.md#bm25) tapi #8 di vector tidak pernah ikut merge. Ambil `top_k` penuh dari masing-masing, potong *setelah* [RRF](glossary-rag-id.md#rrf).

3. **Merge/rerank di atas daftar yang sama sempitnya.** Pelajaran nyata funnel Chapter 4 terulang di sini: menggabungkan atau menilai ulang 5 kandidat yang itu-itu saja cuma mengocok urutan — lift-nya datang dari kandidat baru yang masuk lewat corong yang lebih lebar.

4. **`merge_threshold = 0.0`.** Artinya "selalu merge": setiap kalimat langsung dipromosikan ke paragrafnya walau cuma satu saudara yang terambil — seluruh logika selektif [auto-merging](glossary-rag-id.md#auto-merging) mati, dan LLM selalu menerima paragraf gemuk berisi kalimat tak relevan.

5. **Menyimpulkan "hybrid tidak membantu" dari eval set homogen.** 10 query lama semuanya semantik — BM25 memang tidak akan pernah kelihatan menang di situ. Tanpa [query adversarial](glossary-rag-id.md#adversarial-queries), tabel perbandingannya bukan mengukur tekniknya, tapi mengukur bias soal ujiannya.

6. **Lupa `SET ivfflat.probes = 10` di `statement_chunks`.** Bug paling mahal Chapter 3 — baseline MRR kelihatan 0.476 gara-gara [`probes=1`](glossary-rag-id.md#ivfflat) cuma memeriksa 1 dari 100 cluster; cerita lengkapnya di [PF-AI004-rag-reranking-generation-id.md](PF-AI004-rag-reranking-generation-id.md), bagian Kesalahan Umum — siap terulang di tabel baru. Setting-nya tidak ikut otomatis, harus dipasang di `DocumentRetriever` juga.

7. **Lookup parent satu-satu di dalam loop merge.** `get_chunk_by_id()` per parent yang lolos threshold = satu round-trip DB per cluster. Untuk korpus sekarang (ratusan PDF, ribuan chunk) masih wajar; begitu skala naik, batch dengan `WHERE id = ANY($1::uuid[])`.

8. **Berasumsi config `'indonesian'` terpasang.** Instance Supabase managed maupun lokal kemungkinan sama-sama tidak punya kamus stemming-nya — migration yang merujuk config yang tidak ada langsung gagal. Cek `SELECT cfgname FROM pg_ts_config;` dulu; `'simple'` adalah default yang aman dan selalu ada.

9. **Nyerah dan lari ke LlamaIndex "biar cepat".** Ketiga teknik ini ada siap pakai di framework — tapi tujuan chapter ini justru bisa *menjelaskan* mekanismenya di interview. Framework-nya menyusul di Chapter 7–8, setelah kamu tahu persis apa yang dia sembunyikan.

---

## Summary

**Masalah yang diselesaikan:** retrieval Chapter 4 masih cosine top-K di atas satu tabel datar — lemah di query kata-kunci eksak ("tagihan listrik PLN"), buta terhadap isi statement PDF (chunker Chapter 4 belum terpakai), dan rawan menyodorkan serpihan paragraf ke LLM. Plus: eval set lama tidak sanggup memperlihatkan perbedaan antar teknik.

**Yang dibangun:**
- **[Hybrid search](glossary-rag-id.md#hybrid-search)** — [BM25](glossary-rag-id.md#bm25) ([tsvector](glossary-rag-id.md#tsvector) `'simple'` + [GIN](glossary-rag-id.md#gin-index) + [`plainto_tsquery`](glossary-rag-id.md#tsquery)) berdampingan dengan vector search, digabung [RRF](glossary-rag-id.md#rrf) k=60; `search_mode` additive-optional di `SearchRequest`.
- **[Sentence-window retrieval](glossary-rag-id.md#sentence-window-retrieval)** — tabel `statement_chunks` (chunk_text di-index, window_text dikembalikan), [backfill](glossary-rag-id.md#backfill) idempotent dari Supabase Storage, `DocumentRetriever`.
- **[Auto-merging](glossary-rag-id.md#auto-merging)** — [hierarki parent/child](glossary-rag-id.md#chunk-hierarchy) di tabel yang sama, `AutoMergingRetriever` dengan [sibling threshold](glossary-rag-id.md#sibling-threshold) 0.5 dan kandidat lebar `top_k * 3`.
- **Eval yang diperluas** — 5 [query adversarial](glossary-rag-id.md#adversarial-queries) + flag `--mode`/`--all` di harness; semua varian diukur dengan set yang sama, pemenangnya jadi default produksi.

**Angka yang jadi patokan (diisi setelah STEP 6 jalan):**

| Varian | MRR@5 | P@5 | Latency p50 |
|--------|-------|-----|-------------|
| `vector` (baseline Ch4) | 1.000 | 0.66 | — |
| `bm25` | *diukur* | *diukur* | *diukur* |
| `hybrid` | *diukur* | *diukur* | *diukur* |
| `vector+rerank` | *diukur* | *diukur* | *diukur* |
| `hybrid+rerank` | *diukur* | *diukur* | *diukur* |
| `sentence_window` | *diukur* | *diukur* | *diukur* |

> **MRR@5 vs P@5, singkatnya:** MRR@5 peduli posisi jawaban relevan *pertama* saja (1.000 = selalu di slot #1); P@5 peduli kualitas *semua* 5 slot top-K sekaligus (0.66 = 66% dari 5 hasil relevan). Baseline `vector` di atas nunjukkan pola sehat untuk RAG — rank teratas selalu akurat — tapi masih ada noise di posisi 2–5. Target varian baru di tabel ini: naikkan P@5 tanpa menjatuhkan MRR@5.

Prediksi plan-nya: `hybrid` menang untuk jalur `/search` + `/ask` (deskripsi bank Indonesia kaya kata kunci eksak — dua jurinya memang saling melengkapi), `sentence_window` menang untuk tanya-jawab level dokumen. Tapi itu hipotesis — tabelnya yang memutuskan.

**Pelajaran terpenting chapter ini:** dua teknik retrieval bisa kelihatan "sama bagusnya" bukan karena memang setara, tapi karena soal ujiannya homogen. Query adversarial — yang sengaja dirancang supaya tiap modalitas punya panggungnya sendiri — adalah yang membuat tabel perbandingan bermakna. Dan pola yang berulang dari chapter-chapter sebelumnya makin kelihatan: lift hampir selalu datang dari *corong yang lebih lebar* (ambil banyak dulu, saring belakangan), dan bug paling mahal hampir selalu datang dari *setting yang diam-diam salah* — probes di sini dan di Chapter 3, config tsvector di chapter ini, publication di Chapter 5 — bukan dari kode yang salah.

**Kalimat penutup untuk interview** (dari file asli, angka diisi setelah eval): *"Saya mengimplementasikan tiga advanced RAG pattern di platform personal finance saya dan mem-benchmark masing-masing dengan eval set yang sama: hybrid BM25+vector via RRF (paling kuat untuk deskripsi bank Indonesia yang kaya kata kunci), sentence-window retrieval di atas statement PDF (kecil untuk dicari, besar untuk dibaca), dan auto-merging (promosi ke paragraf saat kalimat-kalimat satu paragraf muncul berombongan di hasil). Kombinasi pemenangnya [X] — mengangkat P@5 dari 0.66 ke 0.YY, dan query adversarial-lah yang membuat perbandingannya bermakna."*

**Lanjutannya:** Chapter 7 (agents) memakai `DocumentRetriever` dan `AutoMergingRetriever` sebagai *tools* yang dipanggil agent — pola constructor injection yang sama dengan `AnswerService` Chapter 4 membuat strategi retrieval bisa ditukar tanpa menyentuh agent-nya. Detail lengkap TODO steps, acceptance criteria, dan Knowledge Check quiz ada di file asli: [PF-AI006-advanced-rag-patterns-todo.md](PF-AI006-advanced-rag-patterns-todo.md).

---

## 📖 Glossary

Semua istilah baru chapter ini (BM25, tsvector, RRF, hybrid search, sentence-window retrieval, auto-merging, sibling threshold, dll) sudah di-link langsung dari tiap kemunculan pertamanya di atas. Kalau mau lihat semuanya sekaligus, cek file bersama yang dipakai semua chapter RAG: **[Glossary RAG (Bahasa Indonesia)](glossary-rag-id.md)** — istilah chapter ini ada di kategori *Hybrid Search & Advanced Retrieval*.
