# Tips Belajar — Cara Cepat Jadi Mahir

**Pendamping dari:** [`ai-engineer-learning-path.md`](./ai-engineer-learning-path.md)
**Horizon:** 12 minggu. Tujuannya: siap interview, bukan siap ujian.
**Strategi:** Bikin "belajar → bangun → buktikan" jadi satu siklus yang diulang tiap hari.

---

## 5 Prinsip Utama (yang memang didukung riset)

| Prinsip | Artinya buat kamu | Kenapa berhasil |
|---|---|---|
| **Aktif mengingat > pasif mengulang** | Setiap habis nonton video 25 menit, tutup tab-nya dan *tulis dari ingatan* apa yang baru kamu pelajari. Putar ulang hanya bagian yang masih ada celah. | Roediger & Karpicke 2006 — belajar dengan cara self-testing terbukti 50%+ lebih efektif untuk ingatan jangka panjang dibanding baca ulang. |
| **Project dulu, teori kalau butuh** | Buka fitur Personal Finance yang mau kamu ship. Cari teori hanya kalau sudah mentok. Jangan habisin kursus penuh sebelum nyentuh kode. | Cognitive load theory — pemahaman terbentuk lebih cepat kalau dikaitkan dengan masalah nyata. Teori yang mengambang tanpa konteks gampang menguap. |
| **Spaced repetition, bukan cramming** | Sentuh tiap konsep di Hari 1, 3, 7, dan 21. Revisit 15 menit jauh lebih efektif dari binge 4 jam sekaligus. | Ebbinghaus forgetting curve — 80% info baru hilang dalam 48 jam kalau tidak diambil kembali. |
| **Campur topik, jangan satu blok panjang** | Jangan 2 minggu murni RAG lalu 2 minggu murni Agents. Campur: pagi tuning RAG retrieval, siang LangGraph node. | Rohrer 2012 — interleaving terasa lebih susah jangka pendek, tapi jauh lebih baik untuk *transfer learning* — dan itulah yang diuji di interview. |
| **Feynman / ajari orang lain** | Setelah ship tiap fitur, tulis 1 paragraf seolah kamu jelasin ke rekan baru. Kalau tidak bisa, berarti kamu belum benar-benar paham. | Ini memaksamu memadatkan. Kalau bisa dipadatkan, berarti kamu ngerti. Bonus: bahan gratis buat CV atau blog. |

---

## Daily Loop (≤ 4 jam fokus)

Ini bukan soal berapa jam duduk, tapi seberapa dalam otak kamu menyerap. **Kualitas fokus > kuantitas waktu.**

```
06:30–07:00 (30 menit) — RETRIEVAL WARMUP
  Buka progress.md. Tanpa lihat catatan, tulis apa yang kamu ship
  kemarin + satu konsep yang masih sulit kamu jelaskan. Baca ulang
  hanya bagian yang masih ada celah. Ini layer spaced repetition kamu.

07:00–08:30 (90 menit) — DEEP WORK BLOCK #1  (Phase 2 atau 3 — jalur utama)
  Pilih SATU konsep (misalnya, "sentence-window retrieval"). Tonton
  hanya segmen kursus yang meliputinya, sekitar 10–20 menit saja.
  Berhenti. Buka Personal Finance. Implementasikan. Commit. Selesai.

  Aturan: kalau videonya lebih dari 20 menit, scope-nya terlalu besar.
  Pecah lebih kecil lagi.

09:00–10:30 (90 menit) — DEEP WORK BLOCK #2  (fase berbeda dari pagi)
  Kalau pagi tadi RAG, siang ini Agents/MCP. Kalau pagi eval harness,
  siang ini streaming. Pergantian topik inilah yang bikin belajarmu
  benar-benar nyantol.

10:30–11:00 (30 menit) — TEACH-BACK + LOG
  Tulis paragraf Feynman untuk hasil kerja pagi. Tambahkan ke
  progress.md. Ini yang akan kamu pakai buat blog dan cerita STAR
  di Minggu 11–12.

Total: 3,5 jam fokus. Tidak perlu maraton 8 jam. Setelah 4 jam
kerja kognitif berat, hasilnya justru menurun tajam
(Ericsson, deliberate practice).
```

