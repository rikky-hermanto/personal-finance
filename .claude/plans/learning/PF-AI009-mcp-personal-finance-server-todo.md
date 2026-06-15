# PF-AI009 — Model Context Protocol (MCP) Server

> **Learning Phase:** Phase 3 · Chapter 9 of 12 · Day ~60 of 90
> **Status:** To Do
> **Started:** —
> **Planned from branch:** main
> **Pivot goal:** Ship a personal-finance MCP server callable from Claude Desktop. MCP is Anthropic's open protocol for giving AI assistants structured tool access to external systems — companies building AI features in 2026 use it to connect LLMs to their data without custom tool plumbing. After this chapter, Claude Desktop can query your transactions, run semantic search, and read your pyramid scores. You can explain the protocol, design a tool schema from scratch, and articulate the tradeoffs (stdio vs SSE, tool granularity, auth surface) — the vocabulary that shows up in AI engineering JDs and staff-level interviews.

## Objective

Chapters 1–8 built a complete RAG + agent stack within one service. MCP lifts that capability into a protocol — a stable, typed interface that lets any MCP-compatible client (Claude Desktop, Claude Code, other agents) use your financial tools without custom integration per caller. The chapter delivers:

1. **FastMCP server in the existing AI service** — 4 tools exposed at `/mcp` over SSE transport (the transport Claude Desktop uses natively)
2. **4 production tools with typed schemas:**
   - `get_transactions(date_from, date_to, category, account, limit)` → filtered transaction list from Supabase
   - `get_cashflow_summary(period)` → spending totals by category for a time window
   - `get_pyramid_scores()` → current Financial Pyramid tier scores + indicators (via .NET API)
   - `search_transactions_semantic(query, top_k)` → pgvector semantic search (reuses PF-AI003 `RetrievalService`)
3. **Claude Desktop integration** — tools callable from natural language; demo conversation works end-to-end
4. **Stretch: 2-agent MCP workflow** — an orchestrator agent dispatches calls to your MCP server to answer a multi-step financial question

**Depends on:** PF-AI003 (`RetrievalService`, pgvector semantic search — `search_transactions_semantic` reuses it directly)
**Unblocks:** Chapter 10 demo Loom (the MCP server is the "look at what I built" segment)

---

## Acceptance Criteria

- [ ] `fastmcp>=2.0` and `httpx>=0.27` in `pyproject.toml`; installed in venv; `import fastmcp` works
- [ ] `app/mcp_server.py` defines a `FastMCP` instance with all 4 tools; no `Any` types on tool signatures — all parameters typed, all tools have docstrings
- [ ] `get_transactions()` queries Supabase `transactions + accounts` via asyncpg (same pool as `RetrievalService`); returns list of dicts; filters compile to parametrized SQL WHERE clauses (no string interpolation of values); hard cap at 100 rows regardless of `limit` param
- [ ] `get_cashflow_summary()` returns totals grouped by category, computed in SQL, for `this_month`, `last_month`, `this_year`; numeric totals are `float` (JSON-serializable; Decimal → float conversion happens here)
- [ ] `get_pyramid_scores()` calls `.NET API GET /api/journey/scores` via `httpx.AsyncClient`; returns the JSON response; raises on non-2xx (tool error, not silent empty)
- [ ] `search_transactions_semantic()` calls `RetrievalService.search()` directly — no new embedding code; caps `top_k` at 20
- [ ] MCP server mounted to the existing FastAPI app at `/mcp` via SSE transport; `curl http://localhost:8000/mcp` returns 200 or SSE handshake (not 404)
- [ ] Claude Desktop configured (Windows: `%APPDATA%\Claude\claude_desktop_config.json`); all 4 tools visible in the tools panel; each tool callable from natural language
- [ ] Demo conversation works end-to-end: "berapa pengeluaran makan bulan ini?" → Claude Desktop calls `get_cashflow_summary` and returns a correct IDR total
- [ ] `tests/test_mcp_server.py` passes — all 4 tools tested with mocked asyncpg / mocked httpx (no real API calls in tests)
- [ ] No `.env` / credentials in any committed file; `claude_desktop_config.json` not committed

---

## Approach

**FastMCP inside the existing AI service — not a standalone process.** The AI service already manages the asyncpg pool, `RetrievalService`, and embedding provider. Co-locating the MCP server reuses all of that without a second process. FastMCP mounts onto the existing FastAPI app — the same lifespan starts both the RAG endpoints and the MCP server, so tool handlers share `app.state.retriever` directly. Single port (`8000`), single process, simpler Claude Desktop config.

**SSE transport, not stdio.** Claude Desktop supports both: stdio (spawns a local subprocess) and SSE (HTTP long-poll to a running server). Since the AI service is already running (`npm start` or `uvicorn`), SSE is the right transport — Claude Desktop connects to `http://localhost:8000/mcp` on demand, no process management needed. Stdio makes sense for a self-contained CLI tool that doesn't share infrastructure; not the case here.

**Supabase directly for transaction data; .NET API for computed values.** The `transactions` table is owned by Supabase — direct asyncpg queries are fast and avoid an extra HTTP hop. Pyramid scores and journey tier calculations live in the .NET `JourneyScoringService` — calling `GET /api/journey/scores` via httpx is the honest seam: the .NET API owns that business logic and the MCP server shouldn't duplicate it. Same principle as the existing `JourneyAdvisorClient` / `PortfolioReviewClient` pattern.

**Typed tool schemas — no `dict` returns.** MCP generates the tool's JSON schema from Python type annotations. `dict` as a return type is opaque (`{}` in the schema) — the AI client doesn't know what fields to expect. Typed returns (TypedDict or explicit `list[dict[str, str | float | int]]` with a docstring listing fields) generate a richer schema that the client uses to format output and generate accurate follow-up calls.

