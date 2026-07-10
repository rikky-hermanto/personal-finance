"""RAGAS faithfulness on /ask answers: is every claim grounded in the retrieved context?

    PYTHONPATH=. python evals/eval_faithfulness.py
Requires OPENAI_API_KEY (judge model) — a different model than the generator avoids
self-preference bias (see Chapter 2's LLM-as-judge material).
"""
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import asyncpg
from langchain_openai import ChatOpenAI
from ragas import SingleTurnSample
from ragas.llms import LangchainLLMWrapper
from ragas.metrics import Faithfulness

from app.config import settings
from app.models import AskRequest
from app.providers.embedding_factory import create_embedding_provider
from app.providers.factory import ProviderFactory
from app.services.aggregator import AggregationService
from app.services.answerer import AnswerService
from app.services.query_planner import QueryPlanner
from app.services.reranker import RerankerService
from app.services.retriever import RetrievalService

QUESTIONS_FILE = Path(__file__).parent / "ask_questions.json"


async def _load_categories(db_url: str) -> list[str]:
    conn = await asyncpg.connect(db_url)
    try:
        rows = await conn.fetch(
            "SELECT DISTINCT category FROM transactions WHERE category <> '' ORDER BY category"
        )
    finally:
        await conn.close()
    return [r["category"] for r in rows]


async def run() -> None:
    questions = json.loads(QUESTIONS_FILE.read_text(encoding="utf-8"))

    embed_provider = create_embedding_provider(settings)
    provider = ProviderFactory.create(settings)
    answerer = AnswerService(
        retriever=RetrievalService(provider=embed_provider, db_url=settings.database_url),
        reranker=RerankerService(),
        provider=provider,
        planner=QueryPlanner(provider=provider),
        aggregator=AggregationService(db_url=settings.database_url),
        categories=await _load_categories(settings.database_url),
    )

    # Pass the key explicitly from settings (loaded from .env) rather than relying
    # on it being exported to the process environment — the app reads .env via
    # pydantic-settings, but ChatOpenAI only checks os.environ by default.
    judge = LangchainLLMWrapper(
        ChatOpenAI(model="gpt-4o-mini", temperature=0.0, api_key=settings.openai_api_key)
    )
    metric = Faithfulness(llm=judge)

    scores = []
    for q in questions:
        request = AskRequest(
            query=q["query"],
            date_from=q.get("date_from"), date_to=q.get("date_to"),
        )
        response = await answerer.ask(request)

        # A correct no-data refusal makes zero factual claims, so it is vacuously
        # faithful — RAGAS Faithfulness returns 0/NaN on empty context, which would
        # unfairly sink the mean. Score it 1.0 (no unsupported claims) and flag it,
        # matching the hand-rolled eval's semantics. Q5 (the 2031 adversarial) SHOULD
        # land here; a confident number there is the regression to watch.
        if not response.confident and not response.citations:
            scores.append(1.0)
            print(f"{q['query'][:60]:<62} faithfulness=1.00  [refusal — no claims]")
            continue

        contexts = [
            f"{c.date} | {c.description} | {c.flow} | Rp {c.amount_idr:,.0f} | {c.wallet}"
            for c in response.citations
        ] or ["(no context retrieved)"]

        sample = SingleTurnSample(
            user_input=q["query"],
            response=response.answer,
            retrieved_contexts=contexts,
        )
        score = await metric.single_turn_ascore(sample)
        scores.append(score)
        print(f"{q['query'][:60]:<62} faithfulness={score:.2f}  confident={response.confident}")

    print(f"\nMean faithfulness: {sum(scores) / len(scores):.3f}   (target >= 0.80)")


if __name__ == "__main__":
    asyncio.run(run())
