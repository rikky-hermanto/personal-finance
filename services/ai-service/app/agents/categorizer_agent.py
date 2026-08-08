"""Transaction Categorizer Agent — smolagents ToolCallingAgent.

3 tools, ReAct loop (max_steps=3), LiteLLM provider (Gemini primary / Anthropic fallback).
Every tool call is captured as a Langfuse "tool" span nested under a parent "agent" span
(app.observability.langfuse) — smolagents 1.26 has no built-in instrument_smolagents()
OTel hook (confirmed absent in STEP 1b), so tracing is wired manually here and inside
each app/agents/tools/*.py tool body instead of a single startup call.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass

from smolagents import LiteLLMModel, ToolCallingAgent

from app.agents.tools.categories import get_categories, list_all_categories
from app.agents.tools.category_rules import search_category_rules
from app.agents.tools.similarity import find_similar_transactions
from app.config import settings
from app.observability import langfuse

logger = logging.getLogger(__name__)


class AgentRateLimitedError(RuntimeError):
    """The LLM provider rate-limited every one of smolagents' internal retry attempts.

    smolagents/litellm already retry with exponential backoff before this can ever
    surface (see RETRY_MAX_ATTEMPTS in smolagents.models) — by the time this is
    raised, the provider's quota is genuinely exhausted, not transiently busy.
    Distinguished from other failures so callers (the endpoint, the smoke-test
    script) can report "the provider quota is exhausted" instead of a generic
    "something broke", which otherwise reads as a bug in this code.
    """


def _is_rate_limit_error(exc: BaseException) -> bool:
    """Mirrors smolagents.models.is_rate_limit_error — same heuristic, applied
    one layer up so a caller can act on it after smolagents has already given up.
    """
    text = str(exc).lower()
    return any(
        s in text
        for s in ("429", "rate limit", "too many requests", "rate_limit", "resource_exhausted", "quota")
    )


_SYSTEM_PROMPT = """You are a personal finance transaction categorizer.
Given a bank transaction, use the available tools to determine the correct category.

Strategy — follow this order:
1. Call search_category_rules() with the key merchant/service word from the description.
2. If no rule matched OR the result is ambiguous, call find_similar_transactions()
   to see how the user categorized similar past transactions.
3. Call list_all_categories() to pick the exact category name from the valid vocabulary.
4. Return your final answer in EXACTLY this format (no other text):
   CATEGORY: <exact name from list_all_categories>
   CONFIDENCE: <0.0–1.0 — 1.0=rule matched, 0.7=history match, 0.5=inferred>
   REASONING: <1–2 sentences citing which tool gave you the answer>