**No auth for local dev.** The MCP server inherits the AI service's no-auth posture. When PF-S08 wires Supabase Auth + JWTs, the SSE endpoint will need a bearer token guard. Note it; don't implement it now.

Out of scope: MCP Resources (URI-addressed data), MCP Prompts (pre-baked templates), remote MCP deployment, auth (PF-S08), conversation memory in tools. Don't add them.

---

## Affected Files

| File | Change |
|------|--------|
| `services/ai-service/app/mcp_server.py` | Create — FastMCP server, 4 tool definitions |
| `services/ai-service/app/main.py` | Edit — import mcp, call `set_pool`/`set_retriever` in lifespan, mount at `/mcp` |
| `services/ai-service/app/config.py` | Edit — add `net_api_base_url: str = "http://localhost:7208"` |
| `services/ai-service/pyproject.toml` | Edit — add `fastmcp>=2.0`, `httpx>=0.27` |
| `services/ai-service/tests/test_mcp_server.py` | Create — unit tests (mocked asyncpg + mocked httpx) |
| Claude Desktop config (user machine only) | Configure — `%APPDATA%\Claude\claude_desktop_config.json` (not committed) |

---

## TODO

### [ ] STEP 0 — Theory: MCP concepts (30 min, read before building)

The spec is short and worth reading once — it defines the vocabulary for every MCP interview question.

**Read (in this order):**
1. MCP introduction → https://modelcontextprotocol.io/introduction (10 min — "why" and the three primitives: Tools, Resources, Prompts)
2. MCP concepts: Tools → https://modelcontextprotocol.io/docs/concepts/tools (10 min — how tool schemas are generated from Python annotations; how the client calls them)
3. FastMCP README → https://github.com/jlowin/fastmcp (10 min — `@mcp.tool()` decorator; FastAPI mounting pattern)

**Active-retrieval task (do NOT skip):** Close all tabs. Write from memory:
- What are the three MCP primitives and when would you use each one in a personal finance context?
- What is the difference between stdio and SSE MCP transport? When does each make sense?
- Why does typing tool parameters and return values matter specifically in MCP (vs just using `dict`)?

> **The interview frame:** "MCP is the protocol layer above tool use. In standard `tool_use` API calls, tools are one-shot — you define them per request, the model calls them, you get a result. MCP turns tools into a persistent typed server any MCP client can discover and call, without re-defining the schema each time. Three primitives: Tools (functions the AI calls), Resources (data the AI reads), Prompts (pre-baked templates). For personal finance I exposed four Tools — the same operations a financial analyst would reach for first: transactions, spending summary, pyramid scores, semantic search."

---

### [ ] STEP 1 — Install FastMCP + run the quickstart

Before building the real server, run the MCP quickstart to see the protocol end-to-end.

```bash
cd services/ai-service
pip install "fastmcp>=2.0" "httpx>=0.27"
```

Add to `pyproject.toml` `[project.dependencies]`:
```toml
    "fastmcp>=2.0",
    "httpx>=0.27",
```

**Quickstart: standalone stdio server (15 min)**

```python
# scratch/mcp_hello.py — NOT committed; feel the protocol
from fastmcp import FastMCP

mcp = FastMCP("Hello Finance")

@mcp.tool()
def hello(name: str) -> str:
    """Say hello — the simplest possible MCP tool."""
    return f"Hello, {name}! Your finances await."

if __name__ == "__main__":
    mcp.run()   # stdio transport
```

```bash
# Verify startup (waits for JSON-RPC stdin — Ctrl+C after 3s)
PYTHONPATH=. python scratch/mcp_hello.py
```

Then open the MCP Inspector to call it interactively:
```bash
npx @modelcontextprotocol/inspector python scratch/mcp_hello.py
```

Expected: the inspector browser page shows a `hello` tool listed; calling it returns "Hello, Rikky! Your finances await."

> **Why quickstart before the real server?** The inspector exercise makes the protocol concrete — you see the JSON-RPC handshake, the tool list, and the call/response cycle before you're also fighting asyncpg and httpx. This is the mental model anchor, not a detour.

---

### [ ] STEP 2 — THINK-03 gate: design the tool schemas field-by-field

Before writing any tool code, list every parameter and return field (THINK-03 discipline — wrong types here are silently wrong in the client):

| Tool | Field | Direction | Type | Notes |
|------|-------|-----------|------|-------|
| `get_transactions` | `date_from` | param | `str \| None` | ISO 8601 `YYYY-MM-DD`; cast to `::date` in SQL |
| | `date_to` | param | `str \| None` | ISO 8601 |
| | `category` | param | `str \| None` | ILIKE match |
| | `account` | param | `str \| None` | ILIKE on `accounts.name` |
| | `limit` | param | `int` | Default 20, hard-capped at 100 |
| | `date` | return | `str` | `YYYY-MM-DD` |
| | `description` | return | `str` | |
| | `category` | return | `str` | May be empty string |
| | `amount_idr` | return | `float` | Positive; IDR only; `Decimal → float` here |
| | `flow` | return | `str` | `"DB"` or `"CR"` |
| | `account` | return | `str` | Bank name |
| `get_cashflow_summary` | `period` | param | `str` | `"this_month"`, `"last_month"`, `"this_year"` |
| | `category` | return | `str` | |
| | `total_debit` | return | `float` | Sum of outflows |
| | `total_credit` | return | `float` | Sum of inflows |
| | `count` | return | `int` | Transaction count in period |
| `get_pyramid_scores` | *(none)* | param | — | |
| | passthrough | return | `list[dict]` | JSON from `.NET API` — shape: `[{tier, score, status}]` |
| `search_transactions_semantic` | `query` | param | `str` | Natural language |
| | `top_k` | param | `int` | Default 5, hard-capped at 20 |
| | `transaction_id` | return | `int` | |
| | `date` | return | `str` | |
| | `description` | return | `str` | |
| | `amount_idr` | return | `float` | |
| | `flow` | return | `str` | |
| | `account` | return | `str` | |
| | `similarity` | return | `float` | Rounded to 3dp |

