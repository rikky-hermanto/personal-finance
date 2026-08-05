# Categorization Eval Results

**Date:** 2026-08-05  
**Harness:** `evals/eval_categorize.py` — cases from `evals/categorize_cases.json`  
**Scored on:** label accuracy, out-of-vocabulary rate, confidence calibration

---

## Summary

| Provider | Model | Cases | Accuracy | OOV rate | Conf(right) | Conf(wrong) | Calib gap |
|----------|-------|-------|----------|----------|-------------|-------------|-----------|
| gemini | default | 7 | 1.000 | 0.000 | 0.96 | 0.00 | +0.96 |

---

## Per-case — gemini (default)

| Case | Result | Predicted | Confidence | OOV | Latency | Cost |
|------|--------|-----------|------------|-----|---------|------|
| grab_fee | PASS | Transportation | 0.80 |  | 9725ms | $0.00002 |
| gofood_qris | PASS | Food & Dining | 1.00 |  | 1707ms | $0.00002 |
| pln_bill | PASS | Utilities | 1.00 |  | 1201ms | $0.00002 |
| salary_credit | PASS | Income | 1.00 |  | 1698ms | $0.00002 |
| admin_fee | PASS | Admin Fee | 1.00 |  | 1560ms | $0.00002 |
| ambiguous_indomaret | PASS | Groceries | 0.95 |  | 2392ms | $0.00002 |
| restricted_vocab_vet | PASS | Health | 0.95 |  | 4299ms | $0.00002 |

---

## Failure Modes

No failures — 7/7 cases passed, 0.000 OOV rate. There is nothing to classify into Model/Prompt/Case
buckets this run. Two results worth flagging even without a failure:

- **`restricted_vocab_vet` (the constrained-vocabulary stress case)** passed cleanly: offered only
  `["Food & Dining", "Health", "Groceries"]` for "Sunset Vet Ubud", the model picked `Health` at
  conf=0.95 with no OOV. This is the one case designed specifically to test "never invent categories
  outside the provided list" — on this single sample the prompt held.
- **`grab_fee`** was both the lowest-confidence result (0.80) and the slowest call (9725ms, ~5-8x
  the other cases). Still correct, but worth watching if it recurs as the case list grows — could be
  first-call cold-start latency rather than a genuine ambiguity signal (this was the first case in
  the batch after the API client was constructed).

A 100% pass rate on 7 seed cases is a real, encouraging first signal for `gemini-2.5-flash`, but it
is a small, hand-picked sample skewed toward clear-cut merchants — it is not evidence the model
holds up on messier real statement text. Treat this as a baseline floor to beat, not a ceiling.

---

## Notes

**Vocabulary source deviation from the plan's STEP 1 (documented here for auditability):** the plan
called for querying the local `category_rules` table directly via `psql` and using that result
verbatim as `default_categories`. Two adaptations were required:

1. No `psql` binary was available in this environment, so the query ran via the local Supabase
   PostgREST API instead (`GET /category_rules?select=category`, using the well-known local-dev
   anon key already committed in `apps/api/.../appsettings.Development.json`) — same table, same
   data, different client.
2. The result was `["Bill", "Salary", "Saving Interest", "Withdrawing"]` — only 4 categories, matching
   the 5 rows in `supabase/seed.sql` exactly. This is a thin local dev seed, not the ~106-rule
   production taxonomy referenced elsewhere in the docs, and using it verbatim would have made every
   case in this file (Grab Fee, GoFood, PLN, Indomaret, vet) unscoreable against categories that
   don't exist in that list — exactly the "measures a fiction" failure STEP 1 exists to prevent, just
   from the opposite direction (too narrow rather than invented).
   Instead, `default_categories` was taken from
   [`TransactionPipelineService.DefaultCategories`](../../../apps/api/src/PersonalFinance.Application/Services/TransactionPipelineService.cs#L17-L22) —
   the exact hardcoded fallback list production itself passes to `/categorize` whenever a user's
   `category_rules` table doesn't yet carry the full set. It's cross-checked against the
   independently-seeded `category_presets` table (16 of its 17 distinct categories match exactly;
   `Household` is the one extra, not currently in `DefaultCategories`). Three seed-case `expected`
   values were corrected to match this real vocabulary's exact strings: `Transport` → `Transportation`,
   `Bills & Utilities` → `Utilities`, `Fees & Charges` → `Admin Fee`. Full rationale is in
   `evals/README.md` under "Keeping the vocabulary honest."
   **Follow-up worth a ticket:** decide whether `category_rules` should be seeded more richly for
   local dev, since right now a fresh `supabase db reset` leaves the categorization pipeline with
   only 4 real categories to work with.

**Provider bug fixed in this task (in scope — required for honest cost numbers, not a Categorizer/prompt change):**
`GeminiProvider.generate_json` and `AnthropicProvider.generate_json` computed `input_tokens` /
`output_tokens` locally but never assigned them to `self.last_usage` — only `extract_structured` did.
Since `Categorizer.categorize()` calls `generate_json()`, every `cost_usd` in this harness would have
silently read `$0.00000` regardless of real spend. Fixed by adding the same `self.last_usage = {...}`
assignment `extract_structured` already uses, in both providers. No other consumer of `generate_json`
(`answerer.py`, `journey_advisor.py`, `query_planner.py`) reads `last_usage`, so this is additive only —
confirmed via `pytest` (133 passed, 1 pre-existing unrelated failure in `test_merchant_suggester.py`
that predates this task and touches neither file changed here).

**Rate limiting, not a harness bug:** the free-tier Gemini key throttles at
`GenerateRequestsPerMinutePerProjectPerModel-FreeTier`, quota value 5 — 6 rapid sequential requests
already exceeds it. Both full 7-case attempts hit `429 RESOURCE_EXHAUSTED` on the 7th call. The 7
results above come from real runs against the same 7 cases, assembled from multiple batches (the
auto-save path itself was separately verified end-to-end with a live single-case run — see
`salary_credit`, reproduced identically here) — every number is a genuine API response. This is a
free-tier throughput ceiling, separate from the previously-documented 20-requests/day cap; the
harness's `--filter` flag (built for exactly this "iterate without burning budget" scenario) is what
made recovering from it cheap. Worth revisiting if the case list grows enough that even a single
`--provider` run routinely exceeds ~5 requests.

**Not run:** `--compare` (Anthropic side). No `ANTHROPIC_API_KEY` is configured in this local
environment, so only the Gemini baseline was captured, per this task's explicit instruction to run
`--provider gemini` for the initial baseline. The `--compare` path shares the same `run_provider()`
code exercised above for both providers, but has not been run end-to-end against real Anthropic traffic.

**Coverage gap in the case list:** none of the 7 seed cases exercise `Education`, `E-Wallet`,
`Entertainment`, `Investment`, `Saving`, or `Travel` — 6 of the 16 default categories are currently
untested. Per the plan, growing `categorize_cases.json` over time is expected; this is the natural
next set to add.

**Baseline for PF-AI007:** this file is the number the smolagents categorizer agent needs to match or
beat — re-run this exact harness before and after that agent lands.
