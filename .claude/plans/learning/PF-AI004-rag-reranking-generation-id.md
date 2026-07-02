# PF-AI004 — RAG Phase 2: Chunking, Re-ranking, Generation (Versi Belajar)

> **Ini bukan plan baru.** Ini adalah tulisan ulang dari [PF-AI004-rag-reranking-generation.md](PF-AI004-rag-reranking-generation.md), disusun ulang dari nol supaya urutannya mengikuti cara otak belajar hal baru — bukan urutan implementasi. Semua fakta, angka, kode, dan bug yang disebutkan di sini diambil apa adanya dari file asli. File asli tetap jadi rujukan resmi untuk TODO steps, acceptance criteria, dan quiz — dokumen ini cuma versi "supaya nyantol dulu di kepala."
>
> **Urutan baca:** masalah dulu → baru konsep → baru cara kerja → baru kode → baru optimisasi → baru best practice → baru kesalahan yang pernah kejadian → baru ringkasan. Jangan loncat ke bagian Implementasi kalau tiga bagian pertama belum kebayang, nanti kodenya kelihatan seperti sihir.
>
> **Ketemu istilah asing di tengah baca?** Semua istilah baru dijelaskan pas pertama kali muncul (bukan di-dump di awal), dan sekarang tiap istilah juga di-link langsung ke definisinya di [Glossary RAG](glossary-rag-id.md) — tinggal klik, tidak perlu scroll balik.

---

## Apa Masalah yang Ingin Diselesaikan?