> **Why this table before code?** A tool schema is the contract between your server and every MCP client that ever calls it. Wrong types (e.g., `Decimal` instead of `float`) produce JSON serialization errors that are confusing to diagnose client-side. Getting the types right in 5 minutes of table work prevents 20 minutes of "why is this field null in Claude Desktop" debugging.

---

### [ ] STEP 3 — Create `app/mcp_server.py` with `get_transactions`

Create `services/ai-service/app/mcp_server.py`:

```python
"""Personal Finance MCP Server — FastMCP over SSE transport.

Exposes 4 tools to any MCP-compatible client (Claude Desktop, Claude Code, agents):
  get_transactions            — filtered transaction list from Supabase
  get_cashflow_summary        — spending totals by category for a period
  get_pyramid_scores          — current Financial Pyramid tier scores (via .NET API)
  search_transactions_semantic — pgvector semantic search (PF-AI003 retriever)

Mounted at /mcp by main.py. Shares the asyncpg pool and RetrievalService
from the main lifespan — no second DB connection pool.
"""
from __future__ import annotations

import logging
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


def set_pool(pool: asyncpg.Pool) -> None:
    global _pool
    _pool = pool


def set_retriever(retriever: Any) -> None:
    global _retriever
    _retriever = retriever


def _get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("asyncpg pool not initialised — call set_pool() in lifespan")
    return _pool


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
```

Create `services/ai-service/tests/test_mcp_server.py`:

```python
"""Unit tests for the MCP server tool handlers — all external calls mocked."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.fixture
def mock_pool():
    pool = MagicMock()
    conn = AsyncMock()
    pool.acquire.return_value.__aenter__ = AsyncMock(return_value=conn)
    pool.acquire.return_value.__aexit__ = AsyncMock(return_value=None)
    return pool, conn


@pytest.mark.asyncio
async def test_get_transactions_returns_list(mock_pool):
    pool, conn = mock_pool
    conn.fetch = AsyncMock(return_value=[
        {"date": "2026-03-01", "description": "GOPAY MERCHANT", "category": "Food & Dining",
         "amount_idr": 25000.0, "flow": "DB", "account": "BCA"},
    ])
    import app.mcp_server as srv
    srv.set_pool(pool)
    results = await srv.get_transactions(category="makan", limit=5)
    assert isinstance(results, list)
    assert results[0]["flow"] in ("DB", "CR")


@pytest.mark.asyncio
async def test_get_transactions_hard_caps_limit(mock_pool):
    pool, conn = mock_pool
    conn.fetch = AsyncMock(return_value=[])
    import app.mcp_server as srv
    srv.set_pool(pool)
    await srv.get_transactions(limit=9999)
    call_args = conn.fetch.call_args
    # 100 (the cap) must appear in the positional params
    assert 100 in call_args.args
```

```bash
cd services/ai-service && PYTHONPATH=. pytest tests/test_mcp_server.py::test_get_transactions_returns_list -v
```

> **Why a hard limit cap?** MCP tools are called by an AI with no concept of "how big is this table." Without a cap, `get_transactions(limit=10000)` reads the entire transactions table on every LLM call — a 5,000-row result bloats the context window and adds unnecessary Supabase load. 100 is the generous upper bound for what a single chat turn can usefully process. This pattern appears in every production RAG / tool API.

---

### [ ] STEP 4 — Add `get_cashflow_summary` tool

Add to `app/mcp_server.py`:

```python
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
```

Add to `tests/test_mcp_server.py`:

```python
@pytest.mark.asyncio
async def test_get_cashflow_summary_groups_by_category(mock_pool):
    pool, conn = mock_pool
    conn.fetch = AsyncMock(return_value=[
        {"category": "Food & Dining", "total_debit": 500000.0, "total_credit": 0.0, "count": 10},
        {"category": "Income", "total_debit": 0.0, "total_credit": 15000000.0, "count": 1},
    ])
    import app.mcp_server as srv
    srv.set_pool(pool)
    result = await srv.get_cashflow_summary("this_month")
    assert any(r["category"] == "Income" for r in result)


@pytest.mark.asyncio
async def test_get_cashflow_summary_unknown_period_defaults_gracefully(mock_pool):
    pool, conn = mock_pool
    conn.fetch = AsyncMock(return_value=[])
    import app.mcp_server as srv
    srv.set_pool(pool)
    # Unknown period falls back to this_month — should not raise
    await srv.get_cashflow_summary("decade")
```

> **Why embed SQL date expressions instead of computing dates in Python?** `date_trunc('month', CURRENT_DATE)` evaluates in Postgres timezone context — no risk of Python-side date arithmetic drifting relative to the DB. The period key is a closed literal set (not user input), so there's no injection risk in interpolating the expression name. If `period` were user-supplied, approach would differ.

---

### [ ] STEP 5 — Add `get_pyramid_scores` tool (calls .NET API)

Add `net_api_base_url` to `app/config.py` Settings class:

```python
net_api_base_url: str = "http://localhost:7208"
```

Add to `app/mcp_server.py`:

```python
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
```

Add to `tests/test_mcp_server.py`:

```python
@pytest.mark.asyncio
async def test_get_pyramid_scores_calls_net_api():
    with patch("app.mcp_server.httpx.AsyncClient") as mock_cls:
        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_response.json.return_value = [
            {"tier": "L1", "score": 0.95, "status": "achieved"},
            {"tier": "L2", "score": 0.72, "status": "in_progress"},
        ]
        mock_response.raise_for_status = MagicMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_cls.return_value.__aexit__ = AsyncMock(return_value=None)

        import app.mcp_server as srv
        result = await srv.get_pyramid_scores()
        assert result[0]["tier"] == "L1"
        mock_client.get.assert_called_once_with("/api/journey/scores")
```

> **Why call the .NET API instead of querying Supabase directly?** `JourneyScoringService` computes tier scores from transactions, assets, and investments with business logic spread across MediatR handlers. Duplicating that logic in Python creates a maintenance split — change the scoring formula and forget to update the Python copy. The HTTP boundary is deliberate: Python owns embeddings and MCP tooling; .NET owns scoring. The 10ms HTTP overhead is negligible in a chat interaction.

> **If the .NET API is not running:** the tool raises `httpx.ConnectError` — FastMCP propagates this as a tool error to the client. That's correct: the tool should not silently return empty. In Claude Desktop, the user sees "tool call failed." Start the .NET API before demoing pyramid scores (`cd apps/api && dotnet run --project src/PersonalFinance.Api`).

**Verify the endpoint exists before coding:**
```bash
curl http://localhost:7208/api/journey/scores
```
If 404: check `JourneyController.cs` for the actual route name and adjust the path.

---

### [ ] STEP 6 — Add `search_transactions_semantic` tool (reuses PF-AI003)

Add to `app/mcp_server.py`:

```python
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
    results = await _retriever.search(query=query, top_k=top_k)
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
```

Add to `tests/test_mcp_server.py`:

```python
@pytest.mark.asyncio
async def test_search_transactions_semantic_delegates_to_retriever():
    from app.models import SearchResult
    mock_retriever = AsyncMock()
    mock_retriever.search = AsyncMock(return_value=[
        SearchResult(transaction_id=1, similarity=0.92, description="STARBUCKS",
                     date="2026-03-10", amount_idr=45000.0, flow="DB", wallet="BCA"),
    ])
    import app.mcp_server as srv
    srv.set_retriever(mock_retriever)
    results = await srv.search_transactions_semantic("kopi", top_k=3)
    assert results[0]["description"] == "STARBUCKS"
    assert results[0]["similarity"] == 0.92
    mock_retriever.search.assert_called_once_with(query="kopi", top_k=3)


@pytest.mark.asyncio
async def test_search_transactions_semantic_caps_top_k():
    mock_retriever = AsyncMock()
    mock_retriever.search = AsyncMock(return_value=[])
    import app.mcp_server as srv
    srv.set_retriever(mock_retriever)
    await srv.search_transactions_semantic("test", top_k=999)
    mock_retriever.search.assert_called_once_with(query="test", top_k=20)
```

```bash
PYTHONPATH=. pytest tests/test_mcp_server.py -v
```

> **Why reuse `RetrievalService` instead of embedding again?** The retriever already manages the asyncpg pool, handles Gemini/OpenAI embedding via `EmbeddingProvider`, applies the model-match guard (`WHERE te.model = $4`), and is Langfuse-traced. Adding a second embed call in the MCP tool would duplicate all of that. This is "thin tool, fat service" — the MCP tool is a controller, not a service; same pattern as ASP.NET Core controllers calling services.

---

### [ ] STEP 7 — Wire MCP server into `main.py`

FastMCP supports mounting onto a FastAPI app over SSE. The exact method name depends on the installed version — check first:

```bash
cd services/ai-service
python -c "from fastmcp import FastMCP; m = FastMCP('test'); print([a for a in dir(m) if 'app' in a or 'mount' in a or 'sse' in a])"
```

Common method names across FastMCP versions: `sse_app()`, `get_mcp_app()`, `streamable_http_app()`, `http_app()`. Use whichever the above lists.

Edit `services/ai-service/app/main.py`:

```python
# At top level (after app = FastAPI(...)):
from app.mcp_server import mcp, set_pool, set_retriever

# Mount — adjust method name to match what the check above found:
mcp_app = mcp.sse_app()          # or mcp.get_mcp_app() / mcp.streamable_http_app()
app.mount("/mcp", mcp_app)
```

In the `lifespan` context manager, after the pool and retriever are created, inject them into the MCP server:

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # ... existing pool + service setup unchanged ...
    pool = await asyncpg.create_pool(settings.database_url, ...)
    app.state.pool = pool
    retriever = RetrievalService(pool=pool, embedding_provider=embedding_provider)
    app.state.retriever = retriever

    # MCP server shares the same pool + retriever — no second connection pool
    set_pool(pool)
    set_retriever(retriever)

    yield
    await pool.close()
```

Smoke test:
```bash
cd services/ai-service && uvicorn app.main:app --reload --port 8000

# Verify /mcp exists (exact response depends on FastMCP version)
curl -v http://localhost:8000/mcp
# Expected: 200 or SSE handshake response — NOT 404
```

> **FastMCP version drift note.** If `sse_app()` doesn't exist or mounting fails, fall back to running a separate stdio entry point (see Step 8 fallback). Document which version you installed in the Notes section at the bottom of this plan.

---

### [ ] STEP 8 — Configure Claude Desktop + test end-to-end

**Windows config path:** `%APPDATA%\Claude\claude_desktop_config.json`
(typically `C:\Users\rikky\AppData\Roaming\Claude\claude_desktop_config.json`)

**SSE config (preferred — uses the running AI service):**
```json
{
  "mcpServers": {
    "personal-finance": {
      "url": "http://localhost:8000/mcp"
    }
  }
}
```

**Stdio fallback (if Claude Desktop doesn't support SSE URLs in the installed version):**

Create `services/ai-service/app/mcp_server_stdio.py`:
```python
"""Stdio entry point for Claude Desktop stdio transport."""
import asyncio
import asyncpg
from app.config import settings
from app.mcp_server import mcp, set_pool