**Akhir pekan:** Sisihkan 2 jam di hari Minggu untuk konsolidasi — review commit minggu ini, tulis "5 hal yang aku pelajari minggu ini." Sisanya, istirahat.

---

## Anti-Pattern yang Perlu Kamu Hindari

1. **Nonton kursus dari awal sampai akhir.** Kamu akan merasa produktif tapi tidak ada yang benar-benar nempel. Pilih segmen yang langsung relevan dengan fitur yang sedang kamu ship hari ini.
2. **Mencatat selama video berjalan.** Nulis kata per kata dari video = nyalin secara pasif. Tulis catatan *setelah* video, dari ingatan.
3. **Baca dokumentasi dari atas ke bawah.** Baca docs seperti kamu pakai Stack Overflow — cari yang kamu butuhkan, sebagai respons atas masalah spesifik yang kamu temui.
4. **Bikin proyek toy paralel.** Setiap baris kode masuk ke Personal Finance. Repo kedua memecah fokus dan menghilangkan efek compounding dari satu portfolio yang solid.
5. **Terlalu perfeksionis di satu fitur.** Ship "cukup untuk demo + bisa diukur" di v1. Refine di v2 minggu depan. Eval harness yang akan bilang mana yang benar-benar perlu diperbaiki.
6. **Ambil sertifikasi sebelum pernah ship apapun.** Sertifikat itu *penguat* sinyal, bukan *pencipta* sinyal. Tunda semua sampai minimal Minggu 9–10.

---

## Speed Hack Per Fase

### Phase 2 — RAG + Evals + Observability (Minggu 1–6)

- Skip Phase 1 sepenuhnya, kecuali satu malam untuk skim Anthropic prompt-caching.
- **Langfuse dulu (Minggu 1)** — begitu tracing sudah jalan, setiap eksperimen berikutnya otomatis menghasilkan data. Efek bunga-berbunga.
- Pakai PostgreSQL + pgvector yang sudah ada. Jangan belajar Chroma atau FAISS — itu jalan memutar yang tidak relevan untuk stack kamu.
- Eval harness: 20 fixture sudah cukup. Jangan gold-plate sampai 200.

### Phase 3 — Agents + MCP (Minggu 7–10)

- Mulai dengan **smolagents** (API surface paling kecil) sebelum LangGraph. Kamu bakal paham konsep tool loop dalam 1 hari, baru belajar LangGraph sebagai "smolagents versi industrial."
- **MCP:** bangun server-nya dulu sebelum baca spec-nya. Quickstart Anthropic sudah cukup untuk running dalam 30 menit. Spec-nya baru masuk akal setelah kamu pernah ship satu.

### Phase 4 — Production AI

**Jangan dulu.** Bukan sekarang. Revisit hanya kalau ada JD spesifik yang mensyaratkan fine-tuning.

---

## Satu Ukuran Paling Penting

Setiap hari Minggu, tanyakan satu pertanyaan ini ke diri sendiri:

> **"Apa yang bisa aku ceritakan di interview hari ini yang belum bisa aku ceritakan Minggu lalu?"**

Kalau jawabannya konkret — "Aku ship sentence-window retriever dan ngukur peningkatan MRR 14% di fixture-ku" — minggu itu berhasil. Kalau jawabannya masih kabur — "Aku belajar soal embeddings" — minggu itu terbuang. Segera balik ke project-first.

---

## Intinya

Risetnya sudah jelas: **aktif mengingat + spaced + campur topik + dikaitkan ke project nyata** mengalahkan "banyak jam belajar" dengan faktor 3–5×. Kamu tidak butuh lebih banyak waktu — kamu butuh loop yang lebih ketat. 3,5 jam per hari dengan cara ini akan mengalahkan 8 jam per hari binge kursus, dan kamu masih punya energi untuk perform pas interview mulai berdatangan.
