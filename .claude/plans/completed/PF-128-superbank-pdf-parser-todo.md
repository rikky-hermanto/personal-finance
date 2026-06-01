# PF-128 — Superbank PDF Parser: Bank-Specific LLM Prompt

> **GitHub Issue:** (create on execution)
> **Status:** Done
> **Started:** 2026-05-31

## Objective

Add Superbank PDF statement support by creating a bank-specific extraction prompt
(`app/prompts/superbank_v1.py`) and wiring it into the LLM parser dispatch map in
`llm_parser.py`. The .NET side is already fully wired — `BankIdentifier.cs` detects
"Superbank" in first-page text, `BankKeys.Superbank = "SUPERBANK"` exists, and
`Program.cs` routes it to `LlmPdfParser` which forwards to the Python AI service with
`bank_hint="SUPERBANK"`. This task is Python-only.

## Acceptance Criteria

- [x] Upload a Superbank PDF → API returns correctly parsed transactions with YYYY-MM-DD dates, positive `amount_idr` values, and correct DB/CR `flow`
- [x] "Saldo awal" opening balance row is NOT extracted as a transaction
- [x] Footer totals row (no date — just summed Uang Keluar / Uang Masuk) is NOT extracted as a transaction
- [x] `bank_hint=SUPERBANK` causes the Superbank-specific prompt to be used (verified by unit test importing `_build_system_prompt`)
- [x] All amounts use Indonesian decimal convention: `Rp1.000.000,00` → `1000000.0`; `amount_idr` is always positive
- [x] pytest suite passes: happy path (3 transactions), prompt dispatch test, max_tokens error path
- [x] Generic fallback prompt still works for non-Superbank hints (regression test)

## Approach

Create `app/prompts/superbank_v1.py` with the full bank-specific system prompt (column
semantics, date format, Indonesian decimal convention, skip rules, 2–3 sanitized examples).
Add a `_BANK_PROMPTS` dispatch dict and `_build_system_prompt()` helper to `llm_parser.py`
— when `bank_hint` matches a key, the bank-specific prompt is used wholesale; all other
hints fall back to the existing generic `SYSTEM_PROMPT`. Do NOT touch any .NET files.

## Affected Files

| File | Change |
|------|--------|
| `services/ai-service/app/prompts/` | Create directory (first file in it) |
| `services/ai-service/app/prompts/superbank_v1.py` | Create — Superbank system prompt + sanitized examples |
| `services/ai-service/app/services/llm_parser.py` | Edit — add `_BANK_PROMPTS` dict + `_build_system_prompt()`, use it in `parse()` and `parse_image()` |
| `services/ai-service/tests/test_superbank_extractor.py` | Create — pytest: happy path, prompt dispatch, max_tokens error, regression |

---

## TODO

### [x] STEP 1 — Create `app/prompts/superbank_v1.py`

```python
# services/ai-service/app/prompts/superbank_v1.py

SYSTEM_PROMPT = """You are extracting transactions from a Superbank (PT Super Bank Indonesia) e-statement PDF.

## Column semantics
- "Uang Keluar" = money leaving the account → flow: "DB" (debit / expense)
- "Uang Masuk"  = money entering the account → flow: "CR" (credit / income)
- "Saldo"       = running balance after each row → map to statement_balance; do NOT use as amount_idr

## Date format
Dates appear as "D MMM" (e.g., "7 Jun", "11 Jun") with the transaction time on the
next line (e.g., "10:32 AM"). The statement year appears in the period header at the
top of the statement (e.g., "1 - 30 Jun 2025"). Reconstruct the full date as
YYYY-MM-DD using the year from the period header — it does NOT appear on individual rows.

## Amount format (Indonesian decimal convention)
Amounts use period (.) as thousands separator and comma (,) as decimal separator.
Examples of what you will see in the raw text:
  "-Rp105.000,00"     → amount_idr: 105000.0   (Uang Keluar → flow: "DB")
  "+Rp4.000.000,00"   → amount_idr: 4000000.0  (Uang Masuk  → flow: "CR")
  "+Rp13.394,40"      → amount_idr: 13394.4    (Uang Masuk  → flow: "CR")
Strip the "Rp" prefix and the leading sign character. Convert the resulting value
(period = thousands, comma = decimal) to a plain positive floating-point number.
amount_idr is ALWAYS positive — the flow field encodes the direction.

## Rows to SKIP — do NOT extract these as transactions
1. "Saldo awal" row — opening balance entry at the top of each account section; has no Uang Keluar or Uang Masuk value
2. Footer totals row — the final row of each account section with NO date, only summed Uang Keluar and Uang Masuk totals (e.g., "-Rp15.845.272,31   +Rp16.513.394,40   Rp857.810,33")
3. Any row where Deskripsi is blank or contains only whitespace

## Secondary description (remarks field)
If the description contains a reference number or secondary label separated by a newline
or dash, put it in the remarks field. Otherwise leave remarks empty ("").

## Account name
The section header immediately above the transaction table (e.g., "Tabungan Utama")
is the account. Use it as the account_name field for all rows in that section.

## Sanitized examples

Input row (SKIP — opening balance):
  "1 Jun 2025   Saldo awal                                    Rp189.688,24"
→ omit entirely

Input row (debit):
  "7 Jun        Transfer ke [NAME]     -Rp105.000,00           Rp84.688,24"
  "10:32 AM"
→ date: "2025-06-07", description: "Transfer ke [NAME]", flow: "DB",
  amount_idr: 105000.0, statement_balance: 84688.24, account_name: "Tabungan Utama"

Input row (credit):
  "7 Jun        Transfer dari [NAME]                +Rp4.000.000,00   Rp4.084.688,24"
  "10:52 AM"
→ date: "2025-06-07", description: "Transfer dari [NAME]", flow: "CR",
  amount_idr: 4000000.0, statement_balance: 4084688.24, account_name: "Tabungan Utama"

Input row (SKIP — footer totals, no date):
  "           -Rp15.845.272,31    +Rp16.513.394,40    Rp857.810,33"
→ omit entirely
"""
```