async def _init_and_run():
    pool = await asyncpg.create_pool(settings.database_url)
    set_pool(pool)
    # Note: RetrievalService not wired in stdio mode (no embedding provider config)
    # search_transactions_semantic will raise — all other tools work
    mcp.run()   # stdio transport

if __name__ == "__main__":
    asyncio.run(_init_and_run())
```

Stdio Claude Desktop config:
```json
{
  "mcpServers": {
    "personal-finance": {
      "command": "python",
      "args": ["-m", "app.mcp_server_stdio"],
      "cwd": "C:\\workspaces\\personal-finance\\services\\ai-service"
    }
  }
}
```

**Restart Claude Desktop** after saving the config (it reads config only at startup).

**Test each tool with natural language:**
1. "Apa saja transaksi BCA-ku minggu lalu?" → `get_transactions(account="BCA", date_from=..., limit=10)`
2. "Berapa total pengeluaran makan bulan ini?" → `get_cashflow_summary("this_month")`
3. "Cari transaksi kopi" → `search_transactions_semantic("kopi")`
4. "Seberapa sehat keuanganku sekarang?" → `get_pyramid_scores()` (requires .NET API running)

For each: verify in Claude Desktop's tool panel that the correct tool was called and the parameters look right.

> **Debugging: tools don't appear in Claude Desktop.**
> 1. Restart Claude Desktop (config is read only on startup)
> 2. Open DevTools: Help → Developer Tools → Console — look for MCP connection errors
> 3. Verify the AI service is running: `curl http://localhost:8000/mcp`
> 4. If using SSE and it fails, fall back to stdio config above

---

### [ ] STEP 9 — Full test pass + commit

```bash
cd services/ai-service && PYTHONPATH=. pytest tests/test_mcp_server.py -v
cd services/ai-service && PYTHONPATH=. pytest -v              # full suite — nothing regressed

cd c:\workspaces\personal-finance
git add services/ai-service/app/mcp_server.py
git add services/ai-service/app/main.py
git add services/ai-service/app/config.py
git add services/ai-service/pyproject.toml
git add services/ai-service/tests/test_mcp_server.py
git status    # verify NO .env, NO claude_desktop_config.json
git commit -m "PF-AI009: MCP server — get_transactions, get_cashflow_summary, get_pyramid_scores, search_transactions_semantic (FastMCP SSE)"
```

---

### [ ] STEP 10 — Stretch: 2-agent MCP workflow

Build a demonstration of two agents where Agent 1 calls your MCP tools and passes a report to Agent 2 for synthesis:

```python
# scratch/mcp_agent_demo.py — two-step financial health check
"""
  Agent 1 (Analyst): calls get_cashflow_summary + get_pyramid_scores via tool_use
  Agent 2 (Advisor): receives the structured report and generates 3 next steps
  
Pattern: data-gathering agent → synthesis agent
Illustrates why MCP tools belong in the Analyst, not the Advisor.
"""
import asyncio, json
import anthropic

client = anthropic.AsyncAnthropic()

ANALYST_TOOLS = [
    {
        "name": "get_cashflow_summary",
        "description": "Get spending totals by category for a time period",
        "input_schema": {
            "type": "object",
            "properties": {
                "period": {"type": "string", "enum": ["this_month", "last_month", "this_year"]}
            },
        },
    },
    {
        "name": "get_pyramid_scores",
        "description": "Get Financial Pyramid tier scores",
        "input_schema": {"type": "object", "properties": {}},
    },
]


async def run_analyst() -> str:
    """Agent 1: gather financial data via tool_use loop."""
    messages = [{"role": "user", "content": "Analyze my current financial health. Call both tools."}]
    while True:
        response = await client.messages.create(
            model="claude-haiku-4-5-20251001",    # haiku: data gathering, not reasoning
            max_tokens=1024,
            tools=ANALYST_TOOLS,
            messages=messages,
        )
        if response.stop_reason == "end_turn":
            return next(b.text for b in response.content if hasattr(b, "text"))
        # Process tool calls — in a real implementation, call your actual MCP tools
        tool_results = []
        for block in response.content:
            if block.type == "tool_use":
                # Stub: replace with real MCP client calls
                result = {"note": f"[stub result for {block.name}({block.input})]"}
                tool_results.append({"type": "tool_result", "tool_use_id": block.id, "content": json.dumps(result)})
        messages.append({"role": "assistant", "content": response.content})
        messages.append({"role": "user", "content": tool_results})


async def run_advisor(analyst_report: str) -> str:
    """Agent 2: generate recommendations from the analyst's report."""
    response = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=512,
        messages=[{
            "role": "user",
            "content": (
                f"Based on this financial analysis:\n{analyst_report}\n\n"
                "Provide 3 concrete next steps the user should take this week."
            ),
        }],
    )
    return response.content[0].text


async def main():
    print("=== Running Analyst ===")
    report = await run_analyst()
    print(report)
    print("\n=== Running Advisor ===")
    advice = await run_advisor(report)
    print(advice)

asyncio.run(main())
```

```bash
PYTHONPATH=. python scratch/mcp_agent_demo.py
```

> **Why Haiku for both agents?** The Analyst's job is structured data gathering (tool calls + formatting) — no deep reasoning needed. The Advisor's job is short text generation from a clean report. Both fit Haiku's capability tier. Using Sonnet/Opus here would be an `/efficient-model` violation — overpriced for the task.

