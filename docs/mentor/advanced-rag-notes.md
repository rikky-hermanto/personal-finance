# Advanced RAG Patterns — What I Learned (Chapter 6, PF-AI006)

> **Re-scope note:** this chapter was cut down to hybrid search only. Sentence-window retrieval
> and auto-merging were deferred to [PF-AI006-PART2](../../.claude/plans/learning/PF-AI006-PART2-sentence-window-automerging-todo.md)
> — they need statement-PDF narrative text as a data source, which isn't a product need yet. The
> stubs for those two techniques stay below for when PART2 ships; only the Hybrid Search section
> reflects work actually done in this ticket.

## Hybrid Search (BM25 + Vector + RRF)

Combining rank *positions* is safer than combining raw scores because the two searchers don't
live on the same number line — pgvector cosine similarity is bounded `[0,1]`, but PostgreSQL's
`ts_rank` is an unbounded log-frequency weight whose actual range shifts per query. A fixed
`0.7 * vector + 0.3 * bm25` blend has no principled way to pick 0.7 — for one query BM25's raw
score might be 0.02, for another 4.5, and the weighted sum silently lets one searcher dominate or
vanish depending on the query's term rarity. RRF sidesteps this: each list is ranked independently,
then combined as `1/(k + rank)` — rank positions are always comparable integers (1, 2, 3…)
regardless of what produced them. `k=60` (Cormack et al., SIGIR 2009) controls how much a
document's score decays as it moves down a list; it's a smoothing constant tuned on TREC-scale
corpora, not something this project needed to re-tune. BM25 contributes exact-keyword precision
that embeddings genuinely lack — the Chapter-3 baseline in this doc already shows `tagihan listrik
PLN` failing to rank correctly (`MRR=0.00`) because `PLN` carries no special weight in cosine
space; `to_tsquery('simple', 'pln')` against a GIN index finds it in a fraction of a millisecond
because the token is either present or absent. Vector search wins the opposite case — paraphrases
like "boros" (wasteful) or "makan siang di kantor" where the description says `WARUNG` or `RESTO`,
terms BM25 has zero overlap with. **Measured result (2026-07-24, live, 4,467 transactions): hybrid
did NOT beat vector on this corpus** — MRR@5 0.750 vs 0.771, P@5 0.467 vs 0.533 (full table in
`docs/performances/ai-observability-metrics.md`). This falsified my working assumption going in.
The reason, visible in the per-query breakdown: this project's embedding text is
`description | remarks | category | wallet` — the category tag (`Electricity`) already gives the
embedding the keyword-equivalent signal that BM25 was supposed to add, so on `tagihan listrik PLN`
vector alone already scores a perfect P@5=1.00. RRF then does real damage on queries where BM25 has
*nothing* relevant to contribute (`makan siang di kantor` — zero keyword overlap with `WARUNG`) but
still injects its top candidates into the merged list, **displacing** a vector hit that was already
correct (that query's MRR dropped from 0.25 to 0.00 under hybrid). The lesson: RRF's complementarity
argument only pays off when the two searchers are actually looking at different signal — here, the
category tag had already collapsed BM25's unique contribution into the embedding, so merging just
added noise. `bm25` alone is the weakest mode (MRR 0.433) because most eval queries are
semantic/category questions (`grocery`, `salary`) with no literal keyword match in the descriptions
at all. Also worth recording: the first live run scored `bm25` at a flat 0.000 across every
query — not a data problem but a real bug, `plainto_tsquery` ANDs every query word, so a 5-word
natural-language question never matches a 2-4 word bank description. Fixed by OR-joining tokens
before `to_tsquery` (mocked unit tests couldn't have caught this — they assert SQL shape, not real
match behavior against real data).

## Sentence-Window Retrieval

*(Deferred to PART2 — not implemented in this ticket.)* [1 paragraph: the "small-to-search,
big-to-read" principle; why transaction rows don't benefit (already one-liners) but statement PDFs
do; the trade-off between window_size (larger = more context = fewer precise matches); what you'd
do differently next time. Include latency impact vs baseline.]

## Auto-Merging Retrieval

*(Deferred to PART2 — not implemented in this ticket.)* [1 paragraph: how the sibling-threshold
decision works; when it helps vs when it over-merges (threshold too low = always returns
paragraphs even for unrelated sentences from the same paragraph); how the parent/child hierarchy is
built during indexing; what the eval showed. Include your merge_threshold choice and why.]

## Which won, and why

**Pure `vector` won — `SearchRequest.search_mode` stays defaulted to `vector`, not `hybrid`.** This
is the opposite of what I expected walking in, and it's the most useful outcome of the chapter
precisely because it's a measured correction, not a confirmed hunch. The 5 adversarial queries
added to `search_queries.json` did their job: they're what surfaced the real per-query mechanism
(BM25 injecting noise on `makan siang di kantor`, redundant signal on `tagihan listrik PLN`) instead
of a single macro-average number that would have hidden it. `hybrid` and `bm25` stay implemented and
selectable in `RetrievalService`/`SearchRequest` — they're not dead code, they're the right tool for
a *different* corpus: one where descriptions are the only signal (no category/wallet metadata baked
into the embedding), which is closer to what PART2's sentence-window `statement_chunks` will look
like. The transferable lesson for an interview: "I implemented hybrid search expecting an easy win
on Indonesian bank data, measured it against a real eval set with adversarial queries designed to
expose complementarity, and found the opposite — RRF actively hurt precision here because this
project's embedding scheme already encodes the metadata BM25 was supposed to add. Adding a technique
because the literature says so isn't the same as measuring whether *your* data needs it." That's a
stronger story than a clean win would have been.
