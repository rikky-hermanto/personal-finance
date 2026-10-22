"""Personal Finance MCP Server — FastMCP over SSE transport.

Exposes 4 tools to any MCP-compatible client (Claude Desktop, Claude Code, agents):
  get_transactions            — filtered transaction list from Supabase
  get_cashflow_summary        — spending totals by category for a period
  get_pyramid_scores          — current Financial Pyramid tier scores (via .NET API)
  search_transactions_semantic — pgvector semantic search (PF-AI003 retriever)

Mounted at /mcp by main.py. Shares the asyncpg pool and RetrievalService
from the main lifespan — no second DB connection pool.

Note on owner scoping (PF-S15): the AI service became owner-scoped after this
chapter was planned. RetrievalService.search() now requires an owner_id, and
transactions carry a user_id. For local single-owner use the MCP server resolves
the one owner at startup (set_owner) and passes it to the retriever. The direct
asyncpg queries (get_transactions / get_cashflow_summary) connect as the pool's
role, which bypasses RLS — correct for a single-owner local deployment. When
PF-S08-style auth reaches the SSE endpoint, these should take the owner from the
request instead.
"""
from __future__ import annotations

import logging
import uuid
from typing import Any

import asyncpg
import httpx
from fastmcp import FastMCP

from app.config import settings

logger = logging.getLogger(__name__)

mcp = FastMCP("Personal Finance")

# ── Shared state (injected from main.py lifespan) ─────────────────────────────
_pool: asyncpg.Pool | None = None
_retriever: Any | None = None
_owner_id: uuid.UUID | None = None


def set_pool(pool: asyncpg.Pool) -> None:
    global _pool
    _pool = pool


def set_retriever(retriever: Any) -> None:
    global _retriever
    _retriever = retriever


def set_owner(owner_id: uuid.UUID) -> None:
    """Record the single local owner (PF-S15) used to scope semantic search."""
    global _owner_id
    _owner_id = owner_id


def _get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("asyncpg pool not initialised — call set_pool() in lifespan")
    return _pool


def _require_owner() -> uuid.UUID:
    if _owner_id is None:
        raise RuntimeError("owner not resolved — call set_owner() in lifespan (no transactions found?)")
    return _owner_id


# ── Tool: get_transactions ────────────────────────────────────────────────────