> **Why this stretch matters for interviews:** "I built a 2-agent workflow where the Analyst calls MCP tools to gather data, then passes a structured report to the Advisor for synthesis" is a concrete multi-agent answer. The pattern — one agent calls tools, another does synthesis — is the scaffolding for every multi-agent pipeline, and it maps directly to the "how do you design an AI system that needs multiple capabilities?" interview question.

---

### [ ] STEP 11 — Log progress

```
/mentor log Built personal-finance MCP server: 4 tools (get_transactions, get_cashflow_summary, get_pyramid_scores, search_transactions_semantic), FastMCP SSE mounted at /mcp on AI service port 8000, Claude Desktop configured and tested end-to-end, stretch 2-agent demo. Chapter 9 complete.
```

---

## Resources / Theory to Learn

Organized by concept — read when building the relevant step, not all upfront.

### Concept 1 — MCP protocol fundamentals (Step 0)

- **MCP Introduction** → https://modelcontextprotocol.io/introduction — the "why" and three primitives. Read before anything else; 10 min.
- **MCP Tools concept** → https://modelcontextprotocol.io/docs/concepts/tools — how tool schemas are generated from Python annotations; how the client discovers and calls them.
- **Anthropic Academy MCP Series** → https://anthropic.com/academy (search "MCP") — the official course; watch after the quickstart.

### Concept 2 — FastMCP implementation (Steps 1–6)

- **FastMCP README** → https://github.com/jlowin/fastmcp — `@mcp.tool()` decorator, FastAPI mounting, transport options. The primary coding reference.
- **FastMCP examples** → `examples/` in the GitHub repo — look at any DB-backed example for the asyncpg pool pattern analogue.

### Concept 3 — Claude Desktop integration (Step 8)

- **Claude Desktop MCP setup** → https://modelcontextprotocol.io/quickstart/user — config file location, server entry format, diagnosing connection failures.
- **MCP Inspector** → https://github.com/modelcontextprotocol/inspector — browser-based MCP client for testing without Claude Desktop; use for Step 1 quickstart.

### Concept 4 — Multi-agent MCP patterns (Step 10 stretch)

- **MCP architecture docs** → https://modelcontextprotocol.io/docs/concepts/architecture — the "MCP client vs MCP server" boundary; how agents call MCP servers programmatically (not just Claude Desktop).
- **anthropic-sdk-python MCP client** → https://github.com/anthropics/anthropic-sdk-python — the `MCPClient` class for calling MCP servers from agent code (if you want to wire the 2-agent demo to call your actual server rather than stubs).

---

## Learning Strategy

**Daily loop for Chapter 9:**

- **Day 1 (2.5h):** Steps 0–2 — MCP concepts + quickstart + schema table. Done when the inspector shows your hello tool and the schema table is written from memory.
- **Day 2 (3h):** Steps 3–6 — Build all 4 tools, all tests green. Done when `PYTHONPATH=. pytest tests/test_mcp_server.py -v` is clean.
- **Day 3 (2h):** Steps 7–8 — Wire to FastAPI, configure Claude Desktop. Done when all 4 tools appear in Claude Desktop and the "makan bulan ini" demo works.
- **Day 4 (1h):** Step 9 + optional stretch 10. Commit, log.

**The 5 principles applied to Chapter 9:**

1. **Active retrieval:** Step 0's three questions, written from memory. The non-obvious one: why does `list[dict]` as a return type produce an opaque schema that hurts tool reliability?
2. **Project-first:** The quickstart (Step 1) is theory-that-runs — not reading. By end of Day 1 you've seen a real MCP JSON-RPC handshake in the inspector.
3. **Same-day shipping:** Tools 1–4 on Day 2 (same session, build all four before stopping). Wire + demo on Day 3. Commit + log on Day 4. Three sessions, one commit.
4. **Interleaving:** While Claude Desktop restarts after config changes, write the next tool's test. While the .NET API starts up for pyramid score testing, draft the stdio fallback entry point.
5. **Teach-back:** Say out loud, without notes: "An MCP server exposes Tools the AI calls, Resources the AI reads, and Prompts it can reuse. My server exposes four Tools. The AI client discovers them via a generated JSON schema — like Swagger but for AI agents — and calls them when the user's question matches. I chose SSE transport because the AI service is already running and I didn't want Claude Desktop managing a subprocess."

**Anti-patterns to avoid this chapter:**

- ❌ Building the full server before running the quickstart. The inspector exercise (Step 1) is a 15-minute investment that prevents 2 hours of protocol debugging.
- ❌ `dict` or `Any` as return types. FastMCP generates `{}` schema for `dict` — the AI client doesn't know what fields exist. Type your returns and write the field list in the docstring.
- ❌ String interpolation of user-controlled values into SQL. The `category` and `account` params arrive from the AI (which is paraphrasing the user) — treat them as untrusted. Parametrized WHERE only.
- ❌ Skipping the Claude Desktop end-to-end test. The test suite mocks everything — the proof of value is Claude calling `get_transactions` from a natural language question and returning real data.
- ❌ Committing `claude_desktop_config.json`. It contains no secrets (local URLs only) but it's machine-specific; add to `.gitignore` if it ends up in a project directory.
- ❌ Wiring MCP Resources or Prompts in this chapter. Four tools cover everything needed for the demo and the interview story. Resources (URI-addressed data) and Prompts (templates) are interesting but scope-creep here — defer.

