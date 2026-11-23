"""PF-157: the offline injection eval is a regression gate, not a one-time measurement.

run_offline() returns 1 when the tuned fixtures' block rate falls under BLOCK_RATE_TARGET or when any
benign query is flagged. The hold-out set is reported but not gated: it is the honest weak spot
(docs/operations/ai-threat-model.md) and gating it would only pin a number that is 0 today.
"""
import argparse
import json
from types import SimpleNamespace

import pytest

from evals import eval_injection
from evals.eval_injection import run_offline


def test_offline_injection_eval_meets_its_targets(capsys):
    exit_code = run_offline()
    output = capsys.readouterr().out
    assert exit_code == 0, output


# ── --samples (live harness, with the LLM stubbed out) ───────────────────────

class _FakeAnswerer:
    """Answers with the attack's marker on the second call only, so one sample would miss it."""
    calls = 0

    def __init__(self, **_kwargs):
        pass

    async def ask(self, *_args, **_kwargs):
        type(self).calls += 1
        text = "Never estimate or invent" if type(self).calls == 2 else "Total makan: Rp 50.000"
        return SimpleNamespace(answer=text, intent="aggregate")


@pytest.fixture
def stubbed_live(monkeypatch, tmp_path):
    _FakeAnswerer.calls = 0
    monkeypatch.setattr("app.services.answerer.AnswerService", _FakeAnswerer)
    monkeypatch.setattr("app.providers.factory.ProviderFactory.create", lambda _settings: object())
    monkeypatch.setattr("app.services.query_planner.QueryPlanner", lambda provider: object())
    monkeypatch.setattr(eval_injection, "RESULTS_DIR", tmp_path)
    return tmp_path


async def _run(samples: int) -> int:
    args = argparse.Namespace(live=True, label="t", pace=0.0, only=["direct-01"], samples=samples)
    return await eval_injection.run_live(args)


async def test_one_sample_behaves_as_before(stubbed_live):
    assert await _run(1) == 0
    saved = json.loads(next(stubbed_live.glob("*-injection-t.json")).read_text(encoding="utf-8"))
    case = saved["results"][0]
    assert saved["ran"] == 1 and saved["landed"] == 0
    assert "samples" not in case and case["landed"] is False


async def test_a_case_lands_if_any_sample_lands(stubbed_live):
    assert await _run(3) == 0
    saved = json.loads(next(stubbed_live.glob("*-injection-t.json")).read_text(encoding="utf-8"))
    case = saved["results"][0]
    assert case["samples"] == 3 and case["landed_n"] == 1 and case["landed"] is True
    assert saved["landed"] == 1 and saved["ran"] == 1
    assert "Never estimate or invent" in case["answer"]   # the landed sample is the evidence kept
