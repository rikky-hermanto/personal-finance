# PF-AI008 — Chapter 8
## LangGraph: Membangun Financial Health Advisor yang Stateful

> **Status:** To Do  
> **Scope:** AI Service (`services/ai-service/`)  
> **Core stack:** LangGraph · LangChain Anthropic · .NET API · Langfuse  
> **Primary goal:** mengubah advisor dari single-shot endpoint menjadi agent yang dapat mengambil data, menalar dalam beberapa langkah, menangani kegagalan, dan mengingat percakapan.

---

## 1. Masalah yang Sebenarnya

Endpoint lama, `POST /journey/advise`, dirancang untuk satu request yang sudah lengkap.

Alurnya sederhana:

```text
Frontend
   │
   ├─ hitung pyramid scores
   ├─ bangun JourneyAdviseRequest
   ▼
/journey/advise
   │
   └─ satu kali tool_use
   ▼
Quest card
```

Model ini bekerja untuk UI quest-card, tetapi tidak cukup untuk sebuah chat advisor.

Bayangkan user bertanya:

> “Gimana kondisi keuangan saya sekarang, dan apa yang harus saya prioritaskan?”

Ada tiga masalah struktural.

### 1.1 Agent tidak bisa mengambil data sendiri

Frontend harus mengirim data yang sudah diketahui sebelumnya.

Kalau agent kemudian membutuhkan:

- pyramid scores,
- cashflow,
- spending by category,
- investment allocation,

semuanya harus sudah dipikirkan dan disiapkan dari awal.

Artinya, frontend masih menjadi “planner” sebenarnya. Agent belum benar-benar memiliki akses terhadap konteks finansial yang dibutuhkannya.

### 1.2 Tidak ada memory antar-turn

Request kedua berdiri sendiri.

```text
Turn 1
User → “Apa kondisi keuangan saya?”
Agent → “Anda berada di L2...”

Turn 2
User → “Terus saya harus ngapain dulu buat naik ke L3?”
Agent → ??? 
```

Tanpa state yang dipertahankan, agent tidak tahu apa yang dimaksud dengan “terus”, “itu”, atau “L3” dalam konteks percakapan sebelumnya.

### 1.3 Kegagalan internal menjadi kegagalan request

Pada endpoint single-shot, pola berikut masih masuk akal:

```python
try:
    ...
except Exception:
    raise HTTPException(status_code=502)
```

Dalam agent multi-step, satu tool bisa timeout sementara langkah lainnya sebenarnya masih dapat ditangani.

Kita membutuhkan kemampuan untuk mengatakan:

```text
tool gagal
   ↓
graf mengetahui kegagalan
   ↓
routing memilih fallback
   ↓
user menerima jawaban yang masih berguna
```

bukan:

```text
tool gagal
   ↓
exception naik
   ↓
HTTP 502
```

---

# 2. Target Architecture

Chapter ini menambahkan endpoint baru:

```http
POST /advisor
```

Endpoint ini **tidak menggantikan** `/journey/advise`.

| Endpoint | Tanggung jawab |
|---|---|
| `/journey/advise` | UI quest-card yang sudah ada |
| `/advisor` | conversational financial advisor |

Advisor baru diharapkan dapat:

1. menerima pertanyaan bebas,
2. mengambil data finansial lewat tool,
3. menentukan tool mana yang diperlukan,
4. mengamati hasil tool,
5. menalar ulang,
6. mengingat state antar-turn,
7. mengarahkan error ke fallback.

Secara mental model:

```text
                   ┌─────────────────────────────┐
User query ───────►│ Financial Advisor           │
                   │                             │
                   │   LLM                       │
                   │    │                        │
                   │    ├──► Tool: Pyramid       │
                   │    ├──► Tool: Cashflow      │
                   │    ├──► Tool: Spending      │
                   │    └──► Tool: Investment    │
                   │                             │
                   │   State + Memory            │
                   └────────────┬────────────────┘
                                │
                                ▼
                         Grounded answer
```

Perbedaannya dengan single-shot agent: **agent sekarang memiliki loop yang eksplisit dan state yang dapat dipertahankan.**

---

# 3. Mental Model: LangGraph = Loop yang Dibuat Terlihat

Chapter 7 menggunakan `ToolCallingAgent.run()` dari smolagents.

Secara konseptual, loop-nya sudah ada:

```text
Reason
  ↓
Act
  ↓
Observe
  ↓
Reason
  ↓
...
```

Masalahnya: loop tersebut tersembunyi di dalam satu pemanggilan library.

