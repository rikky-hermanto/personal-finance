from __future__ import annotations
import logging
from typing import TYPE_CHECKING
import re

if TYPE_CHECKING:
    from app.providers.base import LlmProvider

logger = logging.getLogger(__name__)

_SUGGEST_SCHEMA = {
    "type": "object",
    "properties": {
        "suggestions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "merchant_pattern": {"type": "string"},
                    "suggested_category": {"type": "string"},
                    "suggested_keyword": {"type": "string"},
                    "confidence": {"type": "number"},
                },
                "required": ["merchant_pattern", "suggested_category", "suggested_keyword", "confidence"],
            },
        }
    },
    "required": ["suggestions"],
}

_SYSTEM_PROMPT = """You are an expert at categorizing Indonesian bank transactions.
Given a list of merchant/transaction patterns from Indonesian bank statements, 
suggest the most appropriate category for each.

Categories available: {categories}

Rules:
- confidence 0.0-1.0: use 0.9+ only if you're certain (e.g., "INDOMARET" → Groceries)
- suggested_keyword: the shortest substring that uniquely identifies this merchant (uppercase)
- If uncertain, use confidence < 0.7
- Respond in the schema provided, one suggestion per pattern

CRITICAL — suggested_keyword MUST be a merchant name or generic banking term ONLY.
suggested_keyword MUST NOT contain:
- Person names (e.g., "BUDI SANTOSO", "RIKKY HERMANTO")
- Account numbers (e.g., "1234567890")
- Phone numbers (e.g., "+6281234567890", "081234567890")
- Transaction reference IDs (e.g., "TRF/123456")
- Any sequence of 7 or more consecutive digits
If the pattern only contains personal identifiers with no recognizable merchant name,
set confidence to 0.0 and suggested_keyword to an empty string.
"""

# PII validation — dijalankan pada SETIAP keyword yang dikembalikan LLM
_PII_PATTERNS = [
    re.compile(r'\d{7,}'),                    # 7+ digit berturutan
    re.compile(r'(\+62|08\d{2})\d+'),         # nomor HP Indonesia
    re.compile(r'\bA\/N\b', re.IGNORECASE),   # atas nama
    re.compile(r'\bREK\b', re.IGNORECASE),    # rekening
]

def _is_pii_keyword(keyword: str) -> bool:
    return any(p.search(keyword) for p in _PII_PATTERNS)

class MerchantSuggester:
    def __init__(self, provider: "LlmProvider") -> None:
        self._provider = provider

    async def suggest_batch(
        self,
        patterns: list[str],
        available_categories: list[str],
    ) -> list[dict]:
        if not patterns:
            return []

        system = _SYSTEM_PROMPT.format(categories=", ".join(available_categories))
        user = "Categorize these merchant patterns:\n" + "\n".join(
            f"- {p}" for p in patterns
        )

        try:
            result = await self._provider.extract_structured(system, user, _SUGGEST_SCHEMA)
            raw_suggestions = result.get("suggestions", [])

            # Filter out any suggestion where LLM hallucinated PII into the keyword
            suggestions = [
                s for s in raw_suggestions
                if s.get("suggested_keyword") and not _is_pii_keyword(s["suggested_keyword"])
            ]

            if len(suggestions) < len(raw_suggestions):
                logger.warning(
                    "merchant_suggest_pii_filtered",
                    extra={"dropped": len(raw_suggestions) - len(suggestions)},
                )

            logger.info(
                "merchant_suggest_batch",
                extra={"input_count": len(patterns), "output_count": len(suggestions)},
            )
            return suggestions
        except Exception as exc:
            logger.warning("merchant_suggest_batch_failed: %s", exc)
            return []
