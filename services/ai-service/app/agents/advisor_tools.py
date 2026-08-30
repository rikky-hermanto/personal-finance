"""LangGraph tool functions for the Financial Health Advisor agent.

Each tool calls the .NET API via httpx. They are @tool-decorated so LangGraph's
ToolNode can dispatch them automatically from the LLM's tool_calls.

Named advisor_tools.py (not tools.py) — app/agents/tools/ already exists as a
package holding Chapter 7's smolagents-flavored tools (search_category_rules,
find_similar_transactions, list_all_categories). A sibling app/agents/tools.py
module would silently shadow that package on import (Python resolves the
package first), so this LangGraph-flavored tool set gets its own module name.

The .NET API base URL comes from config.net_api_base_url (default: http://localhost:7208).
All tools return a plain dict — ToolNode serializes it back into a ToolMessage.

Endpoint note: GET /api/transactions/aggregated returns both cashflow totals AND
the top-category breakdown in one DashboardDto payload — get_cashflow_summary and
get_spending_by_category both call it and each extract their own slice. There is
no dedicated /api/investments/summary endpoint yet; get_investment_summary
composes /api/networth/current + /api/networth/allocation instead (see the
plan's Notes section for why that gap exists).
"""
from __future__ import annotations

import logging

import httpx
from langchain_core.tools import tool

from app.config import settings

logger = logging.getLogger(__name__)

_CLIENT = httpx.AsyncClient(base_url=settings.net_api_base_url, timeout=10.0)


@tool
async def get_pyramid_scores() -> dict:
    """Fetch the user's current Financial Pyramid tier state.

    Returns a dict with keys: current_level (int 1-5), level_scores
    (dict of "L1".."L5" -> decimal 0-100, only levels with live data present).
    """
    resp = await _CLIENT.get("/api/journey/state")
    resp.raise_for_status()
    data = resp.json()
    return {
        "current_level": data.get("currentLevel"),
        "level_scores": data.get("levelScores", {}),
    }


@tool
async def get_cashflow_summary() -> dict:
    """Fetch total income, total expenses, and net for the current month.

    Returns keys: total_income, total_expenses, net, month.
    """
    resp = await _CLIENT.get("/api/transactions/aggregated")
    resp.raise_for_status()
    data = resp.json()
    summary = data.get("summary", {})
    current_month = data.get("currentMonth", {})
    return {
        "total_income": summary.get("totalIncome"),
        "total_expenses": summary.get("totalExpenses"),
        "net": current_month.get("net"),
        "month": current_month.get("month"),
    }


@tool
async def get_spending_by_category() -> dict:
    """Fetch the top spending categories for the current month.

    Returns a dict of {category_name: total_idr}, highest first.
    """
    resp = await _CLIENT.get("/api/transactions/aggregated")
    resp.raise_for_status()
    top_categories = resp.json().get("topCategories", [])
    return {row["category"]: row["amount"] for row in top_categories}


@tool
async def get_investment_summary() -> dict:
    """Fetch net worth total and the breakdown by asset class (properties,
    investments, savings, vehicles, etc).

    Returns keys: net_worth_idr, allocation_by_class (dict of class name -> IDR value).
    There is no per-holding investment return % yet — see the plan's Notes section.
    """
    net_worth_resp = await _CLIENT.get("/api/networth/current")
    net_worth_resp.raise_for_status()
    allocation_resp = await _CLIENT.get("/api/networth/allocation")
    allocation_resp.raise_for_status()
    return {
        "net_worth_idr": net_worth_resp.json().get("netWorthIdr"),
        "allocation_by_class": allocation_resp.json(),
    }


TOOLS = [get_pyramid_scores, get_cashflow_summary, get_spending_by_category, get_investment_summary]
