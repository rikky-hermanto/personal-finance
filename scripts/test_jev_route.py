"""Offline adapter behavior checks; all SDK calls are mocked."""
import json
import os
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import jev_route
sys.path.insert(0, str(jev_route.ROUTER))
from src import router


class RouterAdapterTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.log = Path(self.tmp.name) / "agent.jsonl"
        self.cfg = {"enabled": True, "mode": "shadow", "thresholds": {}, "limits": {}}
        for target, value in [("jev_route.LOG", self.log),
                              ("src.router.load_config", MagicMock(return_value=self.cfg)),
                              ("src.router.resolve_log_path", MagicMock(return_value=Path(self.tmp.name) / "runs.jsonl"))]:
            p = patch(target, value)
            p.start()
            self.addCleanup(p.stop)

    def response(self, intent="research", stop=0.1):
        return SimpleNamespace(
            model="mock-only",
            usage=SimpleNamespace(model_dump=lambda **kw: {"input_tokens": 100, "output_tokens": 10}),
            choices={"intent": SimpleNamespace(choice=intent, confidence=0.95, probabilities={intent: 1.0})},
            nouls={name: SimpleNamespace(noul=value) for name, value in
                   [("reuse_cache", 0.1), ("needs_subagent", 0.1), ("stop_retry", stop)]},
            scores={"complexity": SimpleNamespace(score=2.0)})

    def test_simple_and_bypass_do_not_call_or_log(self):
        with patch("typesafe_sdk.TypeSafeClient") as client:
            for state in [{"goal": "2+2", "skip_reason": "deterministic"},
                          {"goal": "bypass jev and review architecture"}]:
                self.assertFalse(jev_route.route(state)["jev_used"])
            client.assert_not_called()
        self.assertFalse(self.log.exists())

    def test_missing_key_falls_back_and_logs(self):
        with patch.dict(os.environ, {"TYPESAFE_API_KEY": ""}):
            out = jev_route.route({"goal": "review architecture"})
        self.assertEqual(out["reason"], "missing_api_key")
        self.assertFalse(out["jev_used"])
        self.assertEqual(json.loads(self.log.read_text())["run_id"], out["run_id"])

    def test_research_and_retry_use_upstream_mapping(self):
        with patch.dict(os.environ, {"TYPESAFE_API_KEY": "test-placeholder"}), patch("typesafe_sdk.TypeSafeClient") as client:
            for state, response, action in [
                ({"goal": "compare architecture options", "kind": "research"}, self.response(), "research_capped"),
                ({"goal": "retry failing check", "same_error_count": 2}, self.response(stop=0.9), "stop_retry")]:
                client.return_value.__enter__.return_value.system_one.return_value = response
                out = jev_route.route(state)
                self.assertEqual(out["action"], action)
                self.assertTrue(out["response_received"])
                self.assertEqual(out["usage"]["input_tokens"], 100)
                self.assertEqual(out["mode"], "shadow")
        self.assertEqual(len(self.log.read_text().splitlines()), 2)

    def test_failure_never_logs_exception_payload(self):
        with patch.dict(os.environ, {"TYPESAFE_API_KEY": "test-placeholder"}), patch("typesafe_sdk.TypeSafeClient") as client:
            client.return_value.__enter__.side_effect = TimeoutError("SECRET_SHOULD_NOT_APPEAR")
            out = jev_route.route({"goal": "review architecture"})
        self.assertFalse(out["jev_used"])
        self.assertEqual(out["error_type"], "TimeoutError")
        self.assertNotIn("SECRET_SHOULD_NOT_APPEAR", self.log.read_text())

    def test_active_mode_is_not_silently_enabled(self):
        self.cfg["mode"] = "active"
        with patch("typesafe_sdk.TypeSafeClient") as client:
            out = jev_route.route({"goal": "review architecture"})
            client.assert_not_called()
        self.assertEqual(out["reason"], "active_mode_requires_separate_review")


if __name__ == "__main__":
    unittest.main()
