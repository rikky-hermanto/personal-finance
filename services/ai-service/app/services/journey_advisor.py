import logging

from app.models import JourneyAdviseRequest, JourneyAdviseResponse, Quest
from app.prompts.journey_advisor_v1 import SYSTEM_PROMPT
from app.providers.base import LlmProvider

logger = logging.getLogger(__name__)

# Gemini-compatible: single `type`, `nullable` key, string-only enums.
# Count/range constraints are enforced by the prompt ("exactly 3") + the
# Pydantic `Quest` model rather than by JSON-schema keywords Gemini rejects.
QUEST_SCHEMA = {
    "type": "object",
    "properties": {
        "quests": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "description": {"type": "string"},
                    "target_indicator": {"type": "string"},
                    "estimated_score_gain": {"type": "number"},
                    "difficulty": {"type": "string", "enum": ["easy", "medium", "hard"]},
                    "action_deeplink": {"type": "string", "nullable": True},
                },
                "required": [
                    "title", "description", "target_indicator",
                    "estimated_score_gain", "difficulty",
                ],
            },
        }
    },
    "required": ["quests"],
}


class JourneyAdvisor:
    def __init__(self, provider: LlmProvider) -> None:
        self._provider = provider

    async def advise(self, req: JourneyAdviseRequest) -> JourneyAdviseResponse:
        user_msg = (
            f"User financial snapshot:\n{req.model_dump_json(indent=2)}\n\n"
            "Generate exactly 3 quests targeting the weakest indicators."
        )

        logger.info(
            "journey_advisor: requesting quests | level=%d score=%.1f indicators=%d",
            req.current_level, float(req.total_score), len(req.indicators),
        )

        raw = await self._provider.generate_json(
            SYSTEM_PROMPT, user_msg, QUEST_SCHEMA, max_output_tokens=2048,
        )

        quests = [Quest(**q) for q in raw["quests"]]
        return JourneyAdviseResponse(quests=quests)