Untuk advisor, kita membutuhkan kontrol atas langkah internal tersebut.

LangGraph memecah loop menjadi komponen yang dapat diamati dan diuji:

| Konsep | Peran |
|---|---|
| **State** | data yang mengalir sepanjang eksekusi |
| **Node** | fungsi yang melakukan pekerjaan |
| **Edge** | aturan perpindahan antar-node |
| **Conditional edge** | routing berdasarkan state |
| **Reducer** | aturan bagaimana state digabung |
| **Checkpointer** | penyimpanan state antar-eksekusi |

Dengan demikian:

```text
smolagents

.run()
  └── loop internal


LangGraph

START
  ↓
agent ──► tools ──► agent
  │
  ├──────────────► fallback
  │
  └──────────────► END
```

Ini bukan agent baru dengan “otak berbeda”.

**Ini loop yang sama, tetapi sekarang topologinya eksplisit.**

---

# 4. Empat Konsep yang Menjadi Fondasi

## 4.1 `StateGraph`

`StateGraph` adalah container untuk alur agent.

Setiap langkah diwujudkan sebagai **node**.  
Setiap keputusan perpindahan diwujudkan sebagai **edge**.

Untuk chapter ini:

```text
           ┌────────────┐
           │   agent    │
           │ LLM + tool │
           └─────┬──────┘
                 │
       ┌─────────┼─────────┐
       │         │         │
     error   tool_calls   selesai
       │         │         │
       ▼         ▼         ▼
   fallback    tools      END
                 │
                 └──────► agent
```

Keuntungannya bukan sekadar “graf terlihat bagus”.

Node dan routing dapat diuji tanpa memanggil LLM atau jaringan.

---

## 4.2 Reducer `add_messages`

Ini salah satu detail kecil yang paling mudah terlewat.

State memiliki field:

```python
messages: list[BaseMessage]
```

Secara intuitif, kita mungkin menganggap LangGraph otomatis menambahkan pesan baru.

Tidak.

Jika sebuah node mengembalikan:

```python
{"messages": [new_message]}
```

field list biasa dapat **diganti** dengan list baru.

Akibatnya:

```text
Turn 1
messages = [user, AI, tool, AI]

Turn 2
messages = [user]
```

Bukan karena error.

State hanya mengalami overwrite.

### Solusinya

Gunakan reducer:

```python
messages: Annotated[list, add_messages]
```

`add_messages` memberitahu LangGraph bagaimana update terhadap `messages` harus digabungkan.

Secara konseptual:

```text
old messages + new messages
            ↓
       merged state
```

Inilah yang membuat riwayat percakapan tetap hidup antar-node dan antar-turn.

> **Rule:** untuk conversational graph, `messages` bukan sekadar `list`; reducer adalah bagian dari semantics state.

---

## 4.3 Conditional routing + fallback

Daripada membiarkan exception menjalar keluar dari seluruh graph, node menangkap kegagalan yang dapat ditangani:

```python
state["error"] = "..."
```

Kemudian routing membaca state tersebut:

```python
if state.get("error"):
    return "fallback"
```

Flow menjadi:

```text
node gagal
   ↓
state.error terisi
   ↓
should_continue()
   ↓
fallback
   ↓
END
```

Perhatikan perbedaan ini:

```text
Exception propagation
---------------------
tool → node → graph → endpoint


Graph routing
-------------
tool → node → state.error
                  ↓
               routing
                  ↓
               fallback
```

Dengan pendekatan kedua, fallback menjadi bagian nyata dari topologi graph dan trace Langfuse.

---

## 4.4 `MemorySaver` + `thread_id`

Stateful conversation membutuhkan checkpointer.

Untuk chapter ini digunakan:

```python
MemorySaver()
```

Setiap percakapan diberi ID:

```text
session_id
    ↓
thread_id
    ↓
checkpointer
```

Turn pertama:

```text
thread_id = abc123

State:
- messages
- pyramid_scores
- cashflow_summary
- ...
```

Turn kedua mengirim `thread_id` yang sama:

```text
thread_id = abc123
```

LangGraph dapat memuat state sebelumnya.

Konsekuensinya:

```text
Turn 1
  └─ fetch pyramid
  └─ fetch cashflow
  └─ save state

Turn 2
  └─ load state
  └─ continue conversation
  └─ tidak perlu refetch data yang sudah ada
```

### Catatan produksi

`MemorySaver` adalah storage in-memory, cocok untuk development dan personal-use project.

