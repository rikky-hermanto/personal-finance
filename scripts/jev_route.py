"""Project adapter for the separately installed upstream Jev router.

Reads sanitized state from stdin. Never pass financial records or secrets.
No actions are executed; shadow mode is enforced until separately reviewed.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys
import time
import uuid
from datetime import datetime, timezone
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "tools" / "jev-router"
LOG = ROUTER / "logs" / "agent-runs.jsonl"


def log_record(record: dict) -> None:
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("a", encoding="utf-8") as stream:
        stream.write(json.dumps({"ts": datetime.now(timezone.utc).isoformat(), **record}) + "\n")


def route(state: dict) -> dict:
    # Check bypass before imports, credentials or logging. Simple tasks normally
    # never invoke this script; skip_reason supports explicit offline verification.
    raw = " ".join(str(state.get(k, "")) for k in ("goal", "raw", "user_message", "notes")).lower()
    if any(marker in raw for marker in ("bypass jev", "no jev")) or state.get("skip_reason"):
        return {"action": "proceed_full", "mode": "shadow", "jev_used": False,
                "reason": "agent_skip_or_user_bypass"}

    started = time.perf_counter()
    run_id = str(uuid.uuid4())
    evidence = {}
    out = {"action": "proceed_full", "mode": "shadow", "jev_used": False, "details": {}}
    try:
        sys.path.insert(0, str(ROUTER))
        from src import router
        cfg = router.load_config()
        if cfg.get("mode") != "shadow":
            out["reason"] = "active_mode_requires_separate_review"
        elif not cfg.get("enabled", True):
            out["reason"] = "disabled"
        elif not os.environ.get("TYPESAFE_API_KEY", "").strip():
            out["reason"] = "missing_api_key"
        else:
            from typesafe_sdk import RetryPolicy, TypeSafeClient

            def measured_call(state, questions, model):
                with TypeSafeClient(model=model, timeout=10.0,
                                    retry=RetryPolicy(max_retries=0)) as client:
                    response = client.system_one(state=state, questions=questions)
                evidence["response_received"] = True
                evidence["model"] = response.model
                evidence["usage"] = response.usage.model_dump(mode="json")
                return response

            # Keep the upstream normalization, questions, action mapping and log.
            # Only its SDK transport is bounded and instrumented here.
            with patch("src.jev_client.system_one", side_effect=measured_call):
                out = router.route_task(state)
    except (Exception, SystemExit) as exc:
        # Exception text may contain a request or credentials: log the type only.
        out["reason"] = "router_error"
        evidence["error_type"] = type(exc).__name__

    record = {"event": "agent_route", "run_id": run_id, **out, **evidence,
              "latency_ms": round((time.perf_counter() - started) * 1000, 2),
              "outcome": "pending_agent_action"}
    log_record(record)
    return record


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--outcome", metavar="RUN_ID", help="Append actual action and outcome from stdin")
    args = parser.parse_args()
    try:
        state = json.load(sys.stdin)
        if not isinstance(state, dict):
            raise ValueError("expected object")
        if args.outcome:
            record = {"event": "agent_outcome", "run_id": args.outcome,
                      "actual_action": state["actual_action"], "outcome": state["outcome"]}
            log_record(record)
            print(json.dumps(record))
        else:
            print(json.dumps(route(state), indent=2))
        return 0
    except (ValueError, KeyError):
        print("Invalid JSON state/outcome; no input echoed.", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