> **Why:** The `ai-service.md` rule mandates `app/prompts/{bank_id}_v1.py` per bank. Explicit column semantics prevent the two landmines identified by the architect: (1) "Saldo awal" extracted as a phantom DB transaction, (2) the footer totals row extracted as an oversized DB+CR pair that silently corrupts cashflow totals. Amounts use sanitized `[NAME]` placeholders — no real PII per PF-126 security policy.

---

### [x] STEP 2 — Update `llm_parser.py` — add prompt dispatch

Edit `services/ai-service/app/services/llm_parser.py`. Add the import, the dispatch map,
and the helper function. Replace the inline `system = ...` line in `parse()`.

**Add after the existing imports:**
```python
from app.prompts.superbank_v1 import SYSTEM_PROMPT as _SUPERBANK_PROMPT
```

**Add after `SYSTEM_PROMPT` definition (before the `LlmParser` class):**
```python
# Bank-specific prompt overrides keyed by bank_hint value (uppercase).
# Adding a new bank: one entry here + one new prompts/{bank}_v1.py file.
_BANK_PROMPTS: dict[str, str] = {
    "SUPERBANK": _SUPERBANK_PROMPT,
}


def _build_system_prompt(bank_hint: str | None) -> str:
    hint = (bank_hint or "").upper()
    if hint in _BANK_PROMPTS:
        return _BANK_PROMPTS[hint]
    return SYSTEM_PROMPT + f"Bank context: {bank_hint or 'unknown'}."
```

**In `LlmParser.parse()` AND `LlmParser.parse_image()`, replace the inline system string in both methods:**
```python
# Before (both methods at llm_parser.py:56 and llm_parser.py:85):
system = SYSTEM_PROMPT + f"Bank context: {request.bank_hint or 'unknown'}."

# After (apply to both):
system = _build_system_prompt(request.bank_hint)
```

Superbank is PDF-only, so `parse_image()` won't be exercised for this bank in practice. But applying
the same dispatch to both methods keeps the pattern consistent — a future image-based bank won't
require a separate plumbing change.

> **Why:** A dict dispatch (not if/elif) keeps `llm_parser.py` open for extension — each new bank adds one import and one dict entry. `_build_system_prompt` is a module-level function so tests can import and assert on it directly without constructing a full `LlmParser`. The fallback preserves existing behavior for all non-Superbank hints.

---

### [x] STEP 3 — Write `tests/test_superbank_extractor.py`

