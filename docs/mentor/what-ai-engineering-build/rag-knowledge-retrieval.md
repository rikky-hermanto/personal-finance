# RAG Systems for Knowledge Retrieval

> **Topic doc, not a plan.** This compiles one line from the [AI-First skills field
> guide](https://github.com/alexeygrigorev/ai-engineering-field-guide/blob/main/role/02-skills.md)
> — *"Build RAG (Retrieval-Augmented Generation) system for knowledge retrieval,"* the item that
> opens the list of what the 4,874 AI-First job postings that guide surveys ask an AI Engineer to
> build. It covers what RAG actually is, why a plain LLM call can't do this job alone, and uses this
> project's own retrieval pipeline — already shipped and measured — as the worked example
> throughout. It does not assign build steps; those live in
> [PF-AI003](../../../.claude/plans/learning/PF-AI003-rag-embeddings-retrieval.md),
> [PF-AI004](../../../.claude/plans/learning/PF-AI004-rag-reranking-generation.md), and
> [PF-AI006](../../../.claude/plans/learning/PF-AI006-advanced-rag-patterns-todo.md).

---

## What it is

**Retrieval-Augmented Generation: look up the relevant facts first, then hand only those facts to
the LLM to write the answer from.** The model never answers from what it memorized during
training — it answers from a small set of documents fetched *for this specific question*, at the
moment the question is asked. That's the whole idea; everything else (embeddings, chunking,
re-ranking, hybrid search) is the machinery that makes the "look up the relevant facts" step good
enough to trust.

The problem it solves is concrete, not academic. Before this project had `/search` or `/ask`,
finding a transaction meant scrolling the transactions table or filtering by exact category/date.
A BCA row often looks like `description = "DEBIT"` with the category-rule engine separately
setting `category = "Food & Dining"` — a keyword filter for `"food spending"` shares zero words
with `"DEBIT"` and returns nothing, even though that row is exactly what the user meant. An LLM
asked the same question with no data attached would either say "I don't have access to your
transactions" (the honest failure) or *invent* a plausible-sounding number (the dangerous one) —
neither is acceptable in a finance product where FIN-05 requires every LLM-touched figure to be
traceable. RAG is the fix: retrieve the transactions that actually match "food spending" by
*meaning*, not by shared words, then let the LLM narrate only from those rows.

### Why this is the highest-demand item on the list

Of the five things the field guide's AI-First postings ask for — RAG, agents, fine-tuning, model
serving, prompt engineering — RAG is the one that shows up in the largest share of postings because
it's the answer to the single most common enterprise AI question: *"how do I get an LLM to answer
correctly about data it was never trained on, without retraining it?"* Fine-tuning is expensive and
goes stale the moment the underlying data changes; RAG stays current because the index updates
independently of the model. That's why this is usually the first AI capability a company builds,
and why interviewers ask about it more than any other item on this list.

---

## The helicopter view

RAG runs in two phases that happen at completely different times — this split is the first thing to
internalize, because conflating them is the most common beginner mistake:

```
INDEX TIME (once per transaction, at upload)          QUERY TIME (every question, live)
──────────────────────────────────────────           ────────────────────────────────
transaction row                                        user question
     │                                                       │
     ▼                                                       ▼
compose search_text                                    embed the query
("DEBIT TRANSFER | Groceries | BCA")                   (same embedding model)
     │                                                       │
     ▼                                                       ▼
embed → vector (1536-dim)                              vector search (pgvector cosine)
     │                                                  + optional BM25 keyword search
     ▼                                                       │
store in transaction_embeddings                              ▼
(pgvector column)                                      cross-encoder re-rank (top-10 → top-3)
                                                              │
                                                              ▼
                                                        LLM synthesizes an answer
                                                        FROM ONLY those top-3 rows,
                                                        citing transaction ids
                                                              │
                                                              ▼
                                                          answer + citations
```

Index time is cheap to get wrong and expensive to fix later — every downstream query depends on
what got embedded and how. Query time is where the visible product behavior lives, and it's also
where most of the tunable knobs are (how many candidates to fetch, whether to rerank, which search
mode to use).

---

## Part 1 — The concept ladder: from keyword match to grounded synthesis

Each stage below is a real thing this project tried or shipped, in the order it had to be built —
not a list of options to pick from.

**Keyword search — the version already in the app before RAG existed.** Filter with
`description ILIKE '%makan%'`, or route through the existing 106-rule category matcher. It works
exactly as long as the query shares an exact word with the stored text.

