"""FollowUpSuggester: propose the next questions the user is likely to ask.

One cheap structured call, fired AFTER the answer has already streamed — so it
costs nothing in time-to-first-token and nothing at all when it fails.

Suggestions must be SELF-CONTAINED. `/ask` receives a bare query with no
conversation history, so a chip like "rinci per minggu" reaches QueryPlanner
with no antecedent: it plans empty categories and no date range, and the answer
is wrong. Every suggestion therefore names its own category and period.
"""
from __future__ import annotations

import logging

from app.models import FollowUpRequest
from app.providers.base import LlmProvider

logger = logging.getLogger(__name__)

MAX_QUESTIONS = 3
MAX_CHARS = 80
# gemini-2.5-flash spends output tokens on its own thinking pass before the
# visible JSON — a live smoke test showed a 200-token cap starves that pass and
# response.text comes back empty. journey_advisor.py hit the same ceiling and
# settled on 2048; matching it here since a smaller live-tuned number isn't
# worth spending more of the shared 20-req/day free-tier quota to find.
MAX_OUTPUT_TOKENS = 2048

FOLLOWUP_SCHEMA = {
    "type": "object",
    "properties": {
        "questions": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["questions"],
}

SYSTEM_PROMPT = """You propose the next questions a user is likely to ask about \
their own bank transactions, given the question they just asked and the answer \
they received. Rules:
- Return exactly 3 questions.
- Each question MUST be self-contained. It is sent to a stateless backend with \
no conversation history, so name the category and the time period explicitly. \
Write "Bandingkan Room rent Juli vs Juni", never "Bandingkan vs bulan lalu".
- Build on what the ANSWER revealed. If it named a category or merchant, drill \
into that one rather than repeating the question's own framing.
- Each question must be answerable from transaction data alone — dates, \
descriptions, amounts, categories, accounts. Never ask about investments, \
assets, net worth, or for advice.
- Prefer category names from the provided list, verbatim.
- Never repeat the question the user just asked.
- Maximum 80 characters each. Write in the same language as the question."""


def _clean(raw: object, original: str) -> list[str]:
    """Drop anything unusable, then cap at MAX_QUESTIONS.

    Mirrors the closed-vocabulary guard in QueryPlanner and the citation guard in
    AnswerService: the model's output is filtered by trusted code before it can
    reach the UI.
    """
    if not isinstance(raw, list):
        logger.warning("follow-up payload was %s, not a list — discarded", type(raw).__name__)
        return []

    asked = original.strip().casefold()
    seen: set[str] = set()
    out: list[str] = []
    for item in raw:
        if not isinstance(item, str):
            continue
        q = item.strip()
        key = q.casefold()
        if not q or len(q) > MAX_CHARS or key == asked or key in seen:
            continue
        seen.add(key)
        out.append(q)
        if len(out) == MAX_QUESTIONS:
            break
    return out


class FollowUpSuggester:
    def __init__(self, provider: LlmProvider) -> None:
        self._provider = provider

    async def suggest(self, request: FollowUpRequest, categories: list[str]) -> list[str]:
        try:
            raw = await self._provider.generate_json(
                SYSTEM_PROMPT,
                self._build_prompt(request, categories),
                FOLLOWUP_SCHEMA,
                max_output_tokens=MAX_OUTPUT_TOKENS,
            )
        except Exception:
            # Suggestions are decorative: a failure here must never surface as an
            # error next to a perfectly good answer. The client falls back to its
            # own static chips when the list comes back empty.
            logger.exception("follow-up generation failed — returning no suggestions")
            return []
        return _clean(raw.get("questions"), request.question)

    @staticmethod
    def _build_prompt(request: FollowUpRequest, categories: list[str]) -> str:
        lines = [f"Known categories: {', '.join(categories)}"] if categories else []
        lines.append(f"Question the user asked: {request.question}")
        lines.append(f"Answer they received: {request.answer}")
        if request.intent == "aggregate" and request.total_idr is not None:
            lines.append(f"Verified total: Rp {request.total_idr:,.0f}")
        if request.contexts:
            rows = "\n".join(
                f"- {c.date} | {c.description} | {c.flow} | Rp {c.amount_idr:,.0f}"
                for c in request.contexts
            )
            lines.append(f"Transactions cited in the answer:\n{rows}")
        return "\n\n".join(lines)
