"""QueryPlanner: classify intent and extract typed filters from a chat question.

One cheap structured-extraction call. The model chooses WHAT to query
(dates, categories from a closed list, aggregate vs lookup); it never
writes SQL and never sees the data.
"""
from __future__ import annotations

import datetime
import logging

from app.models import QueryPlan
from app.providers.base import LlmProvider

logger = logging.getLogger(__name__)

PLAN_SCHEMA = {
    "type": "object",
    "properties": {
        "intent": {"type": "string", "enum": ["aggregate", "lookup"]},
        "date_from": {"type": "string", "nullable": True},
        "date_to": {"type": "string", "nullable": True},
        "categories": {"type": "array", "items": {"type": "string"}},
        "flow": {"type": "string", "nullable": True, "enum": ["DB", "CR"]},
    },
    "required": ["intent", "categories"],
}

SYSTEM_PROMPT = """You classify a personal-finance question and extract filters. Rules:
- intent=aggregate when the user asks for a total, sum, count, or average \
("berapa", "total", "how much"). intent=lookup when they ask about specific \
transactions ("kapan", "transaksi apa", "yang terbesar").
- Resolve relative dates ("bulan lalu", "this week") against the reference date. \
If the user names a month without a year, use the reference date's year.
- categories MUST be chosen from the provided list verbatim — never invent one. \
Map colloquial terms ("makan" → "Food", "listrik" → "Electricity", "belanja \
minimarket" → "Groceries"). Empty list if nothing maps.
- flow: "DB" for spending questions, "CR" for income questions, null if unclear.
- Dates are YYYY-MM-DD. Do not guess filters the question doesn't imply."""


class QueryPlanner:
    def __init__(self, provider: LlmProvider) -> None:
        self._provider = provider

    async def plan(
        self, query: str, today: datetime.date, categories: list[str]
    ) -> QueryPlan:
        user_prompt = (
            f"Reference date: {today.isoformat()}\n"
            f"Known categories: {', '.join(categories)}\n\n"
            f"Question: {query}"
        )
        raw = await self._provider.generate_json(SYSTEM_PROMPT, user_prompt, PLAN_SCHEMA)
        plan = QueryPlan(**raw)

        # Closed-vocabulary guard: drop anything the model invented.
        known = set(categories)
        invented = [c for c in plan.categories if c not in known]
        if invented:
            logger.warning("planner invented categories %s — dropped", invented)
            plan.categories = [c for c in plan.categories if c in known]
        return plan
