# PF-AI007 — Chapter 7: First Agent — smolagents (Transaction Categorizer)

> **Learning Phase:** Phase 2 · Chapter 7 of 12 · Day ~37 of 90
> **Status:** To Do
> **Started:** (set when you begin)
> **Planned from branch:** main
> **Pivot goal:** Close the single biggest gap on current AI Eng JDs. "Agentic systems" is the hard one to fake. smolagents is the minimum-surface entry: one LLM, a set of tools, a loop. Grok the ReAct loop here — the state machines, routing, and multi-agent patterns in Chapter 8 (LangGraph) make sense only after you've seen what they're abstracting. After this chapter you can say: "I built a tool-calling agent that categorizes transactions by iterating over rule-matching, semantic similarity search, and spending-pattern context — every tool call is traced in Langfuse."

## Objective

The existing 4-layer categorizer (`categorizer.py`, PF-103) runs silently: rule match → preset → history cache → LLM fallback. It's correct ~85% of the time but opaque — when it's wrong, there's no reasoning trace to debug, and nothing to demo in an interview.

The **Transaction Categorizer Agent** replaces the silent LLM-fallback layer with a smolagents `ToolCallingAgent`. Same inputs and outputs as the existing `/categorize` endpoint, but the agent:

1. Calls tools in a deliberate order to gather evidence
2. Reasons explicitly ("rules say 'coffee' → Dining, but similarity search shows 5 past transactions all in Food & Dining — I'll go with the more specific rule")
3. Emits a structured trace (tool names, arguments, responses, final answer) that Langfuse captures as a span per tool call

This is what "observable AI reasoning" looks like in a job interview demo.

```
                         Transaction Categorizer Agent
                       ┌────────────────────────────────────────────────────────────┐
                       │                                                            │
  Input:               │    LLM: LiteLLM → Gemini 2.5 Flash (or Anthropic)        │
  description +        │         ↑              ↕               ↓                  │
  wallet + amount  ──► │   [Observe]        [Reason]       [Act: tool_call]        │
                       │         │              │               │                  │
                       │         └──────────────┴───────────────┘                  │
                       │                   ReAct loop (≤ 3 iterations)             │
                       └──────────────────────────┬─────────────────────────────────┘
                                                  │
                        ┌─────────────────────────┼────────────────────────┐
                        ▼                         ▼                        ▼
            ┌───────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
            │ search_category_rules │  │ find_similar_trans   │  │ list_all_categories  │
            │ (keyword: str)        │  │ (description: str)   │  │ ()                   │
            │                       │  │                      │  │                      │
            │ → keyword-matches     │  │ → calls /search      │  │ → returns all known  │
            │   against 106 rules,  │  │   endpoint (pgvector │  │   category names so  │
            │   returns rule +      │  │   RAG from PF-AI003) │  │   agent constrains   │
            │   category pairs      │  │   → top-3 with their │  │   final pick to      │
            │                       │  │   historical cats    │  │   valid vocabulary   │
            └───────────────────────┘  └──────────────────────┘  └──────────────────────┘
                        │                         │                        │
                        └─────────────────────────┴────────────────────────┘
                                                  │
                                 Final Answer (ToolCallingAgent):
                                 {
                                   "category": "Food & Dining",
                                   "confidence": 0.9,
                                   "reasoning": "Rule matched 'starbucks' → Food & Dining (Café);
                                                  3 similar past transactions confirmed."
                                 }
                                                  │
                                      ┌───────────▼──────────────┐
                                      │  Langfuse trace           │
                                      │  Parent: /categorize-     │
                                      │  agent (span)             │
                                      │  ├─ search_category_rules │
                                      │  │  (span: input/output)  │
                                      │  ├─ find_similar_trans    │
                                      │  │  (span: input/output)  │
                                      │  └─ LLM completion (span) │
                                      └──────────────────────────┘
```

