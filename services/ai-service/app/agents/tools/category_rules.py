"""Tool: search existing category rules by keyword."""
from __future__ import annotations

from smolagents import tool

from app.agents.owner_context import current_owner_context
from app.observability import langfuse

# PF-S15: the rules are the caller's private rules plus the shared presets, loaded once
# per request into the owner context (app/services/owner_rules.py) rather than on every
# agent iteration. There is no global cross-user snapshot any more.


@tool
def search_category_rules(keyword: str) -> str:
    """Search the category rule base for a keyword match. Use this tool FIRST.

    Rule matches are deterministic and zero-cost — always check rules before
    falling back to similarity search. Returns matching category names and the
    rule patterns that triggered them. Returns 'No rules matched.' when empty.

    Args:
        keyword: Single word or short phrase extracted from the transaction
                 description (e.g. 'starbucks', 'tokopedia', 'listrik', 'grab').
    """
    with langfuse.start_as_current_observation(
        name="search_category_rules", as_type="tool", input={"keyword": keyword}
    ) as obs:
        context = current_owner_context()
        if context is None:
            result = "Rule search unavailable."
            obs.update(output=result)
            return result
        normalized = keyword.lower().strip()
        matches: list[tuple[str, str]] = [
            (pattern, category)
            for pattern, category in context.rules.items()
            if normalized in pattern or pattern in normalized
        ]
        if not matches:
            result = "No rules matched."
        else:
            # ASCII only: smolagents echoes observations to stdout, which is cp1252 on a
            # redirected Windows console, and a non-encodable arrow there 502s the run.
            lines = [f"  pattern='{p}' -> category='{c}'" for p, c in matches[:5]]
            result = "Matched rules:\n" + "\n".join(lines)
        obs.update(output=result)
        return result
