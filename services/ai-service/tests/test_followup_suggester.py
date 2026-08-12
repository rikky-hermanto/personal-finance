"""Unit tests for FollowUpSuggester — mocked provider, no real LLM calls.

The service's job is narrow: build a prompt from the Q&A and filter the model's
output down to at most 3 usable, non-duplicate, self-contained questions.
"""
import logging
from unittest.mock import AsyncMock

import pytest
from google.genai import types

from app.models import FollowUpContext, FollowUpRequest
from app.services.followup_suggester import FOLLOWUP_SCHEMA, FollowUpSuggester

CATEGORIES = ["Room rent", "Food and drinks", "Electricity"]


def _request(**overrides) -> FollowUpRequest:
    base = {
        "question": "Kategori apa yang paling boros?",
        "answer": "Kategori 'Room rent' adalah yang paling boros, Rp 1.800.000 per bulan.",
        "intent": "aggregate",
        "total_idr": 17860000.0,
        "contexts": [FollowUpContext(date="2026-07-02", description="Room rent",
                                     amount_idr=1800000.0, flow="DB")],
    }
    return FollowUpRequest(**{**base, **overrides})


def _suggester(raw) -> tuple[FollowUpSuggester, AsyncMock]:
    provider = AsyncMock()
    provider.generate_json = AsyncMock(return_value={"questions": raw})
    return FollowUpSuggester(provider), provider


def test_FollowupSchema_ValidatedAsGeminiSchema_DoesNotRaise():
    # Reason: google-genai calls types.Schema.model_validate(response_schema)
    # before any API call — the same guard PLAN_SCHEMA needed after PF-132.
    types.Schema.model_validate(FOLLOWUP_SCHEMA)


@pytest.mark.asyncio
async def test_suggest_returns_three_cleaned_questions():
    suggester, _ = _suggester([
        "Bandingkan Room rent Juli vs Juni",
        "Rinci Food and drinks per minggu Juli 2026",
        "Transaksi Room rent terbesar tahun 2026?",
    ])
    result = await suggester.suggest(_request(), CATEGORIES)
    assert len(result) == 3
    assert result[0] == "Bandingkan Room rent Juli vs Juni"


@pytest.mark.asyncio
async def test_suggest_drops_echo_of_original_question():
    suggester, _ = _suggester([
        "  kategori apa yang paling boros?  ",      # same question, different case/space
        "Bandingkan Room rent Juli vs Juni",
    ])
    result = await suggester.suggest(_request(), CATEGORIES)
    assert result == ["Bandingkan Room rent Juli vs Juni"]


@pytest.mark.asyncio
async def test_suggest_dedupes_and_caps_at_three():
    suggester, _ = _suggester(["A?", "a?", "B?", "C?", "D?"])
    result = await suggester.suggest(_request(), CATEGORIES)
    assert result == ["A?", "B?", "C?"]


@pytest.mark.asyncio
async def test_suggest_drops_over_length_and_empty_entries():
    suggester, _ = _suggester(["", "   ", "x" * 81, "Rinci Room rent per minggu"])
    result = await suggester.suggest(_request(), CATEGORIES)
    assert result == ["Rinci Room rent per minggu"]


@pytest.mark.asyncio
async def test_suggest_returns_empty_list_when_provider_fails(caplog):
    provider = AsyncMock()
    provider.generate_json = AsyncMock(side_effect=RuntimeError("quota exhausted"))
    with caplog.at_level(logging.ERROR):
        result = await FollowUpSuggester(provider).suggest(_request(), CATEGORIES)
    assert result == []                                   # never raises to the caller
    assert any("follow-up generation failed" in r.message for r in caplog.records)


@pytest.mark.asyncio
async def test_suggest_prompt_carries_answer_categories_and_citations():
    suggester, provider = _suggester(["Bandingkan Room rent Juli vs Juni"])
    await suggester.suggest(_request(), CATEGORIES)
    user_prompt = provider.generate_json.call_args.args[1]
    assert "Room rent" in user_prompt                     # answer content reached the model
    assert "Food and drinks" in user_prompt               # closed vocab injected
    assert "2026-07-02" in user_prompt                    # citation row injected


@pytest.mark.asyncio
async def test_suggest_caps_output_tokens():
    suggester, provider = _suggester(["Rinci Room rent per minggu"])
    await suggester.suggest(_request(), CATEGORIES)
    # 2048, not a tighter cap: gemini-2.5-flash spends output tokens on an
    # internal thinking pass before the visible JSON — a live smoke test
    # showed 200 starves that pass and response.text comes back empty.
    assert provider.generate_json.call_args.kwargs["max_output_tokens"] == 2048
