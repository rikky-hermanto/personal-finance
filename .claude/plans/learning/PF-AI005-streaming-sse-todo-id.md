# PF-AI005 — Streaming + Production UX dengan SSE (Versi Belajar)

> **Ini bukan plan baru.** Ini adalah tulisan ulang dari [PF-AI005-streaming-sse-todo.md](PF-AI005-streaming-sse-todo.md), disusun ulang supaya urutannya mengikuti cara otak belajar hal baru — bukan urutan implementasi. Semua fakta, angka, kode, dan jebakan yang disebutkan di sini diambil apa adanya dari file asli. File asli tetap jadi rujukan resmi untuk TODO steps, acceptance criteria, dan quiz — dokumen ini cuma versi "supaya nyantol dulu di kepala."
>
> **Urutan baca:** masalah dulu → baru konsep → baru cara kerja → baru kode → baru optimisasi → baru best practice → baru kesalahan umum → baru ringkasan. Jangan loncat ke bagian Implementasi kalau tiga bagian pertama belum kebayang, nanti kodenya kelihatan seperti sihir.
>
> **Ketemu istilah asing di tengah baca?** Semua istilah baru dijelaskan pas pertama kali muncul, dan tiap istilah di-link langsung ke definisinya di [Glossary RAG](glossary-rag-id.md) — tinggal klik, tidak perlu scroll balik.

---

## Apa Masalah yang Ingin Diselesaikan?

Di chapter sebelumnya (PF-AI004), sistem sudah punya `POST /ask`: user tanya *"berapa total pengeluaran makan bulan Maret?"*, sistem melakukan retrieval + re-ranking + generation, lalu mengembalikan jawaban lengkap dengan sitasi. Jawabannya **benar**. Tapi ada masalah UX yang nyata:

**Masalah 1 — user menatap spinner 2–6 detik.** Gemini butuh 2–6 detik untuk menyusun jawaban. Selama itu UI cuma menampilkan spinner kosong. Bandingkan dengan ChatGPT atau Claude.ai — mereka tidak pernah membuatmu menatap layar kosong selama itu; jawabannya muncul kata demi kata. Spinner yang diam lama itu *terasa* rusak, padahal backend-nya bekerja dengan benar. Persepsi = kenyataan di UX.

