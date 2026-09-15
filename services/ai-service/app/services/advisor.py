"""AdvisorService — wraps the compiled LangGraph for the /advisor endpoint."""
from __future__ import annotations

import logging
import uuid

from langchain_core.messages import AIMessage, HumanMessage
from langgraph.errors import GraphRecursionError
from langfuse.langchain import CallbackHandler

from app.agents.chat_model_factory import GRAPH_RECURSION_LIMIT
from app.agents.financial_advisor import advisor_graph, call_fallback
from app.models import AdvisorRequest, AdvisorResponse

logger = logging.getLogger(__name__)


class AdvisorService:
    async def ask(self, request: AdvisorRequest) -> AdvisorResponse:
        session_id = request.session_id or str(uuid.uuid4())

        # LangGraph checkpointer key — same session_id = same memory thread.
        # callbacks: routes every node's LLM/tool spans into the existing
        # Langfuse dashboard (PF-AI001) with zero new tracing code — the
        # CallbackHandler reads the default client configured in observability.py.
        config = {
            "configurable": {"thread_id": session_id},
            "callbacks": [CallbackHandler()],
            "recursion_limit": GRAPH_RECURSION_LIMIT,
        }

        initial_state = {
            "messages": [HumanMessage(content=self._build_query(request))],
            "pyramid_scores": None,
            "cashflow_summary": None,
            "spending_by_category": None,
            "investment_summary": None,
            "error": None,
            "session_id": session_id,
            "model_calls": 0,
        }

        logger.info("advisor.ask session=%s", session_id)

        # LangGraph ainvoke runs the graph to completion and returns final state.
        try:
            final_state = await advisor_graph.ainvoke(initial_state, config=config)
        except GraphRecursionError:
            logger.warning("advisor recursion limit reached")
            snapshot = await advisor_graph.aget_state(config)
            fallback = call_fallback(snapshot.values)
            # Finish the saved turn so a subsequent request can resume cleanly.
            await advisor_graph.aupdate_state(config, fallback, as_node="fallback")
            final_state = {**snapshot.values, "messages": snapshot.values.get("messages", []) + fallback["messages"]}

        # The last AIMessage IS the agent's final answer — should_continue only
        # reaches END once the latest AIMessage carries no pending tool_calls, so
        # the last AIMessage in the list is always the synthesized reply.
        messages = final_state.get("messages", [])
        last_ai = next((m for m in reversed(messages) if isinstance(m, AIMessage)), None)
        answer = self._answer_text(last_ai.content) if last_ai else "No response generated."

        # Count how many turns actually issued tool calls (steps taken = tool hops).
        steps_taken = sum(
            1 for m in messages
            if isinstance(m, AIMessage) and m.tool_calls
        )

        return AdvisorResponse(
            answer=answer,
            session_id=session_id,
            steps_taken=steps_taken,
        )

    @staticmethod
    def _answer_text(content: str | list) -> str:
        if isinstance(content, str):
            return content or "No response generated."
        parts = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict) and block.get("type") == "text" and isinstance(block.get("text"), str):
                parts.append(block["text"])
        return "\n".join(parts) or "No response generated."

    @staticmethod
    def _build_query(request: AdvisorRequest) -> str:
        """Fold an optional date range into the question text. The tools take
        no date arguments of their own (get_cashflow_summary/get_spending_by_category
        always return the current month — see advisor_tools.py), so a period the user
        asked about travels as part of the prompt instead of as structured tool input."""
        if not request.date_from and not request.date_to:
            return request.query
        return (
            f"{request.query}\n\n(Period requested: "
            f"{request.date_from or 'earliest'} to {request.date_to or 'today'})"
        )
