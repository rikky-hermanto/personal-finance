# PF-AI009 — Chapter 9: Model Context Protocol (MCP) Server (Versi Belajar)

> **Ini bukan plan baru.** Ini adalah tulisan ulang dari [PF-AI009-mcp-personal-finance-server-todo.md](PF-AI009-mcp-personal-finance-server-todo.md), disusun ulang supaya urutannya mengikuti cara otak belajar hal baru — bukan urutan implementasi. Semua fakta, kode, dan keputusan desain yang disebutkan di sini diambil apa adanya dari file asli. File asli tetap jadi rujukan resmi untuk TODO steps, acceptance criteria, dan quiz — dokumen ini cuma versi "supaya nyantol dulu di kepala."
>
> **Urutan baca:** masalah dulu → baru konsep → baru cara kerja → baru kode → baru optimisasi → baru best practice → baru kesalahan umum → baru ringkasan. Jangan loncat ke bagian Implementasi kalau tiga bagian pertama belum kebayang, nanti kodenya kelihatan seperti sihir.
>
> **Ketemu istilah asing di tengah baca?** Semua istilah baru dijelaskan pas pertama kali muncul, dan tiap istilah di-link langsung ke definisinya di [Glossary RAG](glossary-rag-id.md) — tinggal klik, tidak perlu scroll balik. (Namanya masih "Glossary RAG" karena historinya, tapi sudah dipakai bersama untuk semua chapter, termasuk chapter MCP ini.)
>
> **Chapter ini belum dikerjakan (status: To Do).** Bagian Implementasi di bawah menjelaskan kode yang *akan* ditulis sesuai file plan asli — bukan kode yang sudah live dan sudah dites terhadap Claude Desktop yang sebenarnya. Bagian Kesalahan Umum juga diberi catatan khusus soal ini.

---

## Apa Masalah yang Ingin Diselesaikan?

Chapter 1–8 sudah membangun kemampuan AI yang nyata di service ini — ekstraksi PDF, kategorisasi, RAG semantic search (PF-AI003–004), 2-agent workflow (PF-AI007–008). Tapi semuanya dijangkau dengan cara yang sama: sebuah caller (.NET API, sebuah script) mengirim HTTP request ke endpoint yang kamu tulis tangan, dan bentuk request/response itu cuma hidup di kodemu sendiri.

Ambil contoh konkret: `POST /categorize`, `POST /ask`, demo 2-agent — semuanya adalah route HTTP spesifik dengan bentuk request/response spesifik, dipanggil oleh persis satu caller (.NET API) yang sudah tahu bentuknya karena kamu yang menulis kedua sisinya.

Sekarang bayangkan kamu mau membuka Claude Desktop dan bertanya langsung: "berapa pengeluaran makan bulan ini?" Claude Desktop bukan .NET API. Dia tidak tahu `/categorize` itu ada, tidak tahu bentuk request body-nya, dan tidak bisa "diajari" per percakapan — tidak ada tempat yang bisa dibaca mesin yang bilang "ini daftar tool yang ada, dan begini cara memanggilnya." Tiap AI client baru yang mau kamu dukung berarti satu integrasi bespoke lagi.

Target chapter ini: publikasikan empat kemampuan yang sudah ada (query transaksi, ringkasan cashflow, skor pyramid, semantic search) sebagai **MCP Tools**, di-mount di AI service yang sudah jalan, supaya Claude Desktop bisa menemukan dan memanggilnya sendiri — tanpa satu baris pun integrasi khusus yang kamu tulis untuk client itu.

```
Claude Desktop (MCP client)
        │  "berapa pengeluaran makan bulan ini?"
        ▼
   MCP Server  ── mounted di /mcp, di AI service yang sama, port 8000 ──
   (FastMCP, SSE transport)
        │
        ├── get_transactions ────────────┐
        ├── get_cashflow_summary ────────┤── asyncpg pool ──▶ Supabase (transactions, accounts)
        ├── search_transactions_semantic ┘── RetrievalService (PF-AI003, pgvector)
        │
        └── get_pyramid_scores ──────────── httpx ──▶ .NET API GET /api/journey/scores
```

