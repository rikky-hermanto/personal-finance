# PF-AI006 — Advanced RAG Patterns: Hybrid Search, Sentence-Window, Auto-Merging (Versi Belajar v2)

> **Ini versi tulis ulang.** Versi sebelumnya ([PF-AI006-advanced-rag-patterns-todo-id.md](PF-AI006-advanced-rag-patterns-todo-id.md)) masih disimpan sebagai backup, tidak dihapus. Alasan ditulis ulang: banyak kalimat di versi lama menggabung analogi dan istilah teknis dalam satu napas, jadi harus dibaca dua-tiga kali baru nyantol. Versi ini memecah tiap kalimat jadi satu ide saja, dan menyelesaikan tiap analogi dulu sebelum masuk ke istilah teknisnya.
>
> **Ini juga bukan plan baru.** Sumber faktanya tetap [PF-AI006-advanced-rag-patterns-todo.md](PF-AI006-advanced-rag-patterns-todo.md) — file itu yang jadi rujukan resmi untuk TODO steps, acceptance criteria, dan quiz. Semua angka dan kode di sini diambil apa adanya dari sana.
>
> **Scope tiket ini sekarang cuma Hybrid Search.** Sentence-window dan auto-merging dipindah ke [PF-AI006-PART2](PF-AI006-PART2-sentence-window-automerging-todo.md), karena keduanya butuh data source baru (teks narasi statement PDF) yang belum jadi kebutuhan produk sekarang. Materi tentang dua teknik itu tetap ada di bawah — statusnya bacaan referensi, bukan bagian yang dieksekusi di tiket ini.
>
> **Urutan baca:** masalah dulu, baru konsep, baru cara kerja, baru kode, baru optimisasi, baru best practice, baru kesalahan umum, baru ringkasan. Kalau langsung loncat ke bagian Implementasi, kodenya akan terasa seperti sihir. Baca tiga bagian pertama dulu.
>
> **Ketemu istilah asing?** Semua istilah baru dijelaskan saat pertama kali muncul. Tiap istilah juga di-link ke [Glossary RAG](glossary-rag-id.md) — tinggal klik, tidak perlu scroll balik.
>
> **Prasyarat:** angka baseline Chapter 4 (P@5 dan RAGAS faithfulness) harus sudah tercatat di metrics doc sebelum chapter ini dimulai. STEP 0 di file asli adalah gerbangnya.

---

## Apa Masalahnya