Untuk deployment produksi, interface checkpointer dapat diarahkan ke storage persisten seperti `PostgresSaver` atau `RedisSaver`, dengan konfigurasi storage tambahan.

---

# 5. Graph Secara Utuh

## 5.1 Request → Agent → Tools → Answer

```text
AdvisorRequest
{ query, session_id? }
        │
        ▼
┌───────────────────────────────────────┐
│ StateGraph — AdvisorState             │
│                                       │
│  ┌─────────┐                          │
│  │  agent  │                          │
│  │ LLM +   │                          │
│  │  tools  │                          │
│  └────┬────┘                          │
│       │                                │
│       ├── error ─────────► fallback    │
│       │                                │
│       ├── tool_calls ────► tools ──┐  │
│       │                            │  │
│       │                            └─►agent
│       │                                │
│       └── selesai ─────────► END      │
│                                       │
│  MemorySaver                           │
│  state keyed by thread_id             │
└───────────────────────────────────────┘
        │
        ▼
AdvisorResponse
{ answer, session_id, steps_taken }
```

## 5.2 Kenapa `tools → agent` wajib ada?

Ini edge yang menutup loop ReAct.

```python
builder.add_edge("tools", "agent")
```

Tanpa edge ini:

```text
agent
  ↓
tools
  ↓
END
```

Agent tidak pernah melihat hasil tool yang baru saja dipanggil.

Dengan edge tersebut:

```text
agent
  ↓
tools
  ↓
agent
  ↓
tools
  ↓
agent
  ↓
END
```

Loop inilah yang memungkinkan agent:

1. meminta data,
2. menerima hasil,
3. mengamati hasil,
4. menalar ulang,
5. meminta data tambahan bila perlu,
6. menyusun jawaban akhir.

---

# 6. Data Model: `AdvisorState`

State harus didefinisikan lebih dulu karena seluruh node berbicara melalui struktur ini.

```python
class AdvisorState(TypedDict):
    # Riwayat percakapan.
    # Reducer add_messages menjaga pesan lama tetap ada.
    messages: Annotated[list, add_messages]

    # Data hasil tool.
    # Dapat diisi sekali dan dipakai kembali.
    pyramid_scores: dict | None
    cashflow_summary: dict | None
    spending_by_category: dict | None
    investment_summary: dict | None

    # Error signal.
    # Node menulis error; conditional edge membacanya.
    error: str | None

    # ID sesi dari request.
    # Dipetakan menjadi thread_id pada checkpointer.
    session_id: str
```

Ada tiga jenis state yang perlu dibedakan:

```text
Conversation state
└─ messages

Domain data state
├─ pyramid_scores
├─ cashflow_summary
├─ spending_by_category
└─ investment_summary

Control state
├─ error
└─ session_id
```

Pemisahan ini membantu membaca graph sebagai sistem, bukan sekadar kumpulan field.

---

# 7. Tools: Agent Mengambil Data dari .NET API

Advisor memiliki empat tool.

Yang penting: **tool tidak mengakses database secara langsung.**

Business logic tetap berada di service .NET.

```text
LLM
 │
 ▼
Python tool
 │
 │ HTTP
 ▼
.NET API
 │
 ▼
existing business logic
 │
 ▼
database
```

Ini menghindari duplikasi business logic di AI service.

Tool juga menjadi kandidat yang baik untuk diekstrak menjadi MCP tools pada Chapter 9.

---

## 7.1 Tool: Pyramid Scores

```python
@tool
async def get_pyramid_scores() -> dict:
    """Fetch the user's current Financial Pyramid tier state.

    Returns a dict with keys:
    - current_level (int 1-5)
    - level_scores (dict of L1..L5 -> decimal 0-100)
    """

    resp = await _CLIENT.get("/api/journey/state")
    resp.raise_for_status()

    data = resp.json()

    return {
        "current_level": data.get("currentLevel"),
        "level_scores": data.get("levelScores", {}),
    }
```

Data berasal dari endpoint yang sudah ada:

```http
GET /api/journey/state
```

Tidak ada endpoint .NET baru yang diperlukan khusus untuk chapter ini.

---

## 7.2 Cashflow dan Spending

Dua tool berbeda membaca payload yang sama:

```http
GET /api/transactions/aggregated
```

Tool pertama mengambil ringkasan cashflow.

Tool kedua mengambil spending by category.

Secara arsitektural:

```text
/api/transactions/aggregated
          │
          ├──► get_cashflow_summary()
          │
          └──► get_spending_by_category()
```

Duplikasi request ini **disengaja** dalam scope chapter.

