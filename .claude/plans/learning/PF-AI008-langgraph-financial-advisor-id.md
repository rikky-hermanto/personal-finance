# PF-AI008 — Chapter 8: LangGraph — Stateful Financial Health Advisor (Versi Belajar)

> **Ini bukan plan baru.** Ini tulisan ulang dari [PF-AI008-langgraph-financial-advisor.md](PF-AI008-langgraph-financial-advisor.md), disusun ulang biar urutannya ngikutin cara otak nyantol ke hal baru — bukan urutan implementasi. Semua fakta, kode, dan keputusan desain di sini diambil apa adanya dari file asli. File asli tetap jadi rujukan resmi untuk TODO steps, acceptance criteria, dan quiz — dokumen ini cuma versi "biar kebayang dulu di kepala."
>
> **Urutan baca:** masalah dulu → baru konsep → baru cara kerja → baru kode → baru optimisasi → baru best practice → baru kesalahan umum → baru ringkasan. Jangan loncat ke bagian Implementasi kalau tiga bagian pertama belum kebayang, nanti kodenya kelihatan kayak sihir.
>
> **Ketemu istilah asing di tengah baca?** Semua istilah baru dijelaskan pas pertama kali muncul, dan tiap istilah di-link langsung ke definisinya di [Glossary RAG](glossary-rag-id.md) (kategori baru **10. LangGraph**) — tinggal klik, nggak perlu scroll balik.
>
> **Chapter ini belum dikerjakan (status: To Do).** Sama seperti [PF-AI007](PF-AI007-tool-calling-agents-smolagents-todo-id.md), bagian Implementasi di bawah menjelaskan kode yang *akan* ditulis sesuai plan asli — bukan kode yang sudah live dan sudah dites terhadap Supabase/API asli seperti PF-AI004. Bagian Kesalahan Umum diberi catatan khusus soal ini — kecuali satu bug yang memang sudah ketangkap beneran waktu plan-nya ditulis (lihat bagian itu).

---

## Apa Masalah yang Ingin Diselesaikan?

Endpoint `/journey/advise` yang sudah ada itu satu kali tembak: frontend sudah menghitung pyramid scores lebih dulu, mengemasnya jadi `JourneyAdviseRequest`, kirim ke endpoint, dapat balik quest card lewat satu panggilan `tool_use`. Selesai — tidak ada langkah kedua.

Bayangkan ini dipakai sebagai chat: user ketik "gimana kondisi keuangan saya sekarang, dan apa yang harus saya prioritaskan?" Endpoint ini sama sekali tidak bisa menjawab pertanyaan bebas seperti itu, karena tiga alasan sekaligus. Pertama, dia tidak bisa **mengambil data sendiri** — semua angka (pyramid scores) harus sudah disodorkan oleh frontend di body request; kalau user butuh data cashflow atau investasi juga, itu harus sudah diantisipasi dan dikirim di awal, bukan diminta agent saat dia butuh. Kedua, dia tidak punya **memori** — pertanyaan susulan seperti "terus abis itu aku harus ngapain dulu buat naik ke L3?" akan diproses dari nol, tanpa tahu "itu" merujuk ke apa. Ketiga, kalau satu langkah di dalamnya gagal, tidak ada jalan tengah — exception meledak sampai ke HTTP 502, tidak ada jawaban "maaf, coba lagi" yang masih bisa dipakai.

Target chapter ini: endpoint baru, `POST /advisor`, yang bertingkah seperti orang yang benar-benar melihat dashboard-mu — dia cek pyramid scores-mu sendiri, memutuskan sendiri apakah perlu data cashflow atau investasi juga, bertanya (baca: memanggil tool) untuk itu, menalar dari apa yang dia temukan, dan mengingat percakapan ini di giliran bicara berikutnya. `/journey/advise` tidak diubah sama sekali — dia tetap melayani UI quest-card yang sudah ada; `/advisor` adalah endpoint terpisah untuk UI chat.

---

## Konsep Sederhananya

Empat konsep baru menyelesaikan masalah di atas:

