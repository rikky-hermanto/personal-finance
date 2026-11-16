# PF-AI011 — Human-in-the-Loop: Approval Before the Categorizer Writes, and a Read-Only Split for MCP Tools

> **Learning Phase:** Phase 3 · Chapter 11 · topic 16 of the learning path (follow-up to PF-AI010)
> **Status:** To Do
> **Started:** —
> **Planned from branch:** main
> **Sensitive:** new write path on `transactions` (schema function, RLS, cross-service contract between the AI service and the .NET API)
> **Depends on:** PF-AI010 (MCP server, done), PF-S15 (owner-scoped agents, done). `AI_AGENTS_ENABLED` and `AiChat:AgentsEnabled` on locally.
> **Board objective:** The AI can suggest a new category for a saved transaction, but nothing changes until you accept, edit or reject it, and a repeated request never writes twice.
> **Pivot goal:** "An agent that writes to real data needs a point where you say yes or no." This chapter builds that point with a LangGraph `interrupt`, makes the write safe to retry, and marks every MCP tool as read-only with a test that keeps it that way.

# 📑 Table of Contents

- [📖 Introduction](#-introduction)
- [🔧 Implementation](#-implementation)
  - [🎯 Objective](#-objective)
  - [✅ Acceptance Criteria](#-acceptance-criteria)
  - [🧭 Approach](#-approach)
  - [📂 Affected Files](#-affected-files)
  - [📋 TODO](#-todo)
  - [🗺 Concept Map](#-concept-map)
  - [🧪 Experiments](#-experiments)
  - [📌 Notes](#-notes)
- [📝 Knowledge Check](#-knowledge-check)
- [🧾 Owner Review Checklist](#-owner-review-checklist)
- [Execution Notes](#execution-notes)

---

# 📖 Introduction

## High level — what is this?

Today no agent in this project asks before acting, and the categorizer agent cannot act at all: `/categorize-agent` returns a suggestion and stops. There is also no way to change the category of a saved transaction anywhere in the API. This chapter adds the write, and puts a human decision in front of it.

The flow, in plain words:

1. You ask for a review of one saved transaction.
2. The agent proposes a category with its confidence and reasoning. The graph then pauses and saves its state.
3. You accept, edit or reject. Only then does the graph continue.
4. On accept or edit, the write goes through the .NET API, which changes the row only if the category is still the one the agent saw.

## Three ideas to understand before coding

**A pause is a saved state, not a waiting thread.** `interrupt()` stops the graph and the checkpointer stores where it stopped. The HTTP request returns. The decision arrives later, in a different request, and `Command(resume=...)` continues from the saved point.

**The node that pauses runs again from its first line on resume.** Anything before the `interrupt()` call inside that node happens twice. That is why the LLM call lives in its own `propose` node, before a separate `approval` node. Put both in one node and every approval pays for a second model call that may return a different answer.

**A write that can be retried needs a condition.** The write says "change this row to X only if it is still Y". A second attempt finds the row already at X and reports that instead of writing again. An attempt that finds neither X nor Y reports a conflict, because someone changed the row in between.

## Where approval is worth its friction

| Action | Approval? | Why |
|---|---|---|
| Reading transactions, totals, scores | No | Nothing changes; a prompt would only slow the answer. |
| Changing a saved category | Yes | It changes real data and can move a pyramid score. |
| Agent proposes the category already saved | No | There is nothing to write, so there is nothing to approve. |

## 📚 Resources / Theory to Learn

- LangGraph docs — human-in-the-loop, `interrupt` and `Command(resume=...)` (30 min).
- LangGraph docs — persistence and checkpointers; reread with "what survives a restart" in mind (15 min).
- MCP specification — tool annotations (`readOnlyHint`, `destructiveHint`). Note that they are hints to the client and enforce nothing on the server (10 min).

---

# 🔧 Implementation

## 🎯 Objective

Add a category review that pauses for a human decision before any write, and make that write safe to repeat. Mark the four MCP tools read-only in a way a test enforces. This closes topic 16 and gives the interview answers for approval points, tool retries and idempotency.

## ✅ Acceptance Criteria

- [ ] Starting a review for a saved transaction returns the proposal (category, confidence, reasoning), the current category and a review id, and the transaction is unchanged.
- [ ] Accepting writes the proposed category; editing writes the category you chose; rejecting writes nothing.
- [ ] Sending the same decision twice returns the same result and performs one write. The categorizer model runs once per review, not once per request.
- [ ] If the transaction's category changed after the proposal, the decision returns `conflict` and the newer value is kept.
- [ ] If the agent proposes the category already saved, the review ends as `unchanged` without asking.
- [ ] A review id used by a different signed-in user returns not found.
- [ ] An edited category that is not in the owner's category list is refused before the graph resumes.
- [ ] After a successful write, Journey scores are recalculated through the existing event path.
- [ ] Every MCP tool carries a read-only annotation, runs its SQL in a read-only transaction, and a test fails if a tool is added without one.
- [ ] `dotnet test` and `pytest` pass; the new error codes are listed in `.claude/rules/ai-service.md`.

## 🧭 Approach

Backend complete, UI deferred. A new LangGraph graph (`app/agents/category_review.py`) wraps the existing smolagents categorizer as its `propose` node, pauses in an `approval` node with `interrupt()`, and writes in an `apply` node. The write is a compare-and-set SQL function called by a new .NET command, so ownership, RLS and score recalculation stay where they already live; Python reaches it with the caller's own bearer token, exactly as the advisor's tools do. Two thin proxy actions on `ChatController` expose start and decide to the browser side for later.

Deliberately not in this plan: a React approval card and saving "suggested vs kept" for the eval set (both topic 18), a persistent checkpointer (see Notes), and any MCP write tool.

## 📂 Affected Files

| File | Change |
|------|--------|
| `supabase/migrations/{timestamp}_pf_ai014_checked_transaction_category.sql` | Create — `apply_transaction_category` compare-and-set function and its grants |
| `apps/api/src/PersonalFinance.Application/Commands/UpdateTransactionCategoryCommand.cs` | Create — command, result enum |
| `apps/api/src/PersonalFinance.Application/Commands/UpdateTransactionCategoryCommandHandler.cs` | Create — calls the function, publishes the recalculation event |
| `apps/api/src/PersonalFinance.Application/Validators/UpdateTransactionCategoryCommandValidator.cs` | Create — id, lengths, category in the owner's list |
| `apps/api/src/PersonalFinance.Api/Controllers/TransactionsController.cs` | Edit — `PATCH {id:int}/category` |
| `apps/api/src/PersonalFinance.Api/Controllers/ChatController.cs` | Edit — `category-review` and `category-review/decision` proxy actions |
| `apps/api/tests/PersonalFinance.Tests/...` | Create — handler, validator and controller tests |
| `services/ai-service/app/agents/category_review.py` | Create — the review graph |
| `services/ai-service/app/services/category_review.py` | Create — start, decide, replay |
| `services/ai-service/app/agents/advisor_tools.py` | Edit — public `api_patch` helper beside `_get` |
| `services/ai-service/app/models.py` | Edit — review request and response models |
| `services/ai-service/app/main.py` | Edit — two routes, gate entries, categorizer wiring |
| `services/ai-service/app/mcp_server.py` | Edit — read-only annotations, read-only transactions, `WRITE_TOOLS` |
| `services/ai-service/tests/test_category_review.py` | Create — pause, accept, edit, reject, replay, conflict, owner isolation |
| `services/ai-service/tests/test_mcp_server.py` | Edit — read-only policy test |
| `.claude/rules/ai-service.md` | Edit — endpoints and error codes |
| `docs/architecture/API-endpoints.md` | Edit — the three new endpoints |
| `docs/mentor/ai-engineer-learning-path.md` | Edit — row 16 and concept coverage rows |

---

## 📋 TODO

## Phase 1 — The write path (.NET and database)

### [ ] STEP 0 — Theory gate (1h, owner)

Read the three resources above. Then answer without looking: what gets stored when a graph pauses, which code runs again on resume, and what a `readOnlyHint` does and does not guarantee.

> **Why:** the two design decisions in this plan (separate `propose` and `approval` nodes; a conditional write) only make sense once these three answers are clear.
> **Check:** you can explain why one node doing "call the model, then interrupt" is a bug.

---

### [ ] STEP 1 — Confirm the facts this plan relies on

```bash
# No existing single-transaction update (expected: only GET/POST/DELETE actions)
grep -n "Http[A-Z][a-z]*(" apps/api/src/PersonalFinance.Api/Controllers/TransactionsController.cs

# How the API calls a checked SQL function today — find the caller of update_cashflow_account
grep -rn "update_cashflow_account" apps/api/src --include=*.cs

# The recalculation event and what it carries
cat apps/api/src/PersonalFinance.Domain/Events/TransactionsSubmittedEvent.cs
cat apps/api/src/PersonalFinance.Application/EventHandlers/JourneyRecalcOnTransactionsSubmittedHandler.cs

# Grants at the end of the pattern migration (REVOKE / GRANT EXECUTE lines)
grep -n "REVOKE\|GRANT EXECUTE\|COMMIT" supabase/migrations/20261009104000_pf_s08_checked_account_updates.sql

# How the advisor proxy forwards the owner token and the user token
grep -n "advisor" -A 25 apps/api/src/PersonalFinance.Api/Controllers/ChatController.cs

# Where the owner's category list comes from on the .NET side
grep -rn "interface ICategor" apps/api/src/PersonalFinance.Application/Interfaces
```

Write the answers into this plan's Notes before continuing: the class that calls `update_cashflow_account`, whether `TransactionsSubmittedEvent` can be published for a single-row change, and the service that returns the owner's categories.

> **Why:** the .NET steps below say "mirror the existing pattern". This step finds that pattern so nothing is guessed. A wrong guess about grants or the event is silent: the endpoint returns 200 and nothing changes.
> **Check:** all three answers are written down. If no .NET caller of a checked function exists, stop and ask.

---

### [ ] STEP 2 — Migration: a compare-and-set function for one transaction's category

Create `supabase/migrations/{timestamp}_pf_ai014_checked_transaction_category.sql` (use the `db-migrate` skill for the timestamp and apply step). Copy the `REVOKE` and `GRANT EXECUTE` lines from the pattern migration found in STEP 1.

```sql
-- PF-AI011: change one transaction's category only if it still holds the value the caller saw.
-- Returns: applied | already_applied | conflict | not_found.
BEGIN;

CREATE FUNCTION public.apply_transaction_category(
  p_id integer, p_expected text, p_new text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, auth AS $fn$
DECLARE
  v_owner uuid := auth.uid();
  v_current text;
BEGIN
  IF v_owner IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'authenticated_user_required';
  END IF;
  IF p_id IS NULL OR p_expected IS NULL OR p_new IS NULL
     OR length(btrim(p_new)) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_category';
  END IF;
  PERFORM pg_catalog.set_config('lock_timeout', '3s', true);

  SELECT category INTO v_current FROM public.transactions
  WHERE user_id = v_owner AND id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF v_current = btrim(p_new) THEN RETURN 'already_applied'; END IF;
  IF v_current <> p_expected THEN RETURN 'conflict'; END IF;

  UPDATE public.transactions SET category = btrim(p_new)
  WHERE user_id = v_owner AND id = p_id;
  RETURN 'applied';
END $fn$;

-- REVOKE ALL ... FROM PUBLIC; GRANT EXECUTE ... TO authenticated;  (copy the exact form from STEP 1)

COMMIT;
```

Then check all four outcomes against the local database, acting as the owner (replace the uuid and id with a real local pair; do this inside a transaction and roll back):

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"<owner-uuid>","role":"authenticated"}', true);
SELECT category FROM transactions WHERE id = <id>;                      -- note it as OLD
SELECT apply_transaction_category(<id>, 'OLD', 'Groceries');            -- applied
SELECT apply_transaction_category(<id>, 'OLD', 'Groceries');            -- already_applied
SELECT apply_transaction_category(<id>, 'OLD', 'Transport');            -- conflict
SELECT apply_transaction_category(-1, 'OLD', 'Transport');              -- not_found
ROLLBACK;
```

> **Why:** the condition has to be checked and the row changed in one statement sequence under a row lock, or two requests can both pass the check. Order matters too: "already at the new value" is tested before "differs from expected", which is what makes a repeat harmless. The function filters on `user_id` itself, so it never depends on the caller's filter.
> **Check:** the four statements return `applied`, `already_applied`, `conflict`, `not_found` in that order, and a second owner's uuid gets `not_found` for the same id.

---

### [ ] STEP 3 — .NET command, validator and handler

Create `UpdateTransactionCategoryCommand(int Id, string ExpectedCategory, string Category) : IRequest<TransactionCategoryOutcome>` with the enum `Applied, AlreadyApplied, Conflict, NotFound`.

- **Validator** (`UpdateTransactionCategoryCommandValidator`): `Id > 0`; both strings non-empty and at most 100 characters; `Category` is in the owner's category list from the service found in STEP 1.
- **Handler:** call `apply_transaction_category` the same way the class found in STEP 1 calls `update_cashflow_account`, using the per-request client that carries the caller's token. Map the returned text to the enum. On `Applied` only, publish the recalculation event: reuse `TransactionsSubmittedEvent` if STEP 1 showed it fits a single-row change, otherwise add `TransactionCategoryChangedEvent` in `Domain/Events` with a handler that calls the same recalculation as `JourneyRecalcOnTransactionsSubmittedHandler`.
- Inject `ILogger<T>` and log the outcome with the transaction id, never the description.
- An unknown return value from the function throws; it never maps to `Applied`.

Tests (names follow TEST-02): `Handle_FunctionReturnsApplied_PublishesRecalculation`, `Handle_FunctionReturnsAlreadyApplied_DoesNotPublish`, `Handle_FunctionReturnsConflict_ReturnsConflict`, `Handle_UnknownReturnValue_Throws`, `Validate_CategoryNotInOwnerList_Fails`.

> **Why:** a category change can move spending between "spent" and "saved or invested", which changes a pyramid score. Publishing the event only on `Applied` keeps a retried request from triggering a second recalculation. ARCH-05: the handler goes through an Application interface, never raw SQL in a controller.
> **Check:** `dotnet test --filter UpdateTransactionCategory` passes with all five tests.

---

### [ ] STEP 4 — `PATCH /api/transactions/{id}/category`

Add the action to `TransactionsController`: body `{ "expectedCategory": string, "category": string }`, send the command, and map the outcome.

| Outcome | Status | Body |
|---|---|---|
| Applied | 200 | `{"outcome":"applied"}` |
| AlreadyApplied | 200 | `{"outcome":"already_applied"}` |
| Conflict | 409 | `{"outcome":"conflict"}` |
| NotFound | 404 | `{"outcome":"not_found"}` |
| Validation failure | 400 | standard validation response |

The owner comes from `ICurrentUser`. Keep the action body under 15 lines (ARCH-04). Add a controller test for each row of the table and add the endpoint to `docs/architecture/API-endpoints.md`.

> **Why:** `already_applied` is a 200 because, from the caller's side, the state they asked for is the state that exists. Returning an error for a repeat is what makes clients retry in a loop.
> **Check:** with the stack running, a `curl -X PATCH` using a real session token returns `applied`, the same call again returns `already_applied`, and a call with a wrong `expectedCategory` returns 409. Restore the original category afterwards.

---

## Phase 2 — The review graph, its endpoints, and the MCP split

### [ ] STEP 5 — Pre-flight: prove the `interrupt` API on the installed version

```bash
cd services/ai-service
.venv/Scripts/python -c "
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from langgraph.types import interrupt, Command
class S(TypedDict, total=False):
    n: int
    d: str
def a(s): return {'n': s.get('n', 0) + 1}
def b(s): return {'d': interrupt({'ask': 'ok?'})}
g = StateGraph(S); g.add_node('a', a); g.add_node('b', b)
g.add_edge(START, 'a'); g.add_edge('a', 'b'); g.add_edge('b', END)
app = g.compile(checkpointer=MemorySaver()); cfg = {'configurable': {'thread_id': 't'}}
r = app.invoke({}, cfg)
assert '__interrupt__' in r and app.get_state(cfg).next == ('b',), r
r = app.invoke(Command(resume='yes'), cfg)
assert r == {'n': 1, 'd': 'yes'}, r
print('interrupt preflight PASS')"
```

> **Why:** `langgraph` is pinned below 1.0 (0.6.11 installed on 2026-11-14) and this API changed shape between minor versions. The script also proves the point from the introduction: node `a` ran once (`n == 1`) even though the graph was invoked twice.
> **Check:** prints `interrupt preflight PASS`. If it fails on `__interrupt__`, read the pause from `app.get_state(cfg).next` instead and adjust STEP 7.

---

### [ ] STEP 6 — The review graph

First add a public helper to `app/agents/advisor_tools.py`, beside `_get`:

```python
async def api_patch(path: str, payload: dict) -> httpx.Response:
    """PATCH the .NET API as the caller. Does not raise on 4xx — the caller maps them."""
    return await _CLIENT.patch(path, json=payload, headers=_auth_headers())
```

Then create `services/ai-service/app/agents/category_review.py`:

```python
"""Category review — a human decision sits between the agent's proposal and the write.

Graph:
  START → propose → (same as saved? → END) → approval ⏸ → (reject → END) → apply → END

propose and approval are separate nodes on purpose. A node that pauses runs again from
its first line on resume, so a model call in the same node would be paid for twice and
could return a different answer than the one the user approved.
"""
from __future__ import annotations

import asyncio
import contextvars
import logging
from typing import Any, TypedDict

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph
from langgraph.types import interrupt

from app.agents.advisor_tools import api_patch

logger = logging.getLogger(__name__)

_categorizer: Any | None = None


def set_categorizer(agent: Any) -> None:
    """Injected from main.py lifespan — the same instance /categorize-agent uses."""
    global _categorizer
    _categorizer = agent


class ReviewState(TypedDict, total=False):
    transaction_id: int
    description: str
    wallet: str
    amount_idr: float          # prompt text only; never summed or written (FIN-01)
    current_category: str      # read from the database when the review started
    proposal: dict | None      # category, confidence, reasoning, tool_calls_count
    decision: dict | None      # action: accept | edit | reject, category: str | None
    outcome: str | None        # unchanged | rejected | applied | already_applied | conflict | not_found
    final_category: str | None


async def propose(state: ReviewState) -> dict:
    if _categorizer is None:
        raise RuntimeError("categorizer not initialised — call set_categorizer() in lifespan")
    # The categorizer is synchronous; run it in a worker thread with this request's context
    # so its tools see the bound OwnerContext (same pattern as /categorize-agent).
    result = await asyncio.to_thread(
        contextvars.copy_context().run,
        _categorizer.categorize,
        state["description"], state["wallet"], state["amount_idr"],
    )
    proposal = {
        "category": result.category,
        "confidence": result.confidence,
        "reasoning": result.reasoning,
        "tool_calls_count": result.tool_calls_count,
    }
    unchanged = result.category == state["current_category"]
    return {"proposal": proposal, "outcome": "unchanged" if unchanged else None}


def approval(state: ReviewState) -> dict:
    # Nothing above this line may have a side effect: it all runs again on resume.
    decision = interrupt({
        "transaction_id": state["transaction_id"],
        "current_category": state["current_category"],
        "proposal": state["proposal"],
    })
    rejected = decision["action"] == "reject"
    return {"decision": decision, "outcome": "rejected" if rejected else None}


async def apply(state: ReviewState) -> dict:
    decision = state["decision"]
    category = decision["category"] if decision["action"] == "edit" else state["proposal"]["category"]
    response = await api_patch(
        f"/api/transactions/{state['transaction_id']}/category",
        {"expectedCategory": state["current_category"], "category": category},
    )
    if response.status_code == 200:
        outcome = response.json()["outcome"]      # applied | already_applied
    elif response.status_code == 409:
        outcome = "conflict"
    elif response.status_code == 404:
        outcome = "not_found"
    else:
        response.raise_for_status()               # leaves the graph paused before apply
        raise RuntimeError(f"unexpected status {response.status_code}")
    logger.info("category_review transaction=%s action=%s outcome=%s",
                state["transaction_id"], decision["action"], outcome)
    return {"outcome": outcome, "final_category": category}


def _after_propose(state: ReviewState) -> str:
    return END if state.get("outcome") == "unchanged" else "approval"


def _after_approval(state: ReviewState) -> str:
    return END if state.get("outcome") == "rejected" else "apply"


def build_graph() -> CompiledStateGraph:
    builder = StateGraph(ReviewState)
    builder.add_node("propose", propose)
    builder.add_node("approval", approval)
    builder.add_node("apply", apply)
    builder.add_edge(START, "propose")
    builder.add_conditional_edges("propose", _after_propose, {"approval": "approval", END: END})
    builder.add_conditional_edges("approval", _after_approval, {"apply": "apply", END: END})
    builder.add_edge("apply", END)
    return builder.compile(checkpointer=MemorySaver())


review_graph = build_graph()
```

> **Why:** the graph has no write tool for the model to call. The model can only produce a proposal; the write is a fixed node that the graph reaches only through `approval`. That is stronger than telling the model "ask first" in a prompt.
> **Check:** `.venv/Scripts/python -c "from app.agents.category_review import review_graph; print(review_graph.get_graph().draw_ascii())"` shows the three nodes and both early exits.

---

### [ ] STEP 7 — The service: start, decide, replay

Create `services/ai-service/app/services/category_review.py`:

```python
"""CategoryReviewService — starts a review, applies a decision, and replays finished ones."""
from __future__ import annotations

import uuid

from langgraph.types import Command

from app.agents.advisor_tools import caller_token
from app.agents.category_review import review_graph


class ReviewNotFound(Exception):
    """No paused or finished review under this owner and id."""


class CategoryReviewService:
    @staticmethod
    def _config(owner_id: uuid.UUID, review_id: str) -> dict:
        # Keyed by owner plus review, so another user's review id opens an empty thread.
        return {"configurable": {"thread_id": f"{owner_id}:category-review:{review_id}"}}

    @staticmethod
    def _view(review_id: str, values: dict, pending: bool) -> dict:
        return {
            "review_id": review_id,
            "status": "pending" if pending else "resolved",
            "transaction_id": values["transaction_id"],
            "current_category": values["current_category"],
            "proposal": values.get("proposal"),
            "outcome": values.get("outcome"),
            "final_category": values.get("final_category"),
        }

    async def start(self, *, transaction: dict, owner_id: uuid.UUID, user_token: str) -> dict:
        review_id = str(uuid.uuid4())
        config = self._config(owner_id, review_id)
        initial = {**transaction, "proposal": None, "decision": None,
                   "outcome": None, "final_category": None}
        with caller_token(user_token):
            await review_graph.ainvoke(initial, config)
        snapshot = await review_graph.aget_state(config)
        return self._view(review_id, snapshot.values, pending=bool(snapshot.next))

    async def decide(self, *, review_id: str, decision: dict,
                     owner_id: uuid.UUID, user_token: str) -> dict:
        config = self._config(owner_id, review_id)
        snapshot = await review_graph.aget_state(config)
        if not snapshot.values:
            raise ReviewNotFound(review_id)
        if not snapshot.next:
            # Already finished: return the stored result. No second write, no second model call.
            return self._view(review_id, snapshot.values, pending=False)
        # Paused at approval → resume with the decision. Paused before apply (an earlier write
        # attempt failed) → run apply again; the conditional write makes that safe.
        payload = Command(resume=decision) if snapshot.next == ("approval",) else None
        with caller_token(user_token):
            await review_graph.ainvoke(payload, config)
        snapshot = await review_graph.aget_state(config)
        return self._view(review_id, snapshot.values, pending=bool(snapshot.next))
```

> **Why:** three different "second requests" exist and each gets its own answer. A repeat after success replays the stored result. A repeat after a failed write retries only the write. A request for someone else's review finds nothing. Reading state from the checkpointer instead of the `ainvoke` return value keeps the code independent of how the installed version reports an interrupt.
> **Check:** covered by the tests in STEP 9.

---

### [ ] STEP 8 — Models, routes and the .NET proxy

In `app/models.py` add:

```python
class CategoryReviewStartRequest(BaseModel):
    transaction_id: int = Field(..., gt=0)


class CategoryReviewDecisionRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    review_id: str = Field(..., min_length=36, max_length=36)
    action: Literal["accept", "edit", "reject"]
    category: str | None = Field(default=None, max_length=100)


class CategoryReviewResponse(BaseModel):
    review_id: str
    status: Literal["pending", "resolved"]
    transaction_id: int
    current_category: str
    proposal: dict | None = None
    outcome: str | None = None
    final_category: str | None = None
```

In `app/main.py`:

- In the lifespan, call `set_categorizer(app.state.categorizer_agent)`.
- Add `"/category-review"` and `"/category-review/decision"` to `_OWNER_AGENT_ROUTES`. The review id travels in the body, not the path, because the gate matches exact paths.
- `POST /category-review` (dependencies `require_owner` and `require_user_token`, as `/advisor`): load the row with `owner_connection` so RLS scopes it —

```python
row = await conn.fetchrow(
    """SELECT t.description, t.category, t.amount_idr::float AS amount_idr,
              COALESCE(a.name, 'Unknown') AS wallet
       FROM transactions t LEFT JOIN accounts a ON a.id = t.account_id
       WHERE t.id = $1""", request.transaction_id)
```

  Return 404 `transaction_not_found` when there is no row. Build the `OwnerContext` exactly as `/categorize-agent` does, bind it, and call `CategoryReviewService.start` with `transaction_id`, `description`, `wallet`, `amount_idr` and `current_category=row["category"]`.
- `POST /category-review/decision`: for `edit`, require `category` and check it is in `app.state.vocabulary.for_owner(owner_id)`; otherwise return 422 `invalid_category` before touching the graph. Bind the owner context, call `decide`. Map `ReviewNotFound` to 404 `review_not_found`, `AgentRateLimitedError` to 502 `llm_rate_limited`, and any other failure to 502 `category_write_failed` (log the exception, return only the code).

In `ChatController` add `POST category-review` and `POST category-review/decision`, copied from the `advisor` action: gated by `AgentsEnabled`, forwarding the internal key, the signed owner token and the caller's token, and passing the AI service's status and body through.

Add the two endpoints and the three error codes (`transaction_not_found`, `review_not_found`, `category_write_failed`, plus `invalid_category` 422) to `.claude/rules/ai-service.md`, and the proxy routes to `docs/architecture/API-endpoints.md`.

> **Why:** the current category is read from the database under the caller's RLS, never taken from the request, so a client cannot supply a fake "expected" value to force a write. Validating an edit before resuming matters because a resume consumes the pause; a bad value must be refused while the review is still open.
> **Check:** with the AI service running, `curl -s -X POST localhost:8000/category-review` without owner headers returns 401, and with `AI_AGENTS_ENABLED=false` returns 404.

---

### [ ] STEP 9 — Tests for the review

Create `services/ai-service/tests/test_category_review.py`. Patch `app.agents.category_review._categorizer` with a `MagicMock` whose `categorize` returns a result object, and patch `app.agents.category_review.api_patch` with an `AsyncMock`. Never call a real provider or the real API.

| Test | Asserts |
|---|---|
| `test_start_pauses_before_any_write` | status `pending`, proposal present, `api_patch` not called |
| `test_accept_writes_the_proposed_category` | one PATCH with `expectedCategory` = current and `category` = proposal; outcome `applied` |
| `test_edit_writes_the_users_category` | PATCH carries the edited category |
| `test_reject_writes_nothing` | outcome `rejected`, `api_patch` not called |
| `test_same_decision_twice_writes_once` | second `decide` returns the same view; `api_patch` call count 1; `categorize` call count 1 |
| `test_proposal_equal_to_current_ends_without_asking` | status `resolved`, outcome `unchanged`, no PATCH |
| `test_conflict_is_reported_and_final` | PATCH returns 409 → outcome `conflict` |
| `test_failed_write_can_be_retried` | first PATCH returns 500 and `decide` raises; second `decide` reaches `applied`; `categorize` call count still 1 |
| `test_other_owner_cannot_decide` | `decide` with a different `owner_id` raises `ReviewNotFound` |

Add route tests beside the existing agent route tests: `invalid_category` on an edit outside the vocabulary leaves the review pending; the gate returns 404 when agents are disabled.

> **Why:** `test_same_decision_twice_writes_once` and `test_failed_write_can_be_retried` are the two retry cases the learning path asks for. The `categorize` call count is the proof that resume does not re-run the model.
> **Check:** `pytest tests/test_category_review.py -v` shows all tests passing, and `pytest` for the whole service has no new failures.

---

### [ ] STEP 10 — MCP: mark and enforce read-only

Pre-flight first, because the installed `fastmcp` is 4.1.3 and the decorator options moved between major versions:

```bash
cd services/ai-service
.venv/Scripts/python -c "
import asyncio
from fastmcp import FastMCP, Client
m = FastMCP('t')
@m.tool(annotations={'readOnlyHint': True})
def ping() -> str: return 'pong'
async def main():
    async with Client(m) as c:
        tools = await c.list_tools()
        assert tools[0].annotations.readOnlyHint is True, tools[0]
asyncio.run(main()); print('mcp annotations preflight PASS')"
```

Then in `app/mcp_server.py`:

- Add `WRITE_TOOLS: frozenset[str] = frozenset()` near the top with a comment stating the policy: every tool is read-only unless named here; a write tool must return a proposal and send the change through the category review, never write directly.
- Change all four decorators to `@mcp.tool(annotations={"readOnlyHint": True})`.
- In `get_transactions` and `get_cashflow_summary`, wrap the query: `async with conn.transaction(readonly=True):` around the `fetch`.
- Update the module docstring: the four tools are read-only by annotation and by transaction mode.

Add to `tests/test_mcp_server.py`:

```python
@pytest.mark.asyncio
async def test_every_tool_is_read_only_unless_listed_as_a_write_tool():
    from fastmcp import Client
    from app.mcp_server import WRITE_TOOLS, mcp

    async with Client(mcp) as client:
        tools = await client.list_tools()
    assert len(tools) >= 4
    for tool in tools:
        if tool.name in WRITE_TOOLS:
            continue
        assert tool.annotations is not None and tool.annotations.readOnlyHint is True, (
            f"{tool.name} has no read-only annotation. Mark it read-only, or add it to "
            "WRITE_TOOLS and route its change through the category review."
        )
```

Update `test_get_transactions_returns_list` and its neighbours if the mock connection needs a `transaction()` context manager.

> **Why:** an annotation is a hint the client may ignore, and these queries run on a pool that bypasses row-level security. The read-only transaction is the part the database enforces. The test turns "the four tools stay read-only" from a sentence in a plan into something that fails the build when a fifth tool is added carelessly.
> **Check:** the pre-flight prints PASS, `pytest tests/test_mcp_server.py -v` passes, and temporarily removing one annotation makes the new test fail with the message above.

---

### [ ] STEP 11 — Live check through the real API (owner present)

Start the stack (`npm start`). Reuse the sign-in helper from `scripts/pf_s15_ai_isolation.py` to get a session token, pick one transaction whose category is wrong, and run through `/api/chat/category-review`:

1. Start a review; confirm the row is unchanged in Supabase Studio.
2. Accept; confirm the row changed and the Journey score timestamp moved.
3. Send the same decision again; confirm the same response and no second change.
4. Start another review, change the category by hand in Studio, then accept; confirm `conflict` and that the manual value stayed.
5. Open the Langfuse trace for one review and note the model call count.

Record the five results in Notes with the date. If the provider quota blocks step 1, record that and leave this step unchecked.

> **Why:** the mocked tests prove the wiring. Only a live run proves the token forwarding, the SQL function grants and the recalculation together.
> **Check:** five results written in Notes.

---

### [ ] STEP 12 — Records

- `docs/mentor/ai-engineer-learning-path.md`: row 16 status and plan link; concept coverage rows "Human-in-the-loop" and "Agent reliability".
- `docs/mentor/README.md` chapter map; `docs/mentor/progress.md` with what was done.
- If PF-AI013's pages already exist, change their "human-in-the-loop: not built" lines.
- Regenerate the board: `node "$HOME/.claude/skills/loop-lib/scripts/board.mjs" --root . --write`.

> **Why:** the next session picks its work from these files.
> **Check:** `grep -n "PF-AI011" docs/mentor/ai-engineer-learning-path.md plans/BOARD.md` returns hits in both.

---

## 🗺 Concept Map

| New concept | Familiar .NET/backend analogy | What it does |
|---|---|---|
| `interrupt()` | A saga step waiting on an external message | Stops the graph and returns a payload to the caller |
| Checkpointer | Saga state store | Holds the paused state between two HTTP requests |
| `Command(resume=...)` | Delivering the awaited message to the saga | Continues from the paused node with the human's answer |
| Node re-runs on resume | A message handler that may be redelivered | Code before the pause must be free of side effects |
| Compare-and-set write | Optimistic concurrency (`If-Match` / rowversion) | Writes only if the row still holds the value you read |
| `readOnlyHint` | An `[HttpGet]` attribute with no enforcement behind it | Tells the client a tool does not change anything |
| Read-only transaction | A read-only database user | The database refuses writes regardless of the code |

## 🧪 Experiments

**Experiment A — Merge the nodes.** Move the categorizer call into `approval`, above `interrupt()`, and run `test_same_decision_twice_writes_once`. Watch the `categorize` call count become 2. Takeaway: side effects and model calls go in the node before the pause. Revert.

**Experiment B — Remove the condition.** Make `apply` send an empty `expectedCategory` handling in a scratch branch of the SQL function (skip the conflict check) and repeat live step 4. The manual edit is overwritten. Takeaway: the approval protects against the agent; the condition protects against time passing. Revert.

**Experiment C — Restart while paused.** Start a review, restart the AI service, then decide. The answer is `review_not_found`. Takeaway: `MemorySaver` is process memory; nothing was written, so the failure is safe, and this is the case a Postgres checkpointer fixes.

## 📌 Notes

- **Paused reviews do not survive a restart.** The graph uses `MemorySaver`, like the advisor. A lost review costs one model call to redo and never leaves a half-finished write. A Postgres checkpointer needs a new dependency and tables; plan it with PF-AI012, where the service also gets more than one worker.
- **Topic 18 is not in this plan.** The decision (accept, edit, reject) is exactly the feedback event topic 18 wants. Here it is only logged. Topic 18 adds the table that keeps suggested vs kept, the React approval card and the eval export.
- **There was no way to edit a saved transaction's category before this plan.** The new `PATCH` endpoint is also the natural backend for a manual edit in the UI later; it already refuses stale writes.
- `amount_idr` reaches the categorizer as a float because the existing `categorize` signature takes one and uses it only as prompt text. It is never summed, compared or written here. The FIN-01 follow-up for chat totals is unrelated.
- The MCP server still resolves a single local owner and bypasses RLS on its direct queries. That is unchanged and remains the PF-AI010 follow-up; the read-only transaction narrows what a mistake there could do.
- Cost: one review is one categorizer run (up to three model calls). The Gemini free tier allows about twenty requests a day, so the live check uses few reviews on purpose.
- STEP 1 findings: _(fill in during execution)_

---

# 📝 Knowledge Check

1. Why are `propose` and `approval` two nodes instead of one? What exactly would go wrong, and how would you see it in Langfuse?
2. A client times out and sends the same accept twice. Walk through what each request does. How many writes happen, and how many model calls?
3. The write fails with a 500 after the user accepted. What state is the review in, and what does the next request do?
4. Between proposal and approval, the category is changed by hand. What does the user get back, and which component decides that?
5. What does `readOnlyHint` guarantee? What in this plan actually prevents a write through an MCP tool?
6. Name one action in this product where an approval step would be friction without benefit, and say why.

---

# 🧾 Owner Review Checklist

- [ ] A started review leaves the transaction untouched until I decide.
- [ ] Accept, edit and reject each do what they say; a repeat changes nothing.
- [ ] A manual change made in between is kept, and I am told about the conflict.
- [ ] Journey scores update after an accepted change.
- [ ] Removing a read-only annotation from an MCP tool breaks a test.
- [ ] I can answer the six knowledge-check questions aloud.

---

## Execution Notes

### Phase 1 — The write path

Model: **Opus 5.5** · Effort: **high**. Sensitive: a new SQL function with `SECURITY DEFINER`, grants and a write on `transactions`; a wrong grant or owner filter fails silently.
Before you start: local Supabase is running and the owner has done STEP 0.

```
/execute plans/in-progress/learning/PF-AI011-human-in-the-loop-category-approval-todo.md phase 1
```

### Phase 2 — The review graph, its endpoints, and the MCP split

Model: **Sonnet 5.5** · Effort: **high**. Multi-layer (Python plus two .NET proxy actions) with exact code in the steps and tests for every retry case.
Before you start: Phase 1 is merged locally and `PATCH /api/transactions/{id}/category` passed its STEP 4 check. STEP 11 needs the owner.

```
/execute plans/in-progress/learning/PF-AI011-human-in-the-loop-category-approval-todo.md phase 2
```

### Stop and ask if

- STEP 1 finds no existing .NET caller of a checked SQL function to mirror, or the pattern's grants cannot be applied to a function on `transactions`.
- Either pre-flight (STEP 5 or STEP 10) fails in a way the fallback in that step does not cover.
- The recalculation event cannot be published for a single-row change without altering what the import path does.
