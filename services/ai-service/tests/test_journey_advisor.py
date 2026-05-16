from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models import IndicatorSnapshot, JourneyAdviseRequest
from app.services.journey_advisor import advise


def _make_request(**overrides) -> JourneyAdviseRequest:
    defaults = dict(
        user_id="test-user",
        current_level=1,
        total_score=Decimal("35"),
        indicators=[
            IndicatorSnapshot(
                code="spend_lt_income",
                level="L1",
                score=Decimal("20"),
                raw_value=Decimal("0.98"),
                status="in_progress",
            ),
            IndicatorSnapshot(
                code="liquid_savings_ratio",
                level="L2",
                score=Decimal("5"),
                raw_value=Decimal("0.2"),
                status="not_started",
            ),
        ],
    )
    defaults.update(overrides)
    return JourneyAdviseRequest(**defaults)


def _mock_tool_response(quests: list[dict]) -> MagicMock:
    tool_block = MagicMock()
    tool_block.type = "tool_use"
    tool_block.input = {"quests": quests}

    mock_resp = MagicMock()
    mock_resp.stop_reason = "tool_use"
    mock_resp.content = [tool_block]
    mock_resp.usage.input_tokens = 500
    mock_resp.usage.output_tokens = 300
    return mock_resp


SAMPLE_QUESTS = [
    {
        "title": "Audit top 3 expense categories",
        "description": "Check your biggest spending categories and cut one by Rp 300.000 this month.",
        "target_indicator": "spend_lt_income",
        "estimated_score_gain": 12,
        "difficulty": "easy",
        "action_deeplink": "/cashflow/analysis",
    },
    {
        "title": "Open a JAGO savings pocket",
        "description": "Create a dedicated savings pocket in JAGO and transfer Rp 500.000 now.",
        "target_indicator": "liquid_savings_ratio",
        "estimated_score_gain": 8,
        "difficulty": "easy",
        "action_deeplink": "/assets/accounts",
    },
    {
        "title": "Cancel 1 unused subscription",
        "description": "Review your recurring charges and cancel one you haven't used this month.",
        "target_indicator": "spend_lt_income",
        "estimated_score_gain": 6,
        "difficulty": "easy",
        "action_deeplink": None,
    },
]


@pytest.mark.asyncio
async def test_advise_returns_three_quests():
    mock_resp = _mock_tool_response(SAMPLE_QUESTS)

    with patch("app.services.journey_advisor.anthropic.AsyncAnthropic") as mock_cls:
        instance = AsyncMock()
        instance.messages.create = AsyncMock(return_value=mock_resp)
        mock_cls.return_value = instance

        result = await advise(_make_request())

    assert len(result.quests) == 3
    assert result.quests[0].title == "Audit top 3 expense categories"
    assert result.quests[0].target_indicator == "spend_lt_income"
    assert result.quests[0].difficulty == "easy"


@pytest.mark.asyncio
async def test_advise_maps_deeplink_correctly():
    mock_resp = _mock_tool_response(SAMPLE_QUESTS)

    with patch("app.services.journey_advisor.anthropic.AsyncAnthropic") as mock_cls:
        instance = AsyncMock()
        instance.messages.create = AsyncMock(return_value=mock_resp)
        mock_cls.return_value = instance

        result = await advise(_make_request())

    assert result.quests[0].action_deeplink == "/cashflow/analysis"
    assert result.quests[2].action_deeplink is None  # null deeplink preserved


@pytest.mark.asyncio
async def test_advise_raises_on_max_tokens_truncation():
    mock_resp = MagicMock()
    mock_resp.stop_reason = "max_tokens"
    mock_resp.content = []
    mock_resp.usage.input_tokens = 900
    mock_resp.usage.output_tokens = 2048

    with patch("app.services.journey_advisor.anthropic.AsyncAnthropic") as mock_cls:
        instance = AsyncMock()
        instance.messages.create = AsyncMock(return_value=mock_resp)
        mock_cls.return_value = instance

        with pytest.raises(RuntimeError, match="truncated"):
            await advise(_make_request())


@pytest.mark.asyncio
async def test_advise_raises_when_no_tool_use_block():
    mock_resp = MagicMock()
    mock_resp.stop_reason = "end_turn"
    mock_resp.content = []  # no tool_use block
    mock_resp.usage.input_tokens = 200
    mock_resp.usage.output_tokens = 50

    with patch("app.services.journey_advisor.anthropic.AsyncAnthropic") as mock_cls:
        instance = AsyncMock()
        instance.messages.create = AsyncMock(return_value=mock_resp)
        mock_cls.return_value = instance

        with pytest.raises(RuntimeError, match="generate_quests tool"):
            await advise(_make_request())


@pytest.mark.asyncio
async def test_advise_calls_anthropic_with_correct_tool_choice():
    mock_resp = _mock_tool_response(SAMPLE_QUESTS)

    with patch("app.services.journey_advisor.anthropic.AsyncAnthropic") as mock_cls:
        instance = AsyncMock()
        instance.messages.create = AsyncMock(return_value=mock_resp)
        mock_cls.return_value = instance

        await advise(_make_request())

    call_kwargs = instance.messages.create.call_args[1]
    assert call_kwargs["temperature"] == 0.0
    assert call_kwargs["tool_choice"] == {"type": "tool", "name": "generate_quests"}
    assert call_kwargs["model"] == "claude-sonnet-4-6"
