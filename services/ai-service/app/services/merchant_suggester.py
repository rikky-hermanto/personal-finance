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
If the pattern contains personal identifiers but you can still infer the category
(e.g. "BI-FAST CR TRANSFER" → Transfer, "KR OTOMATIS" → Transfer, "BYR VIA E-BANKING" → Bills & Utilities),
still assign the correct category with appropriate confidence, but set suggested_keyword to empty string "".
Only set confidence to 0.0 if you genuinely cannot determine the category.
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

            # Strip PII from keywords but keep the suggestion (category is still useful)
            pii_stripped = 0
            suggestions = []
            for s in raw_suggestions:
                keyword = s.get("suggested_keyword", "")
                if keyword and _is_pii_keyword(keyword):
                    s = {**s, "suggested_keyword": ""}
                    pii_stripped += 1
                suggestions.append(s)

            if pii_stripped:
                logger.warning(
                    "merchant_suggest_pii_stripped",
                    extra={"stripped": pii_stripped},
                )

            logger.info(
                "merchant_suggest_batch",
                extra={"input_count": len(patterns), "output_count": len(suggestions)},
            )
            return suggestions
        except Exception as exc:
            logger.warning("merchant_suggest_batch_failed: %s", exc)
            return []
