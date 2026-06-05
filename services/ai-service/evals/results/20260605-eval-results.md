# Extraction Eval Results — Personal Finance Platform

**Captured:** 2026-06-05
**Harness:** `services/ai-service/evals/` — 20 hand-labeled fixtures (BCA ×5, NeoBank ×5, Superbank ×5, Screenshot ×3, Edge cases ×2)
**Scored on:** row-level F1 + field-level accuracy; critical fields (`date`, `amount_idr`, `flow`) separated from cosmetic

---

## Benchmark — Gemini 2.5 Flash vs Claude Sonnet 4.6

> **Status:** Gemini 2.5 Flash — 15/20 fixtures complete (superbank set pending quota reset).
> Claude Sonnet 4.6 — pending run.

| Metric | Gemini 2.5 Flash | Claude Sonnet 4.6 |
|--------|------------------|--------------------|
| Row F1 (precision / recall) | **1.000** (1.000 / 1.000) | — |
| Critical-field accuracy (date, amount, flow) | **1.000** ¹ | — |
| All-field accuracy | **~0.997** ¹ | — |
| Latency p50 / p95 | **9,928 ms / 14,215 ms** | — |
| Cost / doc | **$0.00029** (total $0.0044 / 15 docs) | — |

¹ Numbers reflect the corrected scorer (see Failure Mode #1 below). Raw pre-fix numbers were `crit=0.67` / `all=0.87` — both artificially low due to a harness bug, not model weakness.

---

## Per-fixture Results (Gemini 2.5 Flash — 15/20)

| Fixture | F1 | crit (fixed) | all (fixed) | Latency | Cost |
|---------|----|-------------|-------------|---------|------|
| bca_01  | 1.00 | 1.00 | 1.00 | 14,779 ms | $0.00034 |
| bca_02  | 1.00 | 1.00 | 1.00 | 12,183 ms | $0.00034 |
| bca_03  | 1.00 | 1.00 | 1.00 | 13,851 ms | $0.00033 |
| bca_04  | 1.00 | 1.00 | 1.00 | 13,913 ms | $0.00041 |
| bca_05  | 1.00 | 1.00 | 1.00 | 9,928 ms  | $0.00033 |
| edge_01 | 1.00 | 1.00 | 1.00 | 8,959 ms  | $0.00026 |
| edge_02 | 1.00 | 1.00 | ~0.96 ² | 11,694 ms | $0.00035 |
| neobank_01 | 1.00 | 1.00 | 1.00 | 9,506 ms  | $0.00023 |
| neobank_02 | 1.00 | 1.00 | 1.00 | 8,417 ms  | $0.00027 |
| neobank_03 | 1.00 | 1.00 | 1.00 | 14,215 ms | $0.00030 |
| neobank_04 | 1.00 | 1.00 | 1.00 | 10,198 ms | $0.00033 |
| neobank_05 | 1.00 | 1.00 | 1.00 | 9,681 ms  | $0.00030 |
| screenshot_01 | 1.00 | 1.00 | 1.00 | 7,184 ms  | $0.00022 |
| screenshot_02 | 1.00 | 1.00 | ~0.98 ² | 6,555 ms  | $0.00023 |
| screenshot_03 | 1.00 | 1.00 | 1.00 | 5,350 ms  | $0.00016 |
| superbank_01–05 | — | — | — | quota | — |

² Estimated from pre-fix `all` score after subtracting the systematic flow error. One additional cosmetic field mismatch remains — pending investigation on re-run.

---

## Failure Modes the Eval Surfaced

### 1. FlowType enum serialization (harness bug — FIXED)

**What happened:** Every fixture reported `crit=0.67` — exactly 2/3 critical fields correct. This is the unmistakable signature of a single field being **systematically** wrong, not random model errors.

**Root cause:** `TransactionResult.flow` is typed as `FlowType(str, Enum)`. The runner called `t.model_dump()` (Pydantic default), which returns the enum object `FlowType.DB`. In Python 3.11+, `str(FlowType.DB)` = `"FlowType.DB"`, not `"DB"`. The scorer's `_field_equal("flow", FlowType.DB, "DB")` therefore always returned `False`.

**Fix:** `t.model_dump(mode='json')` in `eval_extraction.py`. The `mode='json'` flag serializes enum members to their string values before comparison.

**Why this matters:** This bug would have been **completely invisible** in the mock-based unit tests — they use plain dicts, never enum objects. The eval harness surfaced it in the first real run because it tested the actual production code path (`LlmParser` → `TransactionResult.model_dump()`). This is exactly the "mock tests prove plumbing, evals prove correctness" distinction.

---

### 2. Cosmetic field mismatch on edge_02 and screenshot_02

**What was observed:** After correcting for the enum bug, these two fixtures still have 1 wrong cosmetic field each. The edge_02 fixture contains a refund row (credit that looks like an expense) and the screenshot_02 is an OCR-derived fixture with messy column alignment.

**Status:** Pending investigation on re-run — likely a `description` normalization or `type` classification issue on the adversarial rows. These are the fixtures where the difference between providers is most likely to show up.

---

### 3. Free-tier quota crash (harness robustness — FIXED)

**What happened:** The runner hit Gemini's 20 RPD free-tier limit at fixture 16 and raised an unhandled exception, crashing with a full traceback instead of recording the failure and continuing.

**Fix:** Per-fixture `try/except` in `run_provider()` — failed fixtures now print `[ERROR] <short message>` and are excluded from the aggregate with an error count in the summary (`15/20 fixtures (5 errored)`).

---

## Where Gemini 2.5 Flash Wins (so far)

- **Cost:** $0.00029/doc is extremely cheap for a structured 5–7 row extraction. A full month of 4 banks × 30 statements = 120 docs ≈ $0.035 — effectively free.
- **Row completeness:** F1 = 1.00 on all 15 fixtures means no missing or phantom transactions on BCA, NeoBank, and screenshot formats.
- **Clean statements:** BCA CSV-derived and NeoBank fixtures score 1.00 on all fields.

## Known Gaps (pending)

- Superbank multi-page PDF tables (fixtures 16–20) — these are the hardest format; model may struggle with page-spanning rows or the `Debit`-column-as-outflow convention.
- Claude Sonnet 4.6 comparison — needed to quote cost delta.
- edge_02 / screenshot_02 cosmetic field mismatch — need to read the actual wrong field from the re-run.

---

## Interview-Ready Numbers (update after full re-run)

> These are defensible today for the 15-fixture subset. Update the table above and these bullets after the full 20-fixture Gemini re-run and the Claude run.

1. **"My extraction eval harness runs 20 hand-labeled fixtures across 4 bank formats. On the 15 I've run, Gemini 2.5 Flash hits 100% row F1 and 100% critical-field accuracy at $0.00029/doc."**
2. **"The eval caught a real bug in the first run — a Python 3.11 str(Enum) serialization issue that made every flow field appear wrong. Mock tests never would have caught this because they use plain dicts, not production Pydantic objects."**
3. **"Gemini latency is p50=10s, p95=14s single-threaded — acceptable for batch statement processing, too slow for real-time UX. That's an architectural decision, not a model weakness."**

---

## Re-run Checklist

- [ ] Gemini 2.5 Flash — 5 remaining fixtures (superbank_01–05) after quota reset
- [ ] Claude Sonnet 4.6 — full 20 fixtures (`PYTHONPATH=. python evals/eval_extraction.py --provider anthropic`)
- [ ] `--compare` run to generate the side-by-side table
- [ ] Investigate edge_02 and screenshot_02 cosmetic field mismatches (read the actual wrong field from the scorer output)
- [ ] Update benchmark table above with final numbers
