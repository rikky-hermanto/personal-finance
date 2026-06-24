# Extraction Eval Harness

Measures real extraction accuracy of GeminiProvider / AnthropicProvider against a
hand-labeled golden dataset. **NOT part of pytest/CI** — it makes real, paid API calls.

## Eval Mental Model

| Level | What | Tool |
|-------|------|------|
| Unit Tests | Mock LLM calls — prove pipeline plumbing (routing, error handling, field mapping) | `pytest` |
| Eval Harness | Real API calls — prove extraction correctness against hand-labeled fixtures | `eval_extraction.py` |

Unit tests prove the code runs. Evals prove the model extracts correctly. A test that mocks
the LLM cannot catch field type mismatches, enum serialization bugs, or model-specific
output format drift — only a real run against labeled fixtures can.

## Directory Structure

```
evals/
  eval_extraction.py     — runner (real API calls — NOT CI)
  scoring.py             — row-level F1 + field accuracy scorer
  fixtures/              — input text (one .txt per fixture, 20 total)
  ground_truth/          — expected output (one .json per fixture)
  results/               — dated result files: YYYYMMDD-eval-results.md
```

## Fixtures

20 hand-labeled fixtures across 4 formats:

| Bank | Fixtures | Format |
|------|----------|--------|
| BCA | bca_01–05 | CSV-derived text |
| NeoBank | neobank_01–05 | PDF text |
| Superbank | superbank_01–05 | Multi-page PDF |
| Screenshot | screenshot_01–03 | OCR vision |
| Edge cases | edge_01–02 | Adversarial rows (refunds, splits) |

## Running

```bash
# Single provider
python evals/eval_extraction.py --provider gemini
python evals/eval_extraction.py --provider anthropic --model claude-sonnet-4-6

# Side-by-side comparison (both providers in one result file)
python evals/eval_extraction.py --compare

# Print only — skip writing to results/
python evals/eval_extraction.py --provider gemini --no-save
```

## Results Convention

Every run **auto-saves** to `evals/results/YYYYMMDD-eval-results.md`.

After each run:
1. Open the generated file in `evals/results/`
2. Fill in the **Failure Modes** section with any field mismatches or errors observed
3. Add notes on prompt changes, model version differences, or next steps
4. Commit the results file alongside any code changes that prompted the re-run

**Naming:** `YYYYMMDD-eval-results.md` — one file per run date. Use `--compare` to capture
both providers in a single file. If a second run is needed on the same day, add a manual
suffix (e.g. `20260605-eval-results-v2.md`).

## Scoring

- **Row F1:** precision × recall on transaction count — did the model find all rows without adding phantom ones?
- **Critical-field accuracy:** `date`, `amount_idr`, `flow` — wrong values here corrupt the database
- **All-field accuracy:** all 9 `TransactionDto` fields

A model can score F1=1.00 (right row count) with low critical-field accuracy if it
consistently gets `flow` (DB/CR) wrong. The harness separates these to make that failure
mode visible rather than averaging it away.

---

## Embedding mental model (written from memory)

**What is an embedding?**
An embedding is a dense vector in a high-dimensional space (e.g. 1536 dimensions) where semantic similarity between texts is preserved as geometric proximity — similar texts produce vectors with a small angular distance (high cosine similarity).

**Why does cosine distance work for semantic similarity?**
When a model trains on large text corpora, it learns to place semantically similar texts near each other in the embedding space — "food", "makan", and "GoFood" cluster together even without exact string overlap. Cosine distance (angle between vectors) captures this directional similarity regardless of vector magnitude, making it more robust than Euclidean distance for text. Two texts about food spending will point in similar directions in the 1536-dim space; two texts about completely different topics will point in opposite directions.

**What text should you embed for a transaction — raw `description` alone, or `description + remarks + category + wallet`?**
Embed `description + remarks + category + wallet`. The raw description from a BCA statement is often a terse code like `"DEBIT TRANSFER"` or `"DEBIT"` — there is zero semantic signal for a query like "food spending in March". The category set by the rule engine (`"Food & Dining"`) IS the semantic signal. By appending it to the embedding text, a query for "food" now finds the right transactions even when the raw description is opaque. The wallet adds bank-level filtering ("BCA transactions"). The asymmetry is intentional: documents get the enriched form; queries stay natural language.

## Re-ranking mental model (written from memory)

**Why can't the bi-encoder (embedding) score be as accurate as the cross-encoder score?**
A bi-encoder embeds the query and every document *independently* — it never sees them together. By the time you search, all it can do is compare two pre-computed points in vector space (cosine distance). It has no way to reason about whether the specific overlap between "makan" and "makanan ternak" actually matters, because it committed to a representation for each text before the other one ever existed. A cross-encoder reads the query and a single candidate document *together*, in one forward pass — the attention layers can directly weigh tokens from both sides against each other, so it can notice that "ternak" (livestock) flips the meaning even though "makan" is a shared substring. That joint attention is exactly what a bi-encoder structurally cannot do, no matter how good its training data is.

**Why is the standard pattern "retrieve 10 with the fast model, re-rank with the slow model" instead of cross-encoding the whole table?**
A cross-encoder pays for that joint attention with cost: it has to run a full forward pass for every (query, document) pair, so it cannot be pre-computed the way embeddings can. Scoring an entire table of thousands of transactions per query would be far too slow for an interactive request. The bi-encoder is cheap precisely because the document embeddings are computed once, offline, and stored — at query time it's just a vector index lookup. So the funnel exists to get the best of both: the cheap bi-encoder narrows millions of candidates down to a manageable handful (top-10) fast, and the expensive cross-encoder only has to do its precise-but-slow scoring on that small set.

**What does "ms-marco" in the model name refer to, and why does that matter for *my* Indonesian-language transactions?**
MS MARCO (Microsoft Machine Reading Comprehension) is a large-scale English question-answering/passage-ranking dataset built from real Bing search queries — it's the dataset most public cross-encoder rerankers (including FlashRank's `ms-marco-MiniLM-L-12-v2`) are trained on. That means the model's notion of "this passage answers this query" was learned almost entirely from English text. My transaction descriptions and queries are a mix of Indonesian and English ("berapa pengeluaran makan bulan Maret", "GOFOOD GEPREK BENSU GADING") — a model with no Indonesian training signal may re-rank correctly on surface lexical overlap but miss semantic nuance the same way it would on any out-of-distribution language. This is the reason Step 5 explicitly treats a disappointing P@5 delta as a possible language-mismatch finding rather than a broken re-ranker, and why FlashRank's multilingual model option is the documented fallback rather than a silent failure.

**Verified, not hypothetical (2026-06-17):** ran `RerankerService.rerank("makan", [...])` for real (no mocks) against three candidates — `"TRANSFER DEBET SEWA BULANAN"`, `"GOFOOD GEPREK BENSU GADING"` (food delivery — relevant), and `"MAKANAN TERNAK SAPI BERKAH"` (cattle feed — irrelevant, shares the "makan" root). `ms-marco-MiniLM-L-12-v2` ranked the cattle-feed transaction **first**, ahead of the actual food-delivery order — exactly the lexical-overlap trap this section predicts for an English-trained cross-encoder on an Indonesian query. This is real evidence the language mismatch is not a remote risk for this corpus; Step 5's `--rerank` P@5 number (once Supabase is reachable) should be read with this in mind, and the multilingual FlashRank model is the first thing to try if the lift disappoints.
