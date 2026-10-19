"""Tool: return the full known category vocabulary."""
from __future__ import annotations

from smolagents import tool

from app.agents.owner_context import current_owner_context
from app.observability import langfuse

# Used when the caller has no categorised transactions yet (a new user). It holds no
# user data, so it is safe to show anyone. The real list is per owner (PF-S15): the
# SAME vocabulary the query planner uses, so the agent picks from it instead of
# inventing names.
FALLBACK_CATEGORIES = [
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


def get_categories() -> list[str]:
    """The current caller's vocabulary — also used by the result parser's prose-scan
    fallback in categorizer_agent.py when the model narrates instead of emitting a
    literal `CATEGORY: <name>` line. Empty when no owner context is bound.
    """
    context = current_owner_context()
    return list(context.categories) if context else []


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
        categories = get_categories()
        if not categories:
            result = "Category list unavailable."
        else:
            result = "Valid categories:\n" + "\n".join(f"  - {c}" for c in categories)
        obs.update(output=result)
        return result
