"""Opt-in live /advisor request and server-side Langfuse trace verification.

python scripts/verify_advisor_langfuse.py --live-gemini
Uses in-process HTTP and synthetic financial fixtures, real Gemini and Langfuse.
"""
import argparse
import asyncio
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from time import perf_counter
from unittest.mock import patch

import httpx


async def main():
    from app.config import settings
    if settings.ai_provider != "gemini" or not settings.gemini_api_key.strip():
        raise SystemExit("Configured Gemini required; no provider switch")
    from app.main import app
    from app.observability import langfuse
    from app.agents import advisor_tools, chat_model_factory as factory
    from app.services import advisor

    logging.getLogger("httpx").setLevel(logging.WARNING)
    root = Path(__file__).resolve().parents[3]
    evidence_dir = root / ".claude/plans/learning/evidence"
    fixtures = json.loads((evidence_dir / "PF-AI008-gemini-smoke.json").read_text(encoding="utf-8"))["fixtures"]
    report = {"started_utc": datetime.now(timezone.utc).isoformat(), "provider": settings.ai_provider,
              "model": settings.ai_model, "rpc_attempts": 0, "tool_http_paths": [],
              "scope": "real POST /advisor via ASGI, synthetic tool HTTP, real Gemini and Langfuse",
              "limits": {"requests": 1, "model_calls": 4, "output_tokens": 2048, "timeout_seconds": 30, "retries": 0}}
    output = evidence_dir / "PF-AI008-langfuse-live.json"
    def save():
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    auth = httpx.BasicAuth(settings.langfuse_public_key, settings.langfuse_secret_key)
    async with httpx.AsyncClient(base_url=settings.langfuse_host.rstrip("/"), auth=auth, timeout=15) as remote:
        projects = await remote.get("/api/public/projects")
        report["auth_status"] = projects.status_code
        if projects.status_code != 200:
            save()
            raise SystemExit("Langfuse authentication failed; no model call made")

        def fixture_http(request):
            report["tool_http_paths"].append(request.url.path)
            return httpx.Response(200, json=fixtures[request.url.path])

        handlers = []
        original_handler = advisor.CallbackHandler
        def capture_real_handler(*args, **kwargs):
            handler = original_handler(*args, **kwargs)
            handlers.append(handler)
            return handler

        original_rpc = factory._google_async_call
        async def counted_rpc(method, **kwargs):
            if report["rpc_attempts"] >= 4:
                raise RuntimeError("Probe call ceiling reached")
            report["rpc_attempts"] += 1
            try:
                return await original_rpc(method, **kwargs)
            except Exception as exc:
                report["provider_error_type"] = type(exc).__name__
                raise

        async with httpx.AsyncClient(transport=httpx.MockTransport(fixture_http), base_url="http://synthetic") as data:
            with patch.object(advisor_tools, "_CLIENT", data), patch.object(advisor, "CallbackHandler", capture_real_handler), patch.object(factory, "_google_async_call", counted_rpc):
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as api:
                    started = perf_counter()
                    response = await api.post("/advisor", json={"query": "Ambil skor piramida keuangan saya, lalu ringkas level dan prioritasnya dalam maksimal 60 kata."})
                    report["elapsed_seconds"] = round(perf_counter() - started, 3)
                    report["http_status"] = response.status_code
                    report["response"] = response.json()
        report["trace_id"] = handlers[0].last_trace_id if handlers else None
        report["trace_url"] = langfuse.get_trace_url(trace_id=report["trace_id"]) if report["trace_id"] else None
        await asyncio.to_thread(langfuse.flush)
        save()
        if not report["trace_id"]:
            raise SystemExit("No trace ID created")

        for attempt in range(8):
            result = await remote.get(f"/api/public/traces/{report['trace_id']}")
            report["trace_fetch_status"] = result.status_code
            if result.status_code == 200:
                trace = result.json()
                observations = trace.get("observations", [])
                report["observations"] = [{k: o.get(k) for k in (
                    "id", "parentObservationId", "name", "type", "startTime", "endTime",
                    "latency", "model", "usage", "usageDetails", "level", "statusMessage"
                )} for o in observations]
                generation_count = sum(o.get("type") == "GENERATION" for o in observations)
                root_completed = any(o.get("name") == "POST /advisor" and o.get("endTime") for o in observations)
                if root_completed and generation_count == report["rpc_attempts"] and all(o.get("endTime") for o in observations):
                    break
            await asyncio.sleep(3)
        observations = report.get("observations", [])
        names = {o["name"] for o in observations}
        generations = [o for o in observations if o["type"] == "GENERATION"]
        report["checks"] = {
            "trace_persisted": report["trace_fetch_status"] == 200,
            "agent_and_tools_steps": {"agent", "tools", "get_pyramid_scores"}.issubset(names),
            "generation_tokens_present": bool(generations) and all(o.get("usage") or o.get("usageDetails") for o in generations),
            "node_timing_present": bool(observations) and all(o.get("startTime") and o.get("endTime") for o in observations),
            "real_gemini_model_recorded": bool(generations) and all(o.get("model") and "gemini" in o["model"] for o in generations),
            "all_generation_calls_persisted": len(generations) == report["rpc_attempts"],
            "root_span_completed": any(o["name"] == "POST /advisor" and o.get("endTime") for o in observations),
        }
        save()
        print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)
    await asyncio.to_thread(langfuse.shutdown)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live-gemini", action="store_true", required=True)
    parser.parse_args()
    asyncio.run(main())
