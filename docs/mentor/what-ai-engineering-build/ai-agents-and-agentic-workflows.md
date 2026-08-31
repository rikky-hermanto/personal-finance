# AI Agents and Agentic Workflows

> **Topic doc, not a plan.** This compiles one line from the [AI-First skills field
> guide](https://github.com/alexeygrigorev/ai-engineering-field-guide/blob/main/role/02-skills.md)
> — *"AI agents and agentic workflows,"* the single most common thing the 4,874 AI-First job
> postings that guide surveys ask an AI Engineer to build. It covers what the term actually means,
> where it sits relative to plain LLM calls and RAG, and uses this project's own two agents —
> already shipped — as the worked example throughout. It does not assign build steps; those live in
> [PF-AI007](../../../.claude/plans/learning/PF-AI007-tool-calling-agents-smolagents-todo.md) and
> [PF-AI008](../../../.claude/plans/learning/PF-AI008-langgraph-financial-advisor.md).

---

## What it is

**An LLM call answers a question. An agent decides what to do, does it, looks at the result, and
decides again.** That loop — decide → act → observe → decide again, until the task is done — is the
entire definition. Everything else (frameworks, graphs, tool schemas) is plumbing around that loop.

Concretely, the difference already lives in this codebase as two working services that look similar
on paper — both take a financial question, both call an LLM, both return an answer — and are not
the same kind of thing at all.

| | `POST /journey/advise` | `POST /advisor` |
|---|---|---|
| Code | [journey_advisor.py](../../../services/ai-service/app/services/journey_advisor.py) | [financial_advisor.py](../../../services/ai-service/app/agents/financial_advisor.py) |
| Shape | One `provider.generate_json()` call | A `StateGraph` with `agent ⇄ tools` loop |
| Who decides what data to use | The .NET caller — it builds the full snapshot and puts it in the prompt | The LLM — it calls `get_pyramid_scores()`, `get_cashflow_summary()`, etc. only if it decides it needs them |
| Steps | Always exactly 1 LLM call | Variable — 1 to N loops through `agent → tools → agent` |
| Structured output enforced by | A JSON schema on the single call | Each tool's typed signature; final answer is free text |

`journey_advisor` is **not an agent** — it is a well-built single-shot structured-output call, and
that's the correct tool for its job (generate exactly 3 quests from data it's already been handed).
`advisor` **is** an agent — nobody tells it which of the 4 tools to call or in what order; it reads
the user's question, decides, calls one, reads the result, and decides again whether it has enough
to answer. **The test for "is this an agent" is not "does it call an LLM" — it's "does the LLM
control what happens next."**

### Why this is the highest-demand item on the list

Of the five things the field guide's AI-First postings ask for — RAG, agents, fine-tuning, model
serving, prompt engineering — "AI agents and agentic workflows" is the one where the job stopped
being *"call the model well"* and became *"give the model judgment over a sequence of actions,
safely."* That's a materially harder engineering problem: a single bad LLM call produces one wrong
answer; a bad agent step produces a wrong *action*, and every subsequent step reasons from that
wrong result. This doc is about the shape of that problem and how the two agents already in this
codebase handle it.

---

## The helicopter view

```
Plain LLM call                RAG                              Agent
───────────────               ───                              ─────
                                                          ┌─────────────────┐
prompt ──▶ LLM ──▶ answer      query ──▶ retrieve ──▶     │  ┌───────────┐  │
                                          context ──▶      │  │  decide   │◀─┼──┐
                                          LLM ──▶ answer   │  └─────┬─────┘  │  │
                                                            │        │act     │  │
                                                            │        ▼        │  │
                                                            │  ┌───────────┐  │  │
                                                            │  │   tool    │  │  │
                                                            │  └─────┬─────┘  │  │
                                                            │        │observe │  │
                                                            │        └────────┼──┘
                                                            │  loop until done │
                                                            └────────┬─────────┘
                                                                     ▼
                                                                  answer
```

RAG is a **fixed** pipeline: retrieve, then generate, always in that order, always once. An agent's
pipeline is **not fixed** — the LLM chooses which box runs next, and can revisit "decide" as many
times as the task needs. That's the entire delta, and it's why an agent can *use* RAG as one of its
tools (this project's advisor doesn't yet, but easily could — semantic transaction search is already
a working tool in the RAG chapters) without RAG ever becoming an agent on its own.

---

## Part 1 — What makes something an agent, precisely

Four ingredients, all present in both of this project's agents:

