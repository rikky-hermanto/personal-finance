"""Opt-in two-turn live Gemini probe with synthetic HTTP data and local evidence.

Run from the service directory: python scripts/smoke_advisor_gemini.py --live-gemini
No pytest collection, paid judge, provider fallback, or automatic rerun.
"""
import argparse
import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from time import perf_counter
from unittest.mock import patch

import httpx


async def main():
    from app.config import settings
    if settings.ai_provider != "gemini" or not settings.gemini_api_key.strip():
        raise SystemExit("Probe requires configured Gemini and its key; no provider switch.")

    # Synthetic-only local trace; dashboard export is a separate acceptance gate.
    os.environ["LANGFUSE_TRACING_ENABLED"] = "false"
    os.environ["LANGSMITH_TRACING"] = "false"
    from langchain_core.callbacks import BaseCallbackHandler
    from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
    from app.agents import advisor_tools, chat_model_factory as factory
    from app.agents.financial_advisor import build_graph
    from app.models import AdvisorRequest
    from app.services import advisor

    logging.getLogger("httpx").setLevel(logging.WARNING)
    report = {
        "started_utc": datetime.now(timezone.utc).isoformat(),
        "provider": settings.ai_provider, "model": settings.ai_model,
        "data": "synthetic HTTP fixtures; real model, service and compiled graph",
        "quota_preflight": "Account remaining quota/tier unavailable through model metadata; stop on first provider failure.",
        "limits": {"turns": 2, "model_calls_per_turn": 4, "output_tokens": 2048,
                   "timeout_seconds": 30, "retries": 0, "total_rpc_ceiling": 8},
        "rpc_attempts": 0, "turns": [], "langfuse_dashboard": "not tested; local trace only",
    }
    output = Path(__file__).resolve().parents[3] / "plans/resources/learning/evidence/PF-AI008-gemini-smoke.json"
    output.parent.mkdir(parents=True, exist_ok=True)

    def save():
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    # Read-only discovery; no generation or automatic model substitution.
    model_path = settings.ai_model.removeprefix("models/")
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model_path}",
            headers={"x-goog-api-key": settings.gemini_api_key},
        )
        report["model_metadata_http_status"] = response.status_code
        if response.status_code != 200:
            report["outcome"] = "stopped: model metadata unavailable"
            save()
            print(json.dumps(report, ensure_ascii=False))
            return
        metadata = response.json()
        report["supports_generate_content"] = "generateContent" in metadata.get("supportedGenerationMethods", [])
        if not report["supports_generate_content"]:
            report["outcome"] = "stopped: configured model lacks generateContent"
            save()
            return

    fixtures = {
        "/api/journey/state": {"currentLevel": 2, "levelScores": {"L1": 90, "L2": 45, "L3": 20}},
        "/api/transactions/aggregated": {
            "summary": {"totalIncome": 12000000, "totalExpenses": 9000000},
            "currentMonth": {"month": "2026-09", "net": 3000000},
            "topCategories": [{"category": "Food & Dining", "amount": 3500000},
                              {"category": "Housing", "amount": 3000000}],
        },
        "/api/networth/current": {"netWorthIdr": 25000000},
        "/api/networth/allocation": {"Savings": 15000000, "Investment": 10000000},
    }
    report["fixtures"] = fixtures
    current = {}

    def synthetic_http(request):
        current["http_paths"].append(request.url.path)
        return httpx.Response(200, json=fixtures[request.url.path])

    class Recorder(BaseCallbackHandler):
        def on_llm_end(self, response, **kwargs):
            for batch in response.generations:
                for generation in batch:
                    message = generation.message
                    current["model_outputs"].append({
                        "content": message.content, "tool_calls": message.tool_calls,
                        "usage": message.usage_metadata,
                        "response_metadata": message.response_metadata,
                    })

    original_rpc = factory._google_async_call

    async def counted_rpc(method, **kwargs):
        if report["rpc_attempts"] >= 8:
            raise RuntimeError("Probe call ceiling reached")
        report["rpc_attempts"] += 1
        current["rpc_attempts"] += 1
        try:
            return await original_rpc(method, **kwargs)
        except Exception as exc:
            current["error_type"] = type(exc).__name__
            raise

    graph = build_graph()
    session_id = None
    queries = [
        "Kondisi keuangan saya sekarang bagaimana? Apa yang harus saya prioritaskan? Jawab ringkas dalam maksimal 150 kata.",
        "Apa yang harus saya lakukan dulu untuk mencapai L3 dari kondisi tadi? Sebutkan surplus bulanan yang tadi dan tindakan konkretnya. Jawab maksimal 150 kata.",
    ]
    async with httpx.AsyncClient(transport=httpx.MockTransport(synthetic_http), base_url="http://synthetic") as client:
        with patch.object(advisor_tools, "_CLIENT", client), patch.object(advisor, "advisor_graph", graph), patch.object(
            advisor, "CallbackHandler", Recorder
        ), patch.object(factory, "_google_async_call", counted_rpc):
            for index, query in enumerate(queries, 1):
                current = {"turn": index, "query": query, "rpc_attempts": 0,
                           "http_paths": [], "model_outputs": []}
                report["turns"].append(current)
                started = perf_counter()
                result = await advisor.AdvisorService().ask(AdvisorRequest(query=query, session_id=session_id))
                current["elapsed_seconds"] = round(perf_counter() - started, 3)
                current["response"] = result.model_dump()
                session_id = result.session_id
                state = (await graph.aget_state({"configurable": {"thread_id": session_id}})).values
                current["saved_human_messages"] = [m.content for m in state["messages"] if isinstance(m, HumanMessage)]
                current["saved_tool_results"] = [m.content for m in state["messages"] if isinstance(m, ToolMessage)]
                current["answer_matches_final_model_output"] = bool(current["model_outputs"]) and result.answer == advisor.AdvisorService._answer_text(current["model_outputs"][-1]["content"])
                current["model_calls_state"] = state["model_calls"]
                save()
                print(json.dumps(current, ensure_ascii=False), flush=True)
                if "error_type" in current or result.answer.startswith("Maaf") or result.answer == "No response generated.":
                    report["outcome"] = "stopped after unsuccessful turn; no retries"
                    break
            else:
                report["outcome"] = "two turns completed; inspect answers and trace before acceptance"
    save()
    print(f"Evidence: {output}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live-gemini", action="store_true", required=True)
    parser.parse_args()
    asyncio.run(main())
