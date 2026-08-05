"""Tool: find semantically similar past transactions via the in-process RetrievalService."""
from __future__ import annotations

import asyncio
import logging

from smolagents import tool

from app.observability import langfuse

logger = logging.getLogger(__name__)

# Set at startup from app.state.retriever — the SAME instance the /search and
# /ask endpoints use. No self-HTTP: calling our own port from inside our own
# process doubles serialization and couples the tool to its own liveness.
_RETRIEVER = None


def configure(retriever) -> None:
    global _RETRIEVER
    _RETRIEVER = retriever


@tool
def find_similar_transactions(description: str) -> str:
    """Find semantically similar past transactions and their historical categories.

    Searches the pgvector embedding index built in Chapter 3 (PF-AI003). Use this
    tool when rule matching returns 'No rules matched.' or when the matched category
    is ambiguous. Returns the 3 most similar past transactions with their categories.

    Args:
        description: The transaction description to search for similarities.
    """
    with langfuse.start_as_current_observation(
        name="find_similar_transactions", as_type="tool", input={"description": description}
    ) as obs:
        if _RETRIEVER is None:
            result = "Similarity search unavailable."
            obs.update(output=result)
            return result
        try:
            results = asyncio.run(_RETRIEVER.search(query=description, top_k=3))
        except Exception:
            # A tool must NEVER raise into the agent loop — one flaky DB call would
            # abort the whole run. Degrade to a string the LLM can reason about:
            # it still has rule evidence and can answer with lower confidence.
            logger.exception("similarity tool failed description=%r", description)
            result = "Similarity search unavailable."
            obs.update(output=result, level="ERROR")
            return result

        if not results:
            result = "No similar past transactions found."
        else:
            lines = [
                f"  [{i+1}] '{r.description}' — {r.category or 'uncategorized'} "
                f"(similarity={r.similarity:.2f})"
                for i, r in enumerate(results)
            ]
            result = "Similar past transactions:\n" + "\n".join(lines)
        obs.update(output=result)
        return result
