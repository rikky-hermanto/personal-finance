"""Tool: search existing category rules by keyword."""
from __future__ import annotations

from smolagents import tool

from app.observability import langfuse

# Populated at service startup via load_rules() — same 106 rules the 4-layer
# categorizer uses. A snapshot is correct: rules change rarely, and a stale
# snapshot is better than a live DB call on every agent iteration.
_CATEGORY_RULES: dict[str, str] = {}


def load_rules(rules: dict[str, str]) -> None:
    """Called from main.py lifespan to populate the rules snapshot at startup."""
    global _CATEGORY_RULES
    _CATEGORY_RULES = {k.lower(): v for k, v in rules.items()}


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
        normalized = keyword.lower().strip()
        matches: list[tuple[str, str]] = [
            (pattern, category)
            for pattern, category in _CATEGORY_RULES.items()
            if normalized in pattern or pattern in normalized
        ]
        if not matches:
            result = "No rules matched."
        else:
            lines = [f"  pattern='{p}' → category='{c}'" for p, c in matches[:5]]
            result = "Matched rules:\n" + "\n".join(lines)
        obs.update(output=result)
        return result
