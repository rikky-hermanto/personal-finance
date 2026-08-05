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

## Query routing mental model (written from memory)

**Why is a top-K retrieval result the wrong input for a SUM, even with perfect retrieval?**
Retrieval returns *K* rows — a bounded sample ranked by semantic similarity. A SUM is a
question about the **population**: every row matching the filter, not the K most-relevant ones.
Even a flawless retriever that returns the *K* genuinely-best rows still returns only K of them;
if the month has 43 matching food transactions and K=3, the sum of 3 is not the sum of 43. There
is no K that guarantees coverage — you can't prove a top-K contains *all* matches without already
knowing how many there are. Retrieval answers "which rows look like this query?"; aggregation
answers "what is the total over all rows that *are* this kind?" — different questions, and the
first can never stand in for the second. This is why the aggregate path bypasses embeddings
entirely and runs `SUM(amount_idr)` over the whole `transactions` table.

**Why generate filters instead of SQL? Name two failure classes filter-generation eliminates.**
The planner emits a *typed plan* — `{intent, date_from, date_to, categories}` where `categories`
must be chosen from a provided closed list — and trusted code compiles that to the same
parametrized WHERE-clause shape the retriever already uses. The model decides *what* to query, not
*how*. Two failure classes this removes by construction:
1. **SQL injection / unbounded queries** — the model never emits executable SQL, so a crafted
   query string can't become a cross-user read (once auth lands) or a table-scan DoS. Values are
   always bound parameters (`$1`, `$2`), never string-interpolated.
2. **Invented columns/categories** — free-text category output silently matches nothing
   (`"Makanan"` ≠ `"Food"`) and returns a confident **Rp 0**. Constraining `categories` to a
   set-membership check against the real DB vocabulary turns a hallucination into a validation
   no-op — anything the model invents is dropped before it reaches SQL.

**On the aggregate path, what is the LLM's remaining job, and what happens if it disobeys?**
The number is computed by Postgres *before* the LLM is ever called and injected into the prompt as
a verified constant ("The verified total is Rp 2,309,954 from 43 transactions — present this
figure, do not alter it"). The LLM's only job is **narration**: turn that constant into a fluent
one-to-three-sentence answer in the question's language. If it disobeys and writes a different
number, it doesn't matter — the response/`done` payload carries `total_idr` straight from the SQL
result, and the UI renders *that field*, not the prose. The trust boundary is structural: data
flows *around* the model, not *through* it. The prompt is a plea; the payload is enforcement.

---

# Categorization Eval Harness

Measures whether the LLM assigns the **right category** to a transaction. Separate from the
extraction harness: extraction asks "did you find the right set of rows", categorization asks
"for one input, did you pick the right label". **NOT part of pytest/CI** — real, paid API calls.

| Level | What | Tool |
|-------|------|------|
| Unit Tests | Mock LLM — prove `/categorize` plumbing and error fallback | `tests/test_categorize.py` |
| Scorer Tests | Pure math — accuracy, OOV, calibration | `tests/test_scoring_categorize.py` |
| Eval Harness | Real API calls — prove the model categorizes correctly | `eval_categorize.py` |

## Listing the cases

```bash
cd services/ai-service
PYTHONPATH=. python evals/eval_categorize.py --list
```

Prints every case id, description, flow, and expected category, plus the default category
vocabulary. Makes **no API calls** — safe to run any time.

## Adding or updating a case

Edit `evals/categorize_cases.json`. Append an object to `cases`:

```json
{
  "id": "grab_fee",
  "description": "Grab Fee",
  "remarks": "",
  "flow": "DB",
  "amount_idr": 15000,
  "account_name": "NeoBank",
  "expected": "Transportation"
}
```

| Key | Required | Meaning |
|-----|----------|---------|
| `id` | yes | Stable slug — appears in output, and `--filter` matches on it |
| `description` | yes | Merchant / transaction text as it appears on the statement |
| `flow` | yes | `"DB"` (money out) or `"CR"` (money in) |
| `amount_idr` | yes | Number, whole rupiah |
| `remarks` | no | Secondary statement text, default `""` |
| `account_name` | no | Bank name, default `""` |
| `expected` | one of | The single correct category |
| `expected_any` | one of | List of categories, any of which passes — use for genuinely ambiguous merchants |
| `available_categories` | no | Override the offered vocabulary for this case only |

**Rules for good cases:**
- Use a category string that exists in `default_categories` — a typo'd expectation fails 100% of runs and tells you nothing.
- Use `expected_any` when a human couldn't confidently pick one either. Forcing a single answer on an ambiguous input manufactures failures.
- Use `available_categories` to stress the constrained-vocabulary path — that's where "never invent categories outside the list" gets tested.

**Keeping the vocabulary honest:** `default_categories` must match what production actually
passes to `/categorize`. The local `category_rules` table is a thin dev seed (4 categories —
`Bill`, `Salary`, `Saving Interest`, `Withdrawing`), not the real product taxonomy, so this
harness's `default_categories` is copied from the hardcoded fallback list production itself uses
when a user has no rules yet:
[`TransactionPipelineService.DefaultCategories`](../../../apps/api/src/PersonalFinance.Application/Services/TransactionPipelineService.cs)
(cross-checked against the independently-seeded `category_presets` table — 16 of its 17 categories
match exactly). Re-verify against both sources whenever category rules or that fallback list change:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -c "SELECT DISTINCT category FROM category_rules WHERE category IS NOT NULL ORDER BY 1;"
```

## Running

```bash
cd services/ai-service

# Single provider (uses AI_PROVIDER from config if --provider omitted)
PYTHONPATH=. python evals/eval_categorize.py --provider gemini
PYTHONPATH=. python evals/eval_categorize.py --provider anthropic --model claude-sonnet-4-6

# Side-by-side comparison (both providers in one result file)
PYTHONPATH=. python evals/eval_categorize.py --compare

# Iterate on one case without burning quota
PYTHONPATH=. python evals/eval_categorize.py --provider gemini --filter grab_fee

# Print only — skip writing to results/
PYTHONPATH=. python evals/eval_categorize.py --provider gemini --no-save
```

> **Quota note:** Gemini's free tier allows 20 requests/day and each case is one request.
> A full suite run costs one request per case — use `--filter` while iterating.
>
> **Rate-limit note (observed 2026-08-05):** the free tier also throttles at ~5 requests/minute
> (`GenerateRequestsPerMinutePerProjectPerModel-FreeTier`). A 7-case run hit `429 RESOURCE_EXHAUSTED`
> on the 6th–7th case both times it was tried back-to-back. If a full run 429s partway through, wait
> ~60s and finish the remainder with `--filter <remaining-id>` rather than re-running the whole suite.

## Metrics

- **Accuracy** — fraction of cases where the predicted label was acceptable.
- **Out-of-vocab (OOV) rate** — fraction where the model returned a category *not in the offered
  list*. The system prompt says "Never invent categories outside the provided list"; this is the
  only thing that verifies it. A non-zero OOV rate is a prompt bug, not a knowledge gap.
- **Calibration gap** — mean confidence when correct minus mean confidence when wrong. The
  4-layer categorization engine (PF-103) gates on confidence, so a model with high accuracy and a
  near-zero gap is a *worse* production dependency than a less accurate, well-calibrated one:
  downstream code can't tell its good answers from its bad ones.

## Results Convention

Every run auto-saves to `evals/results/YYYYMMDD-categorize-eval.md`. After each run:
1. Open the generated file
2. Fill in **Failure Modes** — which cases failed and whether the cause was the model, the
   prompt, or a wrong expectation in the case list
3. Commit the results file alongside any change that prompted the re-run
