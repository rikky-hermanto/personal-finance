from unittest.mock import AsyncMock

import pytest
from google.genai import types

from app.models import JourneyAdviseRequest
from app.services.journey_advisor import JourneyAdvisor, QUEST_SCHEMA


def test_QuestSchema_ValidatedAsGeminiSchema_DoesNotRaise():
    types.Schema.model_validate(QUEST_SCHEMA)


@pytest.mark.asyncio
async def test_Advise_WithInjectedProvider_ReturnsThreeQuests():
    fake_provider = AsyncMock()
    fake_provider.generate_json = AsyncMock(return_value={
        "quests": [
            {"title": f"Q{i}", "description": "d", "target_indicator": "emergency_fund",
             "estimated_score_gain": 10, "difficulty": "easy", "action_deeplink": None}
            for i in range(3)
        ]
    })
    advisor = JourneyAdvisor(provider=fake_provider)

    req = JourneyAdviseRequest(
        user_id="test-user", current_level=1, total_score=0.0,
        indicators=[],
    )
    result = await advisor.advise(req)

    assert len(result.quests) == 3
    fake_provider.generate_json.assert_awaited_once()
    # max_output_tokens must be passed for the larger quest output
    assert fake_provider.generate_json.await_args.kwargs["max_output_tokens"] == 2048
