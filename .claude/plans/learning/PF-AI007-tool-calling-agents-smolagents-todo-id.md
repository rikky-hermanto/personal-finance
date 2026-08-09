# PF-AI007 — Chapter 7: Tool-Calling Agent — smolagents (Transaction Categorizer) (Versi Belajar)

> **Ini bukan plan baru.** Ini adalah tulisan ulang dari [PF-AI007-tool-calling-agents-smolagents-todo.md](PF-AI007-tool-calling-agents-smolagents-todo.md), disusun ulang supaya urutannya mengikuti cara otak belajar hal baru — bukan urutan implementasi. Semua fakta, kode, dan keputusan desain yang disebutkan di sini diambil apa adanya dari file asli. File asli tetap jadi rujukan resmi untuk TODO steps, acceptance criteria, dan quiz — dokumen ini cuma versi "supaya nyantol dulu di kepala."
>
> **Urutan baca:** masalah dulu → baru konsep → baru cara kerja → baru kode → baru optimisasi → baru best practice → baru kesalahan umum → baru ringkasan. Jangan loncat ke bagian Implementasi kalau tiga bagian pertama belum kebayang, nanti kodenya kelihatan seperti sihir.
>
> **Ketemu istilah asing di tengah baca?** Semua istilah baru dijelaskan pas pertama kali muncul, dan tiap istilah di-link langsung ke definisinya di [Glossary RAG](glossary-rag-id.md) — tinggal klik, tidak perlu scroll balik. (Namanya masih "Glossary RAG" karena historinya, tapi sudah dipakai bersama untuk semua chapter, termasuk chapter agent ini.)
>
> **Chapter ini belum dikerjakan (status: To Do).** Bagian Implementasi di bawah menjelaskan kode yang *akan* ditulis sesuai file plan asli — bukan kode yang sudah live dan sudah dites terhadap Supabase asli seperti PF-AI004. Bagian Kesalahan Umum juga diberi catatan khusus soal ini.

---

## Apa Masalah yang Ingin Diselesaikan?

Fitur kategorisasi transaksi yang sudah ada ([categorizer.py](../../../services/ai-service/app/services/categorizer.py), PF-103) jalan lewat 4 lapis: cocokkan ke 106 rule → cek preset kategori → cek history cache → kalau masih belum ketemu, baru lempar ke LLM sebagai jalan terakhir. Lapis ke-4 ini (LLM fallback) yang jadi sorotan chapter ini: dia cuma mengirim deskripsi transaksi ke model, lalu menerima balik satu kategori tebakan — titik.

Ambil contoh nyata: deskripsi `"GJ*GRAB CAR JAKARTA SELATAN"` masuk ke lapis LLM fallback. Modelnya bisa saja menjawab "Shopping" — padahal ini jelas ongkos transportasi online. Yang bikin ini masalah bukan cuma tebakan yang salah, tapi **tidak ada jejak sama sekali** kenapa dia menjawab begitu. Dia tidak pernah benar-benar mengecek 106 rule yang sudah ada (yang kemungkinan besar punya entry "grab" → Transportation), tidak pernah melihat riwayat transaksi serupa milik user — dia cuma menebak dari untaian teks deskripsinya sendiri. Kalau salah, tidak ada apa pun yang bisa dibuka untuk dikoreksi.

Target chapter ini: `POST /categorize-agent` dengan input yang sama seperti `/categorize` (deskripsi, wallet, nominal), tapi kali ini prosesnya **kelihatan** — setiap langkah pemeriksaan (cek rule, cek riwayat, cek daftar kategori valid) tercatat sebagai satu span yang bisa dibuka di dashboard Langfuse. Bukan cuma prediksi, tapi jejak penalaran yang bisa di-debug.

---

## Konsep Sederhananya

Tiga konsep baru menyelesaikan masalah di atas:

1. **[Agent](glossary-rag-id.md#agent)** — bukan satu kali panggilan LLM, tapi sebuah **loop**: LLM lihat apa yang sudah dia tahu, mikir langkah berikutnya, panggil satu tool, lihat hasilnya, ulangi — sampai punya informasi yang cukup untuk menjawab. Pola loop ini punya nama baku: **[ReAct](glossary-rag-id.md#react)** (Reason → Act → Observe → ulangi).

2. **[`ToolCallingAgent`](glossary-rag-id.md#tool-calling-agent) vs [`CodeAgent`](glossary-rag-id.md#code-agent)** — smolagents (library yang dipakai chapter ini) punya dua varian agent. `CodeAgent` membiarkan LLM menulis kode Python bebas untuk memanggil tool — fleksibel, tapi berbahaya kalau jalan di server produksi (kode yang dihasilkan bisa memuat apa saja, termasuk perintah sistem yang merusak). `ToolCallingAgent` membatasi LLM cuma boleh mengeluarkan **panggilan tool berformat JSON** dari daftar yang sudah didaftarkan — ini yang aman untuk web service.

3. **[Tool docstring sebagai skema](glossary-rag-id.md#tool-docstring-as-schema)** — docstring menjadi deskripsi utama setiap tool yang dipakai LLM untuk menentukan kapan tool perlu digunakan dan bagaimana tool itu dipanggil. Docstring bukan cuma dokumentasi buat manusia di sini — dia **adalah** instruksi yang dibaca mesin.

Diagram besar chapter ini — satu agent, tiga tool, loop ReAct maksimal 3 putaran:

```
  transaksi ───►┌──────────────────────────┐───► kategori + confidence
  (desc/wallet/  │   Agent = LLM + tools    │      + reasoning + trace
   amount)       │                          │
                 │   observe ◄──┐           │
                 │      │       │           │   loop sampai 3× (ReAct):
                 │   reason      │ hasil     │   rules → history → daftar kategori
                 │      │       │ tool      │
                 │      ▼       │           │
                 │    act ──────┘           │
                 │  (panggil satu tool)     │
                 └──────────────────────────┘
```

Tiga tool-nya sengaja mengikuti urutan lapis yang sudah ada di 4-layer categorizer — bukan konsep baru dari nol, cuma dipindahkan jadi sesuatu yang bisa dipanggil agent secara eksplisit:

```
                         Transaction Categorizer Agent
                       ┌────────────────────────────────────────────────────────────┐
  Input:               │    LLM: LiteLLM → Gemini 2.5 Flash (atau Anthropic)         │
  description +        │                                                            │
  wallet + amount ────►│   [Observe]  ──►  [Reason]  ──►  [Act: panggil tool]        │
                       │       ▲                                    │                │
                       │       └────────────────────────────────────┘                │
                       │                   loop ReAct (≤ 3 iterasi)                  │
                       └──────────────────────────┬─────────────────────────────────┘
                                                  │
                        ┌─────────────────────────┼────────────────────────┐
                        ▼                         ▼                        ▼
            ┌────────────────────────┐  ┌────────────────────────┐  ┌────────────────────────┐
            │ search_category_rules  │  │ find_similar_trans      │  │ list_all_categories    │
            │ (keyword)               │  │ (description)           │  │ ()                     │
            │ → cocokkan ke 106 rule  │  │ → panggil Retrieval-     │  │ → daftar kategori      │
            │   yang sudah ada        │  │   Service in-process     │  │   valid (dari DB),     │
            │                         │  │   (pgvector, Chapter 3) │  │   biar tidak mengarang │
            └────────────────────────┘  └────────────────────────┘  └────────────────────────┘
```

---

## Cara Kerjanya

Bagian ini menjelaskan tiap konsep dengan cara "tangga": mulai dari versi paling sederhana, lihat di mana dia mentok, baru pahami kenapa versi berikutnya dibutuhkan. Struktur bertahap ini diambil dari file plan asli dan disusun ulang dalam Bahasa Indonesia.

### Apa itu agent — dari satu kali tebak sampai loop ReAct

**Satu panggilan LLM.** Ini yang sudah ada sekarang: lapis ke-4 `categorizer.py` mengirim deskripsi ke model, model balas satu kategori. Untuk kasus yang jelas ("STARBUCKS COFFEE" → Food & Dining) ini cukup.

Ganjalannya, waktu tebakannya salah, tidak ada apa pun yang bisa dibuka untuk tahu kenapa. Model tidak pernah benar-benar mengecek 106 rule atau riwayat transaksi user — dia menebak murni dari untaian deskripsinya. Kasih dia `"GJ*GRAB CAR JAKARTA"` dan dia bisa saja bilang "Shopping"; tidak ada yang menunjukkan apa yang dia pertimbangkan atau cara mengoreksinya.

**Kasih model tool.** Daripada menebak, biarkan model memanggil fungsi: cari rule yang cocok, cek transaksi mirip di riwayat. **[Tool calling](glossary-rag-id.md#tool-calling)** = LLM mengeluarkan permintaan terstruktur ("panggil `search_category_rules` dengan keyword='grab'"), kode aplikasi yang menjalankannya, hasilnya dikembalikan ke model.

Tapi satu panggilan tool biasanya tidak cukup. Rule bisa saja mengembalikan "tidak ada yang cocok", dan model perlu *melihat hasil itu* baru memutuskan mencoba similarity search. Interaksi satu kali request–response tidak dapat menentukan langkah berikutnya berdasarkan hasil yang baru diperoleh.

**Loop ReAct.** **[ReAct](glossary-rag-id.md#react)** (Reason + Act) menjalankan model dalam loop: amati hasil tool terakhir, pikirkan langkah berikutnya, panggil tool lagi, amati lagi — sampai punya informasi yang cukup untuk menjawab. smolagents yang menjalankan loop ini untukmu. → *Ini yang dipakai chapter ini.*

> **Teaser, belum dibangun di sini:** Chapter 8 (LangGraph) mengubah loop implisit ini jadi graf state eksplisit dengan node routing dan retry — loop yang sama, tapi bisa diinspeksi dan dikendalikan.

### `ToolCallingAgent` vs `CodeAgent` — kenapa bukan yang paling fleksibel

**`CodeAgent`.** `CodeAgent` di smolagents membiarkan LLM *menulis kode Python* untuk memanggil tool — fleksibel banget, dan cocok untuk notebook data science.

Celakanya, ini jalan sebagai web service, dan kode yang dihasilkan itu benar-benar dieksekusi di server. Tidak ada yang mencegah model — atau deskripsi transaksi yang sengaja di-prompt-inject — mengeluarkan `os.system("rm -rf /")` lalu menjalankannya. Fleksibilitas berubah jadi eksekusi kode arbitrer.

**`ToolCallingAgent`.** Batasi model supaya cuma boleh mengeluarkan **panggilan tool berformat JSON** — bentuk yang persis sama dengan `tool_use` yang sudah dipakai di seluruh pipeline ekstraksi PDF project ini. Model cuma bisa memanggil tool yang sudah didaftarkan, dengan argumen bertipe; tidak ada jalur eksekusi kode bebas. → *Ini yang dipakai chapter ini.* Jembatannya ke yang sudah kamu tahu: primitive `tool_use` dari ekstraksi PDF adalah building block yang sama yang dipakai loop agent — kamu bukan belajar sesuatu yang benar-benar baru, cuma melihat di mana primitive itu hidup di dalam sebuah loop penalaran.

### Tool docstring adalah skema — bukan sekadar dokumentasi

**Fungsi polos.** Tulis `search_category_rules(keyword)` dan daftarkan sebagai tool.

Ganjalannya, model memutuskan *apakah dan kapan* memanggil sebuah tool murni dari docstring-nya — itu satu-satunya deskripsi yang dia lihat. Docstring yang samar ("mencari rules") tidak memberi dasar buat model untuk mengecek rule *sebelum* similarity search, jadi urutannya bisa kepanggil salah tanpa ada bug yang kelihatan jelas.

**Docstring sebagai kontrak.** Tulis docstring yang menyebutkan *kapan* tool ini dipakai ("Use this tool FIRST", "gunakan kalau rules mengembalikan tidak ada yang cocok"), makna tiap argumen, dan bentuk hasilnya. Docstring **adalah** skema yang jadi acuan rencana LLM. → *Ini yang dipakai chapter ini.*

### Tool cuma sebagus data yang dikembalikan service di belakangnya

Ini bagian yang paling gampang dilewati, dan justru yang paling mahal kalau kelewat.

Tool 2 (`find_similar_transactions`) tujuannya satu: memberi tahu agent **bagaimana user dulu mengkategorikan transaksi serupa**. Itu referensi utamanya. Masalahnya, hasil `/search` dari Chapter 3 — `SearchResult` — isinya `transaction_id, similarity, description, date, amount_idr, flow, wallet`. **Tidak ada `category` di situ.**

Perhatikan bentuk kegagalannya. Tidak ada exception. Tidak ada error di log. Agent tetap jalan, tetap dapat memanggil tool yang tersedia, tetap menghasilkan pohon span yang rapi di Langfuse, dan tetap mengembalikan sebuah kategori. Yang terjadi cuma: tool 2 mengembalikan `unknown` untuk setiap baris, sehingga salah satu dari tiga sumber informasinya kosong melompong sepanjang waktu. Dilihat dari luar, semuanya "berhasil".

Makanya chapter ini menambahkan `category` ke `SearchResult` dan ikut men-`SELECT t.category` di **dua** jalur retriever (`_search_vector()` dan `_fetch_results_by_ids()` — kalau cuma yang pertama, hybrid/BM25 diam-diam mengembalikan `None`).

Pelajaran yang bisa dibawa ke mana-mana: **membangun agent itu sebagian besar kerjanya menyambungkan service yang sudah ada jadi fungsi tool.** Hampir semua bug di situ bukan soal framework agent-nya, tapi soal asumsi yang salah tentang service yang disambungkan. Dan framework tidak akan pernah memberi tahu kamu kalau sebuah tool sedang mengembalikan hal yang tidak berguna — dia cuma tahu tool itu tidak melempar exception.

### Kenapa `max_steps=3`

Tiga tool-nya punya urutan yang disarankan lewat docstring: rules → history → daftar kategori. Tapi ini urutan *preferensi*, bukan rantai wajib — tiap putaran loop memanggil **satu** tool saja, dan yang memilih adalah LLM. Praktiknya 1–2 iterasi biasanya cukup: rule cocok atau tidak. `[max_steps](glossary-rag-id.md#max-steps)=3` membatasi loop yang kebablasan, di mana LLM terus memanggil tool yang sama dengan keyword berbeda-beda. Chapter 8 (LangGraph) menggantikan batas implisit ini dengan node routing `END` eksplisit — nanti kelihatan persis apa yang dia selesaikan.

---

## Implementasi

Sekarang baru masuk ke kode yang akan ditulis. File yang akan dibuat/diubah — semua di service AI Python (`services/ai-service/`):

| File | Perubahan |
|------|-----------|
| [\_\_init\_\_.py](../../../services/ai-service/app/agents/__init__.py) (`app/agents/`) | Baru — package kosong |
| [categorizer_agent.py](../../../services/ai-service/app/agents/categorizer_agent.py) | Baru — `CategorizerAgent` + `CategorizationResult` + `_parse_result` |
| [category_rules.py](../../../services/ai-service/app/agents/tools/category_rules.py) | Baru — tool `search_category_rules` + `load_rules()` |
| [similarity.py](../../../services/ai-service/app/agents/tools/similarity.py) | Baru — tool `find_similar_transactions` + `configure(retriever)` |
| [categories.py](../../../services/ai-service/app/agents/tools/categories.py) | Baru — tool `list_all_categories` + `load_categories()` |
| [models.py](../../../services/ai-service/app/models.py) | Diedit — tambah `category` ke `SearchResult` **dan** tambah `CategorizeAgentRequest`, `CategorizeAgentResponse` |
| [retriever.py](../../../services/ai-service/app/services/retriever.py) | Diedit — ikut `SELECT t.category` di `_search_vector()` **dan** `_fetch_results_by_ids()` |
| [main.py](../../../services/ai-service/app/main.py) | Diedit — `_load_rules()`; wire agent + snapshot tool di lifespan; endpoint `POST /categorize-agent`; panggil `instrument_smolagents()` |

Perhatikan dua baris terakhir: chapter ini **mengubah kode retrieval dari Chapter 3**, bukan cuma menambah folder baru. Alasannya ada di bagian [Kesalahan Umum #1](#kesalahan-umum) — dan itu justru pelajaran paling berguna dari chapter ini.

**Tool 1 — cari rule.** Docstring-nya secara eksplisit bilang "gunakan ini DULUAN" — ini yang membuat agent mengecek rule sebelum melempar ke similarity search, bukan sebaliknya:

```python
@tool
def search_category_rules(keyword: str) -> str:
    """Search the category rule base for a keyword match. Use this tool FIRST.

    Rule matches are deterministic and zero-cost — always check rules before
    falling back to similarity search. Returns matching category names and the
    rule patterns that triggered them. Returns 'No rules matched.' when empty.
    """
    keyword = keyword.lower().strip()
    matches = [(p, c) for p, c in _CATEGORY_RULES.items() if keyword in p or p in keyword]
    if not matches:
        return "No rules matched."
    return "Matched rules:\n" + "\n".join(f"  pattern='{p}' → category='{c}'" for p, c in matches[:5])
```

Rule 106 yang sudah ada disnapshot sekali ke dict di memori lewat `load_rules()` saat service startup — bukan query DB tiap iterasi loop, karena rule jarang berubah dan snapshot yang agak basi jauh lebih murah daripada round-trip DB di setiap langkah agent.

**Tool 3 — daftar kategori valid.** Tool ini paling sederhana, tapi perannya penting: mencegah agent mengarang nama kategori. Daftarnya **diambil dari DB**, di-snapshot sekali saat startup — bukan ditulis tangan di kode. Service ini sudah punya vokabuler itu: [`_load_categories()`](../../../services/ai-service/app/main.py) melakukan `SELECT DISTINCT category FROM transactions` dan menyimpannya di `app.state.categories` untuk query planner. Tinggal dipakai ulang.

```python
_CATEGORIES: list[str] = []

def load_categories(categories: list[str]) -> None:
    """Dipanggil dari lifespan main.py, sumbernya app.state.categories."""
    global _CATEGORIES
    _CATEGORIES = list(categories) if categories else list(_FALLBACK_CATEGORIES)

@tool
def list_all_categories() -> str:
    """Return the complete list of valid category names.

    Your final CATEGORY must exactly match one of these names — do NOT invent
    category names. If uncertain, use 'Other'.
    """
    return "Valid categories:\n" + "\n".join(f"  - {c}" for c in _CATEGORIES)
```

`_FALLBACK_CATEGORIES` (list tulis tangan) tetap ada, tapi **cuma sebagai cadangan** kalau DB tidak bisa dihubungi saat startup atau tabel transaksi masih kosong di instalasi baru. Kenapa bukan list tulis tangan sebagai sumber utama — dibahas di [Optimisasi #8](#optimisasi).

**`CategorizerAgent`** — kelas yang membungkus `ToolCallingAgent` dengan tiga tool, model lewat `LiteLLMModel`, dan `max_steps=3`. System prompt-nya secara eksplisit menuliskan urutan strategi (rules → history → daftar kategori → jawaban berformat tetap):

```python
class CategorizerAgent:
    def __init__(self) -> None:
        model_id = f"gemini/{settings.ai_model}"  # atau "anthropic/..."
        model = LiteLLMModel(model_id=model_id)
        self._agent = ToolCallingAgent(
            tools=[search_category_rules, find_similar_transactions, list_all_categories],
            model=model,
            instructions=_SYSTEM_PROMPT,   # ← strategi urutan tool masuk DI SINI
            max_steps=3,
        )

    def categorize(self, description: str, wallet: str, amount_idr: float) -> CategorizationResult:
        task = f"Categorize this bank transaction:\n  Description: {description}\n  Bank: {wallet}\n  Amount (IDR): {amount_idr:,.0f}"
        raw = self._agent.run(task)
        steps = getattr(self._agent, "memory", None)
        tool_calls = len(steps.steps) if steps is not None else 0
        return _parse_result(str(raw), tool_calls_count=tool_calls)
```

Dua detail di blok ini yang gampang salah, dan dua-duanya gagal tanpa error:

**Pertama, system prompt masuk lewat `instructions=` di constructor — bukan `additional_args=` di `run()`.** `additional_args` itu untuk mengoper *variabel task*, bukan instruksi sistem. Kalau strategi urutan tool ditaruh di sana, smolagents menerimanya tanpa protes lalu mengabaikannya: agent jalan normal, tidak ada exception, cuma urutan tool-nya jadi ngawur. Ini persis kegagalan yang dibahas di [Kesalahan Umum #2](#kesalahan-umum) — dan alasan kenapa plan asli sekarang punya satu step khusus (STEP 1b) buat mengecek signature `ToolCallingAgent.__init__` sebelum menulis kode agent.

**Kedua, `tool_calls_count` diambil dari catatan langkah milik agent sendiri**, bukan diisi `0` lalu "nanti diisi pemanggil". Field angka yang isinya selalu 0 lebih berbahaya daripada tidak ada field sama sekali — bentuknya seperti hasil pengukuran, jadi tidak ada yang curiga.

Perhatikan: `categorize()` di sini adalah fungsi **sinkron** — `ToolCallingAgent.run()` bawaan smolagents memang sinkron. Dipanggil langsung di dalam `async def` endpoint, dia akan menahan event loop selama agent berjalan (bisa 1–5 detik). Endpoint-nya membungkus panggilan ini dengan `asyncio.to_thread(...)` — pola yang sama dengan FlashRank di Chapter 4 ([lihat glossary](glossary-rag-id.md#asyncio-to-thread)).

**Menyalakan trace ke Langfuse** — cuma satu baris tambahan di startup, *setelah* OTLP exporter (dari PF-AI001) sudah dikonfigurasi:

```python
from smolagents.monitoring import instrument_smolagents
instrument_smolagents()
```

Karena exporter OTLP ke Langfuse sudah aktif, tiap run agent otomatis mengalir ke Langfuse tanpa konfigurasi tambahan — inilah nilai dari observability yang OTel-first sejak PF-AI001: framework baru "langsung jalan" tanpa perlu di-wiring satu-satu.

**Endpoint** `POST /categorize-agent` mengembalikan HTTP 502 (bukan 200 dengan kategori kosong) kalau agent gagal — sesuai kontrak error service ini:

```python
@app.post("/categorize-agent", response_model=CategorizeAgentResponse)
async def categorize_with_agent(request: CategorizeAgentRequest) -> CategorizeAgentResponse:
    try:
        result = await asyncio.to_thread(
            app.state.categorizer_agent.categorize,
            request.description, request.wallet, request.amount_idr,
        )
        return CategorizeAgentResponse(category=result.category, confidence=result.confidence,
                                        reasoning=result.reasoning, tool_calls_count=result.tool_calls_count)
    except Exception as exc:
        logger.exception("agent categorization failed")
        raise HTTPException(status_code=502, detail="llm_parse_error") from exc
```

**Tool 2 — dan sikap penanganan error yang beda dari biasanya.** Tool ini memanggil `RetrievalService` yang sama persis dengan yang dipakai `/search` dan `/ask` (langsung di dalam proses — bukan HTTP ke port sendiri). Yang menarik bukan itu, tapi cara dia menangani kegagalan:

```python
    if _RETRIEVER is None:
        return "Similarity search unavailable."
    try:
        results = asyncio.run(_RETRIEVER.search(query=description, top_k=3))
    except Exception:
        logger.exception("similarity tool failed description=%r", description)
        return "Similarity search unavailable."
```

Di endpoint biasa, melempar exception itu benar — pemanggil memang perlu tahu ada yang rusak. **Di dalam loop agent, tidak.** Exception yang lolos dari sebuah tool membatalkan seluruh run dan membuang semua informasi yang sudah dikumpulkan agent di iterasi sebelumnya. Mengembalikan string `"Similarity search unavailable."` membuat loop tetap hidup: LLM membacanya sebagai satu observasi biasa, dan masih bisa menjawab memakai hasil rule dengan confidence yang lebih rendah.

Ringkasnya: **saat tool tidak tersedia, informasi yang dimiliki agent berkurang; agent kemudian memutuskan respons berdasarkan informasi yang tersisa.** Ini postur error handling yang memang berbeda dari sisa codebase ini, dan layak diingat sebagai pola tersendiri.

Kode lengkap tool ke-2, semua test unit (mocked, tanpa panggilan LLM asli), port C# baris-per-baris untuk tiap blok, dan script smoke test 5-transaksi ada di file asli: [PF-AI007-tool-calling-agents-smolagents-todo.md](PF-AI007-tool-calling-agents-smolagents-todo.md), STEP 1b–7.

---

## Optimisasi

Keputusan desain yang diambil di plan chapter ini, dengan alasan konkretnya:

1. **`ToolCallingAgent`, bukan `CodeAgent`.** Ini bukan soal selera — di web service produksi, kode yang dihasilkan `CodeAgent` benar-benar dieksekusi di server. `ToolCallingAgent` membatasi model ke panggilan tool JSON terdaftar saja, jalur yang sama amannya dengan `tool_use` di pipeline ekstraksi.

2. **Tiga tool, bukan tujuh.** Makin banyak tool = makin banyak indirection = makin susah di-debug kalau agent salah pilih. Tiga tool di sini memberi agent akses ke tiga hal yang relevan dari categorizer yang sudah ada: rules dulu (Layer 1), history berikutnya (Layer 3), daftar kategori terakhir (supaya jawaban akhirnya dibatasi ke nama yang valid).

3. **LiteLLM sebagai wrapper provider.** smolagents pakai LiteLLM sebagai backend default, jadi `LiteLLMModel(model_id="gemini/...")` maupun `"anthropic/..."` sama-sama jalan pakai key yang sudah ada di `config.py` — nol setup secret tambahan.

4. **Trace Langfuse lewat satu hook OTel, bukan tracing manual per tool call.** `instrument_smolagents()` cukup satu kali panggil di startup — karena exporter OTLP ke Langfuse (dari PF-AI001) sudah aktif, semua run agent, tool call, dan LLM completion otomatis terekam sebagai pohon span tanpa kode tracing tambahan di tiap fungsi.

5. **`max_steps=3` itu jatah langkah, bukan satu langkah per tool.** Angkanya memang disamakan dengan panjang strategi (rules → history → daftar kategori), tapi jangan dibaca sebagai "tool 1 di langkah 1, tool 2 di langkah 2". Satu rule yang langsung cocok bisa menyudahi run di langkah pertama, dan LLM boleh saja menghabiskan dua langkah di tool yang sama dengan keyword berbeda. Kalau agent sering mentok di batas ini, itu sinyal untuk memperbaiki docstring, bukan menaikkan angkanya.

6. **`asyncio.to_thread` untuk memanggil `agent.run()` yang sinkron.** `ToolCallingAgent.run()` smolagents itu blocking. Dipanggil langsung di dalam `async def`, dia menahan event loop selama proses agent berjalan (1–5 detik) — semua request lain (termasuk `/health`) ikut macet. `asyncio.to_thread` melepaskannya ke thread pool.

7. **Endpoint `/categorize-agent` terpisah, tidak menggantikan `/categorize`.** `/categorize` yang sudah ada adalah jalur produksi — cepat, 4 lapis, tanpa overhead agent. Jalur agent lebih lambat (1–3 panggilan LLM per request) dan dipakai untuk debugging, edge case, dan demo. Keduanya hidup berdampingan supaya bisa dibandingkan langsung: transaksi yang sama, jalur cepat bilang "Shopping", agent bilang "Shopping (Online)" dengan alasan "rule Tokopedia cocok + 3 transaksi mirip di riwayat mengonfirmasi Shopping (Online)."

8. **Snapshot vokabuler kategori saat startup — bukan query per iterasi, tapi juga bukan list tulis tangan.** Ini sebenarnya dua pertanyaan berbeda yang sering ketuker jadi satu.

   *Datanya dari mana?* **Sumber utamanya DB.** `_FALLBACK_CATEGORIES` hanya dipakai kalau DB tidak tersedia saat startup atau instalasi baru belum memiliki data. List yang ditulis tangan di kode pasti lama-lama melenceng dari isi database. Dan agent yang dibatasi ke daftar nama yang ternyata tidak ada di sistem itu lebih buruk daripada agent yang tidak dibatasi sama sekali: dia sekarang mengarang dengan percaya diri, karena merasa sedang memilih dari daftar resmi. Vokabuler aslinya juga sudah tersedia — `app.state.categories` sudah di-load saat startup buat query planner.

   *Dibacanya seberapa sering?* **Sekali saja, saat startup.** Round-trip DB di tiap iterasi loop agent menambah latency dan overhead koneksi untuk data yang berubahnya mungkin sebulan sekali.

   Snapshot-saat-startup memberi dua-duanya: data asli, biaya per panggilan nol. Konsekuensinya daftar itu basi sampai service di-restart — untuk nama kategori, itu masih wajar, dan kalaupun bermasalah gampang kelihatan di Langfuse. Yang tidak wajar adalah menukar "hemat query" dengan "datanya karangan".

---

## Best Practice

Aturan yang dipegang selama membangun chapter ini, dan kenapa masing-masing penting:

- **Batasi agent produksi ke tool call JSON, jangan pernah eksekusi kode arbitrer.** Ini bukan preferensi gaya — ini keputusan keamanan. `CodeAgent` cocok untuk eksperimen lokal, tidak untuk web service yang menerima input dari luar.
- **Docstring tool harus eksplisit soal urutan pemanggilan** ("Use this tool FIRST", "gunakan kalau X kosong") — bukan cuma menjelaskan apa yang dilakukan tool itu, tapi kapan dia relevan dipanggil.
- **`max_steps` yang mentok adalah sinyal diagnostik, bukan alasan menaikkan limit.** Biasanya berarti docstring ambigu — model tidak tahu kapan harus berhenti.
- **Kerjaan sinkron blocking (seperti `agent.run()`) harus dilepas dari event loop** lewat `asyncio.to_thread` (Python) atau `Task.Run` (C#/.NET) — sama seperti pola FlashRank di Chapter 4.
- **Untuk kegagalan operasional yang recoverable di dalam tool, kembalikan observasi kegagalan agar agent masih dapat melanjutkan run.** Exception yang lolos dari tool membatalkan seluruh run agent dan membuang informasi yang sudah dikumpulkan. `"Similarity search unavailable."` membuat loop tetap jalan dengan informasi yang tersisa.
- **Cek dulu data yang benar-benar dikembalikan service di balik tiap tool**, jangan diasumsikan dari nama fungsinya. Tool yang mengembalikan hal tidak berguna tidak akan pernah melempar error — dia kelihatan sukses.
- **Verifikasi signature library sebelum menulis kode agent** (`instructions=` vs `additional_args=`, nama modul monitoring, atribut catatan langkah). API smolagents dapat berubah antar rilis minor, dan salah pakai kwarg gagalnya diam-diam.
- **Jangan pernah memanggil LLM asli di unit test.** Mock `ToolCallingAgent` di level class — pola yang sama dengan mocking `anthropic.AsyncAnthropic` di test ekstraksi.
- **Kegagalan agent/LLM harus mengembalikan HTTP 502, bukan 200 dengan kategori kosong.** Kontrak error service ini eksplisit melarang 200-dengan-kosong.
- **Aktifkan exporter OTLP dulu, baru panggil `instrument_smolagents()`.** Hook-nya mengikat ke `TracerProvider` yang aktif *pada saat dipanggil* — kalau urutannya terbalik, hook itu terikat ke provider kosong.
- **Sediakan endpoint debug/demo terpisah dari jalur produksi cepat**, bukan menggantikannya. Memudahkan perbandingan langsung dan tidak menambah latency ke jalur produksi yang sudah jalan.

---

## Kesalahan Umum

> Chapter ini belum dibangun (status: To Do), jadi sebagian besar daftar ini adalah jebakan yang *diantisipasi* di plan — bukan insiden nyata dari sesi build, beda dengan PF-AI004 yang sudah live-verified.
>
> **Kecuali empat yang pertama.** Nomor 1–4 ditemukan saat review arsitektur terhadap plan-nya, dengan mengecek langsung ke kode dan skema database yang ada sekarang. Draft pertama plan ini benar-benar memuat keempatnya. Semuanya sudah diperbaiki di file plan asli — tapi ditulis di sini apa adanya, karena bentuk kegagalannya jauh lebih berharga daripada perbaikannya.

1. **`SearchResult` tidak punya field `category` — tool 2 mengembalikan `unknown` untuk semua baris.** Tool yang seharusnya jadi sumber informasi riwayat ternyata tidak membawa kategori sama sekali. Tidak ada error, tidak ada log, pohon span di Langfuse tetap rapi. Agent tetap menjawab — cuma dengan satu dari tiga sumber informasinya kosong. Ini kegagalan paling berbahaya di seluruh chapter justru karena bentuknya mirip keberhasilan. Perbaikannya: tambah `category` ke model, dan `SELECT t.category` di **dua** jalur retriever.

2. **System prompt dioper lewat `additional_args=` di `run()`, bukan `instructions=` di constructor.** `additional_args` itu untuk variabel task. Strategi urutan tool yang ditaruh di sana diterima tanpa protes lalu diabaikan — seluruh premis "docstring + prompt yang mengatur urutan tool" jadi tidak pernah benar-benar diuji, dan tidak ada satu pun error yang muncul.

3. **`app.state.retriever._conn` dipakai untuk query rule di lifespan — atribut itu tidak ada.** `RetrievalService` membuka `asyncpg.connect()` baru tiap panggilan dan menutupnya di `finally`; tidak ada koneksi jangka panjang yang bisa dipinjam. Yang bikin ini kelihatan masuk akal: kebiasaan menjangkau atribut privat milik objek lain. Akibatnya `AttributeError` saat startup.

4. **`tool_calls_count` di-hardcode `0` dengan komentar "nanti diisi pemanggil" — dan tidak ada pemanggil yang mengisinya.** Field itu muncul di response model, di acceptance criteria, dan di output smoke test. Angka yang selalu 0 tapi berbentuk hasil pengukuran lebih menyesatkan daripada tidak ada angka sama sekali.

5. **Pakai `CodeAgent` alih-alih `ToolCallingAgent`.** Eksekusi kode di web service adalah lubang keamanan — pilihan yang jelas-jelas salah untuk konteks ini, dicatat eksplisit di plan sebagai anti-pattern nomor satu.

6. **Memanggil `agent.run()` langsung di dalam `async def` tanpa `asyncio.to_thread`.** Menahan event loop selama durasi agent (1–5 detik) — semua request konkuren lain (termasuk `/health`) ikut timeout.

7. **Docstring `search_category_rules` tidak bilang "gunakan ini DULUAN".** Kalau ini kelewatan, agent bisa saja memanggil `find_similar_transactions` lebih dulu — Langfuse akan menunjukkan urutan tool call yang salah walau tidak ada error yang meledak.

8. **Tool melempar exception ke dalam loop agent.** Satu panggilan DB yang lagi rewel bisa membatalkan seluruh run dan membuang informasi yang sudah dikumpulkan di iterasi sebelumnya. Untuk kegagalan yang masih dapat ditangani agent, tool sebaiknya mengembalikan observasi kegagalan alih-alih membatalkan seluruh run.

9. **Testing dengan panggilan LLM asli, bukan mock `ToolCallingAgent` di level class.** Selain boros biaya, `ToolCallingAgent.__init__` bisa mencoba validasi/inisialisasi model LiteLLM yang gagal di CI tanpa API key — plan asli secara eksplisit meminta mocking di level class untuk menghindari ini.

10. **Memberi agent 7+ tool.** Makin banyak tool = makin susah dilacak kenapa agent memilih urutan tertentu ketika dia loop.

11. **Melewati verifikasi pohon span di Langfuse setelah smoke test.** Trace tree itu verifikasi utama chapter ini — kalau dilewati, klaim "saya membangun agent yang bisa diobservasi" jadi klaim kosong tanpa verifikasi.

12. **Return HTTP 200 dengan kategori kosong saat agent gagal**, alih-alih 502 sesuai kontrak error yang sudah dipakai konsisten di service ini.

13. **`instrument_smolagents()` dipanggil sebelum OTLP exporter dikonfigurasi.** Hook-nya terikat ke `TracerProvider` yang aktif saat itu — kalau exporter belum siap, hook itu mengirim ke provider kosong; parent trace bisa tetap muncul dari tracer lain yang sudah ada duluan, tapi child span tiap tool call hilang tanpa error yang kelihatan. (Di service ini `trace.set_tracer_provider()` jalan di level modul, jadi memanggilnya di dalam lifespan sudah aman — yang berbahaya justru memindahkan pemanggilan `instrument_smolagents()` ke level modul sebelum konfigurasi exporter selesai.)

14. **Tidak mengecek API smolagents sebelum menulis kode agent.** Bukan cuma versi: nama kwarg system prompt, keberadaan modul `monitoring`, dan atribut catatan langkah dapat berubah antar rilis minor. Plan asli sekarang menaruh ini sebagai satu step tersendiri (STEP 1b, 5 menit) justru karena salah tebak di sini gagalnya diam-diam.

15. **Menebak nama kolom `category_rules` alih-alih membacanya.** Kolomnya `(id, keyword, type, category, keyword_length)` — tidak ada `category_name`. Draft pertama plan memakai `category_name`. Pelajaran umumnya bukan soal nama kolom ini, tetapi tentang kebiasaan menebak skema alih-alih membacanya.
---

## Summary

**Masalah yang diselesaikan:** lapis LLM-fallback di categorizer yang sudah ada menebak diam-diam — waktu salah, tidak ada jejak sama sekali kenapa dia menjawab begitu.

**Yang akan dibangun (sesuai plan, belum dieksekusi):**
- `CategorizerAgent` — `ToolCallingAgent` smolagents dengan 3 tool: `search_category_rules`, `find_similar_transactions`, `list_all_categories`, model lewat LiteLLM, `max_steps=3`.
- Endpoint `POST /categorize-agent` — input sama dengan `/categorize`, tapi hasilnya menyertakan `reasoning` dan `tool_calls_count`; kegagalan agent → HTTP 502.
- Trace Langfuse lewat satu baris `instrument_smolagents()` — tiap run agent jadi pohon span (parent = run agent, child = tiap tool call).
- Unit test dengan `ToolCallingAgent` yang di-mock di level class (tanpa panggilan LLM asli) + smoke test 5 transaksi lewat script terpisah.

**Angka yang jadi patokan (diisi setelah chapter ini dijalankan):**

| Metrik | Target di plan | Hasil aktual |
|--------|-----------------|--------------|
| Kategori **tepat sesuai label harapan** di smoke test | 5/5 | *diukur* |
| `tool_calls_count` per transaksi | ≥ 1 | *diukur* |
| Latency agent vs `/categorize` (jalur cepat) | dicatat, bukan ditarget | *diukur* |
| Tool call child span per run terlihat di Langfuse | ya | *diverifikasi* |

Perhatikan baris pertama: patokannya **cocok persis dengan label yang diharapkan**, bukan sekadar "dapat kategori yang valid" — lima jawaban "Other" lolos patokan yang kedua. Dan kalau hasilnya 3/5, itu justru hasil yang menarik: buka dua trace yang gagal di Langfuse, lalu telusuri mata rantai mana yang putus (docstring urutan? `category` di retriever? snapshot vokabuler kosong?). Tiap kegagalan menunjuk ke satu baris yang kamu tulis sendiri. Diagnosis itu keterampilan aslinya — run pertama yang langsung 5/5 justru mengajarkan lebih sedikit.

**Pelajaran terpenting chapter ini (dari desain plan-nya):** agent bukan model yang "lebih pintar" — dia model yang sama, ditaruh di dalam loop pengumpulan informasi, dengan akses ke tool yang eksplisit. Keamanan produksi di sini bukan soal membatasi kemampuan model, tapi soal membatasi *bentuk* aksinya (tool call JSON terstruktur, bukan kode bebas) — dan docstring tool adalah kontrak yang dibaca model dan dirancang untuk memandu keputusannya, bukan sekadar catatan untuk manusia.

**Pelajaran kedua, dari review arsitektur terhadap plan ini:** membangun agent itu sebagian besar kerjanya **menyambungkan service yang sudah ada jadi fungsi tool** — dan hampir semua bug di situ bukan soal framework agent-nya, tapi soal asumsi yang salah tentang service yang disambungkan. Empat masalah pertama di [Kesalahan Umum](#kesalahan-umum) semuanya berbentuk sama: kolom yang ternyata tidak ada, atribut yang ternyata tidak ada, kwarg yang ternyata diabaikan, angka yang ternyata tidak pernah diisi. Tidak satu pun berhubungan dengan ReAct atau smolagents. Dan tiga dari empat gagal **tanpa melempar error** — agent tetap jalan, tetap menjawab, trace-nya tetap rapi. Di sistem agentic, "tidak ada error" bukan jaminan bahwa semuanya bekerja.

**Kalimat penutup untuk interview** (target dari plan asli, dipakai setelah chapter ini selesai): *"Saya membangun transaction categorizer agent pakai smolagents ToolCallingAgent dengan 3 tool: pencarian rule berbasis keyword, semantic similarity search lewat pgvector (dari Chapter 3), dan penjaga kosakata kategori. Agent-nya menjalankan loop ReAct — maksimal 3 iterasi — dan tiap tool call jadi child span di Langfuse. Saya bisa tunjukkan trace-nya: dia panggil search_category_rules, dapat 'tidak ada yang cocok', lalu panggil find_similar_transactions, ketemu 3 transaksi 'Shopping (Online)' di riwayat, dan mengembalikan kategori itu dengan confidence 0.7. Itu penalaran agentic yang bisa diobservasi — bukan sekadar demo, tapi artefak produksi yang bisa di-debug."*

**Lanjutannya:** Chapter 8 (LangGraph) menjadikan `CategorizerAgent` ini satu *node* di dalam graf Financial Advisor. Tiga tool-nya jadi tool graf. `max_steps=3` jadi node routing `END` eksplisit. Detail lengkap TODO steps, port C# baris-per-baris, semua kode test, dan Knowledge Check quiz ada di file asli: [PF-AI007-tool-calling-agents-smolagents-todo.md](PF-AI007-tool-calling-agents-smolagents-todo.md).

---

## 📖 Glossary

Istilah baru chapter ini (agent, ReAct, tool calling, `ToolCallingAgent`, `CodeAgent`, LiteLLM, docstring-as-schema, `max_steps`, span/trace) sudah di-link langsung dari tiap kemunculan pertamanya di atas, di kategori baru **"9. Agents & Tool Calling"**. Kalau mau lihat semuanya sekaligus (atau cari istilah dari chapter-chapter sebelumnya): **[Glossary RAG (Bahasa Indonesia)](glossary-rag-id.md)**.