Di chapter sebelumnya (PF-AI003), sistem sudah bisa melakukan **retrieval**: user tanya sesuatu, pertanyaan itu diubah jadi angka ([embedding](glossary-rag-id.md#embedding)), lalu dicari transaksi yang paling mirip di database pakai [cosine similarity](glossary-rag-id.md#cosine-similarity). Itu jalan — tapi ada dua masalah nyata yang bikin hasilnya belum bisa dipakai serius:

**Masalah 1 — apa yang di-embed itu penting.** Kalau teks sumbernya panjang (misalnya narasi statement bank berlembar-lembar) lalu dipotong-potong sembarangan sebelum di-embed, hasil potongannya bisa rusak — nama merchant kepotong di tengah, atau dua transaksi malah nyampur jadi satu chunk. Model embedding jadi "melihat" data yang sudah cacat dari awal.

**Masalah 2 — cosine similarity saja gampang ketipu, dan baris data mentah bukan jawaban.** Contoh nyata dari project ini: user tanya *"berapa pengeluaran makan bulan Maret?"*. Sistem retrieval lama bisa saja mengembalikan baris **"MAKANAN TERNAK AYAM BROILER"** (pakan ternak ayam) di posisi tinggi — karena kata "makan" dan "makanan ternak" punya akar kata yang mirip, jadi embedding-nya berdekatan secara matematis, walau artinya beda total. Dan bahkan kalau top-3 hasilnya sudah benar sekalipun, itu baru berupa **daftar baris transaksi** — bukan jawaban. User tidak nanya "kasih saya daftar," dia nanya "berapa," yaitu satu angka.

Jadi target chapter ini jelas: `POST /ask {"query": "berapa pengeluaran makan bulan Maret?"}` harus mengembalikan jawaban yang **benar** dan **bisa dipertanggungjawabkan** (ada rujukan transaksi aslinya, bukan karangan LLM).

---

## Konsep Sederhananya

Ada tiga konsep baru yang menyelesaikan dua masalah di atas. Kalau dianalogikan sederhana:

1. **[Chunking](glossary-rag-id.md#chunking)** — cara memotong teks panjang jadi potongan-potongan kecil *sebelum* di-embed, supaya potongannya tidak merusak makna aslinya. Ibarat memotong kue: potong di garis yang sudah ada, jangan potong di tengah lapisan.

2. **[Re-ranking](glossary-rag-id.md#re-ranking)** — pakai "juri kedua" yang lebih teliti (tapi lebih lambat) untuk mengecek ulang urutan hasil pencarian dari juri pertama. Juri pertama ([bi-encoder](glossary-rag-id.md#bi-encoder) / model embedding) menilai query dan dokumen **secara terpisah** lalu membandingkan titiknya di ruang vektor — cepat, tapi kadang salah kira mirip padahal beda arti. Juri kedua ([cross-encoder](glossary-rag-id.md#cross-encoder)) membaca query dan dokumen **bersamaan** dalam satu kali proses — jauh lebih akurat, tapi terlalu lambat kalau dipakai untuk semua data, jadi cuma dipakai untuk menyaring ulang kandidat teratas.

3. **[Grounded generation](glossary-rag-id.md#grounded-generation) + [citations](glossary-rag-id.md#citations)** — bukan cuma menyodorkan baris data mentah ke user, tapi minta LLM merangkumnya jadi kalimat jawaban, dengan aturan ketat: **jawab hanya dari data yang diberikan**, boleh bilang "tidak tahu" kalau datanya tidak ada, dan setiap angka/klaim di jawaban harus bisa dilacak balik ke transaksi aslinya (sitasi/citation). Kalau LLM "mengarang" id transaksi yang sebenarnya tidak ada di data yang dikirim, itu harus dibuang sebelum sampai ke user.

Alur besarnya ([RAG](glossary-rag-id.md#rag) itu cuma dua fase — bangun index sekali, lalu query berkali-kali):

```
 1. BANGUN INDEX (offline, sekali per dokumen)
 ──────────────────────────────────────────────────────────────────────────
                                                                  ┌─────────┐
   Sumber Data        dipotong jadi      embed setiap    simpan   │ 1010 0101│
   📄 🖼  💬 ▶        chunk teks         chunk            ───▶ │ 1110 1011│
  ┌──────────┐  ──▶  ┌─────────────┐ ─▶ ┌─────────────┐          │ 0011 1010│
  │statement,│       │ chunk 1     │    │ embeddings  │          │ 1001 0101│
  │ PDF, dll │       │ chunk 2     │    │  1010 0101  │          └─────────┘
  └──────────┘       │ chunk 3     │    │  1110 1011  │           pgvector DB
                      │ chunk 4     │    │  ...        │
                      └─────────────┘    └─────────────┘

 2. JAWAB PERTANYAAN (online, tiap request — inilah "RAG"-nya)
 ──────────────────────────────────────────────────────────────────────────
   USER  ───────▶   DB (pgvector)  ───────▶   LLM   ───────▶  jawaban akhir
   query             cari yang paling         susun jawaban    dikirim ke
                      mirip                    + sitasi         user
```

Yang dibangun chapter ini adalah bagian kanan (fase 2), lebih detail:

```
chunk ──▶ embed ──▶ simpan ──▶ retrieve ──▶ re-rank ──▶ generate ──▶ sitasi
 Ch.4      Ch.3       Ch.3       Ch.3         Ch.4        Ch.4       Ch.4
(potong)  (vektor)  (pgvector) (cosine     (cross-     (LLM +     (validasi
                                top-10)     encoder)    context)   id-nya nyata)
```

---

## Cara Kerjanya

Bagian ini menjelaskan tiap konsep dengan cara yang sama seperti belajar naik tangga: mulai dari versi paling bodoh yang masih jalan, lihat di mana dia mentok, baru pahami kenapa versi berikutnya dibutuhkan.

### Chunking — dari "potong asal" sampai "potong sesuai struktur"

Contoh teks mentah dari statement bank (`bca_01.txt`):

```
14/03/2024 GOFOOD GEPREK BENSU GADING                               85.000,00
15/03/2024 GRABFOOD ORDER 7FHJS8                                     62.500,00
16/03/2024 ALFAMART CIPETE RAYA                                      47.000,00
```

**Versi 0 — potong tiap 35 karakter, tanpa peduli isinya.** Ini cara paling bodoh: jalan terus dan potong setiap 35 karakter.

```
Chunk 0: "14/03/2024 GOFOOD GEPREK BENSU GA"   ← nama merchant kepotong
Chunk 1: "DING                         85.00"   ← "GADING" kehilangan awalnya
```

**Masalahnya:** karakter ke-35 jatuh persis di tengah nama merchant. `"GADI"` dan `"NG"` di-embed sebagai dua potongan yang tidak nyambung — model embedding tidak tahu keduanya sebenarnya satu kata ("GADING"), jadi pencarian untuk merchant ini bisa gagal di kedua chunk.

**Versi 1 — pakai [overlap](glossary-rag-id.md#overlap).** [`fixed_size_chunks(text, chunk_size, overlap)`](glossary-rag-id.md#fixed-size-chunking) masih menghitung karakter, tapi sisa ekor satu chunk dibawa juga ke chunk berikutnya, jadi fakta yang kepotong di batas tetap muncul utuh di salah satu chunk.

**Masalahnya:** overlap mencegah fakta *hilang*, tapi si pemotong masih buta terhadap struktur kalimat. Deskripsi transaksi masih bisa terpisah dari nominalnya kalau batas potongan jatuh di antara keduanya.

**Versi 2 — potong berdasarkan struktur, bukan hitungan karakter.** [`sentence_window_chunks(text, window_size)`](glossary-rag-id.md#sentence-window-chunking) memotong berdasarkan baris baru (`\n`) dan tanda baca kalimat, jadi tiap chunk adalah **satu baris lengkap** — nama merchant tidak pernah kepotong, deskripsi tidak pernah terpisah dari nominalnya. Ditambah lagi ada [`window`](glossary-rag-id.md#window): ±N baris tetangga ikut dibawa, jadi unit yang **dicari** kecil dan presisi, tapi unit yang **dikirim ke LLM** cukup konteksnya. Prinsipnya: **"kecil untuk dicari, besar untuk dibaca."** → *Ini yang dipakai chapter ini.*

```
sentence_window_chunks(text, window_size=1)

Chunk 1:
  text:   "15/03/2024 GRABFOOD ORDER 7FHJS8        62.500,00"
  window: "<baris sebelumnya>\n<baris ini>\n<baris sesudahnya>"
```

Hasilnya: setiap chunk = satu transaksi utuh, merchant dan nominal tidak pernah terpisah.

**Batu sandungan berikutnya (di luar scope chapter ini):** struktur ≠ makna. `\n` tidak tahu bahwa baris "GOFOOD" dan "MAKANAN TERNAK" adalah dua transaksi yang maknanya sama sekali tidak berhubungan — memotong berdasarkan struktur itu perkiraan yang cukup bagus, tapi bukan solusi sempurna. Versi berikutnya ([semantic chunking](glossary-rag-id.md#semantic-chunking) atau [agentic chunking](glossary-rag-id.md#agentic-chunking) — memotong di titik makna berubah) dicatat sebagai teaser untuk nanti, tidak dibangun sekarang.

> **Catatan project:** Transaksi di aplikasi ini sudah berupa satu baris DB pendek — tidak ada yang perlu dipotong di situ. Yang benar-benar butuh chunking adalah teks sumber yang panjang, seperti narasi statement bank multi-halaman. Jadi modul chunking ini dibangun dan ditest sekarang terhadap teks statement asli, tapi baru benar-benar dipakai untuk retrieval di chapter berikutnya (Chapter 6).

### Re-ranking — kenapa juri kedua dibutuhkan

**Versi 0 — [cosine top-K](glossary-rag-id.md#cosine-top-k) saja (baseline dari Chapter 3).** Embed query `"berapa pengeluaran makan bulan Maret?"`, cari [cosine similarity](glossary-rag-id.md#cosine-similarity) di `transaction_embeddings`, ambil 10 teratas.

```
Rank | tx_id | similarity | description                      | amount_idr
  1  |  42   |   0.891    | GOFOOD GEPREK BENSU GADING       |  85.000
  2  |  43   |   0.874    | GRABFOOD ORDER 7FHJS8            |  62.500
  3  |  47   |   0.862    | GRABFOOD WARUNG PADANG           |  55.000
  4  |  56   |   0.831    | MAKANAN TERNAK AYAM BROILER      | 250.000  ← SALAH, ini pakan ternak
  5  |  44   |   0.803    | ALFAMART CIPETE RAYA             |  47.000
```

**Masalahnya:** model embedding itu **[bi-encoder](glossary-rag-id.md#bi-encoder)** — dia meng-encode query dan tiap deskripsi transaksi **secara terpisah**, tidak pernah bareng-bareng. Hasilnya cuma membandingkan dua titik yang sudah dihitung duluan di ruang vektor. Kata "makan" dan "makanan ternak" berbagi cukup banyak akar kata sehingga posisinya berdekatan di ruang vektor — bi-encoder tidak pernah punya kesempatan mempertimbangkan bedanya secara langsung.

**Versi 1 — re-rank top-10 pakai cross-encoder.** **[Cross-encoder](glossary-rag-id.md#cross-encoder)** membaca query dan dokumen kandidat **bersamaan**, dalam satu kali proses — jadi bisa benar-benar mempertimbangkan apakah "makanan ternak" itu menjawab pertanyaan tentang "makan" atau tidak. Polanya berbentuk corong ([funnel](glossary-rag-id.md#funnel)): bi-encoder yang murah-dan-lebar mengambil 10 kandidat dulu, baru cross-encoder yang mahal-dan-sempit menilai ulang 10 itu.

```
["berapa pengeluaran makan bulan Maret?" + "GOFOOD GEPREK BENSU GADING"]        → skor 0.94  (restoran makanan)
["berapa pengeluaran makan bulan Maret?" + "MAKANAN TERNAK AYAM BROILER"]       → skor 0.12  ("ternak ayam" ≠ "makan orang")
```

Hasil setelah re-ranking: transaksi pakan ternak (skor 0.12) tersingkir dari top-3, digantikan transaksi makanan yang benar.

**Masalahnya:** cross-encoder berkualitas yang di-hosting (misalnya Cohere Rerank) itu berbayar dan butuh round-trip jaringan setiap kali dipanggil. Untuk traffic produksi itu wajar, tapi menyulitkan kalau kamu mau menjalankan eval harness berkali-kali sambil iterasi — tiap run bisa kena biaya atau kena rate limit.

**Versi 2 — [FlashRank](glossary-rag-id.md#flashrank), ide sama tapi jalan lokal.** Model cross-encoder [MiniLM](glossary-rag-id.md#minilm) ~34 MB yang jalan di CPU lokal, tanpa API key, tanpa rate limit, hasilnya deterministik — bebas dijalankan ulang berkali-kali untuk eval. → *Ini yang dipakai chapter ini.*

> **Temuan nyata dari eksperimen (bukan teori, ini kejadian betulan):** `ms-marco-MiniLM-L-12-v2` adalah model yang dilatih khusus Bahasa Inggris. Pada query Bahasa Indonesia, model ini justru **menurunkan** [P@5](glossary-rag-id.md#p-5) dari 0.657 menjadi 0.600 — dia tidak memahami kosakata keuangan Indonesia. Lihat bagian Kesalahan Umum untuk detailnya — ini salah satu temuan paling berharga di chapter ini.

### Grounded Generation + Citations — dari dump data mentah sampai jawaban tervalidasi

**Versi 0 — sodorkan baris mentah ke user.**

```
GOFOOD GEPREK BENSU GADING — Rp 85.000
GRABFOOD ORDER 7FHJS8 — Rp 62.500
GRABFOOD WARUNG PADANG — Rp 55.000
```

**Masalahnya:** baris data bukan jawaban. User nanya "berapa" — sebuah angka — bukan "ini daftar, jumlahkan sendiri ya."

**Versi 1 — minta LLM merangkum jadi jawaban.** Kirim data ke model, minta dijumlahkan dan dijelaskan dengan bahasa biasa.

**Masalahnya:** tanpa batasan yang ketat, model bisa **[halusinasi](glossary-rag-id.md#hallucination)** — menyebut total yang tidak cocok dengan data yang dikasih (misalnya bilang "Rp 500.000" padahal datanya cuma Rp 202.500), atau bahkan menyebut transaksi yang sebenarnya tidak ada di data yang dikirim.

**Versi 2 — pakai [grounding prompt](glossary-rag-id.md#grounding-prompt).** Instruksikan model secara eksplisit: jawab **hanya** dari data yang diberikan, dan boleh bilang "saya tidak tahu" ([`confident: false`](glossary-rag-id.md#confident-flag)) daripada menebak-nebak.

```
SYSTEM: "Jawab HANYA dari transaksi bernomor yang diberikan sebagai konteks.
         Kalau konteks tidak mengandung jawabannya, katakan begitu dan set confident=false.
         Jangan pernah menaksir atau mengarang nominal."
```

**Masalahnya:** bahkan model yang sudah diberi grounding prompt sekalipun kadang tetap menyebut `transaction_id` yang sebenarnya tidak pernah ada di konteks yang dikirim — angka yang dia pattern-match dari data latihannya atau digit terdekat, bukan sesuatu yang benar-benar dia baca.

**Versi 3 — validasi setiap id yang disitasi terhadap konteks yang benar-benar dikirim.** Cek satu-satu setiap `cited_transaction_ids` terhadap kumpulan id yang benar-benar ada di prompt; kalau ada yang tidak ada, buang diam-diam (dan catat di log). → *Ini yang dipakai chapter ini* — disebut **[hallucination guard](glossary-rag-id.md#hallucination-guard)**.

```python
by_id = {42: (1, tx42), 43: (2, tx43), 47: (3, tx47)}

for tid in raw["cited_transaction_ids"]:   # [42, 43, 47, 9999] ← andaikan LLM mengarang 9999
    if tid in by_id:
        citations.append(...)
    else:
        logger.warning("LLM cited unknown transaction_id=%s — dropped", tid)
# → hasil akhir cuma berisi tx42, tx43, tx47. 9999 tidak pernah sampai ke user.
```

Jawaban akhir yang dikirim ke user sudah punya sitasi yang bisa diklik/dilacak balik ke transaksi aslinya:

```json
{
  "answer": "Pengeluaran makan bulan Maret: Rp 202.500 dari 3 transaksi — [1] Rp 85.000, [2] Rp 62.500, [3] Rp 55.000.",
  "confident": true,
  "citations": [
    {"marker": 1, "transaction_id": 42, "description": "GOFOOD GEPREK BENSU GADING", "amount_idr": 85000.0},
    {"marker": 2, "transaction_id": 43, "description": "GRABFOOD ORDER 7FHJS8", "amount_idr": 62500.0},
    {"marker": 3, "transaction_id": 47, "description": "GRABFOOD WARUNG PADANG", "amount_idr": 55000.0}
  ]
}
```

**Kasus khusus — pertanyaan yang datanya memang tidak ada** (misalnya tanya sewa tahun 2031): retrieval mengembalikan 0 baris → reranker mengembalikan kosong → sistem langsung berhenti, LLM tidak dipanggil sama sekali:

```python
AskResponse(answer="Tidak ada transaksi yang cocok.", confident=False,
            citations=[], model="none", retrieval_ms=45.3, generation_ms=0.0)
```

Untung tiga kali: tidak ada halusinasi, `confident: false` bikin UX jujur, dan biaya LLM-nya Rp 0.

### Alur data lengkap, dari teks mentah sampai jawaban akhir

```
TEKS MENTAH  "14/03/2024 GOFOOD GEPREK BENSU GADING    85.000,00\n..."
    │
    ▼  CHUNKING (sentence_window_chunks, window=1)
    │
    ▼  EMBEDDING (text-embedding-3-small) — sudah ada dari Chapter 3
    │
    ▼  RETRIEVAL (cosine top-10, ivfflat.probes=10, filter tanggal via SQL)
    │  10 kandidat — termasuk false positive "MAKANAN TERNAK AYAM BROILER" @ rank 4
    │
    ▼  RE-RANKING (FlashRank cross-encoder, query+dokumen dibaca bareng)
    │  top-3: GOFOOD [0.94] · GRABFOOD [0.89] · WARUNG PADANG [0.85]
    │  dibuang: MAKANAN TERNAK [0.12] · SEWA BULANAN [0.03]
    │
    ▼  FORMAT KONTEKS (_format_context)
    │  "[1] id=42 | 2024-03-14 | GOFOOD GEPREK BENSU GADING | DB | Rp 85,000 | BCA"
    │
    ▼  LLM SYNTHESIS (grounding prompt + skema jawaban)
    │  hasil mentah: {answer: "Rp 202.500 [1][2][3]", cited_ids: [42,43,47], confident: true}
    │
    ▼  VALIDASI SITASI (hallucination guard)
    │  cek tiap cited_id ∈ konteks yang benar-benar dikirim; buang + catat kalau tidak ada
    │
    ▼  AskResponse
       {answer, confident, citations[], model, retrieval_ms, generation_ms}
```

---

## Implementasi

Sekarang baru masuk ke kodenya. File yang dibuat/diubah — semua di service AI Python (`services/ai-service/`):

| File | Perubahan |
|------|-----------|
| [chunker.py](../../../services/ai-service/app/services/chunker.py) | Baru — `fixed_size_chunks()` + `sentence_window_chunks()` |
| [reranker.py](../../../services/ai-service/app/services/reranker.py) | Baru — `RerankerService` (FlashRank cross-encoder) |
| [answerer.py](../../../services/ai-service/app/services/answerer.py) | Baru — `AnswerService` (retrieve → rerank → generate tervalidasi) |
| [retriever.py](../../../services/ai-service/app/services/retriever.py) | Diedit — filter metadata opsional dikompilasi ke SQL WHERE |
| [main.py](../../../services/ai-service/app/main.py) | Diedit — endpoint `POST /ask` baru |

**Chunking** — dua fungsi murni (`app/services/chunker.py`), tanpa I/O, tanpa panggil model:

```python
def fixed_size_chunks(text: str, chunk_size: int = 500, overlap: int = 100) -> list[Chunk]:
    # potong per chunk_size karakter, overlap dibawa ke chunk berikutnya
    ...

def sentence_window_chunks(text: str, window_size: int = 1) -> list[Chunk]:
    # potong per baris/kalimat; `window` = ±window_size baris tetangga
    ...
```

**Re-ranking** — `RerankerService` membungkus FlashRank. Bagian pentingnya: FlashRank itu inferensi CPU yang **sinkron** (bukan async). Kalau dipanggil langsung di dalam endpoint `async def`, dia akan memblokir event loop — semua request lain yang sedang diproses server ikut macet selama proses itu berlangsung. Solusinya: `asyncio.to_thread`, yang memindahkan kerjaan itu ke thread terpisah supaya event loop tetap bebas melayani request lain.

```python
class RerankerService:
    def __init__(self, cache_dir: str = "/tmp/flashrank") -> None:
        self._ranker = Ranker(model_name="ms-marco-MiniLM-L-12-v2", cache_dir=cache_dir)

    async def rerank(self, query: str, results: list[SearchResult], top_k: int = 3) -> list[SearchResult]:
        if not results:
            return []
        passages = [{"id": r.transaction_id, "text": f"{r.description} | {r.wallet} | {r.date} | {r.flow}"} for r in results]
        request = RerankRequest(query=query, passages=passages)
        ranked = await asyncio.to_thread(self._ranker.rerank, request)  # lepas dari event loop
        by_id = {r.transaction_id: r for r in results}
        return [by_id[p["id"]] for p in ranked if p["id"] in by_id][:top_k]
```

> **Buat kamu yang biasa C#:** `asyncio.to_thread(...)` di Python itu setara dengan `Task.Run(...)` di .NET — cara yang sama untuk memindahkan kerjaan CPU-bound sinkron keluar dari thread yang sedang melayani request, supaya tidak menahan semua request lain.

**Filter metadata** — `SearchRequest` sekarang menerima `category`, `account`, `date_from`, `date_to` opsional, yang dikompilasi jadi klausa SQL `WHERE` (bukan post-filter di Python). Nilai selalu masuk lewat parameter (`$3`, `$4`, ...), tidak pernah digabung langsung ke string SQL — mencegah SQL injection sekaligus menjaga hasil `LIMIT top_k` tetap bermakna.

**Grounded generation** — `AnswerService` (`app/services/answerer.py`) adalah jantung chapter ini: retrieve top-10 (dengan filter) → rerank ke top-3 → kirim ke LLM lewat abstraksi provider yang sudah ada (`ProviderFactory` — Gemini atau Anthropic, sudah otomatis ter-trace di Langfuse) → validasi sitasi.

```python
async def ask(self, request: AskRequest) -> AskResponse:
    candidates = await self._retriever.search(query=request.query, top_k=10, ...)
    contexts = await self._reranker.rerank(request.query, candidates, top_k=request.top_k)
    if not contexts:
        return AskResponse(answer="Tidak ada transaksi yang cocok...", confident=False, citations=[], ...)

    raw = await self._provider.generate_json(SYSTEM_PROMPT, user_prompt, ANSWER_SCHEMA)

    by_id = {r.transaction_id: (i + 1, r) for i, r in enumerate(contexts)}
    citations = []
    for tid in raw.get("cited_transaction_ids", []):
        if tid in by_id:
            citations.append(Citation(...))
        else:
            logger.warning("LLM cited unknown transaction_id=%s — dropped", tid)

    return AskResponse(answer=raw["answer"], confident=raw["confident"], citations=citations, ...)
```

`AnswerService` sengaja pakai **constructor injection** untuk tiga kolaboratornya (retriever, reranker, provider) — beda dari service-service sebelumnya yang membangun dependensinya sendiri. Alasannya: tiga hal ini ingin bisa ditukar independen (retriever varian Chapter 6, reranker ganti ke Cohere, provider ganti Gemini↔Anthropic), dan constructor injection bikin unit test jadi gampang — tinggal suntik mock, tidak perlu trik `patch()`.

**Endpoint** — `POST /ask` di `main.py`, dibungkus try/except: kalau LLM gagal, kembalikan HTTP 502 (bukan 200 dengan jawaban kosong — itu melanggar kontrak error service ini).

```python
@app.post("/ask", response_model=AskResponse)
async def ask(request: AskRequest) -> AskResponse:
    try:
        return await app.state.answerer.ask(request)
    except Exception as exc:
        logger.exception("ask failed")
        raise HTTPException(status_code=502, detail="llm_parse_error") from exc
```

Semua detail test (mocked), skema Pydantic lengkap, dan port C# baris-per-baris ada di file asli: [PF-AI004-rag-reranking-generation.md](PF-AI004-rag-reranking-generation.md), STEP 2–9.

---

## Optimisasi

Beberapa keputusan optimisasi nyata yang diambil di chapter ini, dengan alasan konkretnya:

1. **[FlashRank](glossary-rag-id.md#flashrank) lokal, bukan Cohere Rerank (hosted).** Konsepnya sama persis, bedanya cuma tempat jalannya. FlashRank jalan di CPU lokal (~34 MB model), gratis, tanpa rate limit, deterministik — cocok untuk eval harness yang mau dijalankan berkali-kali sambil iterasi. Cohere lebih akurat tapi trial tier-nya dibatasi 10 request/menit — menyulitkan proses benchmark berulang. `RerankerService` sengaja dibuat jadi lapisan tipis supaya kalau nanti mau ganti ke Cohere, tinggal ganti satu class.

2. **Retrieve lebar ([top-10](glossary-rag-id.md#top-k)) dulu, baru re-rank ke sempit (top-3), bukan re-rank yang top-5 langsung.** Kalau kamu re-rank ulang 5 dokumen yang sama, hasilnya cuma **mengurutkan ulang** 5 itu — [MRR@5](glossary-rag-id.md#mrr-5) nyaris tidak berubah karena tidak ada kandidat baru yang masuk. Justru lift-nya datang dari corong yang lebih lebar: transaksi relevan yang tadinya ada di ranking ke-8 (tidak terlihat oleh baseline top-5) bisa "diangkat" masuk top-3 oleh cross-encoder. Ini trade-off recall-vs-precision klasik.

3. **Filter di level SQL (WHERE), bukan post-filter di Python.** Kalau kamu ambil top-10 global lalu baru buang baris yang bukan bulan Maret di kode Python, ada risiko top-10 globalnya memang didominasi bulan lain — hasil akhirnya bisa cuma 1 baris padahal database sebenarnya punya 50 transaksi Maret. Filter di `WHERE` SQL membuat pgvector meranking **di dalam** himpunan yang sudah difilter, jadi `LIMIT top_k` tetap berarti.

4. **`retrieval_ms` dan `generation_ms` dipisah di response.** Ini investasi untuk chapter berikutnya (streaming) — dengan mengukur di mana latency sebenarnya berada (retrieval ~100ms vs generation ~2 detik), baru ada alasan konkret kenapa yang perlu di-streaming adalah fase generation-nya.

5. **[Judge model](glossary-rag-id.md#judge-model) yang berbeda dari model generator saat evaluasi [faithfulness](glossary-rag-id.md#faithfulness).** Generator pakai Gemini, judge (penilai) pakai `gpt-4o-mini` dari provider lain. Kalau model yang sama dipakai untuk menilai jawabannya sendiri, hasilnya cenderung bias ([self-preference bias](glossary-rag-id.md#self-preference-bias)) — skornya jadi terlalu bagus dari kenyataan.

6. **Pin versi dependency dengan ketat, bukan `>=` tanpa batas atas.** `ragas>=0.2` (tanpa batas atas) ternyata resolve ke versi 0.4.x yang tidak kompatibel dengan `langchain` versi terbaru — dipin ulang jadi `ragas>=0.2,<0.3`. Lihat bagian Kesalahan Umum untuk cerita lengkap bug ini.

---

## Best Practice

Aturan-aturan yang dipegang selama membangun chapter ini, dan kenapa masing-masing penting:

- **[Grounding prompt](glossary-rag-id.md#grounding-prompt) yang eksplisit dan berlapis.** Bukan cuma bilang "jawab dari data ini," tapi juga: izinkan model bilang "saya tidak tahu" (`confident: false`), sediakan flag boolean yang bisa dicek program (bukan cuma teks bebas yang harus di-parse), dan larang model menaksir/mengarang.
- **Selalu validasi sitasi terhadap konteks asli ([hallucination guard](glossary-rag-id.md#hallucination-guard)).** LLM bisa menyitasi dengan percaya diri padahal salah. Sebuah id yang tidak ada di konteks yang benar-benar dikirim, secara definisi adalah karangan — kalau dibiarkan lolos, user bisa melihat sitasi yang menunjuk ke transaksi yang salah atau bahkan tidak ada. Ini cuma beberapa baris kode, tapi jadi jawaban standar untuk pertanyaan interview "bagaimana kamu menangani halusinasi?"
- **Constructor injection untuk service yang komponennya perlu ditukar-tukar.** Memudahkan testing (tinggal suntik mock, tidak perlu `patch()` module-level) dan bikin kode siap untuk pola multi-agent di chapter mendatang.
- **Kegagalan LLM harus mengembalikan HTTP 502, bukan 200 dengan jawaban kosong.** Kontrak error service ini eksplisit melarang 200-dengan-kosong — kalau dibiarkan, eval harness dan pemetaan error di sisi .NET API bisa salah kira request-nya sukses padahal gagal total.
- **Kerjaan CPU-bound sinkron (seperti FlashRank) harus dilepas dari event loop** lewat `asyncio.to_thread` (Python) atau `Task.Run` (C#/.NET) — supaya satu request berat tidak memblokir semua request lain yang sedang dilayani server.
- **Sebelum menulis skema ekstraksi/jawaban, daftar dulu tiap field: nama, tipe JSON, contoh nilai, dan alasan tipenya.** Kesalahan tipe di skema (misalnya `string` untuk angka) tidak menyebabkan error saat compile ataupun runtime — data-nya cuma diam-diam jadi salah di database. Mendaftar field satu-satu sebelum menulis kode adalah cara mencegah itu.
- **"Kecil untuk dicari, besar untuk dibaca."** Prinsip [sentence-window chunking](glossary-rag-id.md#sentence-window-chunking) ini berlaku umum: unit yang dipakai untuk pencarian sebaiknya kecil dan presisi, tapi unit yang dikirim ke LLM untuk dibaca sebaiknya cukup besar supaya konteksnya lengkap.
- **[Judge model](glossary-rag-id.md#judge-model) untuk evaluasi sebaiknya beda dari model yang dievaluasi**, untuk menghindari bias [self-preference](glossary-rag-id.md#self-preference-bias).

---

## Kesalahan Umum

Ini bagian paling berharga — semua ini adalah bug **nyata** yang benar-benar kejadian selama chapter ini dikerjakan, bukan skenario teoretis:

1. **[Cross-encoder](glossary-rag-id.md#cross-encoder) yang cuma paham Bahasa Inggris dipakai untuk query Bahasa Indonesia.** `ms-marco-MiniLM-L-12-v2` justru **menurunkan** [P@5](glossary-rag-id.md#p-5) dari 0.657 ke 0.600, dan salah satu query (`"gaji bulanan salary income"`) MRR-nya jatuh dari 1.00 ke **0.00** — cross-encoder-nya malah menyingkirkan hasil yang tadinya sudah benar dari [bi-encoder](glossary-rag-id.md#bi-encoder) (yang multilingual), karena dia tidak mengenali kosakata keuangan Indonesia sebagai relevan. **Pelajarannya:** re-ranking bisa memperburuk hasil kalau model yang dipakai tidak cocok bahasanya dengan data — ini bukan kegagalan, ini temuan yang harus didiagnosis dan dicatat, bukan diabaikan.

2. **Baseline retrieval yang ternyata rusak karena konfigurasi index.** [MRR@5](glossary-rag-id.md#mrr-5) awalnya kelihatan cuma 0.476 — ternyata itu bug: [`IVFFlat probes=1`](glossary-rag-id.md#ivfflat) (default) cuma mencari di 1 dari 100 cluster index, jadi banyak hasil relevan tidak pernah "terlihat." Setelah di-fix jadi `probes=10`, baseline aslinya ternyata **1.000**. Bug konfigurasi index seperti ini gampang disalahartikan sebagai "model embedding-nya jelek," padahal masalahnya di pengaturan pencarian.

3. **LLM menyitasi angka penanda konteks, bukan id transaksi aslinya.** Ada bug di mana LLM memasukkan angka marker `[2]` ke `cited_transaction_ids`, padahal seharusnya `id=24561` (id transaksi aslinya). Akibatnya, [hallucination guard](glossary-rag-id.md#hallucination-guard) membuang **semua** sitasi karena dianggap tidak valid — skor [faithfulness](glossary-rag-id.md#faithfulness) jadi 0.00 di mana-mana. Solusinya: perjelas instruksi di `SYSTEM_PROMPT` supaya tidak ambigu antara "nomor urutan konteks" dan "id transaksi asli."

4. **Tipe data tanggal yang salah dikirim ke database.** Kode mengirim tanggal sebagai *string* ke parameter SQL bertipe `::date`, padahal driver database (asyncpg) mengharapkan objek `datetime.date`. Error yang muncul membingungkan (`'str' object has no attribute 'toordinal'`) — solusinya `date.fromisoformat()` sebelum dikirim.

5. **Data uji tidak cocok dengan rentang tanggal data asli.** Pertanyaan eval menanyakan bulan Maret 2026, padahal data yang ada cuma sampai Januari 2026 — hasilnya selalu kosong bukan karena bug kode, tapi karena datanya memang tidak ada di rentang itu.

6. **Batasan versi dependency yang terlalu longgar (`>=` tanpa batas atas).** `ragas>=0.2` resolve ke versi baru yang tidak kompatibel dengan `langchain` versi terbaru — dua library saling bentrok. Solusinya: pin ke rentang spesifik (`ragas>=0.2,<0.3`).

7. **Environment Python yang tercampur versi.** Sekitar 11 package punya file binary yang dikompilasi untuk Python 3.14, padahal virtual environment-nya Python 3.11 — akibat dari instalasi sebelumnya yang salah sasaran interpreter. Harus di-reinstall paksa satu-satu.

8. **Re-ranking cuma diterapkan ke top-5 yang sama, bukan memperlebar dulu ke top-10.** Seperti dibahas di bagian Optimisasi — ini bukan bug crash, tapi anti-pattern yang membuat re-ranking kelihatan tidak berguna padahal masalahnya di lebar corongnya.

9. **Memanggil FlashRank langsung di dalam endpoint `async` tanpa `asyncio.to_thread`.** Ini memblokir event loop — semua request lain (termasuk health check) ikut macet selama model CPU itu berjalan.

10. **Membiarkan `cited_transaction_ids` dari LLM lolos tanpa validasi.** Halusinasi sitasi adalah pembunuh kepercayaan nomor satu di aplikasi finansial — user bisa melihat "bukti" yang menunjuk ke transaksi yang tidak pernah ada.

11. **Menyetel grounding prompt "pakai feeling" tanpa regression test.** Pertanyaan adversarial (nanya data yang sengaja tidak ada, misalnya sewa tahun 2031) berfungsi sebagai tes regresi — kalau prompt yang diubah-ubah bikin pertanyaan ini tiba-tiba dijawab dengan angka percaya diri, itu tandanya prompt-nya rusak.

12. **Mengembalikan HTTP 200 dengan jawaban kosong saat LLM gagal**, alih-alih 502. Ini bikin sistem lain (eval harness, .NET API) mengira request-nya sukses padahal sebenarnya gagal total.

13. **Pertanyaan superlatif/agregasi ("pengeluaran terbesar bulan ini") adalah kelemahan [RAG](glossary-rag-id.md#rag) yang sudah dikenal.** Top-3 hasil retrieval secara semantik belum tentu memuat nominal yang benar-benar paling besar — dalam eval nyata di chapter ini, skor faithfulness untuk pertanyaan tipe ini cuma 0.50, jauh di bawah pertanyaan lain yang skornya 1.00.

---

## Summary

**Masalah yang diselesaikan:** retrieval yang cuma mengandalkan cosine similarity gampang salah (contoh nyata: "makan" vs "makanan ternak" ketuker), dan baris data mentah bukan jawaban yang bisa dipakai user.

**Yang dibangun:**
- Modul chunking (`fixed_size_chunks`, `sentence_window_chunks`) — teruji, siap dipakai chapter berikutnya.
- Re-ranker berbasis FlashRank (cross-encoder lokal, gratis, deterministik) yang menyaring ulang hasil retrieval.
- Filter metadata (`category`, `account`, `date_from`, `date_to`) yang dikompilasi jadi SQL `WHERE`, bukan post-filter.
- `AnswerService` + endpoint `POST /ask`: retrieve top-10 → rerank ke top-3 → LLM menyusun jawaban dengan grounding prompt → validasi sitasi (hallucination guard) sebelum dikirim ke user.
- Eval harness untuk mengukur lift re-ranking (P@5) dan faithfulness jawaban (RAGAS).

**Angka nyata yang didapat:**

| Metrik | Baseline | Setelah perubahan | Delta |
|--------|----------|--------------------|-------|
| [MRR@5](glossary-rag-id.md#mrr-5) (setelah fix bug probes) | 1.000 | 0.857 (setelah rerank) | -0.143 (lihat Kesalahan Umum #1) |
| [P@5](glossary-rag-id.md#p-5) | 0.657 | 0.600 (setelah rerank) | -0.057 (lihat Kesalahan Umum #1) |
| [RAGAS](glossary-rag-id.md#ragas) [faithfulness](glossary-rag-id.md#faithfulness) (5 jawaban) | — | **0.900** (target ≥ 0.80) | ✅ tercapai |

**Pelajaran terpenting chapter ini:** angka yang turun bukan berarti gagal. Delta P@5 dan MRR yang negatif setelah re-ranking justru jadi temuan diagnostik paling berharga — [cross-encoder](glossary-rag-id.md#cross-encoder) yang dipakai ternyata bias ke Bahasa Inggris, dan itu bisa dijelaskan dengan bukti konkret, bukan cuma "ya turun aja." Begitu juga bug [IVFFlat probes](glossary-rag-id.md#ivfflat): baseline yang kelihatan jelek ternyata masalah konfigurasi index, bukan masalah model.

**Kalimat penutup untuk interview** (versi ringkas dari file asli): *"Saya membangun retrieval dua tahap — [pgvector](glossary-rag-id.md#pgvector) cosine search mengambil 10 kandidat, lalu cross-encoder lokal (FlashRank) menilai ulang berdasarkan query dan dokumen yang dibaca bersamaan. Saya juga menemukan dan mendiagnosis delta negatif: cross-encoder-nya bias ke Bahasa Inggris. Di atas retrieval itu, saya membangun endpoint `/ask` yang menjawab hanya dari data yang diambil, memvalidasi setiap sitasi supaya tidak ada id yang dikarang, dan mencapai skor faithfulness RAGAS 0.900 dengan judge model yang berbeda dari model generatornya."*

**Lanjutannya:** chapter berikutnya (streaming) akan memanfaatkan fakta bahwa `generation_ms` jauh lebih besar dari `retrieval_ms` sebagai alasan untuk mulai men-streaming jawaban token demi token. Detail lengkap TODO steps, kode C# equivalent, test file, dan quiz sertifikasi ada di file asli: [PF-AI004-rag-reranking-generation.md](PF-AI004-rag-reranking-generation.md).

---

## 📖 Glossary

Semua istilah baru chapter ini (bi-encoder, cross-encoder, cosine similarity, citations, grounded generation, MRR, faithfulness, dll) sudah di-link langsung dari tiap kemunculan pertamanya di atas. Kalau mau lihat semuanya sekaligus (atau cari istilah yang belum sempat di-link), cek file terpisah supaya bisa dipakai ulang untuk chapter-chapter RAG berikutnya juga: **[Glossary RAG (Bahasa Indonesia)](glossary-rag-id.md)**.