Acceptance criteria menginginkan empat tool yang dapat dipanggil dan diuji secara independen.

Caching lintas-tool adalah optimisasi produksi lanjutan, bukan requirement chapter ini.

---

## 7.3 Investment Summary

Tidak ada endpoint khusus:

```http
/api/investments/summary
```

Sebaliknya, tool menyusun data dari dua endpoint existing:

```text
/api/networth/current
/api/networth/allocation
         │
         ▼
get_investment_summary()
```

Ini mengikuti keputusan desain awal: gunakan endpoint yang sudah tersedia daripada menambah aggregate endpoint baru di luar scope AI service.

---

# 8. Routing: Jantung StateGraph

Fungsi routing menentukan apa yang terjadi setelah node `agent`.

```python
def should_continue(state: AdvisorState) -> str:
    """Routing setelah node agent.

    - error tersetel → fallback
    - pesan terakhir memiliki tool_calls → tools
    - selain itu → END
    """

    if state.get("error"):
        return "fallback"

    messages = state["messages"]
    last = messages[-1] if messages else None

    if isinstance(last, AIMessage) and last.tool_calls:
        return "tools"

    return END
```

Urutannya penting.

### Prioritas routing

```text
1. Ada error?
   └─ YA → fallback

2. Tidak ada error.
   Apakah AIMessage terakhir punya tool_calls?
   └─ YA → tools

3. Selain itu
   └─ END
```

Jangan membalik urutan ini.

Error harus ditangani terlebih dahulu sebelum memeriksa apakah pesan terakhir terlihat seperti tool call.

---

# 9. Membangun Graph

Implementasi graph-nya relatif kecil:

```python
def build_graph() -> StateGraph:
    tool_node = ToolNode(TOOLS)

    builder = StateGraph(AdvisorState)

    builder.add_node("agent", call_agent)
    builder.add_node("tools", tool_node)
    builder.add_node("fallback", call_fallback)

    builder.add_edge(START, "agent")

    builder.add_conditional_edges(
        "agent",
        should_continue,
        {
            "tools": "tools",
            "fallback": "fallback",
            END: END,
        },
    )

    builder.add_edge("tools", "agent")
    builder.add_edge("fallback", END)

    return builder.compile(
        checkpointer=MemorySaver()
    )
```

Topologi final:

```text
             START
               │
               ▼
             agent
          ╱    │    ╲
         ╱     │     ╲
      error  tool_calls  done
       │       │          │
       ▼       ▼          ▼
   fallback  tools       END
                 │
                 │
                 └──────► agent
```

Ada tiga node aplikasi:

- `agent`
- `tools`
- `fallback`

Dan satu node prebuilt:

- `ToolNode`

---

# 10. Service Layer

Graph tidak dipanggil langsung oleh endpoint.

Tambahkan wrapper:

```python
async def ask(self, request: AdvisorRequest) -> AdvisorResponse:
    session_id = request.session_id or str(uuid.uuid4())

    config = {
        "configurable": {
            "thread_id": session_id
        }
    }

    initial_state = {
        "messages": [
            HumanMessage(
                content=self._build_query(request)
            )
        ],
        "error": None,
        "session_id": session_id,
    }

    final_state = await advisor_graph.ainvoke(
        initial_state,
        config=config,
    )

    messages = final_state.get("messages", [])

    last_ai = next(
        (
            m for m in reversed(messages)
            if isinstance(m, AIMessage)
        ),
        None,
    )

    answer = (
        last_ai.content
        if last_ai
        else "No response generated."
    )

    steps_taken = sum(
        1
        for m in messages
        if isinstance(m, AIMessage) and m.tool_calls
    )

    return AdvisorResponse(
        answer=answer,
        session_id=session_id,
        steps_taken=steps_taken,
    )
```

Perhatikan dua hal.

### 10.1 `session_id` → `thread_id`

API berbicara dengan konsep:

```text
session_id
```

LangGraph berbicara dengan:

```text
thread_id
```

Service layer menjadi adapter di antara keduanya.

### 10.2 Follow-up tidak perlu mengirim ulang state

Pada turn kedua, cukup kirim query dan `session_id` yang sama.

Jangan secara tidak sengaja mengirim ulang field tersimpan sebagai `None`, karena itu dapat menimpa nilai yang sudah ada di checkpoint.

---

# 11. Bug yang Terdeteksi Saat Menulis Plan

Bug ini penting karena terlihat “masuk akal” saat dibaca cepat.

Versi yang salah mencoba mencari final answer dengan:

```python
hasattr(m, "content") and not hasattr(m, "tool_calls")
```