**The Sunday metric:**
> "What can I say in an interview today that I couldn't say last Sunday?"
> Target: *"I built a personal-finance MCP server exposing 4 typed tools — transaction queries with SQL pre-filtering, spending summaries by period, pyramid tier scores via the .NET API, and semantic search reusing the PF-AI003 pgvector retriever. I mounted it on the existing FastAPI service over SSE transport and configured Claude Desktop to use it. The key design decision was co-locating the MCP server with the AI service to share the asyncpg connection pool and RetrievalService, rather than building a standalone process — same Clean Architecture boundary principle, applied to MCP. Claude Desktop can now answer 'how much did I spend on food this month?' with a tool call, not hallucination, citing real transaction data."*

---

## Notes

- **FastMCP 2.x API drift.** The mounting method (`sse_app()`, `get_mcp_app()`, `streamable_http_app()`) has changed across versions. Run the `dir(mcp)` check in Step 7 before writing the `app.mount()` call — don't guess the method name. Record which version you installed and which method you used here: `fastmcp version: ___`, `mount method: ___`.
- **`/api/journey/scores` route.** Verify this endpoint exists and returns `[{tier, score, status}]` before coding Step 5. Check `JourneyController.cs` for the actual route if the curl returns 404.
- **asyncpg pool sharing.** The `set_pool()` / `set_retriever()` module-global pattern is intentionally simple. In production you'd use DI; for this learning chapter, globals are fine and mirror the existing `_pool` pattern in `retriever.py`. Don't over-engineer it.
- **Windows Claude Desktop config path.** `%APPDATA%\Claude\claude_desktop_config.json` = `C:\Users\rikky\AppData\Roaming\Claude\claude_desktop_config.json`. Restart Claude Desktop after every config edit.
- **Auth is deliberately deferred.** When PF-S08 wires Supabase Auth, the MCP SSE endpoint will need a bearer token guard + RLS enforcement. It's a 3-line FastAPI middleware addition once the auth plumbing exists. Note it; don't build it now.
- **THINK-05 (frozen contract).** The MCP tool schemas are a public interface. Once Claude Desktop (or another agent) starts using your MCP tools, renaming a return field (e.g., `account` → `bank`) breaks any prompt or workflow that references that field name. Treat tool schemas as stable as `TransactionDto` fields.
- **Stretch: MCP Resources.** If you go further after the stretch agent demo, expose `finance://pyramid-scores` as a Resource (read-only URI-addressed data the AI fetches proactively) alongside the `get_pyramid_scores` Tool (an action it calls on demand). Resources vs Tools = GET vs POST in REST: Resources are for data that's already computed; Tools are for live operations. Interesting interview angle; defer to after Chapter 12.

---

## 📝 Knowledge Check

> Original practice questions modeled on the published exam domains of official AI Engineering certifications (Databricks Generative AI Engineer Associate, Azure AI Engineer AI-102, AWS Certified ML Engineer – Associate). Not verbatim exam items. Answers are hidden — recall first, then reveal.

### 1. MCP primitives — when to use which (Databricks · Azure AI-102)

*Scenario:* You're extending the personal-finance MCP server. You want to: (a) let the AI query account balances on demand, (b) give the AI read access to a static lookup table of Indonesian bank codes, (c) offer a pre-built prompt template for "summarize my month in plain Bahasa."

*Question:* Which MCP primitive maps to each use case?

- **A.** All three are Tools — MCP doesn't distinguish between callable actions and read-only data
- **B.** (a) Tool, (b) Resource, (c) Prompt — Tools for callable actions, Resources for data the AI reads, Prompts for reusable templates
- **C.** (a) Resource, (b) Tool, (c) Prompt — Resources are for dynamic data; Tools are for static lookups
- **D.** (a) Prompt, (b) Resource, (c) Tool — Prompts trigger actions; Resources store data; Tools generate text

<details>
<summary>Show answer</summary>

**B** — the MCP spec defines three primitives for three purposes: Tools (callable actions that return results — queries, writes, computations), Resources (URI-addressed data the AI reads passively — files, static tables, configs), Prompts (reusable templates with variables the AI fills in). Account balance query = Tool (live, dynamic); bank code table = Resource (static read); month summary template = Prompt.
*Maps to: Databricks GenAI Engineer Associate · Application Development (tool/agent design); Azure AI-102 · Implement AI agents*
</details>

---

### 2. SSE vs stdio transport — shared state tradeoff (Databricks · AWS ML Engineer)

*Scenario:* Your MCP server shares the AI service's asyncpg connection pool and `RetrievalService`. A colleague suggests running it as a stdio server (spawned by Claude Desktop as a subprocess).

*Question:* What is the main operational problem with stdio transport in this case?

- **A.** stdio transport is not supported by the MCP spec for Python servers
- **B.** Claude Desktop spawns a new process on every connection — each process creates a new asyncpg pool, losing connection reuse and the warm `RetrievalService` embedding cache that the AI service running on port 8000 maintains. SSE connects to the already-running process.
- **C.** stdio servers cannot make outbound HTTP calls (e.g., to the .NET API)
- **D.** stdio transport limits tool return payloads to 4KB

<details>
<summary>Show answer</summary>

**B** — stdio spawns a fresh process per session; a new asyncpg pool means no connection reuse and a cold `RetrievalService` (no warm embedding cache). SSE connects to the running AI service, which already has a warm pool and shared state. The trade-off: SSE requires the service to be running; stdio is self-contained but stateless and pool-hungry.
*Maps to: Databricks GenAI Engineer Associate · Application Development (deployment); AWS Certified ML Engineer – Associate · ML infrastructure / cost*
</details>

---

### 3. Tool schema typing — why it matters (Azure AI-102 · Databricks)

*Scenario:* Your `get_transactions` tool returns `list[dict]` instead of a typed structure. In Claude Desktop, the AI occasionally confuses field names and generates incorrect follow-up tool calls.