1. **[StateGraph](glossary-rag-id.md#stategraph)** — Chapter 7 sudah mengenalkan agent lewat `ToolCallingAgent.run()` di smolagents, tapi loop di dalamnya tersembunyi di satu pemanggilan library — kamu tidak bisa melihat atau menguji langkah-langkah internalnya satu per satu. LangGraph menulis loop yang sama sebagai graf eksplisit: tiap langkah jadi **node** (fungsi biasa), tiap aturan lompat jadi **edge** (fungsi routing) — semuanya bisa dites sendiri-sendiri tanpa memanggil LLM.

2. **[Reducer `add_messages`](glossary-rag-id.md#add-messages)** — riwayat percakapan (`messages`) di state LangGraph butuh cara khusus supaya pesan baru **ditambahkan**, bukan menimpa yang lama. Tanpa ini, giliran bicara kedua akan lupa total giliran pertama — bukan karena bug yang meledak, tapi karena state-nya diam-diam diganti.

3. **Routing kondisional + [fallback node](glossary-rag-id.md#fallback-node)** — kalau satu langkah gagal (misalnya panggilan ke .NET API timeout), kegagalan itu tidak langsung jadi exception yang meledak. Dia jadi sinyal di state, dan sebuah fungsi routing yang membaca sinyal itu lalu mengarahkan ke node fallback yang mengembalikan pesan ramah — bukan crash.

4. **[`MemorySaver` + `thread_id`](glossary-rag-id.md#memorysaver)** — checkpointer yang menyimpan state graf setelah tiap giliran, dan memuatnya kembali di giliran berikutnya, dikunci dengan satu ID opak (`thread_id`, dipetakan dari `session_id`). Kirim `thread_id` yang sama, percakapan lanjut dari tempat terakhir berhenti.

Diagram besar chapter ini — satu agent, empat tool data-fetch, memori antar giliran:

```
  pertanyaan user ───►┌────────────────────────────┐───► jawaban grounded
  ("gimana kondisi     │  Advisor = LLM + 4 tool     │      + session_id
   keuangan saya?")    │                             │
                       │   observe ◄──┐              │   loop (ReAct):
                       │      │       │              │   contoh: pyramid → cashflow →
                       │   reason      │ hasil        │   spending → investment
                       │      │       │ tool         │   (panggil seperlunya)
                       │      ▼       │              │
                       │    act ──────┘               │
                       │  (panggil satu tool)          │
                       │                              │
                       │  session_id sama di giliran  │
                       │  berikutnya → memori lanjut  │
                       └────────────────────────────┘
```

Dan topologi graf-nya sendiri — tiga node, satu jalur error terpisah:

```
      AdvisorRequest {query, session_id?}
             │
             ▼
      ┌──────────────────────────────────────────────────────────────┐
      │ StateGraph — AdvisorState                                     │
      │                                                              │
      │  ┌─────────┐── error? YA ──────────────────────► fallback   │
      │  │  agent  │── tidak ada error + tool_calls? YA ► tool_node │
      │  │ (LLM +  │◄────────────── amati ────────────── (4 tool)  │
      │  │  tools) │                                                  │
      │  └────┬────┘                                                  │
      │       └── selain itu ───────────────────────────► SELESAI    │
      │                                                              │
      │ MemorySaver checkpointer — state per session_id              │
      └──────────────────────────────────────────────────────────────┘
             │
             ▼
      AdvisorResponse {answer, session_id, steps_taken}
```

---

## Cara Kerjanya

Bagian ini menjelaskan tiap konsep dengan cara "tangga": mulai dari versi paling sederhana, lihat di mana dia mentok, baru pahami kenapa versi berikutnya dibutuhkan — struktur bertahap dari file plan asli, disusun ulang dalam Bahasa Indonesia.

### Dari loop tersembunyi smolagents sampai graf eksplisit LangGraph

**Loop di dalam satu pemanggilan library.** Chapter 7 membungkus seluruh loop ReAct-nya di dalam `ToolCallingAgent.run()` — kamu panggil `.run()`, dapat balik kategori. Loop-nya ada, tapi tertutup rapat: kamu tidak bisa melihat atau menggunakan ulang langkah-langkah internalnya.

Ganjalannya, advisor butuh dua hal yang tidak diberikan `.run()`: jalur error khusus yang mengembalikan pesan ramah alih-alih melempar exception, dan state yang bertahan **antar request HTTP terpisah** (data yang diambil di giliran 1 harus masih ada di giliran 2). Membongkar isi `.run()` untuk menambahkan itu bukan pilihan yang realistis.

**`StateGraph` LangGraph.** Alih-alih satu pemanggilan tertutup, kamu menulis tiap langkah loop sebagai fungsi biasa (**node**) dan aturan lompat di antaranya juga sebagai fungsi biasa (**edge**): node `agent` yang memanggil LLM, node `tools` yang menjalankan apa pun yang diminta LLM (**`ToolNode`**, node siap-pakai — kamu tidak menulis logika dispatch-nya sendiri), dan fungsi routing yang memutuskan `tools`, `fallback`, atau selesai. → *Ini yang dipakai chapter ini.* Tiap potongan ini bisa dites sendiri-sendiri — Step 9 di file asli menguji fungsi routing tanpa panggilan LLM atau jaringan sama sekali.

### Reducer `add_messages`: kenapa list biasa bikin ingatan hilang

**Field list biasa.** `messages: list[BaseMessage]` di state, ditambah manual tiap giliran.

Ganjalannya, LangGraph tidak menggabungkan update dict seperti yang kamu kira. Kalau sebuah node mengembalikan `{"messages": [pesan_baru]}`, perilaku default LangGraph untuk field list biasa adalah **mengganti** nilai lama dengan yang baru — bukan menambahkan. Giliran ke-2 percakapan ("Apa yang harus saya lakukan dulu untuk mencapai L3?") akan mulai dari list kosong, dan agent tidak tahu sama sekali "L3" itu merujuk ke apa — riwayat giliran 1 sekadar lenyap.

**`Annotated[list, add_messages]`.** [**`add_messages`**](glossary-rag-id.md#add-messages) adalah sebuah **reducer**: fungsi yang dipanggil LangGraph untuk menggabungkan nilai balik sebuah node ke state yang sudah ada, bukan menimpanya. Untuk field `messages` yang dianotasi begini, pesan baru **ditambahkan** ke list yang sudah ada. → *Ini yang dipakai chapter ini,* dan ini sumber bug diam-diam paling umum di build LangGraph pertama — graf-nya jalan tanpa error, cuma diam-diam lupa semua yang terjadi di giliran-giliran sebelumnya.

### Routing kondisional dan node fallback: dari try/except ke edge yang bisa dites

**`try/except` di endpoint.** Semua endpoint AI service yang sudah ada (`/parse-pdf`, `/journey/advise`) membungkus logikanya di satu `try/except` dan mengembalikan HTTP 502 kalau gagal.

Ganjalannya, pola itu cocok untuk satu pemanggilan tunggal. Dia tidak cocok untuk graf multi-langkah — exception dari sebuah tool call dapat menjalar melewati beberapa node lalu meledakkan seluruh giliran tanpa pesan yang ramah, dan tidak ada cara menguji "apa yang terjadi kalau sebuah tool gagal" tanpa benar-benar melempar exception lewat beberapa lapis pemanggilan.

**Node menangkap exception-nya sendiri, lalu edge mengarahkan ke fallback.** Node yang gagal menyetel `state["error"]` alih-alih melempar. Sebuah conditional edge (`should_continue`) mengecek field itu lebih dulu dan mengarahkan state tersebut ke node `fallback` khusus kalau field itu terisi — fungsi biasa, bisa dites dengan fixture state tanpa mocking exception sama sekali. → *Ini yang dipakai chapter ini.* Jalur fallback muncul sebagai node sungguhan di topologi graf dan di trace Langfuse, bukan stack trace yang terkubur di log.

### Ingatan lintas giliran: `MemorySaver` dan `thread_id`

**Pemanggilan tanpa status.** `advisor_graph.ainvoke(initial_state)` begitu saja. Tiap request mulai dari nol.

Ganjalannya, percakapan advisor yang sungguhan butuh giliran ke-2 mengingat apa yang sudah diambil giliran ke-1 — mengambil ulang pyramid scores dan data cashflow di tiap follow-up membuang panggilan tool percuma, dan tidak bisa menjawab "gimana cara benerin kategori yang tadi" tanpa memaksa user mengulang sendiri.

**`MemorySaver` + `thread_id`.** Sebuah **checkpointer** menyimpan state graf setelah tiap eksekusi, dan memuatnya kembali sebelum eksekusi berikutnya, dikunci dengan sebuah `thread_id` opak yang kamu kirim di `config`. Kirim `thread_id` yang sama (dipetakan dari `session_id`) di giliran ke-2, dan LangGraph melanjutkan tepat dari tempat giliran 1 berhenti — tanpa mengambil ulang, tanpa mengulang konteks. Untuk follow-up, jangan kirim ulang field data tersimpan sebagai `None`, supaya state checkpoint tidak tertimpa. → *Ini yang dipakai chapter ini.* **Teaser, belum dibangun di sini:** `MemorySaver` cuma di-memori proses; deployment produksi dapat beralih ke `PostgresSaver` dengan interface checkpointer yang sama, meski tetap perlu konfigurasi storage tambahan — tool-tool Chapter 9 (MCP) memakai bentuk state yang sama ini.

---

## Implementasi

Sekarang baru masuk ke kode yang akan ditulis. File yang akan dibuat/diubah — semua di service AI Python (`services/ai-service/`):

| File | Perubahan |
|------|-----------|
| [\_\_init\_\_.py](../../../services/ai-service/app/agents/__init__.py) (`app/agents/`) | Baru — package kosong |
| [state.py](../../../services/ai-service/app/agents/state.py) | Baru — `AdvisorState` TypedDict |
| [tools.py](../../../services/ai-service/app/agents/tools.py) | Baru — 4 fungsi `@tool` (httpx → .NET API) |
| [financial_advisor.py](../../../services/ai-service/app/agents/financial_advisor.py) | Baru — `StateGraph`, node, edge, compile |
| [advisor.py](../../../services/ai-service/app/services/advisor.py) | Baru — `AdvisorService` pembungkus graf |
| [models.py](../../../services/ai-service/app/models.py) | Diedit — tambah `AdvisorRequest`, `AdvisorResponse` |
| [main.py](../../../services/ai-service/app/main.py) | Diedit — endpoint `POST /advisor` |
| [config.py](../../../services/ai-service/app/config.py) | Diedit — tambah `net_api_base_url` |
| [pyproject.toml](../../../services/ai-service/pyproject.toml) | Diedit — tambah `langgraph`, `langchain-anthropic` |
| [test_advisor_tools.py](../../../services/ai-service/tests/test_advisor_tools.py) | Baru — unit test tiap tool (httpx di-mock) |
| [test_advisor_agent.py](../../../services/ai-service/tests/test_advisor_agent.py) | Baru — test routing graf |
| [advisor_scenarios.json](../../../services/ai-service/evals/advisor_scenarios.json) | Baru — 5 skenario eval |

**State-nya dulu** — ini yang paling penting dipahami sebelum menulis node apa pun, karena field yang tipenya salah bikin bug routing yang sama diam-diamnya seperti bug SQL, tapi tanpa pesan error sama sekali:

```python
class AdvisorState(TypedDict):
    # Riwayat percakapan — pakai reducer add_messages, BUKAN list polos.
    # list[BaseMessage] polos akan DIGANTI tiap node mengembalikan pesan baru.
    messages: Annotated[list, add_messages]
    # Data hasil tool — diisi sekali, dipakai ulang di giliran-giliran berikutnya.
    pyramid_scores: dict | None
    cashflow_summary: dict | None
    spending_by_category: dict | None
    investment_summary: dict | None
    # Sinyal error — disetel node mana pun saat gagal; conditional edge membaca ini duluan.
    error: str | None
    # Diteruskan dari request, dipetakan jadi thread_id di checkpointer.
    session_id: str
```

Satu dari empat tool-nya — polanya sama untuk tiga sisanya, semuanya memanggil endpoint .NET yang **sudah ada**, bukan endpoint baru yang dibuat khusus untuk chapter ini:

```python
@tool
async def get_pyramid_scores() -> dict:
    """Fetch the user's current Financial Pyramid tier state.

    Returns a dict with keys: current_level (int 1-5), level_scores
    (dict of "L1".."L5" -> decimal 0-100, only levels with live data present).
    """
    resp = await _CLIENT.get("/api/journey/state")
    resp.raise_for_status()
    data = resp.json()
    return {
        "current_level": data.get("currentLevel"),
        "level_scores": data.get("levelScores", {}),
    }
```

Catatan penting yang gampang kelewat: tidak ada endpoint `/api/investments/summary` khusus di .NET. `get_investment_summary` menyusun data ringkasannya dari **dua** endpoint yang sudah ada (`/api/networth/current` + `/api/networth/allocation`), dan `get_cashflow_summary` / `get_spending_by_category` sama-sama memanggil `/api/transactions/aggregated`, cuma masing-masing mengambil potongan berbeda dari satu payload yang sama. Ini bukan kelalaian — plan aslinya secara eksplisit memilih menyusun ulang endpoint yang sudah ada daripada membuat endpoint agregat baru di luar cakupan chapter AI service.

**Jantung graf-nya** — fungsi routing plus cara node-node itu disambung:

```python
def should_continue(state: AdvisorState) -> str:
    """Routing setelah node agent:
    - error tersetel → 'fallback'
    - pesan terakhir punya tool_calls → 'tools'
    - selain itu → END
    """
    if state.get("error"):
        return "fallback"
    messages = state["messages"]
    last = messages[-1] if messages else None
    if isinstance(last, AIMessage) and last.tool_calls:
        return "tools"
    return END


def build_graph() -> StateGraph:
    tool_node = ToolNode(TOOLS)
    builder = StateGraph(AdvisorState)
    builder.add_node("agent", call_agent)
    builder.add_node("tools", tool_node)
    builder.add_node("fallback", call_fallback)

    builder.add_edge(START, "agent")
    builder.add_conditional_edges(
        "agent", should_continue, {"tools": "tools", "fallback": "fallback", END: END},
    )
    builder.add_edge("tools", "agent")   # tools selalu balik ke agent untuk menalar ulang
    builder.add_edge("fallback", END)

    return builder.compile(checkpointer=MemorySaver())
```

Perhatikan `builder.add_edge("tools", "agent")` — ini yang menutup loop ReAct (Reason → Act → Observe → Reason lagi). Kalau edge ini hilang dan diganti langsung ke `END`, agent tidak pernah "melihat" hasil tool yang baru dia panggil sendiri (lihat Kesalahan Umum #2).

**Pembungkus service-nya** — dan di sinilah satu bug beneran sudah ketangkap waktu plan ini ditulis:

```python
async def ask(self, request: AdvisorRequest) -> AdvisorResponse:
    session_id = request.session_id or str(uuid.uuid4())
    config = {"configurable": {"thread_id": session_id}}
    initial_state = {
        "messages": [HumanMessage(content=self._build_query(request))],
        "error": None, "session_id": session_id,
    }
    final_state = await advisor_graph.ainvoke(initial_state, config=config)

    messages = final_state.get("messages", [])
    last_ai = next((m for m in reversed(messages) if isinstance(m, AIMessage)), None)
    answer = last_ai.content if last_ai else "No response generated."
    steps_taken = sum(1 for m in messages if isinstance(m, AIMessage) and m.tool_calls)

    return AdvisorResponse(answer=answer, session_id=session_id, steps_taken=steps_taken)
```

> **Bug yang beneran ketangkap:** draf awal baris `last_ai` di atas memfilter pakai `hasattr(m, "content") and not hasattr(m, "tool_calls")` untuk mencari jawaban akhir. Itu terbalik — setiap instance `AIMessage` **selalu** punya atribut `tool_calls` (field Pydantic yang defaultnya `[]`), jadi `not hasattr(m, "tool_calls")` selalu `False` untuk `AIMessage` apa pun, entah dia benar-benar memanggil tool atau tidak. Filter itu justru mencocokkan `ToolMessage` terakhir (yang punya `content` tapi sama sekali tidak punya atribut `tool_calls`) — artinya `answer` diam-diam jadi JSON mentah hasil tool, bukan sintesis LLM, di giliran yang normal sekalipun. `isinstance(m, AIMessage)` adalah cek yang benar, dan itulah perbaikan yang dipakai di kode final di atas.

Endpoint-nya sendiri tipis, mengikuti kontrak error yang sudah konsisten di service ini (502, bukan 200-dengan-kosong):

```python
@app.post("/advisor", response_model=AdvisorResponse)
async def advisor(request: AdvisorRequest) -> AdvisorResponse:
    try:
        return await _advisor.ask(request)
    except Exception as exc:
        logger.exception("advisor failed")
        raise HTTPException(status_code=502, detail="advisor_error") from exc
```

Kode lengkap semua 4 tool, port C# baris-per-baris untuk tiap blok, semua test unit (mocked, tanpa panggilan LLM/API asli), 5 skenario eval lengkap, dan skrip smoke test dua-giliran ada di file asli: [PF-AI008-langgraph-financial-advisor.md](PF-AI008-langgraph-financial-advisor.md), STEP 3–10.

---

## Optimisasi

Keputusan desain yang diambil di plan chapter ini, dengan alasan konkretnya:

1. **LangGraph, bukan loop smolagents yang diperluas secara manual.** smolagents (Chapter 7) menyembunyikan loopnya di dalam `.run()`. LangGraph adalah loop yang sama, dibuat eksplisit sebagai graf: node adalah fungsi, edge adalah keputusan routing, state mengalir di antaranya. Setelah melihat versi yang dikelola library (Chapter 7), abstraksi graf ini jadi masuk akal, bukan terasa seperti sihir.

2. **`langchain-anthropic` sebagai wrapper LLM agent, terpisah dari `ProviderFactory` ekstraksi.** `ProviderFactory` (SDK Anthropic/Gemini mentah) tetap dipakai untuk ekstraksi — bagian itu tidak diubah (THINK-05). Agent memakai `ChatAnthropic` dari `langchain-anthropic`, yang membungkus API Claude yang sama, tapi hidup di modul terpisah supaya tidak mencemari pipeline ekstraksi. Konsekuensinya: `/advisor` butuh `ANTHROPIC_API_KEY` terlepas dari setting `AI_PROVIDER` service — advisor selalu bicara ke Claude.

3. **Tool memanggil .NET API, bukan database langsung — dan memakai ulang yang sudah ada.** Business logic (pyramid scoring, agregasi kategori, alokasi net worth) hidup di service .NET. Melewatinya dan langsung ke DB akan menduplikasi logika dan rusak begitu service itu berevolusi. Ini juga membuat tool-tool ini gampang jadi tool MCP di Chapter 9 — sama-sama berupa panggilan HTTP dengan interface tool yang jelas, tidak ada yang perlu ditulis ulang.

4. **`MemorySaver`, bukan database, untuk memori sesi.** `MemorySaver` adalah checkpointer in-memory, seumur hidup proses. Untuk skala personal-use project ini, itu sudah benar. Framing untuk interview: "saya pakai `MemorySaver` untuk development; produksi dapat beralih ke `PostgresSaver` atau `RedisSaver` dengan interface checkpointer yang sama, meski tetap perlu konfigurasi storage tambahan."

5. **Routing error lewat graf, bukan exception yang menjalar.** Node menangkap exception-nya sendiri dan menyetel `state["error"]`; conditional edge mengarahkan state ber-error ke node `fallback` yang mengembalikan pesan ramah. Ini pola yang idiomatis di LangGraph, dan inilah yang membedakan agent produksi dari sekadar demo: kegagalan yang dapat ditangani dialihkan oleh graf ke fallback, alih-alih langsung berakhir sebagai error endpoint.

6. **`date_from`/`date_to` dilipat ke teks prompt, bukan jadi argumen tool.** Endpoint dashboard .NET tidak menerima rentang tanggal bebas (dia menerima `year`/`month`/`months`), jadi periode yang diminta user ditambahkan ke teks query yang dilihat agent, bukan dialirkan sebagai argumen terstruktur ke tool. Ini simplifikasi sengaja untuk chapter ini, bukan kelupaan.

7. **`_build_llm()` dipanggil di dalam node, bukan di level modul.** `ChatAnthropic(...)` di level modul akan langsung terinstansiasi saat modul di-import. Di test, itu terjadi *sebelum* `settings` sempat di-patch. Di dalam fungsi node, instansiasinya terjadi saat node dipanggil — patch berlaku dengan benar, dan tiap test bisa mock secara terpisah. Biaya performanya (mikrodetik) tidak relevan untuk agent yang didominasi network call.

---

## Best Practice

Aturan yang dipegang selama membangun chapter ini, dan kenapa masing-masing penting:

- **Satu agent, empat tool, tiga node dulu** — jangan bangun graf multi-agent sebelum graf single-agent-nya solid. Multi-agent adalah wilayah Phase 3, bukan chapter ini.
- **Jangan membuat instance LLM di level modul saat import.** Instansiasi di level modul merusak test karena terjadi sebelum `settings` sempat di-patch; buat instance di dalam fungsi node, seperti pola `_build_llm()` di atas.
- **`thread_id` itu opak — jangan divalidasi seolah dia data user biasa tanpa namespace.** Dari sudut pandang checkpointer, `thread_id` cuma bytes; ID pendek atau UUID buatan user cukup aman di skala personal, tapi nilai yang benar-benar tidak dipercaya bisa bertabrakan sesi kalau tidak diberi namespace di skala produksi.
- **`isinstance`, bukan `hasattr`, untuk menyaring tipe pesan.** Lihat bug yang sudah dijelaskan di bagian Implementasi — atribut yang selalu ada di semua tipe bukan sinyal tipe yang bisa diandalkan.
- **Jangan panggil `advisor_graph.ainvoke` asli di unit test** — itu membuka koneksi LLM/API sungguhan. Test node dan fungsi routing secara terisolasi (lihat `should_continue` di atas); integrasi penuh diuji lewat 5 skenario manual dengan trace Langfuse sebagai verifikasi.
- **Jangan sentuh `app/services/journey_advisor.py`.** Endpoint itu melayani UI quest-card dan sudah stabil. Chapter 8 menambahkan `POST /advisor` di sampingnya, bukan menggantinya.

---

## Kesalahan Umum

> Chapter ini belum dibangun (status: To Do), jadi sebagian besar daftar di bawah adalah jebakan yang sudah diantisipasi di plan asli (bagian 📌 Notes dan anti-pattern), bukan insiden nyata dari sesi build — kecuali nomor 1, yang memang bug sungguhan yang ketangkap waktu draf kode di plan ini ditulis (lihat bagian Implementasi untuk detail lengkapnya). Daftar ini akan diperbarui dengan bug betulan setelah chapter ini benar-benar dikerjakan.

1. **(Sudah kejadian beneran) Pakai `hasattr` sebagai pengganti cek tipe saat mencari pesan jawaban akhir.** Karena `tool_calls` selalu ada di semua `AIMessage` (default `[]`), `not hasattr(m, "tool_calls")` tidak pernah membedakan "AIMessage yang tidak memanggil tool" dari "bukan AIMessage sama sekali" — filter-nya malah mencocokkan `ToolMessage` terakhir, dan jawaban ke user diam-diam jadi JSON mentah hasil tool. Perbaikannya: `isinstance(m, AIMessage)`.

2. **Lupa edge `tools → agent`.** Kalau graf langsung diarahkan `tools → END`, agent tidak pernah melihat hasil tool yang baru dia panggil — jawabannya akan salah kaprah ("saya tidak punya akses ke data Anda") padahal datanya sudah berhasil diambil. Loop ReAct butuh langkah "Observe → Reason lagi" ini, dan itu persis yang dilakukan edge tersebut.

3. **Lupa anotasi `Annotated[list, add_messages]` pada field `messages`.** Tanpa reducer ini, riwayat percakapan giliran sebelumnya hilang diam-diam — tidak ada error, cuma agent tiba-tiba "amnesia" di giliran kedua.

4. **`ANTHROPIC_API_KEY` tidak diset padahal `.env` cuma punya `GEMINI_API_KEY`.** Advisor selalu memakai `ChatAnthropic`, terlepas dari setting `AI_PROVIDER` yang dipakai pipeline ekstraksi — smoke test di Step 8 akan gagal kalau key ini belum ada.

5. **Urutan pengecekan di `should_continue` terbalik** (cek `tool_calls` sebelum cek `error`). Kalau urutannya salah, sebuah error tool bisa saja ke-treat seolah dia permintaan tool call baru, bukan diarahkan ke fallback.

6. **`_build_llm()` dipanggil di level modul, bukan di dalam fungsi node.** Instansiasi saat import terjadi sebelum test sempat mem-patch `settings` — mock jadi tidak berlaku, dan test bisa diam-diam mencoba koneksi asli.

7. **Menyamakan duplikasi panggilan `/api/transactions/aggregated` di dua tool berbeda (`get_cashflow_summary` dan `get_spending_by_category`) sebagai bug, lalu "memperbaikinya" dengan cache yang tidak diminta.** Plan asli mencatat ini sebagai keputusan sadar — tiap tool tetap bisa dipanggil dan diuji secara independen, sesuai acceptance criteria "4 tool yang berbeda." Optimisasi cache adalah pekerjaan produksi lanjutan, bukan sesuatu yang perlu dipaksakan di chapter ini.

---

## Summary

**Masalah yang diselesaikan:** `/journey/advise` yang ada cuma satu kali tembak — tidak bisa mengambil data sendiri, tidak punya memori antar giliran, dan kalau satu langkah gagal, tidak ada jalan tengah selain HTTP 502.

**Yang akan dibangun (sesuai plan, belum dieksekusi):**
- `AdvisorState` — TypedDict 7 field, `messages` dianotasi `add_messages` supaya riwayat percakapan ditambah bukan diganti.
- `StateGraph` 3 node (`agent`, `tools`, `fallback`) + `ToolNode` prebuilt + conditional edge `should_continue` + `MemorySaver` checkpointer per `session_id`.
- 4 tool `@tool` yang memanggil endpoint .NET yang sudah ada (`/api/journey/state`, `/api/transactions/aggregated` ×2 potongan, `/api/networth/current` + `/api/networth/allocation`).
- Endpoint `POST /advisor` — input `{query, session_id?, date_from?, date_to?}`, output `{answer, session_id, steps_taken}`; kegagalan → HTTP 502, bukan 200 kosong.
- 5 skenario eval tertulis (termasuk satu adversarial: tahun 3000, agent harus jujur bilang tidak tahu, bukan mengarang angka) + unit test routing yang mocked sepenuhnya.

**Angka yang jadi patokan (diisi setelah chapter ini dijalankan):**

| Metrik | Target di plan | Hasil aktual |
|--------|-----------------|--------------|
| Skenario eval lulus (dari 5) | 5/5 | *diukur* |
| Giliran ke-2 tidak mengambil ulang data yang sama (skenario S4/follow-up) | 0 re-fetch | *diverifikasi* |
| Trace Langfuse per giliran advisor terlihat lengkap | ya | *diverifikasi* |

**Pelajaran terpenting chapter ini (dari desain plan-nya):** LangGraph tidak membuat agent "lebih pintar" — dia membuat loop yang sama yang sudah dipakai smolagents di Chapter 7 jadi **bisa diinspeksi**: tiap langkah adalah fungsi yang bisa dites sendiri, tiap keputusan routing adalah edge yang bisa dites tanpa LLM, dan kegagalan adalah node nyata di graf, bukan stack trace yang terkubur. Reducer `add_messages` adalah detail kecil yang mahal kalau terlewat — satu anotasi yang membedakan agent yang "ingat" dari agent yang diam-diam amnesia tiap giliran.

**Kalimat penutup untuk interview** (target dari plan asli, dipakai setelah chapter ini selesai): *"Saya mengganti prompt satu-kali-tembak dengan LangGraph StateGraph — tiga node (agent, tool_node, fallback), empat tool pengambil data yang memanggil API .NET saya sendiri, routing kondisional lewat should_continue, dan MemorySaver untuk persistensi sesi. Saya punya trace Langfuse yang menunjukkan giliran kedua memakai state yang sudah tersimpan alih-alih memanggil ulang tool, plus 5 test skenario termasuk satu yang adversarial di mana agent-nya benar menolak mengarang data untuk tahun 3000."*

**Lanjutannya:** Chapter 9 (MCP) menjadikan 4 tool ini tool MCP dengan perubahan minimal — bentuk state yang sama dipakai ulang. Detail lengkap TODO steps, port C# baris-per-baris tiap blok kode, semua kode test, dan Knowledge Check quiz ada di file asli: [PF-AI008-langgraph-financial-advisor.md](PF-AI008-langgraph-financial-advisor.md).

---

## 📖 Glossary

Istilah baru chapter ini (`StateGraph`, node, edge, reducer, `add_messages`, `ToolNode`, checkpointer, `MemorySaver`, `thread_id`, fallback node) ada di kategori baru **"10. LangGraph — Graph, State, dan Memori Percakapan"**, sudah di-link langsung dari tiap kemunculan pertamanya di atas. Kalau mau lihat semuanya sekaligus (atau cari istilah dari chapter-chapter sebelumnya): **[Glossary RAG (Bahasa Indonesia)](glossary-rag-id.md)**.