Masalahnya: `AIMessage` memiliki field `tool_calls`, termasuk ketika nilainya hanya list kosong.

Akibatnya:

```text
AIMessage
  └─ punya content
  └─ punya tool_calls
  └─ not hasattr(tool_calls) = False

ToolMessage
  └─ punya content
  └─ tidak punya tool_calls
  └─ cocok dengan filter
```

Akibat akhirnya berbahaya karena tidak selalu meledak.

Jawaban dapat berubah menjadi:

```text
JSON mentah hasil tool
```

bukan:

```text
sintesis akhir dari LLM
```

### Perbaikan

Gunakan type check eksplisit:

```python
isinstance(m, AIMessage)
```

Ini juga contoh mengapa “atribut ada/tidak” bukan pengganti pemeriksaan tipe.

---

# 12. Endpoint

Endpoint hanya bertugas sebagai boundary HTTP.

```python
@app.post("/advisor", response_model=AdvisorResponse)
async def advisor(request: AdvisorRequest) -> AdvisorResponse:
    try:
        return await _advisor.ask(request)

    except Exception as exc:
        logger.exception("advisor failed")
        raise HTTPException(
            status_code=502,
            detail="advisor_error",
        ) from exc
```

Kontrak service tetap konsisten:

```text
success → 200 + AdvisorResponse
failure → 502 + advisor_error
```

Fallback internal tidak menggantikan kontrak HTTP.

Ia menangani failure yang masih dapat direpresentasikan sebagai jawaban conversational.

---

# 13. Request dan Response

## Request

```json
{
  "query": "Gimana kondisi keuangan saya sekarang?",
  "session_id": null,
  "date_from": null,
  "date_to": null
}
```

## Response

```json
{
  "answer": "...",
  "session_id": "abc123",
  "steps_taken": 3
}
```

`date_from` dan `date_to` pada chapter ini tidak diteruskan sebagai argumen tool terstruktur.

Endpoint dashboard .NET yang tersedia bekerja dengan `year`, `month`, dan `months`.

Karena itu, periode user dilipat ke dalam teks query yang dilihat agent.

Ini adalah simplifikasi yang disengaja untuk scope chapter.

---

# 14. Konfigurasi LLM

Pipeline ekstraksi dan advisor menggunakan layer berbeda.

### Extraction

Tetap menggunakan:

```text
ProviderFactory
├─ Anthropic SDK
└─ Gemini SDK
```

### Advisor

Menggunakan:

```text
ChatAnthropic
└─ langchain-anthropic
```

Alasannya bukan karena API Claude berubah.

Tujuannya adalah memisahkan dependency agent dari pipeline ekstraksi.

Konsekuensinya:

```text
AI_PROVIDER = GEMINI
```

tidak membuat advisor ikut menggunakan Gemini.

Advisor tetap membutuhkan:

```text
ANTHROPIC_API_KEY
```

---

# 15. Mengapa `_build_llm()` Tidak Boleh di Level Module

Hindari:

```python
llm = ChatAnthropic(...)
```

langsung saat module di-import.

Pada test, module dapat di-load sebelum `settings` di-patch.

Akibatnya instance LLM sudah telanjur dibuat.

Buat instance di dalam node atau factory:

```python
def _build_llm():
    return ChatAnthropic(...)
```

lalu dipanggil ketika node dieksekusi.

Secara praktik, overhead membuat instance jauh lebih kecil dibanding latency network call agent.

Keuntungannya justru ada di testability dan dependency control.

---

# 16. Memory Flow Antar-Turn

Contoh konkret.

### Turn 1

```text
User:
“Gimana kondisi keuangan saya?”

Agent:
  → get_pyramid_scores()
  → get_cashflow_summary()

State:
  messages = [...]
  pyramid_scores = {...}
  cashflow_summary = {...}

Checkpoint:
  thread_id = abc123
```

### Turn 2

```text
User:
“Terus yang paling penting saya benahi dulu apa?”

thread_id = abc123
```

Graph dapat memulai dengan state checkpoint sebelumnya.

Tidak perlu memaksa user mengulangi:

```text
- current level
- cashflow
- previous answer
- context
```

Inilah perbedaan antara:

```text
chat endpoint
```

dan:

```text
stateful advisor
```

---

# 17. Failure Flow

Misalnya:

```text
agent
  │
  └─► get_cashflow_summary()
             │
             └─ timeout
```

Tool/node menangkap failure:

```python
state["error"] = "cashflow service unavailable"
```

Router:

```python
should_continue(state)
```