> **The wall:** a query for `"food spending"` against a row whose only text is literally `"DEBIT"`
> returns nothing. Keyword matching has no notion that "food spending" and "Groceries" mean the
> same thing.

**Embeddings + vector search.** An embedding model turns text into a vector — a list of numbers
positioned so that semantically similar text ends up nearby in that vector space, regardless of
which literal words were used. This project's [`EmbedItem.search_text()`](../../../services/ai-service/app/services/embedder.py)
composes `description | remarks | category | wallet` before embedding — deliberately including the
*category* the rule engine already assigned, so a terse bank code like `"DEBIT TRANSFER BCA"`
still carries the semantic signal "Groceries" into its vector, even though that word never appears
in the raw bank text. Vectors are stored in Postgres via `pgvector`
([transaction_embeddings table](../../../services/ai-service/app/services/embedder.py)), and a
query is answered by cosine-similarity search — `1 - (embedding <=> query_vector)` — over that
column, in [`RetrievalService._search_vector`](../../../services/ai-service/app/services/retriever.py).

> **The wall:** vector search is *fuzzy by design* — great for `"belanja makan siang"` (semantically
> close to "Groceries", "Food & Dining"), weak on a query where the exact keyword is the whole
> signal. `"tagihan listrik PLN"` should hit the row containing "PLN" verbatim, ranked #1, every
> time — but a bi-encoder embedding doesn't guarantee that a literal substring match wins.

**Hybrid search — vector + BM25, merged by Reciprocal Rank Fusion.** Run PostgreSQL's `tsvector`
BM25-style ranking (`ts_rank` over an `to_tsquery`) *and* the vector search in parallel, then merge
the two ranked lists with RRF — `score = 1/(k + rank)` per list, summed — instead of trying to
average two incomparable score scales (cosine similarity is bounded 0–1; `ts_rank` is unbounded and
log-scaled, so a naive weighted average like `0.7 * cosine + 0.3 * bm25` is comparing apples to an
unrelated unit). See [`_rrf_merge`](../../../services/ai-service/app/services/retriever.py) and
`search_mode="hybrid"` in the same file.

> **The wall — and a real result, not a guess:** hybrid *should* win on keyword-rich Indonesian bank
> descriptions. On this project's actual eval (4,467 real transactions, 10 baseline + 5 adversarial
> keyword-heavy queries), it didn't: **vector scored MRR@5 0.771 / P@5 0.533; hybrid scored 0.750 /
> 0.467** — worse on both metrics on this corpus. The eval is the only way to know that; intuition
> said hybrid should win, and it was measured to lose. `search_mode="vector"` stayed the production
> default for `/ask`, with the losing result documented rather than discarded.