@mcp.tool()
async def get_transactions(
    date_from: str | None = None,
    date_to: str | None = None,
    category: str | None = None,
    account: str | None = None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    """Get bank transactions with optional filters.

    Returns transactions most-recent-first. All amounts are in IDR.
    Flow: 'DB' = debit (expense), 'CR' = credit (income).

    Args:
        date_from: Start date (YYYY-MM-DD). Omit for no lower bound.
        date_to:   End date (YYYY-MM-DD). Omit for no upper bound.
        category:  Filter by category name (case-insensitive partial match).
        account:   Filter by bank account name (case-insensitive partial match).
        limit:     Max results to return (default 20, max 100).

    Returns list of: {date, description, category, amount_idr (float), flow, account}
    """
    limit = min(limit, 100)
    pool = _get_pool()

    where = ["1=1"]
    params: list[Any] = []

    def add(clause: str, value: Any) -> None:
        params.append(value)
        where.append(clause.replace("{n}", str(len(params))))

    if date_from:
        add("t.date >= ${n}::date", date_from)
    if date_to:
        add("t.date <= ${n}::date", date_to)
    if category:
        add("t.category ILIKE '%' || ${n} || '%'", category)
    if account:
        add("a.name ILIKE '%' || ${n} || '%'", account)

    params.append(limit)
    sql = f"""
        SELECT
            t.date::text          AS date,
            t.description,
            COALESCE(t.category, '') AS category,
            t.amount_idr::float   AS amount_idr,
            t.flow,
            COALESCE(a.name, '')  AS account
        FROM transactions t
        LEFT JOIN accounts a ON a.id = t.account_id
        WHERE {" AND ".join(where)}
        ORDER BY t.date DESC, t.id DESC
        LIMIT ${len(params)}
    """
    async with pool.acquire() as conn:
        rows = await conn.fetch(sql, *params)
    return [dict(r) for r in rows]


# ── Tool: get_cashflow_summary ──────────────────────────────────────────────

_PERIOD_SQL: dict[str, tuple[str, str]] = {
    "this_month": (
        "date_trunc('month', CURRENT_DATE)",
        "CURRENT_DATE",
    ),
    "last_month": (
        "date_trunc('month', CURRENT_DATE - INTERVAL '1 month')",
        "date_trunc('month', CURRENT_DATE) - INTERVAL '1 day'",
    ),
    "this_year": (
        "date_trunc('year', CURRENT_DATE)",
        "CURRENT_DATE",
    ),
}


@mcp.tool()
async def get_cashflow_summary(period: str = "this_month") -> list[dict[str, Any]]:
    """Get spending and income totals grouped by category for a time period.

    Returns one row per category with total debit (expense) and credit (income).
    Useful for answering "how much did I spend on X this month?" questions.

    Args:
        period: Time window — 'this_month' (default), 'last_month', or 'this_year'.

    Returns list of: {category, total_debit (float, IDR), total_credit (float, IDR), count (int)}
    """
    if period not in _PERIOD_SQL:
        period = "this_month"

    date_from_expr, date_to_expr = _PERIOD_SQL[period]
    pool = _get_pool()

    sql = f"""
        SELECT
            COALESCE(t.category, 'Uncategorized') AS category,
            SUM(CASE WHEN t.flow = 'DB' THEN t.amount_idr ELSE 0 END)::float AS total_debit,
            SUM(CASE WHEN t.flow = 'CR' THEN t.amount_idr ELSE 0 END)::float AS total_credit,
            COUNT(*)::int AS count
        FROM transactions t
        WHERE t.date BETWEEN {date_from_expr} AND {date_to_expr}
        GROUP BY t.category
        ORDER BY total_debit DESC
    """
    async with pool.acquire() as conn:
        rows = await conn.fetch(sql)
    return [dict(r) for r in rows]


# ── Tool: get_pyramid_scores ────────────────────────────────────────────────

@mcp.tool()
async def get_pyramid_scores() -> list[dict[str, Any]]:
    """Get the current Financial Pyramid tier scores.

    Returns the 5-tier pyramid score (L1=Foundations through L5=Legacy),
    each with a 0.0–1.0 score and a status indicator.

    The pyramid defines the correct order for financial health:
    L1 Foundations → L2 Defense → L3 Growth → L4 Freedom → L5 Legacy.
    Each tier must be achieved before the next unlocks.

    Returns list of: {tier (str), score (float 0–1), status (str)}
    Status values: 'locked', 'in_progress', 'achieved'
    """
    async with httpx.AsyncClient(
        base_url=settings.net_api_base_url, timeout=10.0
    ) as client:
        response = await client.get("/api/journey/scores")
        response.raise_for_status()
        return response.json()


# ── Tool: search_transactions_semantic ──────────────────────────────────────

@mcp.tool()
async def search_transactions_semantic(
    query: str,
    top_k: int = 5,
) -> list[dict[str, Any]]:
    """Search transactions using natural language via semantic vector search.

    Uses pgvector cosine similarity over OpenAI/Gemini embeddings to find
    transactions semantically related to the query — even when exact words
    don't match (e.g., 'kopi' finds 'STARBUCKS' and 'GOPAY KAFE BENGKEL').

    Args:
        query: Natural-language search query (Indonesian or English).
        top_k: Number of results to return (default 5, max 20).

    Returns list of: {transaction_id (int), date, description, amount_idr (float),
                      flow, account, similarity (float 0–1)}
    """
    if _retriever is None:
        raise RuntimeError("RetrievalService not initialised — start the AI service first")
    top_k = min(top_k, 20)
    # PF-S15: the retriever is owner-scoped. Pass the resolved local owner.
    results = await _retriever.search(query=query, top_k=top_k, owner_id=_require_owner())
    return [
        {
            "transaction_id": r.transaction_id,
            "date": r.date,
            "description": r.description,
            "amount_idr": float(r.amount_idr),
            "flow": r.flow,
            "account": r.wallet,
            "similarity": round(r.similarity, 3),
        }
        for r in results
    ]