mendeteksi:

```python
state.get("error")
```

dan mengembalikan:

```text
fallback
```

Sehingga:

```text
agent
  ↓
tool failure
  ↓
state.error
  ↓
fallback
  ↓
END
```

Bukan:

```text
agent
  ↓
tool failure
  ↓
exception
  ↓
HTTP 502
```

HTTP 502 tetap tersedia untuk failure yang benar-benar keluar dari service boundary.

---

# 18. File yang Dibuat / Diubah

Semua perubahan berada di:

```text
services/ai-service/
```

| File | Perubahan |
|---|---|
| `app/agents/__init__.py` | Baru — package kosong |
| `app/agents/state.py` | Baru — `AdvisorState` |
| `app/agents/tools.py` | Baru — 4 `@tool` |
| `app/agents/financial_advisor.py` | Baru — graph, node, edge, compile |
| `app/services/advisor.py` | Baru — `AdvisorService` |
| `app/models.py` | Edit — `AdvisorRequest`, `AdvisorResponse` |
| `app/main.py` | Edit — `POST /advisor` |
| `app/config.py` | Edit — `net_api_base_url` |
| `pyproject.toml` | Edit — `langgraph`, `langchain-anthropic` |
| `tests/test_advisor_tools.py` | Baru — unit test tools |
| `tests/test_advisor_agent.py` | Baru — routing test |
| `evals/advisor_scenarios.json` | Baru — 5 skenario eval |

---

# 19. Testing Strategy

Jangan menguji seluruh graph dengan LLM nyata untuk setiap unit test.

Pisahkan level pengujiannya.

## 19.1 Unit test

Uji fungsi terisolasi.

Contoh:

```text
should_continue()
get_pyramid_scores()
get_cashflow_summary()
get_spending_by_category()
get_investment_summary()
```

HTTP dapat di-mock.

LLM tidak perlu dipanggil.

### Routing test

Contoh fixture:

```text
state.error = "timeout"
```

Expected:

```text
fallback
```

Atau:

```text
last message = AIMessage(tool_calls=[...])
```

Expected:

```text
tools
```

Atau:

```text
last message = AIMessage(tool_calls=[])
```

Expected:

```text
END
```

---

## 19.2 Integration / scenario test

Gunakan 5 skenario eval yang ditentukan plan.

Termasuk satu kasus adversarial:

```text
User meminta data untuk tahun 3000.
```

Expected behavior:

```text
agent tidak mengarang angka
agent menyatakan data tidak tersedia / tidak diketahui
```

Ini penting karena kualitas advisor bukan hanya “bisa menjawab”, tetapi juga “tidak mengarang saat data tidak ada”.

---

## 19.3 Smoke test dua-turn

Minimal alurnya:

```text
Turn 1
GET data
SAVE state

Turn 2
LOAD same state
FOLLOW-UP
```

Satu indikator penting:

```text
re-fetch data yang sama = 0
```

untuk skenario follow-up yang memang dapat menggunakan state sebelumnya.

---

# 20. Observability

Trace Langfuse seharusnya menunjukkan:

```text
Turn
 └─ agent
     ├─ tool call
     ├─ tool result
     ├─ agent reasoning step
     └─ final answer
```

Pada turn berikutnya:

```text
same thread/session
└─ state loaded
   └─ follow-up answer
```

Tujuannya bukan sekadar melihat “LLM menghasilkan jawaban”.

Kita ingin dapat menjawab:

- tool apa yang dipanggil,
- berapa langkah yang terjadi,
- apakah fallback dipakai,
- apakah turn berikutnya menggunakan state sebelumnya,
- apakah agent memanggil data yang tidak perlu.

---

# 21. Design Decisions

## 21.1 LangGraph vs memperpanjang smolagents

**Dipilih:** LangGraph.

Karena kebutuhan utama chapter ini adalah:

- explicit state,
- explicit routing,
- explicit fallback,
- testable graph,
- checkpointing.

Memperluas loop internal `smolagents.run()` akan membuat kontrol ini tetap tersembunyi.

---

## 21.2 Tool → .NET API, bukan DB

**Dipilih:** HTTP ke API existing.

Alasannya:

```text
Business logic
     │
     ▼
.NET service
     │
     └── source of truth
```

AI service tidak boleh menduplikasi:

- pyramid scoring,
- category aggregation,
- net-worth allocation logic.

Selain menghindari duplikasi, pola ini menjaga compatibility dengan rencana MCP di Chapter 9.

---

## 21.3 `MemorySaver`, bukan database

