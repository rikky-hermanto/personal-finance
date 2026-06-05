"""Extraction benchmark harness. Runs real LLM calls — NOT part of CI.

    python evals/eval_extraction.py --provider gemini
    python evals/eval_extraction.py --provider anthropic --model claude-sonnet-4-6
    python evals/eval_extraction.py --compare
"""
import argparse, asyncio, json, time
from pathlib import Path

from app.config import settings
from app.providers.gemini import GeminiProvider
from app.providers.anthropic import AnthropicProvider
from app.observability import estimate_cost_usd
from app.models import ParseRequest
from app.services.llm_parser import LlmParser
from evals.scoring import score_fixture, CRITICAL_FIELDS, COSMETIC_FIELDS, SCORED_FIELDS

EVALS_DIR = Path(__file__).parent
FIXTURES = EVALS_DIR / "fixtures"
TRUTH = EVALS_DIR / "ground_truth"


def _make_provider(name: str, model: str | None):
    if name == "gemini":
        return GeminiProvider(api_key=settings.gemini_api_key, model=model or "gemini-2.5-flash")
    if name == "anthropic":
        return AnthropicProvider(api_key=settings.anthropic_api_key, model=model or "claude-sonnet-4-6")
    raise ValueError(name)


def _bank_hint(fixture_name: str) -> str:
    return fixture_name.split("_")[0]  # bca_01 -> bca


async def run_provider(name: str, model: str | None) -> dict:
    provider = _make_provider(name, model)
    parser = LlmParser(provider=provider)
    scores, latencies, costs = [], [], []
    errors = 0

    for fx in sorted(FIXTURES.glob("*.txt")):
        truth = json.loads((TRUTH / f"{fx.stem}.json").read_text(encoding="utf-8"))["transactions"]
        text = fx.read_text(encoding="utf-8")

        t0 = time.perf_counter()
        try:
            resp = await parser.parse(ParseRequest(text=text, bank_hint=_bank_hint(fx.stem)))
        except Exception as exc:
            latency_ms = (time.perf_counter() - t0) * 1000
            errors += 1
            print(f"  {fx.stem:24s}  [ERROR] {exc!s:.80s}")
            continue
        latency_ms = (time.perf_counter() - t0) * 1000

        # mode='json' serializes FlowType enum → "DB"/"CR" string, dates → ISO strings
        predicted = [t.model_dump(mode='json') for t in resp.transactions]
        s = score_fixture(fx.stem, predicted, truth)
        scores.append(s)
        latencies.append(latency_ms)

        usage = provider.last_usage or {"input": 0, "output": 0}
        cost = estimate_cost_usd(model or provider._model, usage["input"], usage["output"])
        costs.append(cost)

        print(f"  {fx.stem:24s}  F1={s.f1:5.2f}  crit={s.field_accuracy(CRITICAL_FIELDS):5.2f}  "
              f"all={s.field_accuracy():5.2f}  {latency_ms:7.0f}ms  ${cost:.5f}")

    return _aggregate(name, model, scores, latencies, costs, errors)


def _aggregate(name, model, scores, latencies, costs, errors: int = 0) -> dict:
    n = len(scores)
    lat_sorted = sorted(latencies)
    p95 = lat_sorted[int(0.95 * (n - 1))] if n else 0
    return {
        "provider": name,
        "model": model or "default",
        "fixtures": n,
        "errors": errors,
        "row_f1": sum(s.f1 for s in scores) / n,
        "recall": sum(s.recall for s in scores) / n,
        "precision": sum(s.precision for s in scores) / n,
        "critical_field_acc": sum(s.field_accuracy(CRITICAL_FIELDS) for s in scores) / n,
        "all_field_acc": sum(s.field_accuracy() for s in scores) / n,
        "p50_latency_ms": lat_sorted[n // 2] if n else 0,
        "p95_latency_ms": p95,
        "avg_cost_usd": sum(costs) / n if n else 0,
        "total_cost_usd": sum(costs),
    }


def _print_summary(agg: dict):
    errors = agg.get("errors", 0)
    total = agg["fixtures"] + errors
    err_note = f"  ({errors} errored)" if errors else ""
    print(f"\n=== {agg['provider']} ({agg['model']}) — {agg['fixtures']}/{total} fixtures{err_note} ===")
    print(f"  Row F1            : {agg['row_f1']:.3f}  (precision {agg['precision']:.3f} / recall {agg['recall']:.3f})")
    print(f"  Critical fields   : {agg['critical_field_acc']:.3f}  (date, amount_idr, flow)")
    print(f"  All fields        : {agg['all_field_acc']:.3f}")
    print(f"  Latency p50 / p95 : {agg['p50_latency_ms']:.0f}ms / {agg['p95_latency_ms']:.0f}ms")
    print(f"  Cost / doc        : ${agg['avg_cost_usd']:.5f}  (total ${agg['total_cost_usd']:.4f})")


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--provider", choices=["gemini", "anthropic"])
    ap.add_argument("--model", default=None)
    ap.add_argument("--compare", action="store_true")
    args = ap.parse_args()

    if args.compare:
        for prov, model in (("gemini", "gemini-2.5-flash"), ("anthropic", "claude-sonnet-4-6")):
            print(f"\n--- Running {prov} ---")
            _print_summary(await run_provider(prov, model))
    else:
        _print_summary(await run_provider(args.provider or settings.ai_provider, args.model))


if __name__ == "__main__":
    asyncio.run(main())