Chapter 4 (PF-AI004) sudah membuat jalur `/ask` cukup matang. Alurnya: retrieval [cosine](glossary-rag-id.md#cosine-similarity) ambil top-10, [re-rank](glossary-rag-id.md#re-ranking) persempit ke top-3, lalu LLM menjawab dengan [sitasi](glossary-rag-id.md#citations) yang tervalidasi. Baseline-nya sudah tercatat: [MRR@5](glossary-rag-id.md#mrr-5) = 1.000, [P@5](glossary-rag-id.md#p-5) = 0.66.

Tapi "matang" di sini ada batasnya. Retrieval-nya masih satu bentuk saja: cosine top-K di atas satu tabel embedding yang datar. Ada tiga celah nyata yang belum tertutup.

**Celah pertama: kata kunci yang eksak justru bikin vector search kalah.** Coba bayangkan query nyata dari aplikasi ini: "tagihan listrik PLN". Maksud user jelas — dia mau transaksi yang deskripsinya memuat kata PLN, persis. Embedding tidak menangkap maksud itu dengan cara yang sama. Bagi embedding, kata "tagihan" adalah sinyal yang kuat, jadi tagihan air, tagihan internet, dan tagihan kartu kredit ikut naik ke posisi atas. Baris yang benar-benar berisi PLN malah tidak dijamin nomor satu. Untuk parafrase, vector search itu jago. Untuk merek dan istilah persis seperti PLN, OVO, atau GoPay, pencocokan kata kunci gaya lama justru lebih bisa diandalkan.

**Celah kedua: satu modul sudah jadi, tapi belum pernah dicolok.** `sentence_window_chunks()` dibangun di Chapter 4. Fungsi itu sudah lulus test. Masalahnya, belum ada satu pun tempat yang memanggilnya di jalur produksi. Akibatnya, `/ask` cuma bisa menjawab dari baris transaksi. Padahal setiap bulan, statement bank dalam bentuk PDF sudah melewati pipeline ekstraksi — teks naratifnya (1 sampai 5 halaman per file) diekstrak, dipakai sebentar untuk mengambil data transaksi, lalu dibuang begitu saja. Pertanyaan tentang isi statement itu sendiri tidak bisa dijawab sama sekali.

**Celah ketiga: kalau teks statement diindeks per kalimat, hasil pencarian bisa berupa serpihan.** Bayangkan query rangkuman: "ringkas semua transaksi belanja online bulan ini". Empat dari hasil teratas bisa saja adalah empat kalimat yang kebetulan berasal dari paragraf yang sama. LLM lalu menerima empat potongan yang saling tumpang tindih. Padahal jawaban terbaiknya sederhana: paragraf itu sendiri, utuh, satu potong saja.

Ada satu masalah lagi yang menyatukan ketiganya. Eval set yang ada sekarang berisi 10 query, dan semuanya ditulis untuk menguji parafrase semantik. Kalau teknik-teknik baru diuji pakai set yang sama, hasilnya hampir pasti seri. Kesimpulan yang muncul bisa salah total — bukan karena tekniknya memang setara, tapi karena soal ujiannya buta terhadap perbedaan itu. Chapter ini menambahkan 5 query adversarial, supaya tiap teknik punya kesempatan menang di kasus yang memang jadi kekuatannya.

Target chapter ini: tiga teknik retrieval lanjutan, masing-masing bisa dinyalakan sendiri-sendiri, masing-masing diukur dengan harness yang sama. Pemenangnya jadi default produksi.

---

## Konsep Sederhananya

### Hybrid search — dua juri lomba

Bayangkan sebuah lomba dengan dua juri yang keahliannya berbeda total. Juri pertama sangat peka terhadap makna — dia bisa menangkap kalau dua kalimat bicara soal hal yang sama meskipun kata-katanya berbeda jauh. Juri kedua tidak peduli soal makna sama sekali — dia cuma menghitung apakah kata yang dicari muncul persis di teks, dan seberapa sering.

Juri pertama itu vector search. Juri kedua itu [BM25](glossary-rag-id.md#bm25), algoritme scoring kata kunci klasik.

Masalahnya, dua juri ini memberi nilai dengan skala yang sama sekali berbeda. Juri pertama selalu memberi angka antara 0 dan 1. Juri kedua bisa memberi angka berapa saja, tidak ada batas atasnya, dan skalanya berubah-ubah tergantung soal yang dinilai. Menjumlahkan dua nilai ini secara langsung sama seperti menjumlahkan nilai ujian dalam skala 0–100 dengan nilai kredit dalam skala yang tidak ditentukan — hasilnya tidak berarti apa-apa.

Solusinya bukan menjumlahkan nilai kedua juri. Solusinya menjumlahkan urutan peringkat yang mereka berikan. Nama tekniknya [RRF](glossary-rag-id.md#rrf), singkatan dari Reciprocal Rank Fusion.

### Sentence-window retrieval — kartu katalog perpustakaan

Bayangkan sebuah perpustakaan lama dengan kartu katalog. Setiap kartu berisi ringkasan singkat satu buku — judul, satu kalimat tentang isinya. Kamu mencari lewat kartu-kartu itu, karena mencari lewat rak buku satu per satu terlalu lambat.

Tapi begitu kamu menemukan kartu yang cocok, kamu tidak berhenti di kartunya. Kamu mengambil bukunya, lalu membaca isi buku itu untuk benar-benar menjawab pertanyaanmu.

Yang kamu *cari* adalah kartu kecil dan ringkas. Yang kamu *baca* adalah bukunya yang lengkap. Dalam sentence-window retrieval, kartu kecil itu adalah satu kalimat, dan "buku"-nya adalah kalimat itu ditambah beberapa kalimat tetangga di kiri-kanannya.

Konsep "kecil untuk dicari, besar untuk dibaca" ini sebetulnya sudah dikenalkan di Chapter 4 lewat fungsi `sentence_window_chunks()`. Chapter ini yang benar-benar menyalakan listriknya di produksi: tabel baru, script backfill, dan retriever yang jalan sungguhan.

### Auto-merging — aturan keluarga

Bayangkan sebuah acara keluarga besar dengan banyak keluarga inti di dalamnya. Panitia ingin tahu keluarga mana saja yang hadir. Kalau cuma satu dari lima anggota sebuah keluarga yang datang, panitia mencatat orang itu saja. Tapi kalau tiga dari lima anggota keluarga yang sama ternyata hadir, panitia menyimpulkan satu hal yang lebih masuk akal: keluarga itu memang datang, jadi undang saja seluruh keluarganya sekalian, termasuk kepala keluarganya.

Auto-merging bekerja dengan logika yang sama. Ketika lebih dari separuh kalimat dari satu paragraf sama-sama muncul di hasil pencarian, itu adalah bukti kuat bahwa paragraf itulah yang relevan, bukan cuma kalimat-kalimat lepasnya. Sistem lalu mengganti kumpulan kalimat yang terpisah-pisah itu dengan satu paragraf utuh.

### Posisi ketiganya di pipeline

Semua bagian bertanda 🔄 di bawah ini adalah tambahan chapter ini. Bagian lainnya adalah baseline Chapter 4 yang tidak berubah.

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
[Rerank]          FlashRank top-3           [Sentence-window index]   🔄  (referensi,
    │                                         statement_chunks:            dieksekusi
    ▼                                         cari chunk_text kecil,       di PART2)
[LLM + sitasi]    POST /ask                   kembalikan window_text

MRR@5=1.000 · P@5=0.66                      [Auto-merging]            🔄  (referensi,
                                              hierarki parent_id:          dieksekusi
                                              serpihan → paragraf utuh     di PART2)

                                            [Eval] +5 query adversarial
                                            [Winner] jadi default produksi
```

> **Cara baca `MRR@5=1.000 · P@5=0.66`:** MRR@5 mengukur satu hal saja — posisi jawaban relevan yang *pertama* kali muncul. Nilai 1.000 berarti jawaban relevan pertama selalu muncul di peringkat #1. Ini bukan "100% benar" seperti persentase biasa. P@5 mengukur hal yang berbeda — proporsi hasil yang relevan dari 5 hasil teratas. Nilai 0.66 berarti dari 5 hasil, rata-rata sekitar 3,3 di antaranya benar-benar relevan, sisanya noise. Kedua angka ini berkisar 0.0 sampai 1.0. Makin dekat ke 1.0, makin bagus.

---

## Cara Kerja

Bagian ini menjelaskan tiap konsep seperti belajar naik tangga. Mulai dari versi paling sederhana yang masih jalan. Lihat di mana versi itu mentok. Baru pahami kenapa versi berikutnya dibutuhkan.

### Hybrid search — dua juri, satu daftar akhir

**Anak tangga 1: vector search saja.** Ini yang dipakai Chapter 3 dan 4. Query di-embed, dibandingkan lewat [cosine similarity](glossary-rag-id.md#cosine-similarity) ke semua embedding transaksi, lalu diambil 10 teratas. Untuk query seperti "makan siang di kantor" — padahal deskripsi aslinya "WARUNG", "RESTO", "MAKAN" — cara ini menang telak. Embedding memang dibuat untuk menangkap kedekatan makna seperti itu.

Anak tangga ini mentok di satu titik. Query "tagihan listrik PLN" tidak dijamin mengangkat baris ber-PLN ke posisi teratas. Bagi ruang vektor, semua "tagihan" itu saling bertetangga — tagihan listrik, tagihan air, tagihan internet, semuanya dianggap mirip. Yang dibutuhkan di kasus ini adalah pencocokan kata yang persis, dan itu bukan keahlian embedding.

**Anak tangga 2: tambahkan juri kata kunci.** [BM25](glossary-rag-id.md#bm25) adalah algoritme scoring dari dunia search engine lama. Dokumen dapat skor tinggi kalau kata yang dicari muncul persis di dalamnya, dibobot seberapa sering kata itu muncul dan seberapa langka kata itu di seluruh koleksi data. BM25 tidak paham sinonim sama sekali — dan justru itu kekuatannya untuk merek serta istilah eksak.

Di PostgreSQL, BM25 didekati lewat [tsvector](glossary-rag-id.md#tsvector). Kolom `description_tsv` dihitung otomatis dari kolom `description`, lewat [generated column](glossary-rag-id.md#generated-column), bukan trigger. Kolom itu diindeks dengan [GIN](glossary-rag-id.md#gin-index), dicari dengan [`plainto_tsquery`](glossary-rag-id.md#tsquery), dan diranking dengan [`ts_rank`](glossary-rag-id.md#ts-rank). Config yang dipakai adalah `'simple'` — tokenisasi per kata, tanpa stemming. Deskripsi bank Indonesia pendek dan sudah apa adanya, seperti "BELANJA MAKAN" atau "TRANSFER PLN". Pencocokan token eksak sudah cukup untuk teks sependek itu. Config `'indonesian'` juga belum tentu terpasang di instance Supabase.

Anak tangga ini juga mentok, tapi di titik yang berbeda. Sekarang ada dua daftar ranking, dan skor keduanya tidak bisa dijumlahkan begitu saja. Cosine similarity berkisar 0 sampai 1. `ts_rank` adalah bobot log-frekuensi yang tidak berbatas, dan skalanya berubah tiap query. Rumus seperti `0.7 * vector + 0.3 * bm25` kelihatan masuk akal di atas kertas. Kenyataannya, salah satu juri bisa diam-diam mendominasi total, atau bahkan lenyap sama sekali — dan kamu tidak akan tahu kapan itu terjadi, karena skalanya bergeser tiap kali query berbeda.

**Anak tangga 3: gabungkan peringkat, bukan skor.** [RRF](glossary-rag-id.md#rrf) membuang skor mentah sepenuhnya. Yang dipakai cuma posisi peringkat tiap dokumen di masing-masing daftar. Dokumen di posisi tertentu menyumbang nilai `1/(k + posisi)`, lalu nilai itu dijumlahkan dari semua daftar tempat dokumen itu muncul. Posisi peringkat selalu berupa angka 1, 2, 3, dan seterusnya, di daftar mana pun — jadi tidak perlu normalisasi apa-apa lagi.

Konstanta k=60 diambil dari paper aslinya, Cormack dkk., SIGIR 2009. Angka itu di-tuning di benchmark TREC dan terbukti tetap bagus di berbagai jenis data. Cara kerjanya gampang dicek dengan angka: dokumen yang berada di peringkat #1 pada *kedua* daftar mendapat `1/61 + 1/61`, sekitar 0.033. Dokumen yang cuma peringkat #1 di satu daftar saja mendapat `1/61`, sekitar 0.016. Dokumen yang disepakati dua juri sekaligus selalu menang melawan dokumen yang cuma diunggulkan satu juri.

Penggabungan ini dilakukan di kode Python, bukan di SQL. Alasannya sederhana: dua daftar itu datang dari dua jenis query yang berbeda — satu memakai operator `<=>` untuk vector search, satu memakai `ts_rank` untuk BM25 — jadi keduanya memang harus diambil terpisah dulu.

Ini yang dipakai chapter ini untuk mode `hybrid`.

▶ **Baca untuk konsep ini:** [pgvector hybrid search README](https://github.com/pgvector/pgvector#hybrid-search) — contoh SQL RRF di sana jadi jangkar kode untuk STEP 3.

### Sentence-window retrieval — dari fungsi murni jadi jalur produksi (referensi, dieksekusi di PART2)

**Anak tangga 1: embed satu dokumen jadi satu vector.** Cara paling sederhana untuk membuat teks statement PDF bisa dicari: ambil seluruh teks satu halaman, lalu embed jadi satu vector saja.

Cara ini mentok cepat. Satu halaman statement Superbank berisi ringkasan akun, 30 transaksi, dan catatan kecil soal biaya. Satu embedding untuk semua itu jadi semacam rata-rata makna dari ratusan kalimat berbeda. Query seperti "bayar PLN bulan Maret" nyaris tidak menang melawan noise, karena vektor halamannya sendiri sebagian besar mewakili hal lain.

**Anak tangga 2: potong jadi kalimat.** Split teks jadi kalimat-kalimat, lalu embed tiap kalimat sendiri-sendiri. Ini persis yang dilakukan `sentence_window_chunks()` di [chunker.py](../../../services/ai-service/app/services/chunker.py) — fungsi ini dibangun dan diuji di Chapter 4, tapi belum pernah dicolokkan ke produksi.

Pencarian sekarang jadi presisi. Query "bayar PLN bulan Maret" menemukan kalimat yang tepat, misalnya "Bayar PLN Rp 250.000". Tapi ada jebakan baru di sini: kalau kalimat telanjang itu langsung dikirim ke LLM, LLM tidak bisa menjawab pertanyaan susulan seperti "dibayar tanggal berapa, dari rekening mana?" Konteks tanggal dan rekening ada di kalimat-kalimat tetangga — dan kalimat-kalimat itu terpotong justru oleh proses chunking yang membuat pencariannya presisi.

**Anak tangga 3: simpan dua representasi sekaligus.** Tiap baris di tabel `statement_chunks` menyimpan dua kolom. `chunk_text` adalah satu kalimat kecil — ini yang di-embed dan dicari. `window_text` adalah kalimat itu ditambah kira-kira dua kalimat tetangga di tiap sisi — ini yang dikembalikan ke LLM. Prinsipnya: kecil untuk dicari, besar untuk dibaca.

Script backfill mengambil semua PDF lama dari Supabase Storage, mengekstrak teksnya, memotongnya lewat `sentence_window_chunks()`, meng-embed dalam batch 50, lalu menyimpan ke tabel. `DocumentRetriever` yang baru mencari lewat `chunk_text`, tapi selalu mengembalikan `window_text` ke pemanggilnya.

▶ **Baca untuk konsep ini:** [LlamaIndex — Sentence Window Retrieval](https://docs.llamaindex.ai/en/stable/examples/node_postprocessor/MetadataReplacementDemo/) — perhatikan diagram `index_node` versus `window_node`, itu mental model yang sama dengan yang dibangun di sini secara manual.

### Auto-merging — melebar hanya kalau ada bukti (referensi, dieksekusi di PART2)

**Anak tangga 1: sentence-window selalu melebar.** Setiap kalimat yang ketemu selalu dibawa bersama window-nya, tanpa syarat apa pun. Untuk query yang mencari satu fakta spesifik — misalnya "berapa bayar PLN?" — cara ini pas.

Cara ini mentok pada query yang sifatnya merangkum. Query "ringkas semua transaksi belanja online bulan ini" bisa saja mengambil empat kalimat, dan keempatnya ternyata berasal dari paragraf yang sama. Hasilnya empat window yang saling tumpang tindih, isinya berulang-ulang, dan LLM harus menjahit sendiri paragraf yang sebenarnya sudah utuh di dokumen aslinya.

**Anak tangga 2: kelompokkan per induk, lalu hitung rasionya.** Saat proses indexing, tiap lima kalimat digabung jadi satu baris induk — level 1 untuk paragraf, level 0 untuk kalimat. Hubungan ini disimpan lewat kolom `parent_id`, dan tiap kalimat anak menyimpan `sibling_count`, yaitu jumlah total saudara di bawah induk yang sama.

Saat pencarian berjalan, `AutoMergingRetriever` mula-mula mengambil kandidat dalam jumlah lebih banyak dari biasanya — tiga kali lipat dari `top_k`. Kandidat itu dikelompokkan berdasarkan `parent_id`-nya. Untuk tiap kelompok, dihitung rasio: jumlah kalimat dari kelompok itu yang ikut terambil, dibagi `sibling_count`. Kalau rasio itu mencapai ambang batas 0.5, artinya separuh lebih anggota keluarga hadir — kumpulan kalimat itu diganti dengan satu baris induk saja. Kalau rasionya di bawah itu, kalimat-kalimat itu dibiarkan berdiri sendiri-sendiri. Langkah terakhir adalah menghapus duplikat dan memotong hasil sampai `top_k`.

Ini yang membedakan auto-merging dari sentence-window, dan ini poin yang enak dipakai saat interview. Sentence-window selalu melebar, tanpa syarat. Auto-merging cuma melebar kalau ada bukti — yaitu saudara-saudaranya ikut terambil juga.

▶ **Baca untuk konsep ini:** [LlamaIndex — Auto-Merging Retriever](https://docs.llamaindex.ai/en/stable/examples/retrievers/auto_merging_retriever/) — fokus ke konsep sibling threshold dan bentuk hierarki node-nya, bukan ke kode framework-nya.

### Eval — kenapa butuh query adversarial

Set eval lama berisi 10 query, dan semuanya ditulis untuk menguji parafrase semantik. Kalau hybrid dan vector diuji pakai set ini saja, hasilnya nyaris pasti seri. Bukan karena kedua teknik itu setara — tapi karena tidak ada satu pun query di set itu yang memberi BM25 kesempatan untuk menang.

Solusinya menambahkan 5 [query adversarial](glossary-rag-id.md#adversarial-queries), masing-masing dirancang supaya satu modalitas tertentu memang seharusnya menang:

| Query | Dirancang untuk |
|-------|-----------------|
| "tagihan listrik PLN" | BM25 menang — merek eksak ada verbatim di deskripsi |
| "makan siang di kantor" | vector menang — deskripsi asli bilang "WARUNG", "RESTO", "MAKAN" |
| "pengeluaran akhir Maret dan awal April" | melintasi dua bulan — filter tanggal saja tidak cukup |
| "all coffee spending this year" | query berbahasa Inggris di atas data berbahasa Indonesia |
| "transfer yang aneh atau mencurigakan" | tidak ada jawaban pastinya di data — sistem harus berani bilang tidak tahu |

Harness `eval_retrieval.py` diperluas dengan flag `--mode` dan `--all`. Semua varian diukur pakai set query yang sama: `vector`, `bm25`, `hybrid`, `vector+rerank`, `hybrid+rerank`, dan `sentence_window`. MRR@5, P@5, dan latency p50 tiap varian dicatat di metrics doc. Pemenangnya jadi `search_mode` default di produksi.

### Alur data lengkap untuk mode hybrid

Contoh di bawah ini hipotetis. Posisi peringkatnya cuma ilustrasi untuk memperlihatkan mekanismenya, bukan hasil terukur sungguhan.

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
    │   TRANSFER PLN POSTPAID: 1/(60+4) + 1/(60+1) → disepakati dua juri → naik ke #1
    │
    ▼
RERANK (FlashRank — funnel Chapter 4, tidak berubah)
    │
    ▼
LLM + SITASI (POST /ask — grounding dan hallucination guard Chapter 4, tidak berubah)
    │
    ▼
EVAL (MRR@5 dan P@5 per varian, 15 query termasuk 5 adversarial)
```

---

## Implementasi

Sekarang masuk ke kodenya. File yang dibuat atau diubah semuanya berpusat di service AI Python:

| File | Perubahan |
|------|-----------|
| [{ts}_advanced_rag.sql](../../../supabase/migrations/) | Baru — kolom `description_tsv` + GIN index + tabel `statement_chunks` |
| [models.py](../../../services/ai-service/app/models.py) | Diedit — field `search_mode` di `SearchRequest` |
| [retriever.py](../../../services/ai-service/app/services/retriever.py) | Diedit — mode `bm25` dan `hybrid` (RRF) |
| [doc_retriever.py](../../../services/ai-service/app/services/doc_retriever.py) | Baru — `DocumentRetriever` di atas `statement_chunks` (PART2) |
| [auto_merger.py](../../../services/ai-service/app/services/auto_merger.py) | Baru — `AutoMergingRetriever` (PART2) |
| [backfill_statement_chunks.py](../../../services/ai-service/scripts/backfill_statement_chunks.py) | Baru — PDF → chunk → embed → insert, idempotent, punya `--dry-run` (PART2) |
| [main.py](../../../services/ai-service/app/main.py) | Diedit — wiring retriever baru di lifespan |
| [search_queries.json](../../../services/ai-service/evals/search_queries.json) | Diedit — tambah 5 query adversarial |
| [eval_retrieval.py](../../../services/ai-service/evals/eval_retrieval.py) | Diedit — flag `--mode`, `--all`, dan tabel perbandingan |

**Search mode.** Field baru ini sengaja bersifat additive-optional. Nilai defaultnya tetap `"vector"`, jadi semua pemanggil lama tidak terpengaruh sampai pemenang eval benar-benar ditetapkan.

```python
search_mode: Literal["vector", "bm25", "hybrid"] = "vector"
```

> **Buat kamu yang biasa C#:** `Literal["vector", "bm25", "hybrid"]` di Pydantic setara dengan enum yang tervalidasi otomatis. Pydantic menolak nilai di luar tiga pilihan itu di layer request — mirip dengan model binding plus enum di ASP.NET yang menolak nilai tak dikenal sebelum menyentuh handler.

**RRF.** Fungsi murni sekitar 12 baris, tanpa I/O sama sekali, jadi gampang di-test tanpa database:

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

Di `RetrievalService.search()`, mode `hybrid` mengambil `top_k` penuh dari masing-masing daftar dulu, baru menggabungkan dan memotongnya:

```python
if search_mode == "hybrid":
    vector_ids = [r.transaction_id for r in await self._search_vector(conn, query, top_k, ...)]
    bm25_ids   = await self._search_bm25(conn, query, top_k, ...)
    merged_ids = _rrf_merge(vector_ids, bm25_ids)[:top_k]
    return await self._fetch_results_by_ids(conn, merged_ids)
```

Jalur BM25 sendiri cukup satu query SQL. `plainto_tsquery` dipakai, bukan `to_tsquery`, karena `to_tsquery` melempar error kalau disodori kalimat biasa:

```sql
WHERE t.description_tsv @@ plainto_tsquery('simple', $1)
ORDER BY ts_rank(t.description_tsv, plainto_tsquery('simple', $1)) DESC
LIMIT $2
```

**DocumentRetriever (referensi, PART2).** Inti dari "dua representasi" ada di satu baris SELECT: yang dipakai untuk ranking adalah `embedding` milik `chunk_text`, tapi yang dikembalikan ke pemanggil adalah `window_text`:

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

**AutoMergingRetriever (referensi, PART2).** Logika merge-nya murni perhitungan di memori setelah satu kali search, karena `sibling_count` sudah disimpan langsung di tiap baris anak:

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

**Backfill (referensi, PART2).** Script ini idempotent — sebelum insert, dia mengecek dulu apakah `upload_id` sudah ada di tabel, jadi aman dijalankan berkali-kali. Embedding dilakukan dalam batch 50. Flag `--dry-run` selalu tersedia, supaya kamu bisa melihat daftar PDF dan jumlah chunk-nya sebelum satu baris pun benar-benar masuk database.

Kode lengkap — migration SQL utuh, test yang di-mock untuk ketiga service, dan harness dengan flag `--all` — ada di file asli: [PF-AI006-advanced-rag-patterns-todo.md](PF-AI006-advanced-rag-patterns-todo.md), STEP 2 sampai STEP 6.

---

## Optimisasi

Berikut keputusan tuning yang diambil di plan chapter ini, beserta alasan konkretnya.

1. **RRF, bukan weighted sum.** Rumus `alpha * vector + (1-alpha) * bm25` membutuhkan dua skor yang sebanding. Padahal cosine berkisar 0 sampai 1, sedangkan `ts_rank` tidak terbatas dan bergeser tiap query. RRF menghilangkan masalah skala ini sepenuhnya, karena hanya memakai posisi peringkat. Konstanta k=60 dipakai apa adanya dari paper aslinya — bukan angka yang perlu di-tuning ulang untuk korpus sekecil ini.

2. **Config tsvector `'simple'`, bukan `'indonesian'`.** Instance Supabase, baik yang managed maupun lokal, belum tentu punya kamus stemming Indonesia terpasang. Deskripsi bank yang pendek, seperti "BELANJA MAKAN WARTEG", juga tidak butuh stemming — token eksak sudah cukup untuk teks sesingkat itu. Kalau ternyata config `'indonesian'` sudah terpasang (cek dengan `SELECT cfgname FROM pg_ts_config;`), tinggal ganti satu kata di kode.

3. **Ambil `top_k` penuh dari tiap daftar sebelum merge, jangan `top_k/2`.** Membagi jatah kelihatan hemat, tapi justru mematikan sifat saling melengkapi dari dua juri itu. Dokumen yang rank #8 di vector tapi rank #1 di BM25 — sebuah keyword-exact hit yang sangat relevan — bisa lenyap kalau BM25 cuma diambil 5. Aturannya: ambil lebar dulu dari masing-masing daftar, gabungkan, baru potong.

4. **Generated column, bukan trigger.** `GENERATED ALWAYS AS ... STORED` menjaga `description_tsv` tetap sinkron di tiap INSERT dan UPDATE, tanpa kode aplikasi tambahan dan tanpa trigger yang perlu dirawat. Kolom ini memang tidak muncul di `SELECT *` lewat supabase-csharp — tapi itu tidak masalah, karena yang membacanya cuma service Python lewat asyncpg.

5. **`sibling_count` disimpan langsung di tiap baris anak.** Kalau angka itu cuma ada di baris induk, tiap kali mengecek syarat merge butuh join atau lookup tambahan. Dengan disimpan di anak, keputusan merge jadi perhitungan murni di memori setelah satu kali search — tidak ada round-trip database tambahan per kelompok.

6. **Merge RRF dilakukan di Python, bukan SQL.** Dua daftar ranking datang dari dua jenis query yang berbeda — operator `<=>` untuk vector, `ts_rank` untuk BM25 — dan memang harus diambil terpisah lebih dulu. Penggabungannya baru terjadi setelah keduanya ada di tangan, lewat `_rrf_merge()` yang berbentuk fungsi murni. Bonusnya, fungsi ini bisa di-unit-test tanpa database sama sekali.

7. **Ambil kandidat lebih banyak, `top_k * 3`, sebelum auto-merge.** Logika threshold butuh melihat cukup banyak saudara supaya rasionya bermakna. Ini pelajaran yang sama dengan funnel rerank di Chapter 4 — corong yang terlalu sempit dari awal tidak menyisakan apa-apa untuk diputuskan belakangan.

8. **Setting ivfflat untuk `statement_chunks`: `lists=50`, `probes=10`.** Korpusnya berukuran ribuan chunk, bukan jutaan, jadi 50 cluster sudah cukup. Setting `probes=10` dipasang sejak hari pertama, supaya bug probes yang pernah terjadi di Chapter 3 tidak terulang lagi (lihat bagian Kesalahan Umum).

---

## Best Practice

Berikut aturan yang dipegang selama membangun chapter ini, dan alasan tiap aturan itu penting.

- **Pakai `plainto_tsquery` untuk input dari user, selalu.** `to_tsquery` menuntut format operator seperti `&` dan `:*`, dan langsung error kalau disodori kalimat natural seperti "tagihan listrik PLN bulan lalu". Input dari user adalah kalimat biasa, bukan ekspresi boolean.
- **Field API baru harus additive-optional.** `search_mode` defaultnya `"vector"`, jadi perilaku semua pemanggil lama tidak berubah sedikit pun sampai eval selesai dan pemenangnya sengaja dijadikan default. Fitur baru tidak boleh diam-diam mengubah perilaku yang sudah berjalan.
- **Script backfill harus idempotent dan punya `--dry-run`.** Cek dulu apa yang sudah terindeks, supaya aman dijalankan ulang kalau prosesnya terputus di tengah jalan. Selalu bisa dilihat apa yang *akan* terjadi, sebelum satu baris pun benar-benar ditulis.
- **Desain eval harus adversarial.** Tiap modalitas retrieval butuh setidaknya satu query di mana dia memang seharusnya menang. Set query yang homogen membuat dua teknik yang sebenarnya berbeda kelihatan identik. Ini kebalikan dari "teaching to the test" — di sini kamu sengaja membuat soal yang menguji kelemahan masing-masing teknik.
- **Bangun manual dulu, baru pakai framework.** LlamaIndex dan LangChain sudah punya ketiga teknik ini siap pakai. Tapi keduanya baru masuk di Chapter 7 dan 8, setelah kamu membangun sendiri apa yang mereka sembunyikan di baliknya. Kursus DeepLearning.AI dibaca untuk memahami konsepnya, bukan untuk disalin kodenya.
- **Logika keputusan harus jadi fungsi murni.** `_rrf_merge()` dan perhitungan ambang batas auto-merging sengaja ditulis tanpa I/O sama sekali. Keduanya bisa di-unit-test tanpa mock database. Bagian kode yang paling gampang salah justru bagian yang paling murah untuk ditest — itu bukan kebetulan, itu desain.
- **Rationale keputusan ditulis di commit body, bukan di komentar kode.** Mode pemenang dan angka delta eval-nya dicatat di pesan commit. Komentar "kenapa hybrid" di dalam kode akan basi begitu angka berikutnya keluar, sementara git log tidak.
- **`SET ivfflat.probes` harus ikut dipasang di jalur kode baru.** Setting ini berlaku per koneksi database. `DocumentRetriever` mengambil koneksinya sendiri dari pool lewat jalur kode yang terpisah dari retriever lama — jadi jalur baru harus mengeluarkan perintah `SET`-nya sendiri, bukan berharap warisan dari jalur lama.

---

## Kesalahan Umum

> Chapter ini masih berstatus To Do, jadi belum ada bug yang benar-benar terjadi dari sesi build. Bagian ini akan diperbarui setelah chapter jalan. Tapi plan-nya sudah memetakan jebakan-jebakan yang paling mungkin muncul. Sebagian di antaranya adalah kelanjutan langsung dari bug yang memang pernah terjadi di Chapter 3 dan 4.

1. **`to_tsquery` disodori kalimat biasa.** Format operatornya wajib, misalnya "kata & kata", jadi kalimat natural seperti "tagihan listrik PLN bulan lalu" langsung memicu error. Gejalanya baru muncul saat runtime, waktu ada input dari user sungguhan. Solusinya: pakai `plainto_tsquery` sejak awal.

2. **Mencoba "menghemat" dengan mengambil `top_k/2` dari tiap daftar.** Niatnya membatasi jumlah total kandidat. Hasilnya justru membunuh dokumen yang paling berharga — keyword-exact hit yang rank #1 di BM25 tapi rank #8 di vector tidak pernah ikut proses merge. Solusinya: ambil `top_k` penuh dari masing-masing daftar, potong hasilnya *setelah* RRF selesai.

3. **Merge atau rerank di atas daftar kandidat yang sudah sempit dari awal.** Ini pelajaran nyata dari funnel Chapter 4 yang terulang lagi di sini. Menggabungkan atau menilai ulang lima kandidat yang itu-itu saja cuma mengocok urutannya. Peningkatan sesungguhnya datang dari kandidat baru yang masuk lewat corong yang lebih lebar.

4. **Mengatur `merge_threshold` ke 0.0.** Ini berarti "selalu merge" — setiap kalimat langsung dipromosikan ke paragrafnya, walaupun cuma satu saudara yang ikut terambil. Seluruh logika selektif auto-merging jadi mati total, dan LLM selalu menerima paragraf gemuk yang penuh kalimat tidak relevan.

5. **Menyimpulkan "hybrid tidak membantu" dari eval set yang homogen.** 10 query lama semuanya menguji parafrase semantik, jadi BM25 memang tidak akan pernah kelihatan menang di situ. Tanpa query adversarial, tabel perbandingan yang dihasilkan bukan mengukur tekniknya — yang terukur justru bias dari soal ujiannya sendiri.

6. **Lupa memasang `SET ivfflat.probes = 10` di `statement_chunks`.** Ini bug paling mahal di Chapter 3. Baseline MRR sempat kelihatan cuma 0.476, gara-gara `probes=1` cuma memeriksa 1 dari 100 cluster yang ada. Cerita lengkapnya ada di [PF-AI004-rag-reranking-generation-id.md](PF-AI004-rag-reranking-generation-id.md), bagian Kesalahan Umum. Bug ini siap terulang di tabel baru kalau setting-nya tidak dipasang eksplisit di `DocumentRetriever` juga.

7. **Melakukan lookup induk satu per satu di dalam loop merge.** Memanggil `get_chunk_by_id()` untuk tiap induk yang lolos threshold berarti satu round-trip database per kelompok. Untuk korpus sekarang, yang masih berukuran ratusan PDF dan ribuan chunk, ini masih wajar. Begitu skalanya naik, ganti dengan satu query batch memakai `WHERE id = ANY($1::uuid[])`.

8. **Berasumsi config `'indonesian'` sudah terpasang.** Instance Supabase, baik managed maupun lokal, kemungkinan besar sama-sama tidak punya kamus stemming-nya. Migration yang merujuk config yang tidak ada akan langsung gagal. Cek dulu dengan `SELECT cfgname FROM pg_ts_config;` — config `'simple'` adalah pilihan aman yang selalu tersedia.

9. **Menyerah dan langsung lari ke LlamaIndex supaya cepat.** Ketiga teknik ini memang sudah tersedia siap pakai di framework itu. Tapi tujuan chapter ini justru supaya kamu bisa menjelaskan mekanismenya sendiri saat interview. Framework-nya menyusul di Chapter 7 dan 8, setelah kamu tahu persis apa yang disembunyikan di baliknya.

---

## Summary

**Masalah yang diselesaikan.** Retrieval di Chapter 4 masih berupa cosine top-K di atas satu tabel embedding yang datar. Itu lemah menghadapi query kata kunci eksak seperti "tagihan listrik PLN". Itu juga buta terhadap isi statement PDF, karena chunker dari Chapter 4 belum pernah dipakai di produksi. Ditambah lagi, cara indeks per kalimat rawan menyodorkan paragraf yang terpecah-pecah ke LLM. Dan sebagai masalah yang menyatukan semuanya: eval set lama tidak sanggup memperlihatkan perbedaan antar teknik.

**Yang dibangun di tiket ini:**
- **Hybrid search** — BM25 (tsvector `'simple'`, GIN index, `plainto_tsquery`) berjalan berdampingan dengan vector search, digabung lewat RRF k=60. Field `search_mode` ditambahkan ke `SearchRequest` secara additive-optional.

**Yang tetap jadi materi belajar, tapi dieksekusi di PART2:**
- **Sentence-window retrieval** — tabel `statement_chunks` (chunk_text diindeks, window_text dikembalikan), backfill idempotent dari Supabase Storage, `DocumentRetriever`.
- **Auto-merging** — hierarki parent/child di tabel yang sama, `AutoMergingRetriever` dengan sibling threshold 0.5 dan kandidat lebar `top_k * 3`.

**Eval yang diperluas** untuk seluruh chapter ini: 5 query adversarial ditambah flag `--mode` dan `--all` di harness. Semua varian diukur dengan set query yang sama, dan pemenangnya jadi default produksi.

**Angka patokan (diisi setelah eval STEP 6 benar-benar jalan):**

| Varian | MRR@5 | P@5 | Latency p50 |
|--------|-------|-----|-------------|
| `vector` (baseline Ch4) | 1.000 | 0.66 | — |
| `bm25` | *diukur* | *diukur* | *diukur* |
| `hybrid` | *diukur* | *diukur* | *diukur* |
| `vector+rerank` | *diukur* | *diukur* | *diukur* |
| `hybrid+rerank` | *diukur* | *diukur* | *diukur* |
| `sentence_window` | *diukur* | *diukur* | *diukur* |

> **MRR@5 vs P@5, singkatnya:** MRR@5 cuma peduli pada posisi jawaban relevan yang pertama. Nilai 1.000 berarti jawaban itu selalu ada di slot #1. P@5 peduli pada kualitas semua 5 slot top-K sekaligus. Nilai 0.66 berarti 66% dari 5 hasil itu relevan. Baseline `vector` di atas menunjukkan pola yang sehat untuk RAG — rank teratas selalu akurat — tapi masih ada noise di posisi 2 sampai 5. Target varian baru di tabel ini adalah menaikkan P@5 tanpa menjatuhkan MRR@5.

Prediksi dari plan ini: `hybrid` akan menang untuk jalur `/search` dan `/ask`, karena deskripsi bank Indonesia kaya kata kunci eksak — dua juri di dalamnya memang saling melengkapi. `sentence_window` diperkirakan menang untuk tanya-jawab level dokumen. Tapi ini baru hipotesis. Tabel eval-lah yang akan memutuskan.

**Pelajaran terpenting chapter ini.** Dua teknik retrieval bisa kelihatan sama bagusnya, padahal bukan karena keduanya memang setara — melainkan karena soal ujiannya homogen. Query adversarial, yang sengaja dirancang supaya tiap modalitas punya panggungnya sendiri, adalah yang membuat tabel perbandingan jadi bermakna. Ada pola lain yang juga berulang dari chapter-chapter sebelumnya: peningkatan hampir selalu datang dari corong yang lebih lebar — ambil banyak dulu, saring belakangan. Dan bug yang paling mahal hampir selalu datang dari setting yang diam-diam salah, bukan dari logika kode yang salah — contohnya probes di Chapter 3 dan di sini, config tsvector di chapter ini, publication di Chapter 5.

**Kalimat penutup untuk interview** (dari file asli, angka diisi setelah eval selesai): "Saya mengimplementasikan tiga advanced RAG pattern di platform personal finance saya, dan saya mem-benchmark masing-masing dengan eval set yang sama: hybrid BM25+vector lewat RRF, yang paling kuat untuk deskripsi bank Indonesia yang kaya kata kunci; sentence-window retrieval di atas statement PDF, dengan prinsip kecil untuk dicari dan besar untuk dibaca; dan auto-merging, yang mempromosikan kalimat ke paragraf induknya saat kalimat-kalimat satu paragraf muncul berombongan di hasil pencarian. Kombinasi pemenangnya adalah [X], yang mengangkat P@5 dari 0.66 ke 0.YY. Query adversarial-lah yang membuat perbandingan ini benar-benar bermakna."

**Lanjutannya.** Chapter 7 tentang agents akan memakai `DocumentRetriever` dan `AutoMergingRetriever` sebagai tools yang dipanggil agent. Pola constructor injection yang sama dengan `AnswerService` di Chapter 4 membuat strategi retrieval bisa ditukar tanpa menyentuh kode agent-nya sama sekali. Detail lengkap TODO steps, acceptance criteria, dan Knowledge Check quiz ada di file asli: [PF-AI006-advanced-rag-patterns-todo.md](PF-AI006-advanced-rag-patterns-todo.md).

---

## 📖 Glossary

Semua istilah baru di chapter ini — BM25, tsvector, RRF, hybrid search, sentence-window retrieval, auto-merging, sibling threshold, dan lainnya — sudah di-link langsung dari kemunculan pertamanya di atas. Untuk melihat semuanya sekaligus, cek file bersama yang dipakai semua chapter RAG: **[Glossary RAG (Bahasa Indonesia)](glossary-rag-id.md)** — istilah chapter ini ada di kategori *Hybrid Search & Advanced Retrieval*.