**Masalah 2 — data berubah di server, tapi UI tidak tahu.** Setelah upload wizard commit statement bank, tab Transactions baru menampilkan baris baru saat React Query kebetulan refetch (pindah halaman, refresh manual). Tab kedua tetap basi. Device lain tetap basi. Solusi naifnya adalah [polling](glossary-rag-id.md#polling) — tembak request tiap 2 detik selamanya, yang hampir semuanya menjawab "tidak ada yang berubah." Boros request, boros beban server.

Jadi target chapter ini dua:
1. `POST /ask/stream` — jawaban muncul **token demi token**, token pertama tampil dalam ~150ms, bukan 2–6 detik.
2. Tab Transactions ter-update **live** saat upload di-commit — tanpa refetch manual, tanpa polling.

---

## Konsep Sederhananya

Ada tiga konsep baru. Analoginya:

1. **[SSE (Server-Sent Events)](glossary-rag-id.md#sse)** — biasanya HTTP itu seperti pesan-antar: kamu pesan sekali, kurir datang sekali bawa satu paket lengkap, selesai. SSE itu seperti langganan koran: kamu daftar sekali, lalu koran terus diantar tiap terbit lewat "pintu" yang sama, sampai kamu berhenti langganan. Server terus mendorong potongan data kecil ke browser lewat **satu koneksi HTTP yang dibiarkan terbuka** — tanpa browser harus bertanya ulang.

2. **[Async generator](glossary-rag-id.md#async-generator)** — fungsi biasa itu seperti koki yang baru keluar dari dapur setelah SEMUA masakan jadi (`return` sekali di akhir). Async generator itu koki yang mengantar tiap piring begitu matang (`yield` berkali-kali). Untuk streaming, provider LLM harus jadi koki tipe kedua — tidak mungkin men-stream token yang belum kamu punya.

3. **[Supabase Realtime](glossary-rag-id.md#supabase-realtime)** — daripada UI bertanya "ada data baru?" tiap 2 detik (polling), balik arahnya: database yang *memberi tahu* UI begitu ada baris baru masuk. Seperti bel pintu vs kamu bolak-balik ngecek ke depan rumah tiap 2 menit.

Gambaran besar `POST /ask/stream`:

```
Client (ChatPage)                    AI Service (FastAPI /ask/stream)
   |  POST /ask/stream {query}              |
   |---------------------------------------->|
   |                                         |-- retrieve (pgvector) + rerank (FlashRank)
   |   event: metadata {contexts: [...]}     |
   |<-----------------------------------------|   sitasi tampil SEKARANG — sebelum token pertama
   |                                         |-- provider.stream_generate() mulai
   |   event: token "Total"                  |
   |<-----------------------------------------|
   |   event: token " pengeluaran"           |
   |<-----------------------------------------|
   |   event: token " Rp 50.000"             |
   |<-----------------------------------------|
   |   event: done                           |
   |<-----------------------------------------|
```

Tiga jenis event, urutannya selalu sama: `metadata` (konteks hasil retrieval — dikirim *sebelum* generation mulai, supaya sitasi langsung tampil) → `token` (tiap potongan teks dari LLM) → `done` (sinyal selesai).

Dan untuk Realtime:

```
Upload wizard commit ──▶ .NET API INSERT ──▶ Postgres ──▶ Supabase Realtime
                                                              │ push (~50ms)
                                                              ▼
                                              Tab Transactions: toast + refetch otomatis
```

---

## Cara Kerjanya


### Streaming — dari satu blob JSON sampai SSE + fetch-event-source

Response sekali jadi — `POST /ask` yang sudah ada. Retrieve → rerank → generate → return satu JSON lengkap. Benar, sederhana, sudah shipped di chapter lalu.

Ganjalannya, Gemini butuh 2–6 detik untuk menyusun jawaban, dan sepanjang itu user hanya melihat spinner. Total durasi kerjanya tidak bisa dipangkas — yang bisa digeser cuma *persepsinya*.

**Push tiap potongan teks begitu model menghasilkannya.** Kata pertama muncul dalam ~150ms. [TTFT (time-to-first-token)](glossary-rag-id.md#ttft) anjlok dari ~3 detik ke ~150ms, padahal total durasi generation tidak berubah sama sekali. Yang berubah cuma: user *melihat progres*.

Kedengarannya tinggal implementasi — sampai ketabrak sifat dasar HTTP: satu request → satu response, selesai. Bagaimana caranya server terus mengirim data tambahan *setelah* response dimulai, tanpa client bertanya lagi?

**[SSE](glossary-rag-id.md#sse) — satu koneksi HTTP dibiarkan terbuka.** Response yang tidak pernah ditutup dan terus ditulisi server. Unidirectional (server → client saja), jalan di HTTP biasa (tanpa upgrade protokol, tanpa konfigurasi proxy khusus), dan browser otomatis reconnect kalau koneksi putus. Untuk pola "client kirim satu query, server balas aliran token" — bentuknya pas persis. Alternatifnya, [WebSocket](glossary-rag-id.md#websocket), memberi kanal dua arah — itu tepat untuk chat room atau collaborative editing di mana dua sisi terus bicara; di sini client cuma kirim sekali lalu mendengarkan, jadi dua-arah cuma overhead.

Tinggal satu batu sandungan, dan letaknya di browser: React perlu mengirim **POST dengan JSON body** (`{"query": "...", "category": "..."}`) untuk memulai stream, sementara API SSE bawaan browser, [`EventSource`](glossary-rag-id.md#eventsource), **cuma bisa GET** — tidak bisa kirim body, tidak bisa custom header. Dia bahkan gagal di langkah pertama.

**[`@microsoft/fetch-event-source`](glossary-rag-id.md#fetch-event-source) — bungkus `fetch()`, bukan `EventSource`.** Mendukung POST body, custom header, dan `AbortController` untuk membatalkan — sambil mempertahankan semantik auto-reconnect SSE. → *Ini yang dipakai chapter ini* (di `chatApi.ts`).

> **Teaser, tidak diajarkan di sini:** WebSockets untuk kanal full bidirectional — chat room, multiplayer, collaborative editing. Bukan kebutuhan chapter ini.

▶ **Tonton/baca untuk konsep ini:** https://github.com/sysid/sse-starlette dan [MDN — Using server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)

### Provider streaming — dari `return` sekali sampai async generator yang aman untuk event loop

**`return` sekali di akhir — `provider.generate_json()` yang sudah ada.** Memanggil LLM dan me-`return` jawaban lengkap satu kali, setelah model benar-benar selesai.

Cocok untuk `/ask`, buntu untuk streaming: endpoint SSE butuh `yield` token berulang kali *selagi* generation masih berjalan, dan fungsi yang `return` sekali di akhir tidak punya apa-apa untuk disuapkan ke generator SSE — mustahil men-stream token yang belum ada.

**[Async generator](glossary-rag-id.md#async-generator) — `yield` tiap potongan.** `async def stream_generate(...)` dengan `yield` alih-alih `return`: tiap `yield text` menyerahkan satu potongan ke siapa pun yang iterasi dengan `async for`, sebelum fungsi lanjut ke potongan berikutnya. Type-nya `AsyncGenerator[str, None]` — teks keluar, tidak ada yang dikirim masuk.

Ada jebakan halus di sini: kalau panggilan SDK di dalamnya ternyata **sinkron dan [blocking](glossary-rag-id.md#blocking-call)** (misalnya `client.generate_content(...)` biasa yang baru return setelah jawaban lengkap), dia membekukan **seluruh [event loop](glossary-rag-id.md#event-loop)** selama itu — health check, search user lain, stream user lain, semua macet sampai dia selesai. Membungkus panggilan blocking dalam `async def` **tidak** membuatnya non-blocking. (Persis jebakan yang sama dengan FlashRank di PF-AI004.)

**Entry point streaming async asli SDK-nya.** Anthropic: `client.messages.stream()` (async context manager, iterasi via `.text_stream`). Gemini: `client.aio.models.generate_content_stream()` (coroutine yang *resolve ke* iterator — makanya butuh `await` sebelum `async for`, beda dengan Anthropic). Event loop tetap bebas selagi token mengalir. Kalau versi SDK terpasang belum punya async streaming, fallback terakhirnya [`asyncio.to_thread(...)`](glossary-rag-id.md#asyncio-to-thread) — kehilangan streaming inkremental (semua teks tetap datang sekaligus), tapi setidaknya tidak menyandera request lain. → *Ini yang dipakai chapter ini.*

▶ **Tonton/baca untuk konsep ini:** https://docs.anthropic.com/en/api/messages-streaming

### Realtime — dari refetch manual sampai publication + RLS

**Andalkan refetch React Query.** Setelah upload commit, baris baru muncul saat query kebetulan refetch — navigasi, mount ulang, refresh manual. Satu tab, satu user: cukup, dan memang itu yang jalan hari ini.

Cukup untuk satu tab — begitu buka tab kedua, langsung retak: data berubah *di server*, dan tidak ada yang memberi tahu client. Tab kedua basi. Device lain basi. Dan pipeline async PF-S11 nanti (202 Accepted → webhook → hasil masuk beberapa menit kemudian) selesai sepenuhnya di luar jalur — tidak ada cara memberi tahu UI sama sekali. Perbaikan naifnya polling: request tiap 2 detik selamanya, hampir semua sia-sia.

**[Supabase Realtime](glossary-rag-id.md#supabase-realtime) — server yang dorong duluan.** Buka satu subscription di tabel `transactions`, biarkan Postgres mendorong tiap baris yang di-commit — event [`postgres_changes`](glossary-rag-id.md#postgres-changes) INSERT sampai dalam ~50ms, tanpa loop polling sama sekali.

Mulus di papan tulis, buntu di praktik: subscribe pakai anon key dan... tidak ada yang datang. Tanpa error, tanpa exception — channel lapor SUBSCRIBED, tapi nol event. Ada **dua filter diam-diam yang independen**: (1) tabelnya tidak ada di [publication](glossary-rag-id.md#publication) `supabase_realtime` — Postgres tidak pernah menyiarkan perubahannya; (2) [RLS (Row Level Security)](glossary-rag-id.md#rls) diam-diam membuang baris yang tidak boleh di-`SELECT` oleh role yang subscribe. Dua-duanya tak terlihat kecuali kamu sudah tahu harus curiga ke sana.

**Publication + RLS dua-duanya dibuka.** Sebuah migration menambahkan `public.transactions` ke publication `supabase_realtime` (belum ada tabel apa pun di dalamnya hari ini), dan policy permisif `allow_all_transactions USING (true)` yang sudah ada membuat anon key menerima semua event secara lokal. Di production (PF-S08) policy itu menyempit ke pemilik yang terautentikasi — dan subscription diam-diam berhenti menerima baris user lain, yang justru *persis* perilaku yang diinginkan. → *Ini yang dipakai chapter ini.*

▶ **Tonton/baca untuk konsep ini:** https://supabase.com/docs/guides/realtime

---

## Implementasi

Sekarang baru kodenya. File yang dibuat/diubah:

| File | Perubahan |
|------|-----------|
| [base.py](../../../services/ai-service/app/providers/base.py) | Edit — tambah `stream_generate()` ke protocol `LlmProvider` |
| [anthropic.py](../../../services/ai-service/app/providers/anthropic.py) | Edit — `stream_generate()` via `messages.stream()` |
| [gemini.py](../../../services/ai-service/app/providers/gemini.py) | Edit — `stream_generate()` via async streaming |
| [main.py](../../../services/ai-service/app/main.py) | Edit — endpoint `POST /ask/stream`; `app.state.provider` |
| [config.py](../../../services/ai-service/app/config.py) | Edit — tambah `http://localhost:8080` ke default `cors_origins` |
| [test_streaming.py](../../../services/ai-service/tests/test_streaming.py) | Baru — test urutan event + bentuk payload |
| [chatApi.ts](../../../apps/frontend/src/api/chatApi.ts) | Baru — `streamAsk()` pakai fetch-event-source |
| [ChatPage.tsx](../../../apps/frontend/src/pages/ChatPage.tsx) | Baru — UI chat streaming di route `/chat` |
| [supabase.ts](../../../apps/frontend/src/lib/supabase.ts) | Baru — singleton client Supabase |
| [useRealtimeTransactions.ts](../../../apps/frontend/src/hooks/useRealtimeTransactions.ts) | Baru — subscription INSERT `transactions` |
| [20260703000001_enable_realtime_transactions.sql](../../../supabase/migrations/20260703000001_enable_realtime_transactions.sql) | Baru — tambah tabel ke publication |

Kode lengkap, test, dan C# equivalent ada di STEP 1–9 file plan asli — di sini cuma potongan yang paling menanggung beban, dengan komentar bahasa biasa.

**Provider streaming (Anthropic)** — inti polanya: async context manager + `yield` per potongan, lalu ambil usage setelah stream selesai untuk [Langfuse](glossary-rag-id.md#langfuse):

```python
async with self._client.messages.stream(
    model=self._model, max_tokens=1024, temperature=0.0,
    system=system_prompt,
    messages=[{"role": "user", "content": user_prompt}],
) as stream:
    async for text in stream.text_stream:
        yield text                              # ← tiap potongan langsung diserahkan ke caller
    final = await stream.get_final_message()    # usage + stop_reason baru ada SETELAH stream habis
```

Dua hal yang gampang bikin bingung:
- **Jangan `await` panggilan generator-nya.** `p.stream_generate(...)` mengembalikan async generator — langsung masuk `async for`. `await` di situ malah `TypeError`. Kontras dengan Gemini: `client.aio.models.generate_content_stream(...)` adalah coroutine yang resolve ke iterator, jadi di sana `await`-nya justru wajib.
- **Instrumentasi Langfuse itu manual per method** (warisan PF-AI001). Method baru tidak otomatis ke-trace — tanpa span sendiri, semua panggilan streaming *hilang diam-diam* dari dashboard biaya.

**Endpoint SSE** — pola generator + urutan event:

```python
async def event_generator():
    candidates = await app.state.retriever.search(...)          # retrieval ~100ms
    contexts = await app.state.reranker.rerank(...)
    if not contexts:
        yield {"event": "done", "data": json.dumps({"confident": False, "contexts": []})}
        return                                                   # data tidak ada → LLM tidak dipanggil
    yield {"event": "metadata", "data": json.dumps({"contexts": context_payload})}
    async for token in app.state.provider.stream_generate(SYSTEM_PROMPT, user_prompt):
        if await req.is_disconnected():                          # user tutup tab / tekan Stop
            break                                                # → hentikan panggilan LLM, hemat token
        yield {"event": "token", "data": token}
    yield {"event": "done", "data": ""}

return EventSourceResponse(event_generator())
```

Kenapa `metadata` dikirim *sebelum* generation? Karena retrieval + rerank sudah selesai sebelum token pertama — kita sudah tahu top-3 konteksnya. UI bisa merender "Sumber transaksi" sebelum jawaban dimulai: user melihat *dari mana jawabannya akan datang* dulu. Ini lebih bagus dari versi non-streaming yang memvalidasi sitasi setelah generation.

**Sisi React** — bagian paling berbahaya justru bukan streaming-nya, tapi *menutup* stream-nya:

```typescript
} else if (msg.event === "done") {
    handlers.onDone(payload);
    controller.abort();   // stream selesai — matikan koneksi supaya library
                          // tidak reconnect dan mengulang POST query-nya
}
...
onclose() {
    throw new Error("stream closed unexpectedly");  // server mati tanpa done → jangan retry diam-diam
},
onerror(err) {
    handlers.onError(err);
    throw err;            // hentikan auto-retry bawaan fetch-event-source
},
```

`fetch-event-source` menganggap koneksi yang ditutup server itu bisa di-retry: tanpa abort/throw, dia diam-diam reconnect dan **mengirim ulang POST** — generation LLM duplikat yang token-nya nempel ke jawaban yang sudah selesai (dan tagihan token dobel). Library-nya sudah tidak di-maintain (rilis terakhir 2021), jadi footgun ini tidak akan pernah "diperbaiki" upstream.

**Realtime** — satu baris migration, satu hook:

```sql
alter publication supabase_realtime add table public.transactions;
```

```typescript
supabase.channel("transactions-inserts")
  .on("postgres_changes",
      { event: "INSERT", schema: "public", table: "transactions" },
      (payload) => onInsert(payload.new as TransactionInsert))
  .subscribe();
```

Di `TransactionsTab.tsx`, callback-nya di-[debounce](glossary-rag-id.md#debounce) 1 detik: satu commit statement bisa insert puluhan baris sekaligus — refetch per event akan menghajar API puluhan kali; debounce menggabungkannya jadi satu toast + satu invalidation.

---

## Optimisasi

Keputusan tuning yang diambil, masing-masing dengan alasan konkretnya:

1. **`metadata` event, bukan sitasi di `done`.** Di mode streaming tidak ada structured output sampai stream selesai — tapi konteks retrieval sudah lengkap sebelum token pertama. Kirim duluan: sitasi tampil sebelum jawaban, tidak butuh parsing mid-stream.
2. **`max_tokens=1024`, bukan 4096.** Jawaban chat itu pendek (1–3 kalimat + sitasi); 1024 token ≈ 750 kata. Pipeline extraction pakai 4096 karena statement bisa panjang. Kalau cap tersentuh, truncation dicatat di log + Langfuse metadata — tidak pernah diam-diam.
3. **`is_disconnected()` dicek di antara tiap yield.** User tutup tab → generator berhenti → panggilan LLM berhenti. Hemat ~$0.001 per stream yang dibatalkan — kecil di volume personal, nyata di skala production. Dicek *setelah* yield karena disconnect *saat* yield sudah ditangkap sebagai exception oleh ASGI server; cek ini menangkap kasus lebih umum: disconnect *di antara* token.
4. **Retrieval kosong → langsung `done`, LLM tidak dipanggil.** Sama seperti PF-AI004: tidak ada halusinasi, `confident: false` jujur ke user, biaya LLM Rp 0.
5. **Debounce 1 detik untuk Realtime.** Satu commit = puluhan INSERT event. Tanpa debounce, puluhan refetch; dengan debounce, satu.
6. **React langsung ke AI service untuk SSE, tidak lewat proxy .NET.** Mem-proxy streaming lewat ASP.NET Core butuh lapisan forward async ekstra, dan auth belum ada. Keputusan ber-scope — ditinjau ulang saat PF-S08 (auth).
7. **TTFT adalah metrik yang di-record** (STEP 11): dari ~3s ([blocking](glossary-rag-id.md#blocking-call) `/ask`) ke ~150ms. Total durasi kerja tidak berubah — yang dibeli streaming adalah *perceived latency*.

---

## Best Practice

Aturan yang dipegang selama build ini, dan kenapa:

- **Jangan bungkus panggilan blocking di `async def` dan berharap dia jadi async.** Event loop tetap terkunci. Pakai entry point async asli SDK; fallback terakhir `asyncio.to_thread`.
- **Content type harus persis `text/event-stream`, dan tiap event diakhiri `\n\n`.** Dua aturan protokol SSE yang paling sering menggigit pemula — `sse-starlette` menanganinya, tapi kamu perlu tahu ini untuk debugging saat browser tidak menerima event apa pun.
- **Verifikasi no-buffering dengan `curl -N --no-buffer`.** Kalau semua token datang sekaligus di akhir, ada yang mem-buffer: proxy (butuh `proxy_buffering off`), Python (`PYTHONUNBUFFERED=1`), atau `sse-starlette` versi lama (<2.1).
- **Satu POST per pertanyaan — verifikasi di devtools Network tab.** Abort setelah `done`, throw di `onclose`/`onerror`. Ini acceptance criterion, bukan opsional.
- **Streaming tidak boleh hilang dari dashboard biaya.** Tiap `stream_generate()` bawa generation span Langfuse sendiri, dengan usage + `stop_reason`/`finish_reason` (PF-AI001 parity).
- **Perubahan schema lewat migration, bukan toggle Studio.** Menambahkan tabel ke publication Realtime = perubahan schema = file SQL bernomor di `supabase/migrations/`.
- **`cors_origins` itu `list[str]` — jangan pernah `.split(",")`.** Override via env harus JSON (`CORS_ORIGINS=["http://localhost:8080",...]`) karena pydantic-settings men-decode field list sebagai JSON; string koma-koma bikin startup crash.
- **Client `supabase-js` cuma di frontend.** AI service tidak punya dependency Supabase — akses DB-nya langsung via asyncpg.

---

## Kesalahan Umum

> Chapter ini belum dibangun (status: To Do), jadi belum ada bug "kejadian betulan" dari sesi build. Tapi plan-nya sudah melewati architect audit (revisi 2026-07-03) yang menemukan lima jebakan nyata — masing-masing sempat ada di draft plan sebelum diperbaiki. Ini daftar yang paling mungkin menggigit:

1. **Reconnect diam-diam = POST dobel.** `fetch-event-source` menganggap server yang menutup koneksi sebagai kondisi retry — setelah `done`, dia reconnect dan mengirim ulang query. Gejala: jawaban kedua nempel di bawah jawaban pertama, tagihan token dobel. **Fix:** `controller.abort()` di handler `done`, `throw` di `onclose` dan `onerror`. Verifikasi: tepat satu `POST /ask/stream` di Network tab.
2. **Channel SUBSCRIBED, nol event, nol error.** Dua filter diam-diam yang independen. Cek berurutan: (1) tabelnya ada di publication? (`select * from pg_publication_tables where pubname = 'supabase_realtime';` — sebelum migration ini, hasilnya kosong); (2) role yang subscribe boleh `SELECT` barisnya? RLS memfilter event tanpa suara.
3. **`CORS_ORIGINS` di-split sebagai string.** `cors_origins` di `config.py` sudah `list[str]` — `.split(",")` di atasnya, atau env override berformat koma-koma, bikin startup crash atau CORS diam-diam salah. Env override harus JSON array.
4. **`await p.stream_generate(...)`.** `TypeError: object async_generator can't be used in 'await' expression`. Async generator langsung di-`async for`; yang butuh `await` justru Gemini `generate_content_stream(...)` (coroutine yang resolve ke iterator). Dua provider, dua bentuk — gampang ketuker.
5. **Method streaming baru hilang dari Langfuse.** PF-AI001 menginstrumentasi tiap method provider *manual* — tidak ada auto-instrumentation. `stream_generate()` tanpa span sendiri = semua jawaban streaming lenyap dari dashboard biaya, tanpa error apa pun.
6. **Semua token datang sekaligus di akhir (buffering).** Terlihat "jalan" di test tapi bukan streaming. Cek: `curl -N --no-buffer` harus menunjukkan kedatangan progresif; kalau tidak — proxy buffering, `PYTHONUNBUFFERED`, atau `sse-starlette` <2.1.
7. **Truncation dianggap hard error (aturan yang salah konteks).** Rule ai-service "treat `max_tokens` as a hard error" ditulis untuk extraction, di mana data parsial menciptakan phantom duplicate. Jawaban chat yang sudah setengah ter-stream tidak bisa "ditarik balik" dari layar user — jadi untuk streaming: log warning + catat `stop_reason` di Langfuse, jangan raise. Deviasi yang terdokumentasi, bukan kelalaian.

---

## Summary

**Masalah:** jawaban `/ask` benar tapi user menatap spinner 2–6 detik; dan tabel Transactions tidak tahu kalau server baru saja commit data baru.

**Yang dibangun:**
- `stream_generate()` di kedua provider (Anthropic `messages.stream()`, Gemini `generate_content_stream()`) — async generator, Langfuse span manual, truncation tercatat.
- `POST /ask/stream` — SSE dengan protokol `metadata → token → done`, guard `is_disconnected()`, retrieval kosong → langsung `done` tanpa panggil LLM.
- UI chat `/chat` — `@microsoft/fetch-event-source` (POST-capable), kursor berkedip, sitasi tampil dari event `metadata` sebelum token pertama, abort-on-done.
- Supabase Realtime di `transactions` — migration publication + subscription INSERT + debounced toast/invalidation.

**Angka-angka kunci:**

| Metrik | Nilai |
|--------|-------|
| TTFT `/ask/stream` | ~150ms (target) |
| vs `/ask` blocking | 2–6s sebelum apa pun tampil |
| Latency push Realtime | ~50ms per INSERT |
| `max_tokens` streaming | 1024 (vs 4096 extraction) |
| Jaminan request | tepat 1 POST per pertanyaan (abort-on-done) |

**Pelajaran terpenting:** streaming tidak mempercepat apa pun — total durasi generation sama persis. Yang dibelinya adalah *perceived latency*: TTFT ~150ms membuat sistem terasa hidup. Dan kedua sisi punya jebakan diam-diam yang simetris: di client, library SSE yang diam-diam reconnect dan mengulang POST; di server, subscription Realtime yang diam-diam tidak menerima apa-apa karena publication/RLS. Keduanya gagal *tanpa error* — kamu harus tahu harus curiga ke mana.

**Interview one-liner:** *"Saya bangun SSE streaming untuk endpoint RAG chat kami — `/ask/stream` mengirim konteks retrieval sebagai event `metadata` sebelum generation mulai, jadi sitasi tampil sebelum token pertama. TTFT turun dari ~3s ke ~150ms. Saya poll `request.is_disconnected()` di antara yield untuk menghentikan panggilan LLM saat user menutup tab, pakai `fetch-event-source` karena `EventSource` native GET-only, dan meng-abort koneksi setelah `done` karena library-nya kalau tidak akan reconnect dan mengulang POST. Lalu saya wire Supabase Realtime untuk transaksi live, men-debug dua mode kegagalan diam-diamnya: tabel yang tidak ada di publication, dan RLS yang memfilter event."*

Untuk TODO steps lengkap, acceptance criteria, C# equivalents, dan Knowledge Check quiz → [PF-AI005-streaming-sse-todo.md](PF-AI005-streaming-sse-todo.md).