**Cross-encoder re-ranking — a second, more expensive pass over fewer candidates.** A bi-encoder
(the embedding model above) scores query and document *independently*, then compares vectors —
fast, but it never lets the query and the document attend to each other directly. A cross-encoder
takes the query and one candidate *together* as a single input and scores that pair — slower (it
can't be precomputed and cached like a document embedding can), so it only runs on a small
shortlist the first pass already narrowed down. This project's
[`RerankerService`](../../../services/ai-service/app/services/reranker.py) runs FlashRank's local
`ms-marco-MiniLM-L-12-v2` cross-encoder (CPU, no API key, deterministic) over the top-10 vector
candidates and keeps the top-3.

> **The wall — another measured result:** on this same eval, adding rerank *on top of* vector
> actually **dropped** the score — vector+rerank measured 0.625/0.467 vs vector-alone's 0.771/0.533.
> Re-ranking is not a free accuracy boost; it can hurt when the first-pass retriever was already
> strong and the cross-encoder's training distribution doesn't match this corpus (short, terse
> Indonesian bank strings). This is the same "measure it, don't assume it" lesson as hybrid search,
> from the opposite direction — a technique with good theoretical justification still needs its own
> number before it ships as a default. `/search`'s `rerank` flag stays optional and off by default
> for `/ask`; see [`answerer.py`](../../../services/ai-service/app/services/answerer.py) inline
> comment citing the eval.

**Grounded generation — the LLM writes only from what was retrieved.** The final step hands the
top-3 (or top-10, pre-rerank) rows to the LLM as numbered context and instructs it, under a
temperature-0 structured-output schema, to answer *only* from those rows, cite them by
`transaction_id`, and set `confident=false` rather than guess if the context doesn't contain the
answer. *This is what ships* as `/ask`'s lookup path. → **▶ Read for this:** Pinecone's
[What is RAG?](https://www.pinecone.io/learn/retrieval-augmented-generation/) walks the same
retrieve→augment→generate shape from first principles.

**Teaser, not built by this doc:** the next rung this project climbed is *routing by intent before
retrieving at all* — see Part 2.

---

## Part 2 — The gotcha nobody's RAG tutorial mentions: retrieval is the wrong tool for arithmetic

Retrieval finds *rows*. It cannot *sum* them. "How much did I spend on Groceries in March?" is not
a lookup question — it's an aggregate question, and no amount of better retrieval fixes an LLM
being asked to eyeball 10 retrieved rows and add them up in its head. This project's
[`QueryPlanner`](../../../services/ai-service/app/services/query_planner.py) runs one cheap
structured-extraction call per question that classifies `intent: "aggregate" | "lookup"` and
extracts typed filters (dates, a closed-vocabulary category list, `flow`) *before* deciding which
path to take:

```
question ──▶ QueryPlanner (temp=0, classify + extract filters)
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
   intent=aggregate        intent=lookup
        │                       │
        ▼                       ▼
   SQL SUM/COUNT           vector search → rerank → top-3
   (Postgres computes            │
    the real number)             ▼
        │                  LLM synthesizes answer,
        ▼                  citing transaction ids
   LLM only narrates
   the number Postgres
   already computed
        │
        └───────────┬───────────┘
                     ▼
              answer + citations
        (total_idr rides in the payload,
         not just the prose — a disobedient
         narration can't corrupt the UI number)
```

See [`AnswerService._answer_aggregate` vs `_answer_lookup`](../../../services/ai-service/app/services/answerer.py).
The closed-vocabulary guard in `QueryPlanner.plan()` is worth calling out on its own: the model is
given the *actual* list of category names that exist in the database and told never to invent one;
anything it returns outside that list gets logged and dropped before it ever reaches a SQL filter.
**The general lesson:** a RAG system answering questions over structured/numeric data needs a
routing layer that sends "how much" questions to deterministic computation and "which transaction"
questions to retrieval — treating every question as a retrieval problem produces confident, wrong
arithmetic. FIN-01 (money is `Decimal`, never summed by an LLM) and FIN-04 (never let something
render as correct that wasn't actually verified) both land here directly: the aggregate path's
`verified=True` flag is set only when SQL computed the number, and the lookup path's `verified`
flag is `bool(citations)` — an uncited answer is explicitly marked unverifiable, not silently
trusted.

---

## Part 3 — What actually goes wrong (and did, in this project)

**1. A technique with a strong theoretical case can still measure worse on your actual data.**
Both hybrid search and cross-encoder re-ranking are standard "best practice" advice in nearly every
RAG tutorial — and both underperformed pure vector search on this project's real corpus and real
query set. The fix wasn't picking a side in advance; it was building
[`evals/eval_retrieval.py`](../../../.claude/plans/learning/PF-AI006-advanced-rag-patterns-todo.md)
and running every variant against the same 15 queries (10 realistic + 5 deliberately keyword-heavy
adversarial ones) before choosing a production default. **The general lesson: never ship a
retrieval technique because a blog post recommends it — ship the technique the eval actually
prefers on your data, and keep the losing numbers in the record so nobody re-litigates the same
question from memory next quarter.**

**2. A homogeneous eval set hides exactly the case a technique was built to fix.** If all 10
baseline eval queries are semantic (`"belanja makan siang"`), hybrid search never gets credit even
when it *should* win — BM25 only pays off on queries where the literal keyword is the whole signal
(`"tagihan listrik PLN"`). The fix was deliberately adding 5 adversarial keyword-heavy queries to
the eval set specifically to give the technique being tested a fair chance to show its strength.
**The general lesson: design your eval set to include the cases your candidate techniques are
*supposed* to be good at, or the eval will systematically favor whatever was already the default.**

**3. Combining two differently-scaled scores by weighted average is a silent correctness bug.**
`0.7 * cosine_similarity + 0.3 * ts_rank` looks reasonable until you notice `cosine_similarity` is
bounded [0, 1] and `ts_rank` is unbounded and log-scaled — the weights aren't actually controlling
what they appear to control, because one term can dwarf the other depending on document length and
term rarity. RRF sidesteps the whole problem by working on *rank position* (1st, 2nd, 3rd...)
instead of raw score, which is scale-free by construction. **The general lesson: never average
scores from two different ranking systems without first checking they live on the same scale — rank
fusion (RRF) is the standard fix when they don't.**

**4. Citing a hallucinated ID is a distinct failure mode from citing the wrong row.** The LLM's
final synthesis step is asked to return `cited_transaction_ids` alongside the prose answer.
[`_answer_lookup`](../../../services/ai-service/app/services/answerer.py) validates every returned
id against the actual retrieved set (`by_id = {r.transaction_id: ...}`) and silently drops (with a
logged warning) any id the model invented rather than trusting it. **The general lesson: a citation
mechanism is only a real guardrail if something downstream checks the citation is real — an LLM
free to name any integer as a `transaction_id` will occasionally do exactly that.**

---

## Part 4 — Observability, and why a RAG system without it is undebuggable

A RAG answer has (at minimum) three independent places to go wrong: the retriever fetched the wrong
rows, the reranker demoted the right one, or the LLM ignored good context and answered from its own
memory anyway. Without per-stage visibility, a wrong answer only tells you *that* something failed,
not *which* stage.

This project's `AnswerService` measures `retrieval_ms` and `generation_ms` separately on every
response (visible in the `AskResponse` payload itself, not just a log line), and every embedding
call and LLM generation is traced through Langfuse
([`embedder.py`](../../../services/ai-service/app/services/embedder.py) wraps
`embed_and_store` in a `langfuse.start_observation(as_type="generation", ...)` span with real
token counts and cost). The eval harness
([`eval_retrieval.py`](../../../.claude/plans/learning/PF-AI006-advanced-rag-patterns-todo.md))
is the other half of this: a number (MRR@5, P@5) that can be re-run after *any* change to the
pipeline — chunking, embedding model, search mode — to catch a regression before it reaches a user.
**The general rule: build the eval harness in the same chapter as the first retrieval endpoint, not
after — "does this look right" from eyeballing a few queries is not a substitute for a number you
can diff.**

---

## Where this shows up in this project

| Component | What it does | Location |
|---|---|---|
| `EmbeddingService` | Composes enriched search text (description + remarks + category + wallet), embeds, upserts to `transaction_embeddings` (pgvector) | [embedder.py](../../../services/ai-service/app/services/embedder.py) |
| `RetrievalService` | Vector / BM25 / hybrid (RRF) search over embeddings, with category/account/date filters | [retriever.py](../../../services/ai-service/app/services/retriever.py) |
| `RerankerService` | FlashRank local cross-encoder, top-10 → top-3 (optional, off by default for `/ask` per the eval) | [reranker.py](../../../services/ai-service/app/services/reranker.py) |
| `QueryPlanner` | Classifies aggregate vs. lookup intent, extracts typed filters from a closed vocabulary | [query_planner.py](../../../services/ai-service/app/services/query_planner.py) |
| `AggregationService` | Deterministic SQL SUM/COUNT for aggregate questions — the LLM never does the arithmetic | [aggregator.py](../../../services/ai-service/app/services/aggregator.py) |
| `AnswerService` | Routes intent → aggregate/lookup, synthesizes grounded answer with validated citations | [answerer.py](../../../services/ai-service/app/services/answerer.py) |
| `POST /search`, `POST /ask`, `POST /ask/stream` | Public endpoints — raw retrieval, routed grounded Q&A, and SSE-streamed grounded Q&A | [main.py](../../../services/ai-service/app/main.py) |
| Retrieval eval harness | MRR@5 / P@5 across search modes, on real data | [PF-AI006 evals/eval_retrieval.py](../../../.claude/plans/learning/PF-AI006-advanced-rag-patterns-todo.md) |

**Natural next targets for this pattern**, not yet built: extending semantic search into the
Investment module (retrieving relevant portfolio commentary or instrument facts before the AI
portfolio review writes its narrative, instead of that review's current single-call approach); a
`get_transactions_semantic` MCP tool exposing this same retriever to an external MCP client
(tracked in PF-AI009).

---

## What you should be able to say in an interview

> *"I built a RAG pipeline over ~4,500 real Indonesian bank transactions: embeddings stored in
> pgvector, retrieval that supports vector, BM25, and hybrid (RRF-merged) search modes, an optional
> FlashRank cross-encoder rerank stage, and a query planner that routes each question to either
> deterministic SQL aggregation or LLM-synthesized grounded lookup with validated citations. The
> part I'd lead with in an interview isn't the pipeline shape — it's that I built an eval harness
> (MRR@5, P@5 over 15 queries including adversarial keyword-heavy ones) and used it to *disprove*
> my own assumptions: hybrid search and cross-encoder reranking both underperformed plain vector
> search on this corpus, so plain vector stayed the production default. I kept the losing numbers
> documented rather than discarding them, because the next person touching this shouldn't have to
> re-run the experiment from scratch to learn what I already know."*

Two follow-ups worth having an answer ready for:

- *"How do you keep the LLM from hallucinating an answer when retrieval comes up empty?"* → The
  system prompt requires `confident=false` when the context doesn't contain the answer, citations
  are validated against the actual retrieved set (invented ids are dropped and logged), and the
  response carries an explicit `verified` flag computed from whether real citations exist — not
  from whether the LLM *said* it was confident.
- *"Why not just always use hybrid search — isn't more signal always better?"* → Not when the two
  scores are on incomparable scales and the eval shows it losing on your actual data; more signal
  sources add complexity and latency that has to earn its place with a number, not an assumption.

---

## Common mistakes

1. **Treating every question as a retrieval problem.** "How much did I spend on X" is arithmetic,
   not lookup — retrieving the top-k rows and asking the LLM to eyeball-sum them produces confident,
   wrong numbers. Route aggregate questions to deterministic SQL.
2. **Averaging two ranking scores that live on different scales** (bounded cosine similarity vs.
   unbounded log-scale BM25) instead of merging by rank (RRF).
3. **Assuming re-ranking always helps.** It's a real technique with real wins on many corpora, but
   it's not free — measure it against the baseline it's supposed to improve before defaulting to it.
4. **Building an eval set that only tests the case you already expect to win.** A homogeneous query
   set can't reveal a technique's actual complementary strength — or its actual weakness.
5. **Trusting an LLM's self-reported citation without validating it against the retrieved set.** A
   free-text `cited_transaction_ids` field can contain an id that was never in the context at all.
6. **Skipping the enrichment step at embedding time.** Embedding a terse bank string
   (`"DEBIT TRANSFER BCA"`) alone loses the semantic signal a human would infer from context;
   composing `description | remarks | category | wallet` before embedding recovers it.

---

## Resources

- Pinecone — What is Retrieval-Augmented Generation? → https://www.pinecone.io/learn/retrieval-augmented-generation/ — the canonical retrieve→augment→generate walkthrough
- pgvector docs → https://github.com/pgvector/pgvector — the Postgres extension this project's vector search runs on directly, no separate vector database
- Cormack, Clarke, Buettcher — Reciprocal Rank Fusion (2009) → https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf — the paper behind `_rrf_merge`
- FlashRank → https://github.com/PrithivirajDamodaran/FlashRank — the local cross-encoder reranker used here, no API key or rate limit
- Eugene Yan — Patterns for LLM Systems → https://eugeneyan.com/writing/llm-patterns/ — ties MRR/NDCG retrieval metrics to the recall-vs-precision framing used in this doc's eval numbers

**Project-local**
- [PF-AI003-rag-embeddings-retrieval.md](../../../.claude/plans/learning/PF-AI003-rag-embeddings-retrieval.md) — the full build plan for embeddings + vector retrieval
- [PF-AI004-rag-reranking-generation.md](../../../.claude/plans/learning/PF-AI004-rag-reranking-generation.md) — reranking + grounded generation with citations
- [PF-AI006-advanced-rag-patterns-todo.md](../../../.claude/plans/learning/PF-AI006-advanced-rag-patterns-todo.md) — hybrid search, the full MRR@5/P@5 comparison table, and the adversarial-query eval design
- [app/services/](../../../services/ai-service/app/services/) — the real retriever, reranker, planner, aggregator, and answerer code

---

## Self-check

1. Why can't the aggregate path for "how much did I spend on Groceries" just retrieve the top-10
   matching transactions and ask the LLM to sum them?
2. This project measured hybrid search *losing* to pure vector search on its own data. What does
   that imply about following generic RAG best-practice advice without an eval?
3. Why is Reciprocal Rank Fusion used to merge vector and BM25 results instead of a weighted average
   of their raw scores?
4. What's the difference between a bi-encoder (used for the first retrieval pass) and a
   cross-encoder (used for reranking), and why does that difference explain why reranking can only
   run on a small shortlist, not the whole corpus?
5. `EmbedItem.search_text()` includes `category` and `wallet` alongside the raw `description`
   before embedding. What specific real-world row shape does this fix?
6. What happens in `_answer_lookup` if the LLM returns a `cited_transaction_ids` value that was
   never actually in the retrieved context — and why does that check matter for a finance product?
