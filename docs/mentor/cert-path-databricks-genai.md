# Learning Path — Databricks Certified Generative AI Engineer Associate

> Sertifikasi tier **S+** untuk profil kamu — materinya (RAG, LLM app design, prompt engineering,
> evaluation, governance) hampir 1:1 dengan yang sudah dibangun di project ini (PF-AI001–PF-AI010).
> Ini target JANGKA PENDEK: effort-to-signal ratio terbaik, bisa siap dalam 4–6 minggu.
>
> Disusun: 2026-08-12 · Verifikasi ulang exam guide resmi sebelum daftar: https://www.databricks.com/learn/certification/genai-engineer-associate

## Fakta Ujian

| Item | Detail |
|------|--------|
| Biaya | $200 USD |
| Durasi | 90 menit |
| Jumlah soal | 45 multiple choice |
| Format | Online proctored (Kryterion) |
| Prasyarat resmi | Tidak ada — rekomendasi ±6 bulan hands-on GenAI |
| Masa berlaku | 2 tahun |
| Passing | ±70% (tidak dipublikasikan resmi) |

## Domain Ujian (6 domain)

| # | Domain | Bobot | Intinya |
|---|--------|-------|---------|
| 1 | Design Applications | 14% | Memilih arsitektur: prompt vs RAG vs fine-tune vs agent; multi-stage reasoning; pemilihan model |
| 2 | Data Preparation | 14% | Chunking strategy, extraction dari dokumen, Delta tables untuk RAG source, metadata filtering |
| 3 | Application Development | 30% | Prompt engineering, RAG pipeline, LangChain, guardrails, output parsing, agent tools |
| 4 | Assembling & Deploying Apps | 22% | Vector Search, Model Serving endpoints, MLflow (log/register/deploy), pyfunc, Foundation Model API |
| 5 | Governance | 8% | Unity Catalog, PII masking, licensing data, guardrail compliance |
| 6 | Evaluation & Monitoring | 12% | LLM-as-judge, MLflow evaluate, inference tables, cost/latency monitoring |

**Pola penting:** Domain 3+4 = **52% ujian** adalah membangun dan men-deploy aplikasi GenAI di
platform Databricks. Konsepnya sudah kamu kuasai — yang harus dipelajari adalah *cara Databricks
melakukannya* (Vector Search, MLflow, Model Serving, Unity Catalog).

> ⚠️ **Update Maret 2026:** ujian diperluas ke agent layer — Mosaic AI Agent Framework, Agent Bricks,
> AI Gateway, MCP server, dan agent UI di Databricks Apps. Bobot per domain di tabel atas kemungkinan
> sudah bergeser setelah update ini; verifikasi ke exam guide resmi sebelum menyusun jadwal final.

## Posisi Kamu Saat Ini (gap analysis)

**Sudah kuat dari project Personal Finance — mayoritas konsep sudah dikuasai:**
- ✅ RAG end-to-end: embeddings, pgvector, retrieval, re-ranking (PF-AI003/004) → Domain 2, 3
- ✅ Advanced RAG: sentence-window, auto-merging (PF-AI006) → Domain 2
- ✅ Chunking strategy & trade-off-nya (PF-AI003, PF-AI006) → Domain 2
- ✅ Prompt engineering + structured output — Gemini `response_schema` + JSON mode, Anthropic
  `tool_use` + forced `tool_choice`, dua-duanya di balik satu `LlmProvider` protocol
  (**PF-009, PF-011** — dari track produk Sprint 1, bukan track belajar PF-AI) → Domain 3
- ✅ Agents & tool calling (PF-AI007 smolagents, PF-AI008 LangGraph) → Domain 1, 3
- ✅ Evaluation harness, F1 metrics, LLM-as-judge concept (PF-AI002, PF-AI010) → Domain 6
- ✅ Observability: cost/latency/token per call via Langfuse (PF-AI001) → Domain 6
- ✅ AI security & governance concepts (PF-AI011 in progress) → Domain 5

> Catatan: structured output adalah satu-satunya item di daftar ini yang datang dari track produk
> (Sprint 1), bukan track belajar PF-AI. Nilainya justru tinggi untuk Domain 3 — bobot terbesar
> ujian (30%) — karena kamu bukan sekadar memakai schema enforcement, tapi mengimplementasikan dua
> mekanisme berbeda di balik satu abstraksi, lalu mengadu keduanya lewat eval harness PF-AI002
> sampai menemukan bug serialisasi enum. Itu di atas level yang dituntut ujian associate.

**Gap yang harus ditutup — hampir semuanya platform-specific, bukan konsep.**

Dibagi dua kategori, karena nilainya beda jauh:

**Esensial secara karier (pelajari serius, kepakai di luar Databricks):**
- ❌ **MLflow** — log model, registry, `mlflow.evaluate()`, pyfunc custom model, tracing GenAI.
  Ini satu-satunya gap yang benar-benar transferable: MLflow open-source, jalan standalone, dan
  jadi standar de-facto lifecycle ML/LLM. Konsepnya paralel dengan Langfuse yang sudah kamu pakai
  di PF-AI001 — yang berubah cuma API surface-nya
