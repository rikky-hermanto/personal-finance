import json
import logging
import math
from decimal import Decimal

from app.models import CategorizeRequest, CategorizeResponse
from app.providers.base import LlmProvider

logger = logging.getLogger(__name__)

PROMPT_VERSION = "legacy-categorizer-v1"

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

        logger.info("Categorization started | backend=llm categories=%d", len(request.available_categories))

        raw = await self._provider.generate_json(
            system_prompt=_SYSTEM_PROMPT,
            user_prompt=prompt,
            schema=_CATEGORIZE_SCHEMA,
        )

        try:
            data = json.loads(raw) if isinstance(raw, str) else raw
            raw_category = data["category"]
            raw_confidence = data.get("confidence", 0.5)
            if not isinstance(raw_category, str) or isinstance(raw_confidence, bool):
                raise ValueError("invalid category decision types")
            confidence = float(raw_confidence)
            if not math.isfinite(confidence) or not 0.0 <= confidence <= 1.0:
                raise ValueError("confidence must be finite and between zero and one")
            category = next(
                (
                    offered
                    for offered in request.available_categories
                    if offered.strip().casefold() == raw_category.strip().casefold()
                ),
                None,
            )
            if category is None:
                raise ValueError("category is outside the offered vocabulary")
            return CategorizeResponse(
                category=category,
                confidence=confidence,
                rule_seed_allowed=True,
            )
        except (KeyError, TypeError, ValueError):
            logger.warning(
                "Categorization decision rejected | backend=llm reason=invalid_response"
            )
            return CategorizeResponse(
                category="Uncategorized",
                confidence=0.0,
                rule_seed_allowed=False,
            )
