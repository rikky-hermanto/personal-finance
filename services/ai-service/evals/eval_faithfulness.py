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

from langchain_openai import ChatOpenAI
from ragas import SingleTurnSample
from ragas.llms import LangchainLLMWrapper
from ragas.metrics import Faithfulness

from app.config import settings
from app.models import AskRequest
from app.providers.embedding_factory import create_embedding_provider
from app.providers.factory import ProviderFactory
from app.services.answerer import AnswerService
from app.services.reranker import RerankerService
from app.services.retriever import RetrievalService

QUESTIONS_FILE = Path(__file__).parent / "ask_questions.json"


async def run() -> None:
    questions = json.loads(QUESTIONS_FILE.read_text(encoding="utf-8"))

    embed_provider = create_embedding_provider(settings)
    retriever = RetrievalService(provider=embed_provider, db_url=settings.database_url)
    reranker = RerankerService()
    answerer = AnswerService(retriever, reranker, ProviderFactory.create(settings))

    judge = LangchainLLMWrapper(ChatOpenAI(model="gpt-4o-mini", temperature=0.0))
    metric = Faithfulness(llm=judge)

    scores = []
    for q in questions:
        request = AskRequest(
            query=q["query"],
            date_from=q.get("date_from"), date_to=q.get("date_to"),
        )
        response = await answerer.ask(request)
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