CRITICAL: CATEGORY must exactly match one name from list_all_categories().
Never invent a category name. If truly uncertain, use 'Other'."""


@dataclass
class CategorizationResult:
    category: str
    confidence: float
    reasoning: str
    tool_calls_count: int


def _safe_float(value: str, default: float = 0.5) -> float:
    """LLMs emit 'CONFIDENCE: 0.9 (high)' often enough to matter."""
    try:
        return float(value.split()[0])
    except (ValueError, IndexError):
        return default


_BOLD_SPAN_RE = re.compile(r"\*\*([^*]+)\*\*")


def _scan_prose_for_category(raw: str) -> str | None:
    """Fallback for when the model narrates instead of emitting the literal
    `CATEGORY: <name>` line the system prompt demands (confirmed live
    2026-08-08: 3 of 5 smoke-test transactions answered in prose instead —
    e.g. '...should be categorized as **Bill**....' — with no CATEGORY: token
    anywhere in the text, so no amount of looser line/key matching finds it).

    Checks each *known* category name against the phrase directly (longest
    name first, so "Food & Drinks" wins over a shorter name that happens to be
    a substring of it) rather than capturing an unknown-length span generically
    — a generic `[\\w &]*?` capture terminates early at the first internal
    space in a multi-word name, which silently mis-extracts "Food" out of
    "Food & Drinks". Also cross-checks bolded spans and a last-resort whole-text
    scan so an unrelated bolded word, or a category name that happens to also
    appear in the transaction description itself, can't produce a false match.
    """
    valid = get_categories()
    if not valid:
        return None
    by_length = sorted(valid, key=len, reverse=True)

    for name in by_length:
        pattern = re.compile(rf"categoriz\w* as\s*\*{{0,2}}{re.escape(name)}\*{{0,2}}\b", re.IGNORECASE)
        if pattern.search(raw):
            return name

    valid_lower = {c.lower(): c for c in valid}
    for span in _BOLD_SPAN_RE.findall(raw):
        candidate = valid_lower.get(span.strip().lower())
        if candidate:
            return candidate

    for name in by_length:
        if re.search(rf"\b{re.escape(name)}\b", raw, re.IGNORECASE):
            return name
    return None


def _parse_result(raw: str, tool_calls_count: int = 0) -> CategorizationResult:
    """Parse the agent's final text into a structured result.

    Line-exact `KEY: value` matching alone silently defaulted every prose-only
    answer to "Other" with no way to tell a genuine "uncertain" from a format
    miss. Strip a leading run of `*` from parsed keys (models bold the label,
    e.g. `**CATEGORY:** Bill`) and fall back to a vocabulary-checked prose scan
    before giving up.
    """
    lines = {}
    for line in raw.strip().splitlines():
        if ":" in line:
            key, _, value = line.partition(":")
            lines[key.strip("* ").upper()] = value.strip()
    category = lines.get("CATEGORY") or _scan_prose_for_category(raw) or "Other"
    return CategorizationResult(
        category=category,
        confidence=_safe_float(lines.get("CONFIDENCE", "")),
        reasoning=lines.get("REASONING", raw[:200]),
        tool_calls_count=tool_calls_count,
    )


class CategorizerAgent:
    def __init__(self) -> None:
        if settings.ai_provider == "gemini":
            model_id = f"gemini/{settings.ai_model}"
            api_key = settings.gemini_api_key
        else:
            model_id = f"anthropic/{settings.ai_model}"
            api_key = settings.anthropic_api_key
        # timeout bounds wall-clock per LLM call — max_steps bounds iteration count,
        # not time; a hung provider call would otherwise hold a to_thread worker forever.
        model = LiteLLMModel(model_id=model_id, api_key=api_key, timeout=30)
        self._agent = ToolCallingAgent(
            tools=[search_category_rules, find_similar_transactions, list_all_categories],
            model=model,
            # The strategy prompt goes HERE — the kwarg confirmed in STEP 1b
            # (`instructions=` on MultiStepAgent, installed smolagents==1.26.0).
            # NOT additional_args: that carries task *variables*, not instructions.
            instructions=_SYSTEM_PROMPT,
            max_steps=3,         # cap: rules → history → vocabulary → done
            verbosity_level=1,   # log intermediate steps to stdout in dev
        )

    def categorize(
        self, description: str, wallet: str, amount_idr: float
    ) -> CategorizationResult:
        """Run the agent for one transaction. Synchronous — call via asyncio.to_thread."""
        task = (
            f"Categorize this bank transaction:\n"
            f"  Description: {description}\n"
            f"  Bank: {wallet}\n"
            f"  Amount (IDR): {amount_idr:,.0f}"
        )
        with langfuse.start_as_current_observation(
            name="categorizer_agent_run", as_type="agent", input=task,
        ) as span:
            try:
                raw = self._agent.run(task)
                # Real step count from the agent's own memory — confirmed in STEP 1b
                # (ToolCallingAgent instances expose .memory.steps). Never hardcode
                # this: a field that is always 0 is worse than no field, because it
                # looks like a measurement.
                steps = getattr(self._agent, "memory", None)
                tool_calls = len(steps.steps) if steps is not None else 0
                result = _parse_result(str(raw), tool_calls_count=tool_calls)
                logger.info(
                    "agent_categorized description=%r category=%r confidence=%s tool_calls=%d",
                    description, result.category, result.confidence, result.tool_calls_count,
                )
                span.update(
                    output=str(raw),
                    metadata={
                        "category": result.category,
                        "confidence": result.confidence,
                        "tool_calls_count": result.tool_calls_count,
                    },
                )
                return result
            except Exception as exc:
                if _is_rate_limit_error(exc):
                    # smolagents already retried internally (3 attempts, exponential
                    # backoff) before this surfaced — this is a genuinely exhausted
                    # provider quota, not a transient blip worth retrying again here.
                    logger.warning(
                        "agent categorization rate-limited by provider description=%r — %s",
                        description, exc,
                    )
                    span.update(level="ERROR", status_message="provider rate limit exhausted")
                    raise AgentRateLimitedError(
                        f"LLM provider rate limit exhausted after internal retries: {exc}"
                    ) from exc
                logger.exception("agent categorization failed description=%r", description)
                span.update(level="ERROR", status_message="agent categorization failed")
                raise
