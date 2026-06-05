# Extraction Eval Harness

Measures real extraction accuracy of GeminiProvider / AnthropicProvider against a
hand-labeled golden dataset. NOT part of pytest/CI — it makes real, paid API calls.

## My eval mental model (written from memory, 2026-06-01)
1. Level 1: Unit Tests; Assertoion to ensure the core pipeline works
2. Row-level precision/recall ... (fill in from Step 1)

## Run
    python evals/eval_extraction.py --provider gemini
    python evals/eval_extraction.py --compare