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
space; `plainto_tsquery('simple', 'PLN')` against a GIN index finds it in a fraction of a
millisecond because the token is either present or absent. Vector search wins the opposite case —
paraphrases like "boros" (wasteful) or "makan siang di kantor" where the description says `WARUNG`
or `RESTO`, terms BM25 has zero overlap with. Measured MRR/P@5 delta: **pending** — the local
Supabase stack wasn't running this session, so `eval_retrieval.py --all` hasn't produced live
numbers yet (see the pending table in `docs/performances/ai-observability-metrics.md`). The
`hybrid` default was chosen from the qualitative failure-mode evidence already on record (the
Chapter-3 PLN miss), not yet a measured lift — that's the first thing to fill in once infra is up.

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

For the scope actually shipped (hybrid vs. pure vector), `hybrid` was set as the production default
for `/search` and the `/ask` lookup path. The reasoning: Indonesian bank descriptions are
term-rich and brand-heavy (PLN, OVO, GoPay, Indihome) — exactly the case where BM25's exact-match
signal complements a multilingual embedding that treats "tagihan" (a bill) as the dominant
semantic feature over the specific brand name. The 5 adversarial queries added to
`search_queries.json` were built to make this complementarity visible in the numbers instead of
staying a hunch: one query BM25 should win outright (`tagihan listrik PLN`), one only vector can
win (`makan siang di kantor` — no keyword overlap with `WARUNG`/`RESTO`), and three stress-test
edge cases (English-language query, date-crossing query, semantically-empty adversarial query with
no matching vocabulary at all). Once the local stack is up, re-running `eval_retrieval.py --all`
and pasting the comparison table into the metrics doc is the next concrete step — that's what turns
"hybrid should win" into "hybrid won by +X P@5."
