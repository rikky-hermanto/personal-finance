"""Categorization benchmark. Runs real LLM calls — NOT part of CI.

    PYTHONPATH=. python evals/eval_categorize.py --list
    PYTHONPATH=. python evals/eval_categorize.py --provider gemini
    PYTHONPATH=. python evals/eval_categorize.py --provider anthropic --model claude-sonnet-4-6
    PYTHONPATH=. python evals/eval_categorize.py --compare
    PYTHONPATH=. python evals/eval_categorize.py --provider gemini --filter grab_fee
    PYTHONPATH=. python evals/eval_categorize.py --provider gemini --no-save

Results auto-saved to evals/results/YYYYMMDD-categorize-eval.md after each run.
"""
import argparse, asyncio, json, sys, time
from datetime import date
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.config import settings
from app.models import CategorizeRequest
from app.observability import estimate_cost_usd
from app.providers.gemini import GeminiProvider
from app.providers.anthropic import AnthropicProvider
from app.services.categorizer import Categorizer
from evals.scoring_categorize import (
    CategorizeScore, accepted_labels, case_categories, score_case,
)

EVALS_DIR = Path(__file__).parent
CASES_FILE = EVALS_DIR / "categorize_cases.json"
RESULTS_DIR = EVALS_DIR / "results"


def _load() -> tuple[list[str], list[dict]]:
    data = json.loads(CASES_FILE.read_text(encoding="utf-8"))
    return data["default_categories"], data["cases"]


def _make_provider(name: str, model: str | None):
    if name == "gemini":
        return GeminiProvider(api_key=settings.gemini_api_key, model=model or "gemini-2.5-flash")
    if name == "anthropic":
        return AnthropicProvider(api_key=settings.anthropic_api_key, model=model or "claude-sonnet-4-6")
    raise ValueError(name)


def list_cases() -> None:
    defaults, cases = _load()
    print(f"{len(cases)} cases in {CASES_FILE.name}\n")
    print(f"{'id':<24} {'description':<36} {'flow':<5} {'expected'}")
    print("-" * 92)
    for c in cases:
        expected = " | ".join(accepted_labels(c))
        scoped = "" if not c.get("available_categories") else "  (scoped vocab)"
        print(f"{c['id']:<24} {c['description'][:34]:<36} {c['flow']:<5} {expected}{scoped}")
    print(f"\nDefault categories ({len(defaults)}): {', '.join(defaults)}")


async def run_provider(name: str, model: str | None, case_filter: str | None = None) -> CategorizeScore:
    defaults, cases = _load()
    if case_filter:
        cases = [c for c in cases if case_filter in c["id"]]
        if not cases:
            raise SystemExit(f"No case id matching '{case_filter}'")

    provider = _make_provider(name, model)
    categorizer = Categorizer(provider=provider)
    score = CategorizeScore()

    print(f"\n--- {name} ({model or 'default'}) — {len(cases)} cases ---")
    for c in cases:
        offered = case_categories(c, defaults)
        req = CategorizeRequest(
            description=c["description"],
            remarks=c.get("remarks", ""),
            flow=c["flow"],
            amount_idr=Decimal(str(c["amount_idr"])),
            account_name=c.get("account_name", ""),
            available_categories=offered,
        )

        t0 = time.perf_counter()
        resp = await categorizer.categorize(req)
        latency_ms = (time.perf_counter() - t0) * 1000

        r = score_case(c, resp.category, resp.confidence, offered)
        r.latency_ms = latency_ms
        usage = provider.last_usage or {"input": 0, "output": 0}
        r.cost_usd = estimate_cost_usd(model or provider._model, usage["input"], usage["output"])
        score.results.append(r)

        mark = "PASS" if r.correct else "FAIL"
        oov = "  [OOV]" if r.out_of_vocab else ""
        print(f"  {r.id:<24} {mark}  {r.predicted:<20} conf={r.confidence:.2f}  "
              f"{latency_ms:6.0f}ms  ${r.cost_usd:.5f}{oov}")

    return score


