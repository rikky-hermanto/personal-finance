# Learning material style

Rikky's standing corrections for everything written in the AI-engineering learning track.
The full writing spec lives in the mentor skill (`.agents/skills/mentor/SKILL.md`, section "Learning Material Style (versi belajar)") and in `tech-write materi-id`. This file keeps the lessons behind them.

## Pick one spec per artifact — don't mix them

| Artifact | Spec |
|---|---|
| PF-AIxxx plan file | Plan anatomy: TOC → Introduction → Implementation → Knowledge Check |
| `-id` companion ("versi belajar") | The 8 fixed Indonesian headings below |
| `docs/mentor/{topic}.md` topic doc | Define first (see "Topic docs") |
| Blog draft | Blog rules. "No preamble, first sentence is the hook" applies to blog posts **only** |

## Versi belajar (`{plan}-id.md`, next to the plan)

- Headings in exactly this order, never numbered: **Apa Masalah yang Ingin Diselesaikan? → Konsep Sederhananya → Cara Kerjanya → Implementasi → Optimisasi → Best Practice → Kesalahan Umum → Summary**. Cross-reference by section name.
- **Cara Kerjanya** walks each concept from the simplest approach to the one that ships. Each approach gets a bold lead-in that *names what it is* (e.g. **"SSE (koneksi tetap terbuka)"**). A sentence naming the limit that forces the next approach links each one to the next. The last approach ends with "*Ini yang dipakai chapter ini*".
- **Kesalahan Umum** lists only bugs that really happened.
- Link a domain term on its first use in each section to the shared glossary [glossary-rag-id.md](../../plans/resources/learning/glossary-rag-id.md). Extend that glossary; never make per-chapter ones.
- Canonical example: [PF-AI004-rag-reranking-generation-id.md](../../plans/done/learning/PF-AI004-rag-reranking-generation-id.md).

## Never show the method

- No ordinal labels anywhere, in English or Indonesian: no "Level X", "Versi 0/1/2", "Rung N", "Stage N", "Step N", "Version N".
- Never print the technique's own name ("the ladder", "rung", "progressive learning", "concept ladder") as a heading or phrase. The reader should feel the progression, not be told about it. Headings name the subject.
- Don't repeat one transition word ("Masalahnya:" ×7, `> **The wall:**`). Vary the move each time: a concession ("Ganjalannya,", "Celakanya,"), a contrast ("Cocok untuk X, buntu untuk Y:"), a reveal ("Ada jebakan halus di sini:"), or a "sounded done until…" beat. Use blockquotes only for real asides.

## Natural Indonesian

- Target register: a classroom discussion, casual but educated. If it sounds like a government document or a textbook subtitle, rewrite it.
- **Translate meaning, not words.** Understand the sentence, throw away its shape, and say it the way a native dev would. "Jalur Tercepat Menuju Penguasaan" ✗ → "Cara cepat jadi Mahir" ✓.
- Word choice: ngukur (not menilai), bikin/bangun, keluar (not menghasilkan), kebongkar, jebol, bolong, mastiin, "dari dua sisi" (not "di dua sumbu"). Spoken markers are welcome: kan, kayak, misal, nggak, udah, gimana, bener, doang.
- Keep dev terms in English: eval, harness, ground truth, fixture, prompt, provider, extraction.
- **Structure matters more than vocabulary.** Put at most 2 pieces of information in a sentence. Finish an analogy in 2–3 sentences, *then* map it to the tech term, never as a parenthesis mid-analogy. Avoid English sentence shapes like "Cara X-nya bukan A, tapi B: itulah C". If a paragraph needs two reads, rewrite it.
- This applies to all Indonesian prose you write, including summaries and explanations, not just translations.

## Topic docs (`docs/mentor/{topic}.md`)

1. `## What it is`: a plain definition in the first two sentences, then a real artifact from this codebase, then one sentence on why it matters.
2. `### What it's used for`: concrete jobs in this project, ideally as a table.
3. Only then any contrarian angle.

A hook is fine, but it must carry a verified fact about this repo (a count, a measured number, a real failure), never "X is not what people think". Check the fact (`git log -p`) before it ships.

## Progress log (`docs/mentor/progress.md`)

- Log only what was actually done that session: commits, code, reading. Never name future-chapter topics as if they were dropped. If the curriculum changed, say "restructured the plan". If unsure, check git log for that session.