```python
# services/ai-service/tests/test_superbank_extractor.py

import pytest
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock

from app.models import ParseRequest, ParseResponse, TransactionResult
from app.services.llm_parser import LlmParser, LlmParseError, _build_system_prompt, SYSTEM_PROMPT
from app.prompts.superbank_v1 import SYSTEM_PROMPT as SUPERBANK_PROMPT


# Sanitized extract — mirrors real PDF text layout, no PII
SUPERBANK_SAMPLE_TEXT = """
Tabungan Utama - 000020617734

Tanggal    Deskripsi                      Uang Keluar        Uang Masuk    Saldo

1 Jun 2025  Saldo awal                                                     Rp189.688,24
7 Jun       Transfer ke Erie Andinna      -Rp105.000,00                    Rp84.688,24
10:32 AM
7 Jun       Transfer dari Rikki H                            +Rp4.000.000,00  Rp4.084.688,24
10:52 AM
28 Jun      Bunga Didapat                                    +Rp13.394,40   Rp857.810,33
12:01 AM
            -Rp15.845.272,31              +Rp16.513.394,40   Rp857.810,33
"""


def _make_provider_with_transactions(transactions: list[dict]) -> AsyncMock:
    provider = AsyncMock()
    provider.extract_structured = AsyncMock(return_value={"transactions": transactions})
    return provider


def _make_provider_raising(exc: Exception) -> AsyncMock:
    provider = AsyncMock()
    provider.extract_structured = AsyncMock(side_effect=exc)
    return provider


# ── Prompt dispatch tests ────────────────────────────────────────────────────

def test_build_system_prompt_returns_superbank_prompt_for_superbank_hint():
    result = _build_system_prompt("SUPERBANK")
    assert result is SUPERBANK_PROMPT
    assert "Uang Keluar" in result
    assert "Saldo awal" in result


def test_build_system_prompt_case_insensitive():
    assert _build_system_prompt("superbank") is SUPERBANK_PROMPT
    assert _build_system_prompt("Superbank") is SUPERBANK_PROMPT


def test_build_system_prompt_falls_back_for_unknown_hint():
    result = _build_system_prompt("UNKNOWN_BANK")
    assert result.startswith(SYSTEM_PROMPT[:40])
    assert "UNKNOWN_BANK" in result


def test_build_system_prompt_falls_back_for_none():
    result = _build_system_prompt(None)
    assert result.startswith(SYSTEM_PROMPT[:40])


# ── Extraction tests ──────────────────────────────────────────────────────────

@pytest.mark.anyio
async def test_superbank_happy_path_extracts_three_transactions():
    """Saldo awal and footer totals are skipped by the prompt; 3 real transactions come back."""
    mock_txns = [
        {
            "date": "2025-06-07",
            "description": "Transfer ke Erie Andinna",
            "flow": "DB",
            "type": "Expense",
            "amount_idr": 105000.0,
            "currency": "IDR",
            "account_name": "Tabungan Utama",
            "statement_balance": 84688.24,
        },
        {
            "date": "2025-06-07",
            "description": "Transfer dari Rikki H",
            "flow": "CR",
            "type": "Income",
            "amount_idr": 4000000.0,
            "currency": "IDR",
            "account_name": "Tabungan Utama",
            "statement_balance": 4084688.24,
        },
        {
            "date": "2025-06-28",
            "description": "Bunga Didapat",
            "flow": "CR",
            "type": "Income",
            "amount_idr": 13394.4,
            "currency": "IDR",
            "account_name": "Tabungan Utama",
            "statement_balance": 857810.33,
        },
    ]
    parser = LlmParser(_make_provider_with_transactions(mock_txns))
    result = await parser.parse(ParseRequest(text=SUPERBANK_SAMPLE_TEXT, bank_hint="SUPERBANK"))

    assert result.total_parsed == 3
    assert result.skipped_rows == 0
    assert result.transactions[0].flow == "DB"
    assert result.transactions[0].amount_idr == Decimal("105000.0")
    assert result.transactions[1].flow == "CR"
    assert result.transactions[1].amount_idr == Decimal("4000000.0")
    assert result.transactions[2].description == "Bunga Didapat"


@pytest.mark.anyio
async def test_superbank_amount_idr_is_always_positive():
    """Debit amounts must be positive — flow encodes direction, not sign."""
    mock_txns = [
        {
            "date": "2025-06-07",
            "description": "Transfer ke Koperasi",
            "flow": "DB",
            "type": "Expense",
            "amount_idr": 465000.0,   # positive, not -465000
            "currency": "IDR",
            "account_name": "Tabungan Utama",
        },
    ]
    parser = LlmParser(_make_provider_with_transactions(mock_txns))
    result = await parser.parse(ParseRequest(text=SUPERBANK_SAMPLE_TEXT, bank_hint="SUPERBANK"))

    assert result.transactions[0].amount_idr > 0


@pytest.mark.anyio
async def test_superbank_llm_error_raises_parse_error():
    """Any provider exception must surface as LlmParseError — never swallowed."""
    parser = LlmParser(_make_provider_raising(RuntimeError("provider timeout")))

    with pytest.raises(LlmParseError):
        await parser.parse(ParseRequest(text=SUPERBANK_SAMPLE_TEXT, bank_hint="SUPERBANK"))


@pytest.mark.anyio
async def test_superbank_skips_malformed_rows_and_counts_them():
    """Rows that fail Pydantic validation are skipped, not crashing the whole parse."""
    mock_txns = [
        {
            "date": "2025-06-07",
            "description": "Transfer ke Erie Andinna",
            "flow": "DB",
            "type": "Expense",
            "amount_idr": 105000.0,
            "currency": "IDR",
            "account_name": "Tabungan Utama",
        },
        {
            # Missing required fields — should be counted as skipped
            "description": "Incomplete row",
        },
    ]
    parser = LlmParser(_make_provider_with_transactions(mock_txns))
    result = await parser.parse(ParseRequest(text=SUPERBANK_SAMPLE_TEXT, bank_hint="SUPERBANK"))

    assert result.total_parsed == 1
    assert result.skipped_rows == 1


@pytest.mark.anyio
async def test_non_superbank_hint_uses_generic_prompt_regression():
    """Changing the dispatch must not break BCA/NeoBank/generic PDF behavior."""
    mock_txns = [
        {
            "date": "2025-03-14",
            "description": "GOFOOD GEPREK BENSU",
            "flow": "DB",
            "type": "Expense",
            "amount_idr": 85000.0,
            "currency": "IDR",
            "account_name": "BCA",
        }
    ]
    parser = LlmParser(_make_provider_with_transactions(mock_txns))
    result = await parser.parse(ParseRequest(text="any text", bank_hint="BCA"))

    assert result.total_parsed == 1
    assert result.transactions[0].description == "GOFOOD GEPREK BENSU"
```