**Depends on:** PF-AI003 (pgvector + `/search` endpoint — `find_similar_transactions` calls it directly), PF-AI001 (Langfuse + OTel setup — traces hook into the existing OTLP pipeline).
**Unblocks:** Chapter 8 (LangGraph Financial Advisor — you'll understand exactly what LangGraph adds to this simpler loop), Chapter 9 (MCP server — `search_category_rules` becomes an MCP tool in that chapter).

## Acceptance Criteria

- [ ] `pip install "smolagents[litellm]" litellm` succeeds; both added to `pyproject.toml` main deps
- [ ] `app/agents/categorizer_agent.py` — `CategorizerAgent` wrapping a `ToolCallingAgent` with 3 tools; accepts `description`, `wallet`, `amount_idr`; returns `CategorizationResult(category, confidence, reasoning, tool_calls_count)`
- [ ] `app/agents/tools/category_rules.py` — `search_category_rules(keyword)` `@tool`; queries the 106-rule snapshot loaded at startup; returns matched rule + category pairs as string; returns "No rules matched." when empty
- [ ] `app/agents/tools/similarity.py` — `find_similar_transactions(description)` `@tool`; calls the local `/search` endpoint (pgvector RAG, PF-AI003); returns top-3 descriptions + their historical categories
- [ ] `app/agents/tools/categories.py` — `list_all_categories()` `@tool`; returns static list of all valid category names (no DB call; constrains agent's final pick to known vocabulary)
- [ ] `POST /categorize-agent` endpoint in `main.py` — accepts `CategorizeAgentRequest`; returns `CategorizeAgentResponse(category, confidence, reasoning, tool_calls_count)`; LLM failures return 502 (never 200-with-empty)
- [ ] Langfuse traces: every `/categorize-agent` call produces ≥1 tool-call child span visible in the Langfuse dashboard (parent = agent run; children = individual tool calls)
- [ ] `scripts/test_agent.py` — 5-transaction smoke test runs and prints category + confidence + reasoning + tool count for each; all 5 get a non-null category from the known vocabulary
- [ ] `tests/test_categorizer_agent.py` — unit tests with mocked smolagents agent (no real LLM calls); covers: normal categorization, fallback to "Other" on empty output, 502-propagating exception re-raise
- [ ] HF Agents Course Units 1–2 read; active-retrieval notes written in `docs/mentor/progress.md`

## Approach

**ToolCallingAgent, not CodeAgent — and why this matters for production.**
smolagents has two agent types: `CodeAgent` (generates executable Python to call tools) and `ToolCallingAgent` (generates JSON tool calls — the same JSON format as OpenAI function calling and Anthropic `tool_use`). `CodeAgent` is clever but dangerous in a production web service — the generated code can include `os.system("rm -rf /")` and it will run. `ToolCallingAgent` constrains the LLM to structured tool invocations only, matching the `tool_use` pattern already used throughout the project. The architectural bridge: the "tool_use" primitive you learned in the extraction pipeline is the same building block the agent loop runs on. You're not learning something new — you're seeing where that primitive lives inside a reasoning loop.

**smolagents before LangGraph — deliberate sequencing.**
Chapter 8 is LangGraph: state graphs, conditional routing, multiple agents communicating over shared state. Before you can understand what LangGraph *adds*, you need to see the ReAct loop in its purest form. smolagents is a loop with one LLM and a tool list — that's all an "agent" is at its core. When you see LangGraph next, you'll recognize: "this is the same loop, but with explicit state, retry nodes, and a visual graph instead of implicit iteration." Understanding the primitive makes the abstraction stick.

**Three tools, not seven.**
More tools = more indirection = harder to debug when the agent makes a wrong choice. The three tools here cover the same ground as the 4-layer categorizer: rules first (Layer 1), history next (Layer 3), vocabulary last (so the agent's final category is constrained to known names). The 106 rules are already in the system — `search_category_rules` surfaces them as agent-callable evidence instead of a silent first-pass filter.

**LiteLLM as the provider wrapper.**
smolagents uses LiteLLM as its default provider backend, which means `LiteLLMModel(model_id="gemini/gemini-2.5-flash")` or `"anthropic/claude-sonnet-4-6"` both work with the keys already in `config.py`. Zero additional secret management.

**Langfuse traces via OTel hook.**
smolagents v1.9+ ships with OpenTelemetry instrumentation. One call to `instrument_smolagents()` at service startup pushes every agent run, tool call, and LLM completion to our OTLP endpoint (already configured for Langfuse in PF-AI001). Each tool call appears as a child span of the agent run — the trace tree is the demo artifact that makes "I built an observable agent" concrete and defensible.

## Affected Files

| File | Change |
|------|--------|
| `services/ai-service/app/agents/__init__.py` | Create — empty package |
| `services/ai-service/app/agents/categorizer_agent.py` | Create — `CategorizerAgent` + `CategorizationResult` + `_parse_result` |
| `services/ai-service/app/agents/tools/__init__.py` | Create — empty package |
| `services/ai-service/app/agents/tools/category_rules.py` | Create — `search_category_rules` `@tool` + `load_rules()` |
| `services/ai-service/app/agents/tools/similarity.py` | Create — `find_similar_transactions` `@tool` + `configure()` |
| `services/ai-service/app/agents/tools/categories.py` | Create — `list_all_categories` `@tool` + `KNOWN_CATEGORIES` |
| `services/ai-service/app/models.py` | Edit — add `CategorizeAgentRequest`, `CategorizeAgentResponse` |
| `services/ai-service/app/main.py` | Edit — add `POST /categorize-agent`; wire agent in lifespan; call `instrument_smolagents()` |
| `services/ai-service/pyproject.toml` | Edit — add `smolagents[litellm]`, `litellm` to main deps |
| `services/ai-service/tests/test_categorizer_agent.py` | Create — unit tests (mocked ToolCallingAgent, no real LLM) |
| `services/ai-service/scripts/test_agent.py` | Create — 5-transaction smoke test via httpx |

---

## TODO

### [ ] STEP 0 — Learn: the agent mental model (theory anchor, 60–90 min)

The Hugging Face Agents Course is the fastest way to grok the ReAct loop before building. Complete in this order:

1. **Unit 1 — What is an AI agent?** → https://huggingface.co/learn/agents-course/unit1/introduction
   - The Environment / Observe / Reason / Act loop
   - Why tool calling is not just "calling a function" — it's evidence collection inside an LLM reasoning loop
   - Estimated: 20 min reading + interactive demo

2. **Unit 2 — smolagents: Building your first agent** → https://huggingface.co/learn/agents-course/unit2/smolagents
   - `@tool` decorator, `ToolCallingAgent` vs `CodeAgent`, running the first example
   - Pay close attention to the *intermediate reasoning steps* printed during the run — that's the ReAct loop in action
   - Estimated: 25 min

3. **Skim Unit 3 intro only** — enough to see where multi-step reasoning goes; you'll revisit in Chapter 8.

**Active-retrieval task (mandatory — don't skip):** Close all tabs. In `docs/mentor/progress.md` under today's date, write from memory:
- What does ReAct stand for? What happens at each step (Observe, Reason, Act)?
- Why does `ToolCallingAgent` produce JSON tool calls instead of arbitrary Python? What's the security implication of the alternative?
- What is the difference between how a tool is *described* to the LLM (docstring) vs how it *executes* (Python function body)?
- Why does smolagents run the loop multiple times instead of stopping after the first tool call?

> **The interview frame:** "An AI agent is a loop: the LLM observes tool output, reasons about what to do next, and acts by calling another tool — until it has enough evidence to produce a final answer. ReAct is the standard framing: Reason → Act → Observe → repeat. smolagents runs this loop explicitly; LangGraph (Chapter 8) makes the loop a directed graph so you can add conditional routing, retry nodes, and parallel tool calls. I built the categorizer in smolagents first — so when I explain LangGraph, I can say exactly what it adds."

---

### [ ] STEP 1 — Install smolagents + litellm

Add to `pyproject.toml` main dependencies (runtime — not dev):

```toml
    "smolagents[litellm]>=1.9",
    "litellm>=1.50",
```

```bash
cd services/ai-service
pip install "smolagents[litellm]" litellm
```

Smoke-test the install:

```bash
python -c "from smolagents import ToolCallingAgent, tool, LiteLLMModel; print('smolagents OK')"
```

> **Why `smolagents[litellm]`?** The `[litellm]` extra bundles LiteLLM as smolagents' provider backend. Without it, smolagents defaults to OpenAI only. With it, `LiteLLMModel(model_id="gemini/gemini-2.5-flash")` and `"anthropic/claude-sonnet-4-6"` both work — the same keys already in `config.py`, zero extra setup.

---

### [ ] STEP 2 — Create the package structure + three tool files

```bash
mkdir -p services/ai-service/app/agents/tools
touch services/ai-service/app/agents/__init__.py
touch services/ai-service/app/agents/tools/__init__.py
```

**Tool 1 — `search_category_rules`** (`app/agents/tools/category_rules.py`):

```python
"""Tool: search existing category rules by keyword."""
from __future__ import annotations

from smolagents import tool

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
    keyword = keyword.lower().strip()
    matches: list[tuple[str, str]] = [
        (pattern, category)
        for pattern, category in _CATEGORY_RULES.items()
        if keyword in pattern or pattern in keyword
    ]
    if not matches:
        return "No rules matched."
    lines = [f"  pattern='{p}' → category='{c}'" for p, c in matches[:5]]
    return "Matched rules:\n" + "\n".join(lines)
```

**Tool 2 — `find_similar_transactions`** (`app/agents/tools/similarity.py`):

```python
"""Tool: find semantically similar past transactions via the RAG /search endpoint."""
from __future__ import annotations

import asyncio

import httpx
from smolagents import tool

_SEARCH_URL = "http://localhost:8000/search"


def configure(search_url: str) -> None:
    global _SEARCH_URL
    _SEARCH_URL = search_url


@tool
def find_similar_transactions(description: str) -> str:
    """Find semantically similar past transactions and their historical categories.

    Searches the pgvector embedding index built in Chapter 3 (PF-AI003). Use this
    tool when rule matching returns 'No rules matched.' or when the matched category
    is ambiguous. Returns the 3 most similar past transactions with their categories.

    Args:
        description: The transaction description to search for similarities.
    """
    async def _fetch() -> str:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(_SEARCH_URL, json={"query": description, "top_k": 3})
            resp.raise_for_status()
            data = resp.json()
        results = data.get("results", [])
        if not results:
            return "No similar past transactions found."
        lines = [
            f"  [{i+1}] '{r['description']}' — {r.get('category', 'unknown')} "
            f"(similarity={r['similarity']:.2f})"
            for i, r in enumerate(results)
        ]
        return "Similar past transactions:\n" + "\n".join(lines)

    return asyncio.run(_fetch())
```

> **Why `asyncio.run()` inside a sync tool?** smolagents calls `@tool` functions synchronously. `httpx.AsyncClient` is async. `asyncio.run()` spins a new event loop for this blocking call — same pattern as `asyncio.to_thread` in reverse (sync wrapping async, not async wrapping sync). In a real service, use `httpx.Client` (sync) directly to avoid the overhead. For this chapter, `asyncio.run()` keeps the code simple and correct.

**Tool 3 — `list_all_categories`** (`app/agents/tools/categories.py`):

```python
"""Tool: return the full known category vocabulary."""
from __future__ import annotations

from smolagents import tool

# Static list — categories change rarely. The agent uses this to constrain its
# final answer to known names (prevents category hallucination).
KNOWN_CATEGORIES = [
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


@tool
def list_all_categories() -> str:
    """Return the complete list of valid category names.

    Use this tool when you need to pick the most appropriate category from
    the system vocabulary. Your final CATEGORY must exactly match one of
    these names — do NOT invent category names. If uncertain, use 'Other'.
    """
    return "Valid categories:\n" + "\n".join(f"  - {c}" for c in KNOWN_CATEGORIES)
```

> **Why a static list vs a DB query?** Categories rarely change, and a DB call on every agent iteration adds latency + connection overhead. The agent's constraint is behavioral: the system prompt tells it "your final category MUST be from `list_all_categories()`." Hallucinated names fail downstream validation and appear in Langfuse — they're easy to catch. A future version can make this dynamic without changing the tool signature.

> **The tool docstring IS the schema description.** The LLM sees only what's written in the docstring when it decides whether to call a tool. Ambiguous docstrings produce ambiguous tool choice. Each docstring here explicitly states when to use the tool ("Use this tool FIRST", "Use this when rules return No rules matched") to steer the agent toward the intended call order.

---

### [ ] STEP 3 — Build `CategorizerAgent` in `app/agents/categorizer_agent.py`

```python
"""Transaction Categorizer Agent — smolagents ToolCallingAgent.

3 tools, ReAct loop (max_steps=3), LiteLLM provider (Gemini primary / Anthropic fallback).
Every tool call and LLM step is captured as a Langfuse child span via OTel instrumentation
wired in main.py lifespan.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

from smolagents import LiteLLMModel, ToolCallingAgent

from app.agents.tools.categories import list_all_categories
from app.agents.tools.category_rules import search_category_rules
from app.agents.tools.similarity import find_similar_transactions
from app.config import settings

logger = logging.getLogger(__name__)

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


def _parse_result(raw: str) -> CategorizationResult:
    """Parse the agent's final text into a structured result."""
    lines = {}
    for line in raw.strip().splitlines():
        if ":" in line:
            key, _, value = line.partition(":")
            lines[key.strip().upper()] = value.strip()
    return CategorizationResult(
        category=lines.get("CATEGORY", "Other"),
        confidence=float(lines.get("CONFIDENCE", "0.5")),
        reasoning=lines.get("REASONING", raw[:200]),
        tool_calls_count=0,  # set from the caller based on Langfuse span count
    )


class CategorizerAgent:
    def __init__(self) -> None:
        if settings.ai_provider == "gemini":
            model_id = f"gemini/{settings.ai_model}"
        else:
            model_id = f"anthropic/{settings.ai_model}"
        model = LiteLLMModel(model_id=model_id)
        self._agent = ToolCallingAgent(
            tools=[search_category_rules, find_similar_transactions, list_all_categories],
            model=model,
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
        try:
            raw = self._agent.run(task, additional_args={"system_prompt": _SYSTEM_PROMPT})
            result = _parse_result(raw)
            logger.info(
                "agent_categorized description=%r category=%r confidence=%s",
                description, result.category, result.confidence,
            )
            return result
        except Exception:
            logger.exception("agent categorization failed description=%r", description)
            raise
```

> **Why `max_steps=3`?** The three tools are sequenced: rules → history → vocabulary. In practice 1–2 iterations suffice — rules match or they don't. `max_steps=3` caps runaway loops where the LLM keeps calling the same tool with different keywords. Chapter 8's LangGraph replaces this with explicit `END` routing nodes — you'll see exactly what that solves.

> **Why is `categorize()` synchronous?** `smolagents.ToolCallingAgent.run()` is synchronous (it manages its own internal async where needed). Called directly inside `async def`, it blocks the FastAPI event loop. The endpoint calls it via `asyncio.to_thread()` — same fix as FlashRank in Chapter 4. Don't force it async; trust the thread pool.

---

### [ ] STEP 4 — Wire OTel tracing (Langfuse auto-capture)

In `app/main.py`, add ONE line after the existing OTel exporter setup (from PF-AI001):

```python
from smolagents.monitoring import instrument_smolagents   # smolagents >= 1.9

# At startup, after OTLP exporter is configured:
instrument_smolagents()
```

This registers a hook that wraps `ToolCallingAgent.run()`, tool dispatch, and every LLM completion with OTel spans. Because the OTLP exporter to Langfuse is already configured (`OTEL_EXPORTER_OTLP_ENDPOINT` env var, wired in PF-AI001), every agent run flows to Langfuse without additional config.

**Verify after the smoke test (STEP 7):** open the Langfuse dashboard and confirm:
- A parent trace named `ToolCallingAgent` (or similar)
- Child spans for each tool call: `search_category_rules`, `find_similar_transactions`, `list_all_categories`
- A final LLM completion span with token counts and cost

> **Why one call?** `instrument_smolagents()` hooks into the running OTel `TracerProvider`. The OTLP exporter (already active) receives every span automatically — this is the value of OTel-first observability (PF-AI001): new frameworks "just work" without wiring them individually.

> **If smolagents < 1.9 (check `smolagents.__version__`):** the `monitoring` module may not exist. Fallback: wrap `CategorizerAgent.categorize()` with a manual Langfuse span using the existing `langfuse` client from PF-AI001. A 5-line decorator achieves the same parent/child trace shape.

---

### [ ] STEP 5 — Add models + wire `POST /categorize-agent` in `main.py`

Extend `app/models.py`:

```python
# ── Chapter 7: Agent Categorization ────────────────────────────────────────────

class CategorizeAgentRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    description: str = Field(..., min_length=1, max_length=500)
    wallet: str = Field(default="Unknown")
    amount_idr: float = Field(default=0.0, ge=0.0)


class CategorizeAgentResponse(BaseModel):
    category: str
    confidence: float
    reasoning: str
    tool_calls_count: int
```

In `main.py` lifespan, after the existing services are wired:

```python
from app.agents.categorizer_agent import CategorizerAgent
from app.agents.tools.category_rules import load_rules
from app.agents.tools.similarity import configure as configure_search_url
from smolagents.monitoring import instrument_smolagents

# Snapshot the 106 category rules for the agent's search_category_rules tool.
# Pull from the DB via the existing asyncpg connection (same pool as the retriever).
rules_rows = await app.state.retriever._conn.fetch(
    "SELECT keyword, category_name FROM category_rules LIMIT 500"
)
load_rules({row["keyword"]: row["category_name"] for row in rules_rows})

# Wire the similarity tool's search URL to ourselves (avoids hardcoding port).
configure_search_url("http://localhost:8000/search")

app.state.categorizer_agent = CategorizerAgent()
instrument_smolagents()
```

Add the endpoint:

```python
@app.post("/categorize-agent", response_model=CategorizeAgentResponse)
async def categorize_with_agent(request: CategorizeAgentRequest) -> CategorizeAgentResponse:
    """Categorize a transaction using the ReAct agent with visible reasoning trace.

    Slower than /categorize (1–3 LLM calls vs 0–1) but shows its work — use for
    debugging edge cases, demos, or when the fast path returns 'Other'.
    """
    try:
        result = await asyncio.to_thread(
            app.state.categorizer_agent.categorize,
            request.description,
            request.wallet,
            request.amount_idr,
        )
        return CategorizeAgentResponse(
            category=result.category,
            confidence=result.confidence,
            reasoning=result.reasoning,
            tool_calls_count=result.tool_calls_count,
        )
    except Exception as exc:
        logger.exception("agent categorization failed")
        raise HTTPException(status_code=502, detail="llm_parse_error") from exc
```

> **Why a separate `/categorize-agent` endpoint (not replacing `/categorize`)?** The existing `/categorize` is the production path — fast, 4-layer, no agent overhead. The agent path is slower (1–3 LLM calls per request) and is invoked for debugging, edge cases, and demos. Both being live lets you compare: "same transaction, fast path says 'Shopping', agent says 'Shopping (Online)' with reasoning: 'Tokopedia rule matched + 3 past similar transactions confirmed Shopping (Online).' " That comparison is itself interview content.

> **Why 502 on agent failure (not 500)?** The error contract in `.claude/rules/ai-service.md`: LLM/provider failures are upstream-dependency errors → 502. Returning 200-with-empty is explicitly forbidden — it would poison any downstream evaluation with fake successes.

---

### [ ] STEP 6 — Write unit tests in `tests/test_categorizer_agent.py`

```python
"""Unit tests for CategorizerAgent — mocked smolagents, no real LLM calls."""
from unittest.mock import MagicMock, patch
import pytest

from app.agents.categorizer_agent import CategorizationResult, CategorizerAgent, _parse_result


def test_parse_result_extracts_structured_fields():
    raw = (
        "CATEGORY: Food & Dining\n"
        "CONFIDENCE: 0.9\n"
        "REASONING: Rule matched 'starbucks' → Food & Dining (Café)."
    )
    result = _parse_result(raw)
    assert result.category == "Food & Dining"
    assert result.confidence == pytest.approx(0.9)
    assert "starbucks" in result.reasoning.lower()


def test_parse_result_falls_back_to_other_on_garbage_output():
    result = _parse_result("nothing useful here at all")
    assert result.category == "Other"
    assert result.confidence == pytest.approx(0.5)


@patch("app.agents.categorizer_agent.ToolCallingAgent")
@patch("app.agents.categorizer_agent.LiteLLMModel")
def test_categorize_calls_agent_run(mock_model_cls, mock_agent_cls):
    mock_agent = MagicMock()
    mock_agent.run.return_value = (
        "CATEGORY: Transportation\n"
        "CONFIDENCE: 0.85\n"
        "REASONING: Grab rule matched → Transportation (Online)."
    )
    mock_agent_cls.return_value = mock_agent

    agent = CategorizerAgent()
    result = agent.categorize("GJ*GRAB CAR JAKARTA", "BCA", 35000)

    mock_agent.run.assert_called_once()
    assert result.category == "Transportation"
    assert result.confidence == pytest.approx(0.85)


@patch("app.agents.categorizer_agent.ToolCallingAgent")
@patch("app.agents.categorizer_agent.LiteLLMModel")
def test_categorize_re_raises_on_agent_error(mock_model_cls, mock_agent_cls):
    mock_agent = MagicMock()
    mock_agent.run.side_effect = RuntimeError("model timeout")
    mock_agent_cls.return_value = mock_agent

    agent = CategorizerAgent()
    with pytest.raises(RuntimeError, match="model timeout"):
        agent.categorize("TX", "BCA", 0)
```

```bash
cd services/ai-service && PYTHONPATH=. pytest tests/test_categorizer_agent.py -v
```

> **Why mock `ToolCallingAgent` at the class level?** smolagents' `ToolCallingAgent.__init__` may attempt to validate or initialize the LiteLLM model, which fails in CI without API keys. Patching the class at import prevents that initialization. Same pattern as mocking `anthropic.AsyncAnthropic` in the extraction tests — per `.claude/rules/ai-service.md`.

---

### [ ] STEP 7 — Write + run the 5-transaction smoke test

Create `services/ai-service/scripts/test_agent.py`:

```python
"""Smoke test: run the categorizer agent on 5 hand-picked transactions.

Usage:
    cd services/ai-service && PYTHONPATH=. python scripts/test_agent.py

Requires the AI service running on port 8000.
Prints: description | category | confidence | reasoning (truncated) | tool_calls
"""
import asyncio
import httpx

TEST_TRANSACTIONS = [
    {"description": "STARBUCKS COFFEE GRAND INDONESIA", "wallet": "BCA", "amount_idr": 72000},
    {"description": "TOKOPEDIA*BELANJA ELEKTRONIK", "wallet": "BCA", "amount_idr": 1500000},
    {"description": "PLN PREPAID TOKEN LISTRIK", "wallet": "Superbank", "amount_idr": 200000},
    {"description": "GJ*GRAB CAR JAKARTA SELATAN", "wallet": "BCA", "amount_idr": 35000},
    {"description": "TRANSFER MASUK DARI RIKKY", "wallet": "BCA", "amount_idr": 5000000},
]

URL = "http://localhost:8000/categorize-agent"


async def main() -> None:
    async with httpx.AsyncClient(timeout=30.0) as client:
        for tx in TEST_TRANSACTIONS:
            resp = await client.post(URL, json=tx)
            resp.raise_for_status()
            r = resp.json()
            print(f"\n{'─' * 70}")
            print(f"  Description : {tx['description']}")
            print(f"  Category    : {r['category']}  (confidence={r['confidence']:.2f})")
            print(f"  Reasoning   : {r['reasoning'][:120]}...")
            print(f"  Tool calls  : {r['tool_calls_count']}")


if __name__ == "__main__":
    asyncio.run(main())
```

Run:

```bash
# Terminal 1: start ai service (if not already running)
cd services/ai-service && uvicorn app.main:app --reload --port 8000

# Terminal 2: run the smoke test
cd services/ai-service && PYTHONPATH=. python scripts/test_agent.py
```

Expected output: all 5 transactions get a non-null category from `KNOWN_CATEGORIES`, confidence ≥ 0.5, and a reasoning string citing which tool produced the evidence.

**What to look for in Langfuse after the smoke test:** open the dashboard and find the 5 new traces. Each trace shows a tree: parent = agent run, children = individual tool call spans. Click into a span to see the tool input (the keyword passed) and the tool output (matched rules or similar transactions). *This* is the "observable agentic reasoning" demo — not just a prediction, a full reasoning trail.

> **Comparison story:** run the same 5 transactions against `/categorize` (the fast 4-layer path) and note where the two diverge. Identical result + different latency = the agent's cost for explainability. That tradeoff is interview content.

---

### [ ] STEP 8 — Stretch: DeepLearning.AI Functions, Tools and Agents with LangChain

If time allows (this is optional — don't let it block the commit): complete DeepLearning.AI *Functions, Tools and Agents with LangChain* (free, ~3h) → https://learn.deeplearning.ai (search "Functions, Tools and Agents").

This course bridges smolagents' tool-calling primitives to LangChain's function-calling API, which LangGraph (Chapter 8) builds on. Complete it between STEP 7 and the Chapter 8 start — not as a blocker to this chapter's commit.

---

### [ ] STEP 9 — Full test pass + commit

```bash
cd services/ai-service && PYTHONPATH=. pytest tests/test_categorizer_agent.py -v
cd c:\workspaces\personal-finance
git add services/ai-service/app/agents/
git add services/ai-service/app/models.py
git add services/ai-service/app/main.py
git add services/ai-service/pyproject.toml
git add services/ai-service/tests/test_categorizer_agent.py
git add services/ai-service/scripts/test_agent.py
git status    # verify NO .env, NO credentials
git commit -m "PF-AI007: Chapter 7 — Transaction Categorizer Agent (smolagents ToolCallingAgent, 3 tools, Langfuse traces)"
```

---

### [ ] STEP 10 — Log progress

```
/mentor log Built Transaction Categorizer Agent (smolagents ToolCallingAgent, 3 tools: search_category_rules / find_similar_transactions / list_all_categories); all 5 smoke-test transactions categorized correctly; tool calls visible as Langfuse child spans. Chapter 7 complete.
```

---

## Resources / Theory to Learn

Organized by when you need them — read just before the step that uses it.

### Concept 1 — The ReAct agent loop (STEP 0)
- **HF Agents Course, Unit 1** → https://huggingface.co/learn/agents-course/unit1/introduction — the canonical agent loop (Observe → Reason → Act). Read Unit 1 in full before writing a single line of agent code.
- **HF Agents Course, Unit 2 — smolagents** → https://huggingface.co/learn/agents-course/unit2/smolagents — `@tool`, `ToolCallingAgent` vs `CodeAgent`, running the first example. Estimated 25 min.
- **Yao et al., *ReAct: Synergizing Reasoning and Acting in Language Models*** (2022) → https://arxiv.org/abs/2210.03629 — skim abstract + Figure 1 for the canonical ReAct diagram; skip the math. The interview vocabulary ("Reason → Act → Observe") comes from this paper.

### Concept 2 — ToolCallingAgent vs CodeAgent (STEP 3)
- **smolagents docs — Agent types** → https://huggingface.co/docs/smolagents/en/conceptual_guides/react_and_code_agents — the side-by-side comparison. Read before writing `CategorizerAgent` to cement why you're choosing `ToolCallingAgent`.
- **smolagents docs — Writing good tools** → https://huggingface.co/docs/smolagents/en/tutorials/building_good_tools — "the tool docstring IS the schema description." Bad docstrings = bad tool choices. Read before STEP 2.

### Concept 3 — OTel tracing in smolagents (STEP 4)
- **smolagents docs — Monitoring** → https://huggingface.co/docs/smolagents/en/tutorials/inspect_runs — the `instrument_smolagents()` call and what OTel spans it emits.
- **Langfuse — OpenTelemetry integration** → https://langfuse.com/docs/opentelemetry — how our existing OTLP exporter receives smolagents spans. Skim the "Traces" section to understand the parent/child span shape.

### Concept 4 — Bridge to LangGraph (preview for Chapter 8)
- **LangChain blog — *Introduction to LangGraph*** → https://blog.langchain.dev/langgraph/ — read the first two sections only ("What is LangGraph" + "Motivation"). The key insight: LangGraph replaces the implicit `max_steps` loop with an explicit state graph. Everything you built in Chapter 7 becomes one node in Chapter 8's graph.
- **DeepLearning.AI — *Functions, Tools and Agents with LangChain*** → https://learn.deeplearning.ai — the STEP 8 stretch task; bridges smolagents to LangChain primitives that LangGraph sits on top of.

---

## Learning Strategy

**Daily loop for Chapter 7:**
- **Morning (60–90 min, deep block #1):** STEP 0 (HF Agents Course) + STEP 1 (install). Stop when you can explain the ReAct loop from memory without looking at notes.
- **Midday (90 min, deep block #2):** STEPs 2–3 (tools + agent). Stop when `CategorizerAgent.categorize("STARBUCKS", "BCA", 72000)` runs without error (even if output is imperfect — you're verifying the loop works, not the quality yet).
- **Afternoon (60 min):** STEPs 4–5 (OTel + endpoint). The Langfuse span tree is this chapter's demo artifact — don't skip the verification.
- **Next session (60 min):** STEPs 6–9 (tests + smoke test + commit + log). The smoke test is not optional.

**The 5 principles applied to Chapter 7:**
1. **Active retrieval:** STEP 0's write-from-memory section. If you can't explain ReAct without notes, the tools will work by accident — not by design.
2. **Project-first:** don't read the smolagents docs cover-to-cover. Read Unit 1–2, then open the project and build STEP 2. Pull docs when you hit a wall.
3. **Same-day shipping:** tools + agent (STEPs 2–3) in session 1; endpoint + tests (STEPs 4–6) in session 2. Two commits, not one.
4. **Interleaving:** while smolagents installs (STEP 1), skim the Chapter 8 LangGraph intro. Not distraction — context priming. You'll see Chapter 7 and Chapter 8 as two levels of the same abstraction.
5. **Teach-back:** after STEP 3, close the editor. Say out loud: "smolagents is the ReAct loop — observe tools, reason about next step, call a tool, repeat. LangGraph makes each step a node in a graph so you can add conditional routing. MCP makes each tool a server any agent can call. I've built the raw version now."

**Anti-patterns to avoid:**
- ❌ Using `CodeAgent` instead of `ToolCallingAgent`. Code execution in a web service is a security vulnerability — explicitly the wrong call here.
- ❌ Calling `agent.run()` directly inside `async def` without `asyncio.to_thread`. You'll stall the event loop for the full agent duration (1–5s) and timeout every concurrent request.
- ❌ Calling the real LLM in unit tests. Mock `ToolCallingAgent` at the class level — per ai-service.md patterns.
- ❌ Giving the agent 7+ tools. Start with 3 and measure. More tools = more indirection = harder to trace when the agent loops.
- ❌ Skipping the Langfuse verification after the smoke test. The trace tree is the proof point. Without it, "I built an observable agent" is an empty claim.
- ❌ Returning 200 with empty category on LLM failure. The error contract says 502 — evaluation harnesses depend on it.

**The Sunday metric:**
> "What can I say in an interview today that I couldn't say last Sunday?"
> Target answer: *"I built a transaction categorizer agent using smolagents ToolCallingAgent with 3 tools: rule-based keyword search, semantic similarity search via pgvector (from Chapter 3), and a category vocabulary guard. The agent runs a ReAct loop — max 3 iterations — and every tool call is a Langfuse child span. I can show you the trace where it called search_category_rules, got 'No rules matched', then called find_similar_transactions, found 3 past 'Shopping (Online)' transactions, and returned that category with 0.7 confidence. That's observable agentic reasoning — not just a demo, a debuggable production artifact."*

---

## Notes

- **smolagents version check first.** `instrument_smolagents()` lives in `smolagents.monitoring` from v1.9+. Run `python -c "import smolagents; print(smolagents.__version__)"` before STEP 4. If the module doesn't exist, upgrade: `pip install --upgrade smolagents`.
- **`find_similar_transactions` requires the AI service running.** It calls `/search` via httpx in a `asyncio.run()`. In unit tests this tool is never called (the agent is mocked). In the smoke test, start the service first on port 8000. Alternative: import `RetrievalService` directly and call `asyncio.run(service.search(...))` to avoid the HTTP roundtrip.
- **Category rules DB column name.** The `load_rules()` call in the lifespan uses `row["keyword"]` and `row["category_name"]` — match these to the actual column names in the `category_rules` table (check the Supabase schema). If the column is named differently (e.g. `pattern` or `category`), update the query in `main.py`.
- **`max_steps=3` may need tuning.** If the agent hits the step limit (you'll see "Max iterations reached" in the logs), investigate *why* before raising the limit. Usually it's an ambiguous tool docstring — the LLM doesn't know when to stop. Fix the docstring; don't just raise `max_steps`.
- **Why not LangChain / LlamaIndex for this chapter?** Those frameworks arrive in Chapter 8+ (LangGraph) and later. Building in raw smolagents first means you understand what the frameworks abstract. "I know what LangGraph adds because I built the raw version first" is a stronger position than "I just used LangChain from day one."
- **THINK-05 (frozen contract):** `CategorizeAgentRequest` and `CategorizeAgentResponse` are new contract surface. When .NET grows a `/categorize-agent` proxy (future feature, not in this chapter), freeze these fields and update `.claude/rules/ai-service.md`.
- **Next chapter (8 — LangGraph):** the `CategorizerAgent` becomes one *node* in the Financial Advisor graph. The 3 tools become graph tools. `max_steps=3` becomes explicit `END` routing. You'll understand what LangGraph adds — and why — because you've now seen what it replaces.
- **Deferred:** conversation memory within a categorization session (Chapter 8), MCP server exposing tools to Claude Desktop (Chapter 9), streaming the reasoning steps token-by-token (Chapter 5 streaming applies to `/ask` first).

---

## 📝 Knowledge Check

> Original practice questions modeled on the published exam domains of official AI Engineering certifications (Databricks Generative AI Engineer Associate, Azure AI Engineer AI-102, AWS Certified ML Engineer – Associate, Google Cloud Professional ML Engineer). They match the style and topic areas of those exams — not verbatim exam items. Each question is tagged to the certification domain(s) it maps to. Answers are hidden — recall first, then reveal.

### 1. The ReAct loop (Databricks · Google Cloud PMLE)

*Scenario:* You are explaining your smolagents categorizer to an interviewer. They ask: "What does the agent actually do between receiving the transaction description and returning a category?"

*Question:* Which sequence correctly describes the ReAct agent loop?

- **A.** The LLM generates the final answer in one shot, then optionally calls tools to verify it
- **B.** The LLM calls all tools in parallel, aggregates the results, and generates a final answer
- **C.** The agent pre-selects the correct tool based on input type, then executes it exactly once
- **D.** The LLM observes the current state (input + any prior tool outputs), reasons about the next action, calls a tool, observes the new output, and repeats until it has sufficient evidence to produce a final answer

<details>
<summary>Show answer</summary>

**D** — ReAct (Reason + Act) is an iterative loop: observe → reason → act (call a tool) → observe again → repeat. The LLM does not answer in one shot (A), tools are not called in parallel (B), and the tool choice is decided by the LLM at each iteration based on what it has learned so far — not pre-selected (C).
*Maps to: Databricks GenAI Engineer Associate · Agentic AI & Tool Use; Google Cloud PMLE · AI Agents & Reasoning*
</details>

### 2. ToolCallingAgent vs CodeAgent (Azure AI-102 · Databricks)

*Scenario:* Your personal-finance AI service exposes `/categorize-agent` to end users. A colleague suggests smolagents' `CodeAgent` because it's more flexible. You reject it.

*Question:* What is the primary reason to use `ToolCallingAgent` instead of `CodeAgent` in a production web service?

- **A.** `ToolCallingAgent` is faster because it skips the reasoning step
- **B.** `CodeAgent` requires GPU access; `ToolCallingAgent` runs on CPU
- **C.** `CodeAgent` generates and executes arbitrary Python code — which can include dangerous system calls; `ToolCallingAgent` constrains the LLM to structured JSON tool calls only, matching the `tool_use` pattern already used in the extraction pipeline
- **D.** `ToolCallingAgent` has built-in rate limiting that prevents overuse

<details>
<summary>Show answer</summary>

**C** — `CodeAgent` can generate `os.system("rm -rf /")` or arbitrary network calls and execute them — a critical vulnerability in any multi-tenant or internet-facing service. `ToolCallingAgent` limits the LLM's actions to the declared tool list, expressed as JSON. This is the same reason the extraction pipeline uses `tool_use` with explicit schema validation instead of free-text parsing.
*Maps to: Azure AI-102 · Responsible AI & Security; Databricks GenAI Engineer Associate · Production AI Security*
</details>

### 3. Tool docstring quality (Databricks · AWS ML Engineer)

*Scenario:* Your `find_similar_transactions` tool is being called even when a clear rule match exists. The Langfuse trace shows it firing first, before `search_category_rules`.

*Question:* What is the most likely cause, and how do you fix it?

- **A.** The similarity search endpoint is faster — add a timeout to deprioritize it
- **B.** `ToolCallingAgent` calls tools in the order they appear in the tools list; reorder them
- **C.** The `search_category_rules` docstring doesn't say "Use this tool FIRST" — the LLM has no grounding for the intended call order. Fix: add explicit ordering guidance to both tool docstrings
- **D.** smolagents caches the tool call order from the previous request — restart the service

<details>
<summary>Show answer</summary>

**C** — the tool docstring IS the schema description the LLM sees when it decides which tool to call. Without explicit ordering guidance, the LLM reasons from description relevance alone. Adding "Use this tool FIRST" to `search_category_rules` and "Use this when rules return No rules matched" to `find_similar_transactions` steers the agent toward the intended strategy. The LLM does not use list order (B) or caching (D) as selection criteria.
*Maps to: Databricks GenAI Engineer Associate · Prompt Engineering for Agents; AWS Certified ML Engineer – Associate · Model optimization*
</details>

### 4. Blocking the async event loop (Google Cloud PMLE · Azure AI-102)

*Scenario:* You call `agent.run()` directly inside your FastAPI `async def categorize_with_agent()` endpoint. Under moderate load, `/health` and `/search` start timing out.

*Question:* Why does this happen, and what is the correct fix?

- **A.** smolagents is not thread-safe; use a threading lock to serialize calls
- **B.** `agent.run()` is synchronous CPU-bound work; calling it inline inside `async def` blocks the FastAPI event loop for the full agent duration, starving all concurrent requests. Fix: `await asyncio.to_thread(agent.run, ...)` to offload it to the thread pool
- **C.** The agent is making too many LLM calls; reduce `max_steps` to 1
- **D.** FastAPI cannot handle agentic workloads; use a dedicated Celery worker

<details>
<summary>Show answer</summary>

**B** — FastAPI's event loop is single-threaded. A synchronous blocking call inside `async def` holds the loop for its full duration — every other request queues behind it. `asyncio.to_thread()` offloads the sync call to the thread pool, freeing the event loop to handle concurrent requests. This is the same fix applied to FlashRank in Chapter 4 and the same principle as `Task.Run()` in ASP.NET Core for CPU-bound sync work.
*Maps to: Google Cloud PMLE · Production deployment patterns; Azure AI-102 · Scalable AI service design*
</details>

### 5. OTel hook ordering at startup (Databricks · AWS ML Engineer)

*Scenario:* You call `instrument_smolagents()` at service startup and run 5 transactions via the smoke test. Langfuse shows 5 parent traces but no child spans for individual tool calls.

*Question:* What is the most likely cause?

- **A.** OTel spans are emitted only for LLM calls, not tool calls — you need a separate manual tracer for tools
- **B.** `instrument_smolagents()` was called before the OTLP exporter was configured; it registered a hook with no destination, so tool spans are silently dropped
- **C.** smolagents emits only one parent span per run by design; tool spans require a separate SDK
- **D.** The Langfuse dashboard paginates; scroll down to find tool spans under the parent

<details>
<summary>Show answer</summary>

**B** — `instrument_smolagents()` registers the OTel hook at call time, binding to whatever `TracerProvider` is active at that moment. If the OTLP exporter (pointing at Langfuse) is configured *after* this call, the hook fires into a no-op provider — parent traces may appear from a different pre-existing tracer, but tool-call child spans are lost. Fix: ensure `OTEL_EXPORTER_OTLP_ENDPOINT` is set and the provider is initialized *before* `instrument_smolagents()` in the startup sequence.
*Maps to: Databricks GenAI Engineer Associate · AI Observability; AWS Certified ML Engineer – Associate · Model monitoring*
</details>

### 6. Observability as a competitive signal (Databricks · Azure AI-102)

*Scenario:* An interviewer at an async-first company asks: "How do you debug a wrong category prediction from your agent?"

*Question:* What answer best demonstrates production AI engineering maturity?

- **A.** "We add more training examples and retrain the model."
- **B.** "We increase `max_steps` so the agent has more time to reconsider."
- **C.** "We check the output in unit tests after each deployment."
- **D.** "Every agent run produces a Langfuse trace with a child span per tool call — I can see which tools were called, with what arguments, and what they returned for any specific prediction. When a wrong category is reported, I replay the trace to identify which tool produced misleading output and fix it there — either the rule, the similarity data, or the tool docstring."

<details>
<summary>Show answer</summary>

**D** — "I can show you the trace" is the production AI engineering answer. It demonstrates: (1) observability was designed in, not bolted on after a bug; (2) debugging is trace-driven, not guess-driven; (3) agent failures are tool failures — you fix the tool or its data, not the LLM. Unit tests (C) don't cover the reasoning path; more steps (B) don't diagnose the cause; retraining (A) is wrong category entirely for a tool-calling agent.
*Maps to: Databricks GenAI Engineer Associate · AI Observability & Debugging; Azure AI-102 · Monitoring AI applications*
</details>