def _print_summary(name: str, model: str | None, s: CategorizeScore) -> None:
    print(f"\n=== {name} ({model or 'default'}) ===")
    print(f"  Accuracy          : {s.accuracy:.3f}  ({s.total - len(s.failures)}/{s.total})")
    print(f"  Out-of-vocab rate : {s.oov_rate:.3f}  (model invented a category outside the list)")
    print(f"  Confidence  right : {s.mean_confidence_correct:.2f}")
    print(f"  Confidence  wrong : {s.mean_confidence_wrong:.2f}")
    print(f"  Calibration gap   : {s.calibration_gap:+.2f}  (higher is better; ~0 means confidence is noise)")
    if s.failures:
        print("  Failures:")
        for r in s.failures:
            print(f"    - {r.id}: got '{r.predicted}' (conf {r.confidence:.2f})")


def _render_markdown(runs: list[tuple[str, str | None, CategorizeScore]]) -> str:
    today = date.today().strftime("%Y-%m-%d")
    lines = [
        "# Categorization Eval Results",
        "",
        f"**Date:** {today}  ",
        f"**Harness:** `evals/eval_categorize.py` — cases from `evals/categorize_cases.json`  ",
        "**Scored on:** label accuracy, out-of-vocabulary rate, confidence calibration",
        "",
        "---",
        "",
        "## Summary",
        "",
        "| Provider | Model | Cases | Accuracy | OOV rate | Conf(right) | Conf(wrong) | Calib gap |",
        "|----------|-------|-------|----------|----------|-------------|-------------|-----------|",
    ]
    for name, model, s in runs:
        lines.append(
            f"| {name} | {model or 'default'} | {s.total} | {s.accuracy:.3f} | {s.oov_rate:.3f} "
            f"| {s.mean_confidence_correct:.2f} | {s.mean_confidence_wrong:.2f} | {s.calibration_gap:+.2f} |"
        )
    lines += ["", "---", ""]

    for name, model, s in runs:
        lines += [
            f"## Per-case — {name} ({model or 'default'})",
            "",
            "| Case | Result | Predicted | Confidence | OOV | Latency | Cost |",
            "|------|--------|-----------|------------|-----|---------|------|",
        ]
        for r in s.results:
            lines.append(
                f"| {r.id} | {'PASS' if r.correct else 'FAIL'} | {r.predicted} "
                f"| {r.confidence:.2f} | {'yes' if r.out_of_vocab else ''} "
                f"| {r.latency_ms:.0f}ms | ${r.cost_usd:.5f} |"
            )
        lines += [""]

    lines += [
        "---", "", "## Failure Modes", "",
        "> _Fill in after reviewing per-case output above._", "",
        "---", "", "## Notes", "",
        "> _Prompt changes tested, vocabulary drift observed, next steps._",
    ]
    return "\n".join(lines)


def _save(runs) -> Path:
    RESULTS_DIR.mkdir(exist_ok=True)
    out = RESULTS_DIR / f"{date.today().strftime('%Y%m%d')}-categorize-eval.md"
    out.write_text(_render_markdown(runs), encoding="utf-8")
    return out


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true", help="print all cases and exit (no API calls)")
    ap.add_argument("--provider", choices=["gemini", "anthropic"])
    ap.add_argument("--model", default=None)
    ap.add_argument("--compare", action="store_true")
    ap.add_argument("--filter", default=None, help="run only cases whose id contains this substring")
    ap.add_argument("--no-save", action="store_true")
    args = ap.parse_args()

    if args.list:
        list_cases()
        return

    runs = []
    if args.compare:
        for prov, model in (("gemini", "gemini-2.5-flash"), ("anthropic", "claude-sonnet-4-6")):
            s = await run_provider(prov, model, args.filter)
            _print_summary(prov, model, s)
            runs.append((prov, model, s))
    else:
        prov = args.provider or settings.ai_provider
        s = await run_provider(prov, args.model, args.filter)
        _print_summary(prov, args.model, s)
        runs.append((prov, args.model, s))

    if not args.no_save:
        print(f"\nResults saved -> {_save(runs)}")


if __name__ == "__main__":
    asyncio.run(main())