> **Why:** Per `ai-service.md`: never call the real API in tests; always cover the provider error path. The prompt dispatch tests are synchronous (no `anyio` needed) — they prove the routing table is wired correctly without spinning up a parser. The regression test catches accidental breakage of the fallback path that affects BCA/NeoBank PDFs.

---

### [x] STEP 4 — Run tests and verify

```bash
# Activate venv (Windows)
cd services/ai-service
.venv\Scripts\activate

# Run only the new Superbank tests
pytest tests/test_superbank_extractor.py -v

# Run full suite to catch regressions
pytest -v

# Manual smoke test against a real Superbank PDF (substitute real file path)
curl -X POST http://localhost:8000/parse-pdf \
  -F "file=@/path/to/superbank-statement.pdf;type=application/pdf" \
  -F "bank_hint=SUPERBANK"
```

Check the AI service log output for:
- `Bank context:` line confirming the Superbank prompt was used (or absence of it — meaning the full bank prompt replaced it)
- `input_tokens` and `output_tokens` values to baseline extraction cost

> **Why:** Tests verify logic; they do not verify that the LLM correctly interprets the prompt against a real statement. The manual smoke test catches prompt wording issues (wrong skip instructions, date format misinterpretation) that unit tests with mocked providers cannot surface.

---

## Notes

- **.NET is complete — do not touch it.** After the PF-124 CoR refactor, Superbank detection lives in `SuperbankPdfSignature.cs:11` (checks `ctx.PdfFirstPageText` for "Superbank"), which is registered in `Program.cs:115`. `Program.cs:103` routes `BankKeys.Superbank` → `LlmPdfParser`. `BankKeys.cs:7` defines the `"SUPERBANK"` constant. None of these files need changes.
- **Year inference is critical.** The year "2025" does not appear on individual transaction rows — it only appears in the statement period header ("1 - 30 Jun 2025"). The prompt instructs the LLM to extract it from there. If the period header is not in the PyMuPDF text output, dates will default to the wrong year. Verify the period header appears in the extracted text during the smoke test.
- **Footer totals landmine.** The last row of each account section (`-Rp15.845.272,31 / +Rp16.513.394,40 / Rp857.810,33`) has no date and no Deskripsi. Without the skip instruction, the LLM extracts it as two transactions — one huge DB and one huge CR — that pass schema validation and silently double-count the month's cashflow.
- **Token cost baseline.** A 3-page Superbank statement produces ~1,500–2,500 extracted text characters. With the Superbank-specific prompt (~600 tokens), expect ~500–800 total input tokens on Gemini Flash (< $0.001/statement).
- **Related:** PF-047 (original Superbank ticket) was marked Obsolete and absorbed into PF-S11. This ticket (PF-128) delivers the parser itself independently of the event-driven webhook pipeline — it works with the existing synchronous upload flow.