---

## Konsep Sederhananya

Dua konsep baru menyelesaikan masalah di atas:

1. **[MCP (Model Context Protocol)](glossary-rag-id.md#mcp)** — protokol terbuka dari Anthropic yang mendefinisikan kosakata tetap yang dipahami bersama oleh client dan server: **[Tools](glossary-rag-id.md#mcp-tool)** (aksi yang bisa dipanggil AI), **[Resources](glossary-rag-id.md#mcp-resource)** (data yang dibaca AI secara pasif), dan **[Prompts](glossary-rag-id.md#mcp-prompt)** (template siap pakai). Server mendeklarasikan apa yang dia punya; client menemukannya otomatis lewat protokol — tanpa kode integrasi per-caller.

2. **[Tipe balik eksplisit sebagai skema](glossary-rag-id.md#tool-schema)** — skema JSON yang dilihat AI client *sebelum* dia memanggil tool dihasilkan otomatis dari anotasi tipe Python. Kalau tipe baliknya cuma `dict` polos, skemanya kosong (`{}`) — AI harus menebak nama field.

Diagram alur satu request: Claude Desktop memutuskan tool mana yang cocok dari skema yang sudah dia lihat, memanggilnya, lalu menyusun jawaban dari hasilnya — bukan mengarang dari ingatan model:

```
                        Personal Finance MCP Server (FastMCP, mounted /mcp)
                     ┌──────────────────────────────────────────────────────┐
  Claude Desktop      │                                                      │
  "berapa            │   get_transactions          ──▶ asyncpg (Supabase)    │
  pengeluaran ─────► │   get_cashflow_summary       ──▶ asyncpg (Supabase)    │
  makan bulan ini?"   │   search_transactions_semantic ──▶ RetrievalService   │
                     │   get_pyramid_scores         ──▶ httpx ──▶ .NET API    │
                     └──────────────────────────────────────────────────────┘
                                          │
                                          ▼
                        jawaban terstruktur, disitir dari data nyata
                        — bukan tebakan model
```

---

## Cara Kerjanya

Bagian ini menjelaskan tiap konsep dengan cara "tangga": mulai dari versi paling sederhana, lihat di mana dia mentok, baru pahami kenapa versi berikutnya dibutuhkan. Ini ladder dari file plan asli, disusun ulang dalam Bahasa Indonesia.

### Dari endpoint hand-wired sampai tool yang bisa ditemukan otomatis

**Endpoint hand-wired.** Ini yang sudah ada sekarang: `POST /categorize`, `POST /ask`, demo 2-agent — tiap kemampuan AI di project ini adalah route HTTP spesifik dengan bentuk request/response spesifik, dipanggil persis satu caller (.NET API) yang sudah tahu bentuknya karena kamu menulis kedua sisinya.

Ganjalannya, Claude Desktop bukan .NET API. Dia tidak tahu `/categorize` itu ada, tidak tahu bentuk request body-nya, dan tidak bisa "diajari" per percakapan — tidak ada tempat bersama, bisa dibaca mesin, yang bilang "ini tool yang ada, begini cara memanggilnya." Tiap AI client baru berarti satu integrasi bespoke lagi.

**Tiga primitive MCP.** [MCP](glossary-rag-id.md#mcp) mendefinisikan kosakata kecil dan tetap yang dipahami bersama client dan server: **[Tools](glossary-rag-id.md#mcp-tool)** (aksi yang bisa dipanggil AI — query, komputasi, penulisan), **[Resources](glossary-rag-id.md#mcp-resource)** (data ber-URI yang dibaca AI secara pasif, seperti tabel lookup statis), dan **[Prompts](glossary-rag-id.md#mcp-prompt)** (template siap pakai dengan variabel yang diisi AI). Server mendeklarasikan primitive mana yang dia punya; client menemukannya otomatis lewat protokol — tanpa kode integrasi per-caller. Chapter ini mengekspos empat **Tools**: `get_transactions`, `get_cashflow_summary`, `get_pyramid_scores`, `search_transactions_semantic` — keempatnya query langsung ke data nyata, persis yang jadi peran Tools.

Cocok untuk sisi "apa yang diekspos", tapi belum menjawab bagaimana client benar-benar terhubung ke proses yang menjalankan tool-nya.

**stdio vs SSE transport.** **[stdio transport](glossary-rag-id.md#stdio)** membuat client men-spawn server-mu sebagai subprocess lokal dan bicara lewat stdin/stdout-nya — mandiri, tapi proses baru (dan asyncpg pool baru, `RetrievalService` yang dingin tanpa cache embedding hangat) di tiap koneksi. **[SSE transport](glossary-rag-id.md#sse)** (mekanisme long-lived-HTTP-response yang sama seperti `/ask/stream` di PF-AI005) membuat client terhubung ke server yang *sudah berjalan*. AI service ini sudah jadi proses long-running dengan asyncpg pool dan `RetrievalService` yang sudah hangat — SSE memakai ulang keduanya; stdio akan membuang keduanya dan membangunnya lagi tiap koneksi. → *Ini yang dipakai chapter ini*: FastMCP di-mount di `/mcp` pada AI service yang sudah ada, SSE transport, berbagi `app.state.pool` dan `app.state.retriever`.

### Skema tool: `dict` polos vs tipe eksplisit

**`dict` polos.** Dalam kode Python biasa, fungsi seperti `get_pyramid_scores()` yang mengembalikan `dict` itu wajar banget — pemanggilnya baca `result["tier"]` lalu lanjut, dan kalau ada key yang hilang atau salah nama, ketahuannya di titik pemanggilan.

Ganjalannya, "pemanggil" sebuah MCP tool bukan baris kode Python yang kamu kontrol — dia LLM yang memutuskan, dari skema JSON yang di-generate otomatis, apa yang dikembalikan tool dan bagaimana memakai hasilnya di panggilan susulan. `dict` sebagai anotasi tipe balik tidak membawa informasi field apa pun — FastMCP men-generate skema `{}` kosong. Model melihat tool yang mengembalikan *sesuatu*, tanpa nama dan tanpa tipe, lalu mulai menebak nama field saat mencoba memformat jawaban atau merangkai panggilan kedua.

**Tipe balik eksplisit.** Anotasikan bentuk sebenarnya — `list[dict[str, Any]]` dengan docstring yang menyebutkan tiap field beserta tipenya (seperti docstring `get_transactions` di STEP 3: `{date, description, category, amount_idr (float), flow, account}`), atau bentuk yang lebih kaya seperti `TypedDict`/dataclass. FastMCP mengubahnya jadi skema JSON dengan field bernama dan bertipe — skema yang sama yang dibaca Claude Desktop *sebelum* dia memanggil tool, jadi dia langsung pilih nama field yang benar alih-alih menebak. → *Ini yang dipakai chapter ini*: tiap tool di bawah mengembalikan bentuk eksplisit dengan docstring per-field, tidak pernah `dict` polos.

---

## Implementasi

Sekarang baru masuk ke kode yang akan ditulis. File yang akan dibuat/diubah — semua di service AI Python (`services/ai-service/`):

| File | Perubahan |
|------|-----------|
| [mcp_server.py](../../../services/ai-service/app/mcp_server.py) | Baru — instance `FastMCP` + 4 tool + `set_pool`/`set_retriever` |
| [main.py](../../../services/ai-service/app/main.py) | Diedit — import mcp, panggil `set_pool`/`set_retriever` di lifespan, mount di `/mcp` |
| [config.py](../../../services/ai-service/app/config.py) | Diedit — tambah `net_api_base_url` |
| [pyproject.toml](../../../services/ai-service/pyproject.toml) | Diedit — tambah `fastmcp>=2.0`, `httpx>=0.27` |
| [test_mcp_server.py](../../../services/ai-service/tests/test_mcp_server.py) | Baru — unit test 4 tool (asyncpg + httpx di-mock) |
| Claude Desktop config (mesin lokal) | Dikonfigurasi — `%APPDATA%\Claude\claude_desktop_config.json` (tidak di-commit) |

**Tool 1 — `get_transactions`.** Docstring-nya secara eksplisit menyebutkan tiap field balik beserta tipenya — ini yang membuat skema JSON-nya berguna buat Claude Desktop, bukan `{}` kosong. Filter dari parameter (`category`, `account`) datang dari AI yang memparafrasekan permintaan user, jadi diperlakukan sebagai input untrusted — lewat `WHERE` terparametrisasi, bukan interpolasi string nilai:

```python
@mcp.tool()
async def get_transactions(
    date_from: str | None = None,
    date_to: str | None = None,
    category: str | None = None,
    account: str | None = None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    """Get bank transactions with optional filters.

    Returns list of: {date, description, category, amount_idr (float), flow, account}
    """
    limit = min(limit, 100)
    # ... bangun klausa WHERE via helper add(), semua nilai lewat parameter $n, bukan f-string
```

Hard cap `limit = min(limit, 100)` ada karena AI yang memanggil tool ini tidak tahu seberapa besar tabel transactions — tanpa cap, satu permintaan bisa menarik ribuan baris ke context window dalam satu panggilan.

**Tool `get_pyramid_scores` — memanggil .NET API, bukan query langsung.** `JourneyScoringService` menghitung skor tier dari transaksi, aset, dan investasi lewat business logic yang tersebar di MediatR handler. Menduplikasi logika itu di Python membuka celah drift kalau formula berubah tapi copy Python-nya lupa diupdate — jadi seam-nya sengaja dibuat lewat HTTP, pola yang sama dengan `JourneyAdvisorClient`/`PortfolioReviewClient` yang sudah ada:

```python
@mcp.tool()
async def get_pyramid_scores() -> list[dict[str, Any]]:
    """Get the current Financial Pyramid tier scores.

    Returns list of: {tier (str), score (float 0-1), status (str)}
    """
    async with httpx.AsyncClient(base_url=settings.net_api_base_url, timeout=10.0) as client:
        response = await client.get("/api/journey/scores")
        response.raise_for_status()   # error tool, bukan list kosong diam-diam
        return response.json()
```

**Mounting ke FastAPI yang sudah ada.** Nama method mounting FastMCP berubah antar versi (`sse_app()`, `get_mcp_app()`, `streamable_http_app()`) — plan asli meminta cek `dir(mcp)` dulu sebelum menebak nama method-nya, supaya `app.mount()` tidak gagal diam-diam karena AttributeError yang membingungkan:

```python
mcp_app = mcp.sse_app()          # atau mcp.get_mcp_app() / mcp.streamable_http_app()
app.mount("/mcp", mcp_app)
```

`set_pool(pool)` dan `set_retriever(retriever)` dipanggil di lifespan yang sama, setelah pool dan `RetrievalService` yang sudah ada dibuat — MCP server berbagi keduanya lewat module-level global, bukan koneksi kedua.

Kode lengkap ketiga tool lainnya (`get_cashflow_summary`, `search_transactions_semantic`), semua test unit (mocked, tanpa panggilan asli ke Supabase/httpx/LLM), port C# baris-per-baris untuk tiap blok, konfigurasi Claude Desktop (SSE + fallback stdio), dan script demo 2-agent stretch ada di file asli: [PF-AI009-mcp-personal-finance-server-todo.md](PF-AI009-mcp-personal-finance-server-todo.md), STEP 2–10.

---

## Optimisasi

Keputusan desain yang diambil di plan chapter ini, dengan alasan konkretnya:

1. **FastMCP dipasang di dalam AI service yang sudah ada, bukan proses standalone.** AI service sudah mengelola asyncpg pool dan `RetrievalService` yang hangat — menempatkan MCP server di proses yang sama berarti memakai ulang keduanya, bukan membangun koneksi dan cache kedua dari nol.
2. **SSE transport, bukan stdio.** AI service sudah berjalan sebagai proses long-running (`npm start` atau `uvicorn`) — SSE membiarkan Claude Desktop terhubung ke proses yang sudah ada; stdio berarti proses baru + pool baru + retriever dingin di tiap sesi.
3. **Supabase langsung (asyncpg) untuk data transaksi; .NET API (httpx) untuk nilai terkomputasi (skor pyramid).** `JourneyScoringService` tetap pemiliknya — seam yang sama dengan `JourneyAdvisorClient`/`PortfolioReviewClient` yang sudah ada, bukan konsep baru.
4. **Tipe balik eksplisit di tiap tool, bukan `dict` polos.** FastMCP men-generate skema JSON dari anotasi tipe; `dict` jadi `{}` kosong yang membuat AI menebak nama field.
5. **Hard cap di tiap tool** (`get_transactions` maks 100 baris, `search_transactions_semantic` maks 20 `top_k`) — AI yang memanggil tool tidak tahu ukuran tabel; tanpa cap dia bisa menarik seluruh tabel dalam satu panggilan.
6. **Filter SQL selalu lewat `WHERE` terparametrisasi, tidak pernah interpolasi string nilai.** Parameter `category`/`account` datang dari AI yang memparafrasekan input user — diperlakukan untrusted, sama seperti prinsip di validasi input lain di project ini.
7. **`set_pool()`/`set_retriever()` sebagai module-level global, bukan DI penuh.** Sengaja sederhana untuk chapter belajar ini — meniru pola `_pool` yang sudah ada di `retriever.py`, bukan over-engineering untuk kebutuhan yang belum ada.
8. **Tanpa auth di local dev.** Endpoint SSE akan butuh bearer token guard begitu PF-S08 mengaktifkan Supabase Auth + RLS — dicatat eksplisit di plan, sengaja tidak dibangun sekarang.

---

## Best Practice

Aturan yang dipegang selama membangun chapter ini, dan kenapa masing-masing penting:

- **Docstring tiap tool harus menyebutkan field balik beserta tipenya secara eksplisit** — itu satu-satunya sumber informasi yang dibaca AI client saat menyusun skema dan memutuskan cara memakai hasilnya.
- **Tidak pernah `dict`/`Any` polos sebagai tipe balik tool.** Selalu bentuk eksplisit (`list[dict[str, Any]]` + docstring field-list, atau `TypedDict`) supaya FastMCP men-generate skema yang berisi nama field, bukan `{}` kosong.
- **Semua filter dari parameter tool lewat `WHERE` terparametrisasi**, tidak pernah string interpolation nilai — parameter datang dari AI yang memparafrasekan input user, diperlakukan sebagai untrusted.
- **Hard cap `limit`/`top_k` di tiap tool, apapun nilai yang diminta.** AI tidak tahu seberapa besar tabelnya.
- **Jalankan MCP Inspector dulu (quickstart Step 1) sebelum membangun server sungguhan** — 15 menit main-main di inspector mencegah jam-jam debugging protokol belakangan.
- **Verifikasi endpoint `.NET API` (`/api/journey/scores`) benar-benar ada lewat `curl` sebelum menulis kode Step 5** — jangan asumsikan nama route.
- **Jangan commit `claude_desktop_config.json`.** Spesifik-mesin (path lokal Windows), bukan artefak yang seharusnya jadi bagian repo.
- **Kegagalan tool (mis. .NET API mati) harus melempar error tool** (`raise_for_status()`), **bukan diam-diam mengembalikan list kosong** — kontrak yang sama dengan aturan error service ini di chapter-chapter lain.
- **Cek nama method mounting FastMCP (`dir(mcp)`) sebelum menebak** — API-nya drift antar versi library.

---

## Kesalahan Umum

> Chapter ini belum dibangun (status: To Do), jadi belum ada bug "kejadian betulan" dari sesi build — beda dengan PF-AI004 yang sudah live-verified. Daftar di bawah adalah jebakan-jebakan yang sudah diantisipasi di file plan asli (bagian 📌 Notes, Anti-patterns, dan Knowledge Check) plus konsekuensi logis dari desainnya — bukan insiden nyata. Bagian ini akan diperbarui jadi bug betulan setelah chapter ini benar-benar dikerjakan.

1. **Pakai `dict`/`Any` sebagai tipe balik tool.** FastMCP men-generate skema `{}` kosong — AI menebak nama field lalu salah di panggilan susulan atau saat memformat jawaban.
2. **Interpolasi string nilai `category`/`account` langsung ke SQL, bukan `WHERE` terparametrisasi.** Parameter ini datang dari AI yang memparafrasekan input user — harus diperlakukan untrusted, bukan diasumsikan aman karena "cuma AI yang manggil."
3. **Melewati quickstart MCP Inspector (STEP 1) dan langsung membangun server penuh.** Investasi 15 menit di inspector mencegah 2 jam debugging protokol JSON-RPC yang seharusnya bisa dilihat lebih awal.
4. **Menebak nama method mounting FastMCP (`sse_app()`/`get_mcp_app()`/`streamable_http_app()`) tanpa cek `dir(mcp)` dulu.** API-nya drift antar versi — tebakan salah bikin `app.mount()` gagal diam-diam atau error yang membingungkan.
5. **Commit `claude_desktop_config.json`.** Tidak mengandung secret (cuma URL lokal), tapi spesifik-mesin — bukan artefak repo.
6. **Tidak hard-cap `limit`/`top_k`.** AI yang memanggil tool tidak tahu ukuran tabel — tanpa cap, satu panggilan `get_transactions(limit=10000)` bisa menarik seluruh tabel transaksi ke context window.
7. **Melewati test end-to-end nyata di Claude Desktop dan cuma mengandalkan unit test yang di-mock.** Test suite memock semua eksternal call — satu-satunya bukti bahwa Claude Desktop benar-benar bisa menemukan dan memanggil tool lewat skema yang di-generate adalah demo natural-language yang sungguhan ("berapa pengeluaran makan bulan ini?").
8. **Membangun MCP Resources atau Prompts di chapter ini.** Di luar scope — empat Tools sudah cukup untuk demo dan cerita interview; Resources/Prompts didokumentasikan sebagai stretch masa depan (lihat 📌 Notes plan asli: `finance://pyramid-scores` sebagai Resource), bukan tugas chapter ini.
9. **Query `journey_scores` langsung ke Supabase alih-alih lewat .NET API.** Menduplikasi business logic `JourneyScoringService` yang tersebar di MediatR handler — kalau formula skornya berubah, copy Python-nya bisa lupa diupdate.
10. **Memberi Advisor (agent sintesis) akses langsung ke MCP tools di demo 2-agent stretch, alih-alih menerima laporan terstruktur dari Analyst.** Menggandakan panggilan tool + latency, dan mengaburkan single responsibility masing-masing agent (Analyst = pengambilan data, Advisor = sintesis).

---

## Summary

**Masalah yang diselesaikan:** tiap kemampuan AI di chapter 1–8 cuma bisa dijangkau lewat integrasi bespoke satu-per-satu (endpoint HTTP yang kamu tulis tangan, dipanggil satu caller yang sudah tahu bentuknya) — Claude Desktop (atau AI client lain) tidak tahu apa pun soal endpoint-endpoint itu dan tidak bisa "diajari" per percakapan.

**Yang akan dibangun (sesuai plan, belum dieksekusi):**
- FastMCP server di-mount di `/mcp` pada AI service yang sudah ada, SSE transport, berbagi asyncpg pool + `RetrievalService`.
- Empat tool dengan skema tipe eksplisit: `get_transactions` (filter terparametrisasi ke Supabase), `get_cashflow_summary` (agregasi per periode), `get_pyramid_scores` (via .NET API), `search_transactions_semantic` (reuse `RetrievalService` dari PF-AI003).
- Konfigurasi Claude Desktop (SSE + fallback stdio) dan demo percakapan natural-language end-to-end.
- Stretch: demo 2-agent (Analyst mengumpulkan data lewat `tool_use`, Advisor mensintesis rekomendasi).

**Angka yang jadi patokan (diisi setelah chapter ini dijalankan):**

| Metrik | Target di plan | Hasil aktual |
|--------|-----------------|--------------|
| Tool terlihat di panel Claude Desktop | 4/4 | *diverifikasi* |
| Demo "berapa pengeluaran makan bulan ini?" mengembalikan total IDR yang benar | ya | *diukur* |
| `pytest tests/test_mcp_server.py` hijau | semua | *diukur* |

**Pelajaran terpenting chapter ini (dari desain plan-nya):** MCP bukan cara baru memanggil LLM — dia protokol *discovery*. Server mendeklarasikan tool dengan skema tipe eksplisit; client menemukannya otomatis dan memutuskan kapan memanggilnya, tanpa integrasi per-caller yang ditulis tangan. Semangatnya sama dengan "docstring sebagai skema" di Chapter 7 (agent), cuma sekarang skemanya jadi kontrak protokol yang dipakai bersama banyak client, bukan cuma satu agent.

**Kalimat penutup untuk interview** (target dari plan asli, dipakai setelah chapter ini selesai): *"Saya membangun personal-finance MCP server yang mengekspos 4 tool bertipe — query transaksi dengan pre-filter SQL, ringkasan cashflow per periode, skor tier pyramid via .NET API, dan semantic search yang memakai ulang retriever pgvector dari Chapter 3. Saya mount di service FastAPI yang sudah ada lewat SSE transport dan mengonfigurasi Claude Desktop untuk memakainya. Keputusan desain kuncinya adalah menempatkan MCP server bersama AI service supaya berbagi asyncpg connection pool dan RetrievalService, bukan membangun proses standalone — prinsip batas Clean Architecture yang sama, diterapkan ke MCP. Claude Desktop sekarang bisa menjawab 'berapa pengeluaranku untuk makan bulan ini?' lewat panggilan tool nyata, bukan halusinasi."*

**Lanjutannya:** Chapter 10 (Public Presence + Certification) menjadikan MCP server ini bagian dari demo yang ditunjukkan — "lihat apa yang saya bangun." Detail lengkap TODO steps, port C# baris-per-baris, semua kode test, dan Knowledge Check quiz ada di file asli: [PF-AI009-mcp-personal-finance-server-todo.md](PF-AI009-mcp-personal-finance-server-todo.md).

---

## 📖 Glossary

Istilah baru chapter ini (MCP, Tools/Resources/Prompts, FastMCP, stdio, skema tool) sudah di-link langsung dari tiap kemunculan pertamanya di atas, di kategori baru **"10. MCP (Model Context Protocol)"**. `SSE` memakai ulang definisi yang sudah ada dari chapter streaming (kategori 6). Kalau mau lihat semuanya sekaligus (atau cari istilah dari chapter-chapter sebelumnya): **[Glossary RAG (Bahasa Indonesia)](glossary-rag-id.md)**.