Untuk personal-use project:

```text
MemorySaver
```

cukup sederhana dan sesuai kebutuhan.

Untuk produksi:

```text
MemorySaver
      │
      ▼
persistent checkpointer
(Postgres / Redis)
```

Interface graph tidak perlu berubah secara konseptual.

---

## 21.4 Error sebagai graph state

**Dipilih:** error yang dapat ditangani menjadi state.

Bukan berarti semua exception harus ditelan.

Batasnya:

```text
recoverable internal failure
→ state.error
→ fallback

unhandled service failure
→ exception
→ HTTP 502
```

---

## 21.5 `date_from` / `date_to` sebagai prompt context

Endpoint existing tidak menyediakan arbitrary date range secara langsung.

Karena itu:

```text
date_from/date_to
      ↓
prompt text
      ↓
agent interprets period
```

bukan:

```text
date_from/date_to
      ↓
structured tool args
```

Ini trade-off untuk chapter ini.

---

# 22. Best Practices

### 1. Mulai dari single-agent graph

```text
1 agent
4 tools
3 application nodes
```

Jangan langsung membuat multi-agent orchestration.

Multi-agent adalah scope berbeda.

### 2. State harus jelas sebelum node ditulis

Field yang salah pada state dapat menghasilkan bug routing yang silent.

Definisikan:

```text
conversation state
domain state
control state
```

lebih dulu.

### 3. Gunakan `Annotated[..., add_messages]`

Untuk conversational history, reducer adalah bagian dari design, bukan dekorasi.

### 4. Gunakan `isinstance()` untuk type discrimination

Jangan mengandalkan:

```python
hasattr(...)
```

untuk membedakan `AIMessage`, `ToolMessage`, dan message type lain.

### 5. Jangan instantiate LLM saat import

Factory/node-level initialization membuat testing lebih dapat dikontrol.

### 6. Test graph routing tanpa LLM

Routing adalah pure logic.

Jangan membayar latency LLM hanya untuk menguji:

```text
error → fallback
tool_call → tools
done → END
```

### 7. Jangan ubah `/journey/advise`

Endpoint tersebut sudah memiliki consumer sendiri.

Chapter 8 menambahkan capability baru di sampingnya.

---

# 23. Common Failure Modes

## Failure 1 — `hasattr` salah digunakan sebagai type check

**Symptom**

Jawaban akhir berupa JSON tool result.

**Cause**

`AIMessage` tetap memiliki field `tool_calls`.

**Fix**

```python
isinstance(m, AIMessage)
```

---

## Failure 2 — `tools → agent` hilang

**Symptom**

Agent memanggil tool, tetapi tidak pernah menggunakan hasilnya.

**Cause**

Graph selesai setelah `tools`.

**Fix**

```python
builder.add_edge("tools", "agent")
```

---

## Failure 3 — `messages` tidak memakai reducer

**Symptom**

Turn kedua seperti memulai percakapan baru.

**Cause**

List lama tertimpa.

**Fix**

```python
messages: Annotated[list, add_messages]
```

---

## Failure 4 — `ANTHROPIC_API_KEY` tidak tersedia

Advisor memakai `ChatAnthropic` terlepas dari `AI_PROVIDER`.

**Symptom**

Pipeline extraction berjalan, advisor gagal.

**Fix**

Pastikan environment advisor memiliki:

```text
ANTHROPIC_API_KEY
```

---

## Failure 5 — Error dicek setelah `tool_calls`

**Symptom**

State error tidak selalu masuk ke fallback.

**Cause**

Routing memproses message shape sebelum control signal.

**Fix**

Urutan:

```text
error
  ↓
tool_calls
  ↓
END
```

---

## Failure 6 — `_build_llm()` dibuat di module level

**Symptom**

Test membaca konfigurasi lama atau mencoba koneksi asli.

**Cause**

LLM dibuat saat import, sebelum test melakukan patch.

**Fix**

Build instance saat node dijalankan.

---

## Failure 7 — Menganggap dua panggilan transaction aggregation sebagai bug

**Symptom**

Cache ditambahkan walaupun tidak diperlukan.

**Cause**

Optimisasi produksi dipaksakan masuk ke chapter.

**Fix**

Pertahankan dua tool independen untuk scope ini.

Optimisasi cache dapat menjadi pekerjaan berikutnya.

---

# 24. Metrics / Acceptance Criteria

Nilai berikut baru dapat diisi setelah chapter benar-benar dieksekusi.

