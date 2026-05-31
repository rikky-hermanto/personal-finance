import json
import logging
from decimal import Decimal

from app.models import CategorizeRequest, CategorizeResponse
from app.providers.base import LlmProvider

logger = logging.getLogger(__name__)

_CATEGORIZE_SCHEMA = {
    "type": "object",
    "properties": {
        "category":   {"type": "string"},
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
    },
    "required": ["category", "confidence"],
}

_SYSTEM_PROMPT = (
    "You are a personal finance transaction classifier. "
    "Given a bank transaction, return the most appropriate category from the provided list. "
    "Set confidence to a value between 0.0 and 1.0 reflecting how certain you are. "
    "If no category clearly fits, pick the closest one and set confidence below 0.5. "
    "Never invent categories outside the provided list."
)


class Categorizer:
    def __init__(self, provider: LlmProvider) -> None:
        self._provider = provider

    async def categorize(self, request: CategorizeRequest) -> CategorizeResponse:
        flow_label = "debit (money out)" if request.flow == "DB" else "credit (money in)"
        prompt = (
            f"Transaction:\n"
            f"  Description: {request.description}\n"
            f"  Remarks: {request.remarks or '(none)'}\n"
            f"  Flow: {flow_label}\n"
            f"  Amount (IDR): {request.amount_idr:,.0f}\n"
            f"  Bank/Account: {request.account_name or '(unknown)'}\n\n"
            f"Available categories (choose exactly one):\n"
            + "\n".join(f"  - {c}" for c in request.available_categories)
        )

        logger.info(
            "Categorizing | desc=%s | flow=%s | categories=%d",
            request.description, request.flow, len(request.available_categories),
        )

        raw = await self._provider.generate_json(
            system_prompt=_SYSTEM_PROMPT,
            user_prompt=prompt,
            schema=_CATEGORIZE_SCHEMA,
        )

        try:
            data = json.loads(raw) if isinstance(raw, str) else raw
            return CategorizeResponse(
                category=data["category"],
                confidence=float(data.get("confidence", 0.5)),
            )
        except (KeyError, TypeError, ValueError) as e:
            logger.warning("Failed to parse LLM categorize response: %s — raw=%s", e, raw)
            return CategorizeResponse(
                category=request.available_categories[0] if request.available_categories else "Uncategorized",
                confidence=0.0,
            )