*Question:* Why does the return type annotation matter for MCP tool reliability?

- **A.** FastMCP requires typed returns — `dict` causes a schema generation error at server startup
- **B.** The MCP client sends the tool's JSON schema to the AI as part of the tool definition. `dict` generates an opaque schema `{}` that describes no fields — the AI must guess. Typed returns (explicit `list[dict[str, ...]]` with a docstring listing fields, or TypedDict) generate named fields that the AI uses to generate accurate follow-up calls and format output correctly.
- **C.** Typed returns add latency because FastMCP validates them against the schema on every call
- **D.** Claude's tool-use API only accepts typed returns; `dict` causes a server-side error

<details>
<summary>Show answer</summary>

**B** — the JSON schema exposed by the MCP server is the AI client's only signal about what a tool returns. `dict` produces `{}` — no fields, no types. An explicit type (or a thorough docstring of the returned fields) produces a schema with named keys and types, which the AI uses to generate correct parameter selection in follow-up calls and to display structured data. The reliability difference is measurable in practice.
*Maps to: Azure AI-102 · Implement AI agents (tool design); Databricks GenAI Engineer Associate · Application Development (schema design)*
</details>

---

### 4. SQL pre-filtering in MCP tool queries (Databricks · AWS ML Engineer)

*Scenario:* The AI calls `get_transactions(category="Food", limit=10)`. Your implementation retrieves all rows, then filters and slices in Python. A colleague says "Python slicing is fine."

*Question:* What is the core problem with this approach?

- **A.** Python list slicing is slower than SQL LIMIT at any scale
- **B.** Retrieving all rows then slicing means `limit` is silently ignored whenever category-filtered rows in the DB are fewer than the unfiltered fetch count, potentially returning more (or all) matching rows. More importantly, it reads unnecessary rows over the network. SQL `WHERE` + `LIMIT` pushes both filtering and capping into the query planner, where indexes are available.
- **C.** SQL `LIMIT` is required by the MCP spec for all tool implementations
- **D.** Python-side filtering cannot use ILIKE semantics

<details>
<summary>Show answer</summary>

**B** — SQL `WHERE category ILIKE ... LIMIT n` filters and caps at the query level; Python slicing after a full fetch is wasteful and produces unpredictable result sizes. This is the same pre-filter vs post-filter reasoning as PF-AI004's metadata filtering: push constraints into SQL where the indexes are. For a corpus of thousands of transactions, the difference in network bytes transferred is significant even at dev scale.
*Maps to: Databricks GenAI Engineer Associate · Data Preparation (efficient retrieval); AWS Certified ML Engineer – Associate · ML infrastructure*
</details>

---

### 5. Calling .NET API vs querying Supabase directly (Azure AI-102 · Google Cloud PMLE)

*Scenario:* `get_pyramid_scores()` could either (a) query the `journey_scores` Supabase table directly via asyncpg, or (b) call `GET /api/journey/scores` on the .NET API via httpx.

*Question:* Why is option (b) the architecturally correct choice?

- **A.** asyncpg cannot query computed columns; the .NET API pre-computes them
- **B.** `JourneyScoringService` computes tier scores from transactions, assets, and investments using business logic spread across MediatR handlers. Duplicating that computation in Python creates a maintenance split: change the scoring formula once, forget to update the Python copy. The HTTP call is a deliberate boundary — Python owns embeddings and MCP tooling; .NET owns scoring logic. The 10ms overhead is negligible in a chat interaction.
- **C.** Supabase RLS blocks asyncpg connections from Python
- **D.** The MCP spec requires all tool data to come from REST APIs

<details>
<summary>Show answer</summary>

**B** — the boundary reflects ownership. The .NET API owns the `JourneyScoringService` business logic (multi-source aggregation, tier threshold rules). Duplicating it in Python creates drift — exactly the THINK-05 "both sides must update" problem, extended to business logic. The httpx call makes the boundary explicit and keeps the source of truth in one place, at negligible latency cost for an interactive chat tool.
*Maps to: Azure AI-102 · Design AI solutions (integration patterns); Google Cloud PMLE · MLOps / data governance*
</details>

---

### 6. Multi-agent MCP — single responsibility (Databricks · AWS ML Engineer)

*Scenario:* You build a 2-agent system: an Analyst that calls MCP tools to gather data, and an Advisor that generates recommendations. A colleague asks: "Why doesn't the Advisor call the MCP tools directly to verify the data itself?"

*Question:* Why is giving the Advisor direct MCP tool access an anti-pattern here?

- **A.** The MCP protocol only allows one agent per server connection
- **B.** The Advisor receives a structured report from the Analyst — it doesn't need live data access because the Analyst already fetched and formatted it. Giving both agents MCP access doubles tool calls and latency, forces the Advisor to understand the financial data schema, and muddies the agent's single responsibility (synthesis, not retrieval). The "report hand-off" pattern keeps data gathering and synthesis cleanly separated.
- **C.** FastMCP does not support concurrent connections from multiple agents
- **D.** Only Claude Desktop is permitted to call MCP servers; other agents must use the REST API

<details>
<summary>Show answer</summary>

**B** — single responsibility applied to agents: the Analyst handles tool calls (data access); the Advisor handles synthesis (reasoning over the report). Giving both MCP access doubles retrieval calls, adds latency at every synthesis step, and couples the Advisor to the data schema. The hand-off pattern (Analyst produces structured report → Advisor receives it as a text message) is the building block of every multi-agent pipeline — and the answer to "how do you design a system that needs multiple AI capabilities?"
*Maps to: Databricks GenAI Engineer Associate · Application Development (multi-agent design); AWS Certified ML Engineer – Associate · Model deployment*
</details>