| Metric | Target | Actual |
|---|---:|---:|
| Eval scenario lulus | 5/5 | _diukur_ |
| Re-fetch pada follow-up yang seharusnya memakai state | 0 | _diverifikasi_ |
| Trace Langfuse per turn | Ya | _diverifikasi_ |

Acceptance criteria bukan hanya:

```text
endpoint returns 200
```

Tetapi juga:

```text
agent dapat mengambil data
agent dapat loop
agent dapat mengingat state
agent dapat fallback
agent tidak mengarang data
```

---

# 25. Apa yang Sebenarnya Dipelajari dari Chapter Ini?

LangGraph tidak otomatis membuat LLM menjadi lebih pintar.

Nilai utamanya ada pada **kontrol terhadap agent loop**.

Sebelumnya:

```text
library
└─ hidden loop
```

Sekarang:

```text
graph
├─ state
├─ nodes
├─ edges
├─ routing
├─ fallback
└─ checkpoint
```

Konsekuensinya:

- langkah dapat diinspeksi,
- routing dapat diuji,
- failure path dapat dimodelkan,
- state dapat dipersist,
- observability menjadi lebih jelas.

Dua detail paling penting untuk diingat:

### `add_messages`

Satu reducer kecil menentukan apakah conversational history:

```text
bertambah
```

atau:

```text
diam-diam tertimpa
```

### `tools → agent`

Satu edge menentukan apakah ReAct loop benar-benar:

```text
Reason → Act → Observe → Reason
```

atau berhenti terlalu cepat.

---

# 26. Interview Framing

Kalimat yang dapat digunakan setelah implementasi benar-benar selesai:

> “Saya mengganti advisor dari single-shot prompt menjadi LangGraph `StateGraph`: tiga node utama untuk agent, tools, dan fallback; empat tool yang mengambil data dari API .NET saya sendiri; conditional routing melalui `should_continue`; serta `MemorySaver` untuk state per session. Saya juga menambahkan trace Langfuse dan scenario eval, termasuk kasus adversarial untuk memastikan agent tidak mengarang data ketika sumbernya tidak tersedia.”

Tambahkan detail aktual hanya setelah hasil eval dan trace benar-benar tersedia.

---

# 27. Road Ahead

Chapter berikutnya adalah **Chapter 9 — MCP**.

Empat tool yang dibangun di sini sengaja memiliki boundary yang sederhana:

```text
tool
 │
 └─ HTTP → .NET API
```

Karena itu, transformasinya ke MCP dapat dilakukan dengan perubahan relatif kecil.

Mental model yang dipertahankan:

```text
same business data
same state model
same tool boundary
different tool protocol
```

Detail implementasi lengkap, port C# baris-per-baris, semua test, eval scenario, smoke test dua-turn, dan Knowledge Check tetap berada di:

`PF-AI008-langgraph-financial-advisor.md`

---

# 28. Glossary

Istilah utama chapter ini:

| Istilah | Makna singkat |
|---|---|
| **StateGraph** | graph yang mengatur state dan alur agent |
| **State** | data yang mengalir antar-node |
| **Node** | fungsi yang melakukan pekerjaan |
| **Edge** | aturan perpindahan antar-node |
| **Conditional edge** | edge yang dipilih berdasarkan state |
| **Reducer** | aturan merge update state |
| **`add_messages`** | reducer untuk conversation history |
| **ToolNode** | node siap-pakai untuk menjalankan tool calls |
| **Checkpointer** | mekanisme penyimpanan state |
| **MemorySaver** | checkpointer in-memory |
| **`thread_id`** | ID opak yang mengikat state percakapan |
| **Fallback node** | jalur khusus untuk failure yang masih dapat ditangani |

---

## One-page mental model

```text
                         USER
                          │
                          ▼
                    POST /advisor
                          │
                          ▼
                ┌──────────────────┐
                │   AdvisorState   │
                │                  │
                │ messages         │
                │ financial data   │
                │ error            │
                │ session_id       │
                └────────┬─────────┘
                         │
                         ▼
                      AGENT
                     (Claude)
                         │
                 ┌───────┼────────┐
                 │       │        │
               error  tool_call  done
                 │       │        │
                 ▼       ▼        ▼
             FALLBACK  TOOLS      END
                         │
                         ▼
                       AGENT
                         │
                         └───── loop ─────┐
                                          │
                         MemorySaver ◄────┘
                              │
                              ▼
                         thread_id
                         (= session_id)
```

**Core idea:** LangGraph membuat agent loop menjadi struktur yang dapat diinspeksi, diuji, diarahkan, dan disimpan state-nya.  
