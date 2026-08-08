"""Tool: return the full known category vocabulary."""
from __future__ import annotations

from smolagents import tool

from app.observability import langfuse

# Populated at startup from app.state.categories — the SAME vocabulary the
# query planner uses. The agent picks from this to avoid inventing names.
_CATEGORIES: list[str] = []

# Fallback ONLY — used when the DB is unreachable at startup or the transactions
# table is empty (fresh install). Never the primary source.
_FALLBACK_CATEGORIES = [
    "Food & Dining", "Food & Dining (Café)", "Food & Dining (Fast Food)",
    "Transportation", "Transportation (Online)", "Transportation (Fuel)",
    "Shopping", "Shopping (Online)", "Shopping (Groceries)",
    "Bills & Utilities", "Bills & Utilities (Electricity)", "Bills & Utilities (Internet)",
    "Entertainment", "Entertainment (Streaming)", "Entertainment (Gaming)",
    "Health & Medical", "Health & Medical (Pharmacy)",
    "Education", "Travel & Accommodation",
    "Personal Care", "Financial Services", "Investment", "Income",
    "Transfer", "ATM Withdrawal", "Other",
]


def load_categories(categories: list[str]) -> None:
    """Called from main.py lifespan. Falls back if the DB load returned nothing."""
    global _CATEGORIES
    _CATEGORIES = list(categories) if categories else list(_FALLBACK_CATEGORIES)


def get_categories() -> list[str]:
    """Public accessor for the loaded vocabulary — used by the result parser's
    prose-scan fallback in categorizer_agent.py when the model narrates instead
    of emitting a literal `CATEGORY: <name>` line.
    """
    return list(_CATEGORIES)


@tool
def list_all_categories() -> str:
    """Return the complete list of valid category names.

    Use this tool when you need to pick the most appropriate category from
    the system vocabulary. Your final CATEGORY must exactly match one of
    these names — do NOT invent category names. If uncertain, use 'Other'.
    """
    with langfuse.start_as_current_observation(
        name="list_all_categories", as_type="tool", input={}
    ) as obs:
        result = "Valid categories:\n" + "\n".join(f"  - {c}" for c in _CATEGORIES)
        obs.update(output=result)
        return result
