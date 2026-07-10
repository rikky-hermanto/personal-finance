"""Hand-rolled faithfulness eval — no ragas, no langchain.

Uses the existing LlmProvider (Gemini/Anthropic) as a two-step judge:
  1. Claim decomposition: break the answer into atomic factual claims
  2. Claim verification: is each claim supported by the retrieved context?

Faithfulness = supported_claims / total_claims

    PYTHONPATH=. python evals/eval_faithfulness_handrolled.py

Caveat: uses the same provider as the generator (potential self-preference bias).
RAGAS uses gpt-4o-mini as an independent judge — that path requires MSVC/langchain.
This version is a practical proxy that captures the same signal without native-compile deps.
"""

import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import asyncpg

from app.config import settings
from app.models import AskRequest
from app.providers.embedding_factory import create_embedding_provider
from app.providers.factory import ProviderFactory
from app.services.aggregator import AggregationService
from app.services.answerer import AnswerService
from app.services.query_planner import QueryPlanner
from app.services.reranker import RerankerService
from app.services.retriever import RetrievalService


async def _load_categories(db_url: str) -> list[str]:
    conn = await asyncpg.connect(db_url)
    try:
        rows = await conn.fetch(
            "SELECT DISTINCT category FROM transactions WHERE category <> '' ORDER BY category"
        )
    finally:
        await conn.close()
    return [r["category"] for r in rows]

QUESTIONS_FILE = Path(__file__).parent / "ask_questions.json"

DECOMPOSE_SYSTEM = (
    "You are an NLP expert. Break the answer into the smallest atomic, self-contained "
    "factual claims. Each claim must be independently verifiable from source data. "
    'Ignore meta-statements like "I don\'t have data" or "based on the records" — '
    "extract only concrete assertions (amounts, dates, merchants, counts). "
    "Return JSON."
)
DECOMPOSE_SCHEMA = {
    "type": "object",
    "properties": {"claims": {"type": "array", "items": {"type": "string"}}},
    "required": ["claims"],
}

VERIFY_SYSTEM = (
    "You are a strict fact-checker. Given retrieved transaction records as context and "
    "a single claim, decide if the claim is FULLY supported by those records. "
    "If the claim asserts an amount, date, merchant, count, or category that is not "
    "explicitly present in the context, return supported=false. "
    "Do not infer or estimate — only mark supported=true if the context directly confirms it. "
    "Return JSON."
)
VERIFY_SCHEMA = {
    "type": "object",
    "properties": {
        "supported": {"type": "boolean"},
        "reason": {"type": "string"},
    },
    "required": ["supported", "reason"],
}


async def score_one(answerer: AnswerService, provider, question: dict) -> float:
    request = AskRequest(
        query=question["query"],
        date_from=question.get("date_from"),
        date_to=question.get("date_to"),
    )
    response = await answerer.ask(request)

    print(f"  Answer: {response.answer[:120]}")
    print(f"  Citations: {len(response.citations)} | Confident: {response.confident}")

    # Correct refusal (no data, confident=False) is not a hallucination — score 1.0.
    if not response.confident and not response.citations:
        print("  → no-data refusal → faithfulness=1.00 (no false claims made)")
        return 1.0

    context_str = "\n".join(
        f"[{i+1}] id={c.transaction_id} | {c.date} | {c.description} | "
        f"{c.flow} | Rp {c.amount_idr:,.0f} | {c.wallet}"
        for i, c in enumerate(response.citations)
    ) or "(no context retrieved)"

    # Step 1: decompose into atomic claims.
    decompose_result = await provider.generate_json(
        DECOMPOSE_SYSTEM,
        f"Answer: {response.answer}",
        DECOMPOSE_SCHEMA,
    )
    claims: list[str] = decompose_result.get("claims", [])

    if not claims:
        print("  → no claims extracted → faithfulness=1.00 (nothing to falsify)")
        return 1.0

    print(f"  Claims ({len(claims)}):")

    # Step 2: verify each claim against the retrieved context.
    supported_count = 0
    for claim in claims:
        verify_result = await provider.generate_json(
            VERIFY_SYSTEM,
            f"Context:\n{context_str}\n\nClaim: {claim}",
            VERIFY_SCHEMA,
        )
        supported = verify_result.get("supported", False)
        reason = verify_result.get("reason", "")
        if supported:
            supported_count += 1
        icon = "✅" if supported else "❌"
        print(f"    {icon} {claim[:80]}")
        print(f"       reason: {reason[:80]}")

    score = supported_count / len(claims)
    return score


async def run() -> None:
    questions = json.loads(QUESTIONS_FILE.read_text(encoding="utf-8"))

    embed_provider = create_embedding_provider(settings)
    retriever = RetrievalService(provider=embed_provider, db_url=settings.database_url)
    reranker = RerankerService()
    llm_provider = ProviderFactory.create(settings)
    answerer = AnswerService(
        retriever, reranker, llm_provider,
        planner=QueryPlanner(provider=llm_provider),
        aggregator=AggregationService(db_url=settings.database_url),
        categories=await _load_categories(settings.database_url),
    )

    print(f"Provider : {settings.ai_provider} | Model: {settings.ai_model}")
    print(f"Judge    : same provider (self-preference caveat — see module docstring)")
    print(f"Questions: {len(questions)}")
    print("=" * 70)

    scores = []
    for i, q in enumerate(questions, 1):
        print(f"\n[{i}/{len(questions)}] Q: {q['query']}")
        score = await score_one(answerer, llm_provider, q)
        scores.append(score)
        print(f"  faithfulness = {score:.2f}")

    mean = sum(scores) / len(scores) if scores else 0.0
    print(f"\n{'=' * 70}")
    print(f"Per-question scores : {[f'{s:.2f}' for s in scores]}")
    print(f"Mean faithfulness   : {mean:.3f}   (target >= 0.80)")
    print()
    print("Note: same-provider judge inflates scores vs an independent judge.")
    print("RAGAS-comparable baseline would require: pip install ragas langchain-openai")
    print("(blocked on Windows without MSVC Build Tools — tracked in ai-observability-metrics.md)")


if __name__ == "__main__":
    asyncio.run(run())
