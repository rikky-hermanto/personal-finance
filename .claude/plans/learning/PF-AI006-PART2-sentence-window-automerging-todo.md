# PF-AI006-PART2 — Sentence-Window Retrieval + Auto-Merging (Deferred)

> **Learning Phase:** Phase 2 · lanjutan Chapter 6 (deferred)
> **Status:** Deferred — dieksekusi setelah PF-AI006 (Hybrid Search) selesai DAN ada keputusan sadar bahwa statement-level Q&A memang mau dibangun
> **Split dari:** [PF-AI006-advanced-rag-patterns-todo.md](PF-AI006-advanced-rag-patterns-todo.md) (2026-07-23)
> **Kenapa di-split:** Hybrid search punya ROI produksi yang jelas dan langsung (query kata-kunci eksak seperti "PLN" nyata-nyata lemah di vector search). Sentence-window + auto-merging butuh data source baru (teks naratif statement PDF), tabel baru `statement_chunks`, dan backfill dari Storage — kerja paling besar untuk usecase yang saat ini belum jadi kebutuhan produk (chat UI sekarang eksplisit dibatasi "Beta · Transaksi"). Dua teknik ini tetap bernilai sebagai learning exercise (sering ditanya di interview RAG), tapi tidak boleh menunda hybrid search.

## Scope (dipindah utuh dari PF-AI006)

Semua materi teori, kode, acceptance criteria, dan TODO steps untuk dua teknik ini **tetap ada di file asli** — tidak disalin ke sini supaya tidak ada dua sumber kebenaran:

- **Sentence-window retrieval** — [PF-AI006-advanced-rag-patterns-todo.md](PF-AI006-advanced-rag-patterns-todo.md) STEP 4: tabel `statement_chunks` (bagian 2 dari migration STEP 2), `backfill_statement_chunks.py`, `doc_retriever.py` (`DocumentRetriever`), `test_doc_retriever.py`.
- **Auto-merging retrieval** — STEP 5: hierarki `parent_id`/`level`/`sibling_count`, `auto_merger.py` (`AutoMergingRetriever`, threshold 0.5, kandidat `top_k * 3`), `test_auto_merger.py`.
- **Eval varian `sentence_window`** — bagian dari STEP 6 yang khusus varian ini.
- Versi belajar (bahasa Indonesia): [PF-AI006-advanced-rag-patterns-todo-id.md](PF-AI006-advanced-rag-patterns-todo-id.md), bagian "Masalah 2", "Masalah 3", "Sentence-Window Retrieval", "Auto-Merging".

## Prasyarat sebelum dieksekusi

1. PF-AI006 (Hybrid Search) selesai — angka eval `vector` vs `bm25` vs `hybrid` sudah tercatat.
2. Keputusan produk: apakah `/ask` memang mau diperluas ke pertanyaan level dokumen/statement? Kalau tidak, plan ini tetap bisa jalan sebagai exercise murni — tapi tanpa integrasi ke `/ask` produksi, cukup sampai eval harness.
3. Migration `statement_chunks` (bagian 2 STEP 2 file asli) baru dibuat di sini, bukan di PF-AI006.

## Catatan konteks

- `sentence_window_chunks()` di [chunker.py](../../../services/ai-service/app/services/chunker.py) sudah dibangun dan lulus test sejak Chapter 4 — plan ini yang menyalakannya.
- Chat UI saat ini menampilkan badge "Beta · Transaksi" (AiChatPanel.tsx + ChatPage.tsx) — kalau plan ini jadi diintegrasikan ke `/ask`, badge itu ikut di-update.
- Chapter 7 (PF-AI007 agents) semula direncanakan memakai `DocumentRetriever`/`AutoMergingRetriever` sebagai tools — kalau plan ini masih deferred saat Chapter 7 mulai, agent cukup pakai retriever transaksi yang ada.
