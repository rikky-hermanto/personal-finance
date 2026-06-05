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