| Ingredient | In `CategorizerAgent` | In the `financial_advisor` graph |
|---|---|---|
| **Tools** — typed functions the model can call | 3: `search_category_rules`, `find_similar_transactions`, `list_all_categories` ([app/agents/tools/](../../../services/ai-service/app/agents/tools/)) | 4: `get_pyramid_scores`, `get_cashflow_summary`, `get_spending_by_category`, `get_investment_summary` ([advisor_tools.py](../../../services/ai-service/app/agents/advisor_tools.py)) |
| **A loop** — the model re-enters reasoning after seeing a tool's result | `ToolCallingAgent(max_steps=3)` — smolagents runs the ReAct loop internally | `agent → tools → agent` edges in the `StateGraph`, looping until `should_continue` returns `END` |
| **State** — what persists across loop iterations | The agent's own step memory (`self._agent.memory.steps`) — scoped to one `.categorize()` call | `AdvisorState` ([state.py](../../../services/ai-service/app/agents/state.py)) — messages, fetched data, and a `session_id` checkpointed by `MemorySaver` **across separate HTTP requests** |
| **A stopping condition** | `max_steps=3` — a hard iteration cap, not a semantic "done" signal | `should_continue`: no `tool_calls` on the last `AIMessage` → `END`; an `error` → `fallback` node |

The state row is the one worth sitting with. `CategorizerAgent`'s loop is self-contained — it starts
and ends inside one function call, so a plain list of steps is state enough. The advisor's loop
*must* survive across HTTP requests, because a user's second message ("berapa untuk bulan itu?")
needs to resolve "that month" against what was said in the first — which is exactly the bug that
motivated building it. Different state lifetime, different mechanism (in-process memory vs.
`MemorySaver` checkpointed by `thread_id`), same underlying ingredient.

### ReAct, by name

Both agents implement the same pattern under different frameworks: **ReAct** (Reason + Act) — think
about what to do, take one action, observe the result, think again. It is the load-bearing idea
behind nearly every agent framework (smolagents, LangGraph, CrewAI, OpenAI's Assistants/Responses
tool loop) even when the framework hides the loop behind a `.run()` call. Knowing the name matters
because it's the term interviewers reach for; knowing the mechanism matters more, because it's what
you're actually debugging when a trace shows the agent calling the wrong tool.

---

## Part 2 — Two different agent shapes, and when each is the right call

The two agents in this project aren't just built with different libraries — they're solving
structurally different problems, and the framework choice follows the shape of the problem rather
than the other way around.

**Bounded, tool-selection agent — smolagents' `ToolCallingAgent`.** The categorizer's job is
"pick the right tool out of 3, in roughly the right order, and stop." It doesn't need branching
logic, it doesn't need to survive across requests, and it doesn't need conditional routing — it
needs a tight loop with a hard step cap. smolagents gives you exactly that with almost no
boilerplate: `ToolCallingAgent(tools=[...], model=..., max_steps=3)`. Reach for this shape when the
task is "call 1–3 tools in a sensible order and produce one structured answer" — classification,
enrichment, single-turn lookups.

**Stateful, multi-turn, conditionally-routed agent — LangGraph's `StateGraph`.** The advisor's job
is different in kind: it needs to remember the last few turns of a conversation, route differently
depending on whether a call failed (`fallback`) or succeeded, and expose that routing as something
you can read off a diagram. A graph — nodes, typed state, explicit edges — is the right abstraction
once you have more than one path through the logic or need durable state across calls. It costs
more to set up (a `TypedDict` state, node functions, a checkpointer) but that cost buys you an
explicit, inspectable control-flow graph instead of a loop that just runs.

**The general rule, not specific to these two libraries:** the more your agent's control flow
branches or needs to survive across turns, the more a graph-based framework earns its overhead;
the more it's "call a handful of tools once and answer," the more a lightweight tool-calling loop
is the entire right answer and a graph is over-engineering.

---

## Part 3 — What actually goes wrong (and did, in this project)

An agent fails differently from a plain LLM call, because a wrong step compounds instead of just
being one wrong answer. Three real failures from this codebase, each a named failure mode:

**1. Output-format drift under autonomy.** `CategorizerAgent`'s system prompt demands the literal
line `CATEGORY: <name>`. Live smoke-testing found 3 of 5 real transactions came back as prose
instead — *"...should be categorized as **Bill**...."* — with no `CATEGORY:` token anywhere. A
single-shot structured-output call (like `journey_advisor`'s `generate_json`) can't have this bug at
all, because the schema is enforced server-side. A free-form agent answer has no such guarantee, so
[`_scan_prose_for_category`](../../../services/ai-service/app/agents/categorizer_agent.py#L85)
exists as a vocabulary-checked prose fallback — this is the general lesson: **the more autonomy you
give the output, the more you need a parser that survives the model not following the format.**
Prefer structured output enforced by the framework wherever the task allows it (this is *why* the
tool functions themselves are typed and schema-validated even though the final answer isn't).

**2. Conversation state that doesn't exist yet.** Before Chapter 8, this project's RAG chat
(`/ask`) answered "how much did I spend in March?" correctly, then a same-session follow-up using
"that month" instead of a month name silently summed *all-time* data — because the query planner is
stateless per call, with nothing for the pronoun to resolve against. That live bug is the concrete
reason `AdvisorState` exists and is checkpointed by `session_id`/`thread_id` rather than being
per-request. **The general lesson: an agent that spans multiple user turns needs explicit,
persisted state, or pronoun/reference resolution silently breaks in a way that looks like a correct
answer.**

**3. A namespace collision only agent code creates.** Chapter 8's plan called for a module named
`app/agents/tools.py` — but `app/agents/tools/` already existed as a *package* (Chapter 7's
`search_category_rules` et al.). Python resolves the package first and would have silently shadowed
the new module with no import error. Renamed to
[`advisor_tools.py`](../../../services/ai-service/app/agents/advisor_tools.py) instead. Not an
agent-specific bug in principle, but a class of collision you only meet once a project has *more
than one* agent's worth of tools living side by side — worth flagging because "agents" plural is
where most real codebases end up.

**4. `max_steps` is a safety valve, not a semantic decision.** `CategorizerAgent` caps at 3 steps
because its own strategy needs exactly rules → history → vocabulary. That number is a design
decision tied to the task, not a magic constant — a step cap set too low silently truncates a
legitimate multi-tool investigation; set too high (or absent) risks the model looping indefinitely
on ambiguous input, burning tokens and latency with nothing to show for it. Always size the cap to
the *actual* number of tool calls the task's own strategy requires, and log the real count
(`tool_calls_count`, taken from the agent's own memory, not hardcoded) so a production trace can
tell you when something is looping near its ceiling.

---

## Part 4 — Observability, and why it's not optional for agents

A single LLM call has one input and one output to log. An agent has a *tree* of them — every
reasoning step, every tool call, every intermediate result — and if you can't see the tree, you
can't debug a wrong final answer back to which step caused it.

Both agents in this project trace every step, but through different mechanisms, and the difference
is itself worth knowing:

- **LangGraph** has first-class OpenTelemetry / Langfuse integration — the graph structure maps
  naturally onto trace spans (one span per node execution).
- **smolagents 1.26** has *no* built-in `instrument_smolagents()` OTel hook (confirmed absent by
  hand during Chapter 7's build). So `CategorizerAgent` wires Langfuse manually — one parent `agent`
  span wrapping `self._agent.run()`, with each tool function pushing its own child `tool` span
  inside `app/agents/tools/*.py`. Same visibility, more code, because the framework didn't hand it
  to you.

**The general rule:** before adopting an agent framework, check what tracing it gives you for free
— it changes your build estimate more than the tool-calling API does.

---

## Where this shows up in this project

| Agent | Framework | Status | Location |
|---|---|---|---|
| `CategorizerAgent` — picks a transaction's category via 3 tools | smolagents `ToolCallingAgent` | Code shipped, `/categorize-agent` live; the 5-transaction smoke test (STEP 7) is the still-open gate on formally closing the chapter — see `docs/mentor/progress.md` | [categorizer_agent.py](../../../services/ai-service/app/agents/categorizer_agent.py) |
| Financial Health Advisor — answers financial questions via 4 tools + conversation memory | LangGraph `StateGraph` | Code + unit tests shipped; live end-to-end verification blocked on provider access at last log | [financial_advisor.py](../../../services/ai-service/app/agents/financial_advisor.py) |
| `journey_advisor` — generates 3 quests (contrast case, **not** an agent) | Single `generate_json()` call | Live | [journey_advisor.py](../../../services/ai-service/app/services/journey_advisor.py) |

**Natural next targets for this pattern**, not yet built: an agent that decides *whether* a bank
statement needs OCR/vision extraction vs. direct-CSV parsing before routing it (today that routing
is deterministic code, per [THINK-01](../../../.claude/rules/governance.md) — deliberately, since
CSV parsing is fully deterministic and an agent would only add cost and non-determinism to a
decision that doesn't need judgment); a portfolio-review agent that pulls live IDX/crypto prices via
a tool before writing its narrative, instead of `portfolio_reviewer.py`'s current single-call
approach.

---

## What you should be able to say in an interview

> *"An agent is an LLM given control over what happens next, not just what to say — it decides which
> tool to call, looks at the result, and decides again, until it's done. We have two shipped: a
> bounded tool-calling agent (smolagents) that picks a transaction category from 3 tools in at most
> 3 steps, and a stateful LangGraph agent that answers financial questions using 4 tools and
> persists conversation state across turns via a checkpointer — built specifically because our
> RAG chat broke on a pronoun reference ('that month') with no state to resolve it against.*
>
> *The framework choice followed the problem shape: a tight bounded loop got the lightweight
> tool-calling agent; multi-turn state and conditional routing (success vs. fallback) got the graph.
> The real engineering cost isn't the tool-calling API, which frameworks give you for free — it's
> observability (LangGraph traces for free, smolagents needed manual Langfuse spans per tool call)
> and output robustness, because an autonomous agent's final answer isn't schema-enforced the way a
> single structured-output call is, so we ship a vocabulary-checked fallback parser for when the
> model narrates instead of emitting the exact format we asked for."*

Two follow-ups worth having an answer ready for:

- *"When would you NOT use an agent?"* → When the decision the agent would be making is already
  deterministic — this project routes bank-format detection with plain code (THINK-01) precisely
  because CSV vs. PDF vs. screenshot is a fact about the file, not a judgment call; an agent there
  would add cost and non-determinism for zero benefit.
- *"How do you keep an agent from running away — cost, loops, wrong actions?"* → A hard step cap
  sized to the task's actual strategy (not a guess), a stopping condition that's checked every
  iteration (`should_continue`), a `fallback` path for tool/provider errors so a failure ends the
  graph instead of looping on it, and per-step tracing so a runaway trace is visible before it's a
  cost incident.

---

## Common mistakes

1. **Calling a single structured-output LLM call an "agent" in a design doc or interview answer.**
   It isn't, until the model itself is choosing what happens next — see `journey_advisor` vs.
   `advisor` above.
2. **No step cap, or a step cap chosen by guessing.** Size it to what the task's own strategy
   actually requires (3 tools → cap 3), and log the real count used, not a hardcoded value.
3. **Assuming the final answer is schema-safe just because the tools are typed.** Tool arguments and
   returns can be schema-validated; a free-text final answer from a `ToolCallingAgent` is not,
   unless you add the parsing safety net yourself.
4. **Per-request state for something that needs to remember the last turn.** If the agent will ever
   be asked a follow-up question, plan the checkpointer/session model from the start — retrofitting
   it after a live bug (as this project did) is the expensive way to learn it.
5. **Reaching for a graph framework for a 1–3 tool bounded task**, or reaching for a bare
   tool-calling loop for something that genuinely branches and spans turns. Match the framework
   weight to the control-flow shape, not to which one is more popular this month.
6. **Naming a new agent module in a way that collides with an existing package** — Python resolves
   packages before same-named sibling modules with no error, so the collision is silent. Check
   `app/agents/` (or wherever your project's agents live) for existing names before adding one.

---

## Resources

- Anthropic — Building effective agents → https://www.anthropic.com/research/building-effective-agents — the source for "workflows vs. agents" as a spectrum, and when NOT to reach for autonomy
- ReAct paper (Yao et al.) → https://arxiv.org/abs/2210.03629 — the reasoning+acting loop both frameworks in this project implement under the hood
- smolagents docs → https://huggingface.co/docs/smolagents/index — `ToolCallingAgent`, `max_steps`, the `instructions` kwarg this project's Chapter 7 had to verify by hand
- LangGraph docs → https://langchain-ai.github.io/langgraph/ — `StateGraph`, conditional edges, checkpointers (`MemorySaver` and persistent alternatives)
- LangGraph — Persistence / checkpointing → https://langchain-ai.github.io/langgraph/concepts/persistence/ — the mechanism behind `AdvisorState` surviving across HTTP requests

**Project-local**
- [PF-AI007-tool-calling-agents-smolagents-todo.md](../../../.claude/plans/learning/PF-AI007-tool-calling-agents-smolagents-todo.md) — the full build plan, including the ReAct walkthrough table with a data-source column per tool
- [PF-AI008-langgraph-financial-advisor.md](../../../.claude/plans/learning/PF-AI008-langgraph-financial-advisor.md) — the full build plan, including the "bulan itu" motivating bug
- [app/agents/](../../../services/ai-service/app/agents/) — both agents' real code

---

## Self-check

1. `journey_advisor.py` calls an LLM and returns structured JSON. Why isn't it an agent?
2. `CategorizerAgent` caps at `max_steps=3`. What would happen to a legitimate answer if that were
   set to 1? What would happen to cost/latency if it were removed entirely?
3. Why does the financial advisor need a checkpointer keyed by `session_id`, but the categorizer
   doesn't need anything like it?
4. Name the failure that happens when an agent's final answer isn't schema-enforced, and the fix
   this project shipped for it.
5. Why did smolagents need manual Langfuse spans per tool call, while LangGraph didn't?
6. Give one example, from this project, of a decision that is deliberately *not* handled by an
   agent — and explain why an agent would be the wrong choice there.