- ❌ **Agent layer Databricks** — Mosaic AI Agent Framework, Agent Evaluation (LLM judges, custom
  scorers), AI Gateway, MCP server integration. Pola arsitekturnya sama dengan PF-AI007/008/009
  kamu, jadi ini pemetaan konsep-ke-produk, bukan belajar dari nol

**Sekadar biaya kredensial (hafalkan untuk lulus, nilai intrinsiknya rendah):**
- ❌ **Databricks Vector Search** — Delta Sync index vs Direct Access index. Konsepnya sudah kamu
  kuasai lewat pgvector; ini murni beda API dan trivia vendor
- ❌ **Model Serving** — Foundation Model API (pay-per-token vs provisioned throughput), custom
  endpoint, inference tables. Setengah transferable: pola pay-per-token vs provisioned muncul juga
  di Bedrock dan Azure PTU
- ❌ **Unity Catalog** — permission model, governance model/function. Bobot cuma 8%, paling vendor-locked
- ❌ **Ekosistem istilah Databricks** — Delta table, workspace, notebook flow, DBU cost model.
  Dibutuhkan sekadar supaya bisa membaca soal dengan benar

## Rencana Belajar — 5 Minggu (±6 jam/minggu)

### Fase 1 — Kenalan Platform (Minggu 1)
- [ ] Daftar Databricks Free Edition (databricks.com/learn/free-edition) — cukup untuk semua latihan
- [ ] Jalan-jalan di workspace: notebook, cluster/serverless compute, catalog explorer
- [ ] Buat Delta table sederhana, pahami bedanya dengan Postgres table biasa
- [ ] Tonton course resmi gratis: "Generative AI Engineering with Databricks" di Databricks Academy (self-paced, ini bahan utama ujian)

### Fase 2 — MLflow + Vector Search (Minggu 2–3)
- [ ] MLflow tracking: log params/metrics/artifacts dari eksperimen LLM
- [ ] MLflow model registry + Unity Catalog: register → alias → serve
- [ ] Bangun ulang mini-RAG kamu di Databricks: dokumen → chunk → embed → **Vector Search index** → retrieve
- [ ] Pahami dua tipe index: **Delta Sync** (auto-sync dari Delta table) vs **Direct Access** (manual upsert) — soal favorit
- [ ] `mlflow.evaluate()` dengan LLM-as-judge metrics — bandingkan dengan eval harness PF-AI002 kamu

### Fase 3 — Agent Layer + Deployment + Governance (Minggu 4)
- [ ] **Mosaic AI Agent Framework** — bangun 1 agent, bandingkan langsung dengan pola LangGraph di PF-AI008
- [ ] **Agent Evaluation** — LLM judges bawaan + custom scorer; petakan ke eval harness PF-AI002/PF-AI010 kamu
- [ ] **AI Gateway** — rate limiting, logging, fallback provider (analog dengan provider abstraction kamu)
- [ ] **MCP server integration** di Databricks — kamu sudah punya konteksnya dari PF-AI009
- [ ] Deploy custom pyfunc model (RAG chain) ke Model Serving endpoint
- [ ] Foundation Model API: pay-per-token vs provisioned throughput — kapan pakai yang mana (soal favorit)
- [ ] Inference tables untuk monitoring production
- [ ] Unity Catalog: grant permission ke model/function, PII handling
- [ ] Guardrails: filter input/output, safety config di serving endpoint

### Fase 4 — Exam Prep (Minggu 5)
- [ ] Baca exam guide resmi baris per baris
- [ ] Practice exam resmi Databricks + 1–2 set practice test pihak ketiga (Udemy) — target stabil >80%
- [ ] Review cepat area bobot besar: Domain 3 (30%) dan Domain 4 (22%) dulu, Domain 5 (8%) terakhir

## Resource Utama

1. **Official Exam Guide** — databricks.com/learn/certification/genai-engineer-associate (cakupan resmi)
2. **Databricks Academy** — course "Generative AI Engineering with Databricks" (gratis, self-paced — bahan utama)
3. **Databricks Free Edition** — lingkungan latihan gratis
4. **Dokumentasi**: Vector Search, Model Serving, MLflow LLM evaluate (baca langsung, ujiannya sangat doc-aligned)
5. Practice test pihak ketiga (Udemy) untuk kalibrasi

## Tips Spesifik Ujian Ini

- Ujiannya menguji "cara Databricks", bukan teori GenAI umum. Kalau soal tanya "bagaimana meng-serve RAG chain", jawabannya MLflow pyfunc + Model Serving, bukan FastAPI — meskipun kamu tahu FastAPI lebih familiar.
- Hafalkan pasangan alat ↔ fungsi: Vector Search = retrieval, MLflow = lifecycle, Model Serving = inference, Unity Catalog = governance, Inference Tables = production logging.
- Soal chunking/prompt engineering bisa dijawab dari pengalaman PF-AI003–006 langsung — jangan overthink.
- Banyak soal berbentuk "mana langkah yang TEPAT setelah X" — kuasai urutan workflow: data prep → index → chain → log ke MLflow → register → serve → monitor.
- Setelah lulus, pertimbangkan lanjut **Anthropic Claude Certified Architect** (lihat tier list) — kombinasi keduanya menutup sinyal "RAG production" + "agent architecture".
