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
