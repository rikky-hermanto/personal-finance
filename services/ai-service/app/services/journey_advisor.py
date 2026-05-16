import logging
import anthropic

from app.models import JourneyAdviseRequest, JourneyAdviseResponse, Quest
from app.prompts.journey_advisor_v1 import SYSTEM_PROMPT
from app.config import settings

logger = logging.getLogger(__name__)

TOOL = {
    "name": "generate_quests",
    "description": "Generate exactly 3 actionable financial quests based on the user's indicator gaps",
    "input_schema": {
        "type": "object",
        "properties": {
            "quests": {
                "type": "array",
                "minItems": 3,
                "maxItems": 3,
                "items": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "description": {"type": "string"},
                        "target_indicator": {"type": "string"},
                        "estimated_score_gain": {"type": "number", "minimum": 1, "maximum": 30},
                        "difficulty": {"type": "string", "enum": ["easy", "medium", "hard"]},
                        "action_deeplink": {"type": ["string", "null"]},
                    },
                    "required": ["title", "description", "target_indicator", "estimated_score_gain", "difficulty"],
                },
            }
        },
        "required": ["quests"],
    },
}


async def advise(req: JourneyAdviseRequest) -> JourneyAdviseResponse:
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    user_msg = (
        f"User financial snapshot:\n{req.model_dump_json(indent=2)}\n\n"
        "Generate exactly 3 quests targeting the weakest indicators."
    )

    logger.info(
        "journey_advisor: requesting quests | level=%d score=%.1f indicators=%d",
        req.current_level,
        float(req.total_score),
        len(req.indicators),
    )

    response = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        temperature=0.0,
        system=SYSTEM_PROMPT,
        tools=[TOOL],
        tool_choice={"type": "tool", "name": "generate_quests"},
        messages=[{"role": "user", "content": user_msg}],
    )

    if response.stop_reason == "max_tokens":
        raise RuntimeError(
            "Quest generation truncated — response exceeded max_tokens. "
            "Consider reducing indicator count in the request."
        )

    logger.info(
        "journey_advisor: received response | stop_reason=%s tokens_in=%d tokens_out=%d",
        response.stop_reason,
        response.usage.input_tokens,
        response.usage.output_tokens,
    )

    tool_use = next((b for b in response.content if b.type == "tool_use"), None)
    if tool_use is None:
        raise RuntimeError("AI did not call generate_quests tool — unexpected stop_reason")

    quests = [Quest(**q) for q in tool_use.input["quests"]]
    return JourneyAdviseResponse(quests=quests)
