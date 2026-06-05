"""Extraction benchmark harness. Runs real LLM calls — NOT part of CI.

    python evals/eval_extraction.py --provider gemini
    python evals/eval_extraction.py --provider anthropic --model claude-sonnet-4-6
    python evals/eval_extraction.py --compare
    python evals/eval_extraction.py --provider gemini --no-save

Results auto-saved to evals/results/YYYYMMDD-eval-results.md after each run.
"""
import argparse, asyncio, json, time
from datetime import date
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
RESULTS_DIR = EVALS_DIR / "results"


def _make_provider(name: str, model: str | None):
    if name == "gemini":
        return GeminiProvider(api_key=settings.gemini_api_key, model=model or "gemini-2.5-flash")
    if name == "anthropic":
        return AnthropicProvider(api_key=settings.anthropic_api_key, model=model or "claude-sonnet-4-6")
    raise ValueError(name)


def _bank_hint(fixture_name: str) -> str:
    return fixture_name.split("_")[0]  # bca_01 -> bca


async def run_provider(name: str, model: str | None) -> tuple[dict, list[dict]]:
    provider = _make_provider(name, model)
    parser = LlmParser(provider=provider)
    scores, latencies, costs = [], [], []
    rows: list[dict] = []
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
            rows.append({"fixture": fx.stem, "error": str(exc)})
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

        rows.append({
            "fixture": fx.stem,
            "f1": s.f1,
            "crit": s.field_accuracy(CRITICAL_FIELDS),
            "all": s.field_accuracy(),
            "latency_ms": latency_ms,
            "cost": cost,
        })

        print(f"  {fx.stem:24s}  F1={s.f1:5.2f}  crit={s.field_accuracy(CRITICAL_FIELDS):5.2f}  "
              f"all={s.field_accuracy():5.2f}  {latency_ms:7.0f}ms  ${cost:.5f}")

    return _aggregate(name, model, scores, latencies, costs, errors), rows


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


def _render_markdown(runs: list[tuple[dict, list[dict]]]) -> str:
    today = date.today().strftime("%Y-%m-%d")
    total_fixtures = sum(r["fixtures"] + r.get("errors", 0) for r, _ in runs)
    lines = [
        "# Extraction Eval Results",
        "",
        f"**Date:** {today}  ",
        f"**Harness:** `evals/` — {total_fixtures} fixtures  ",
        "**Scored on:** row-level F1 + field-level accuracy; critical fields (`date`, `amount_idr`, `flow`) separated from cosmetic",
        "",
        "---",
        "",
        "## Summary",
        "",
        "| Provider | Model | Fixtures | Row F1 | Critical-field acc | All-field acc | Latency p50/p95 | Cost/doc |",
        "|----------|-------|----------|--------|--------------------|---------------|-----------------|----------|",
    ]
    for agg, _ in runs:
        errors = agg.get("errors", 0)
        total = agg["fixtures"] + errors
        err_note = f" ({errors} err)" if errors else ""
        lines.append(
            f"| {agg['provider']} | {agg['model']} | {agg['fixtures']}/{total}{err_note} "
            f"| {agg['row_f1']:.3f} | {agg['critical_field_acc']:.3f} "
            f"| {agg['all_field_acc']:.3f} "
            f"| {agg['p50_latency_ms']:.0f}ms / {agg['p95_latency_ms']:.0f}ms "
            f"| ${agg['avg_cost_usd']:.5f} |"
        )
    lines += ["", "---", ""]

    for agg, rows in runs:
        lines += [
            f"## Per-fixture — {agg['provider']} ({agg['model']})",
            "",
            "| Fixture | F1 | crit | all | Latency | Cost |",
            "|---------|-----|------|-----|---------|------|",
        ]
        for row in rows:
            if "error" in row:
                lines.append(f"| {row['fixture']} | — | — | — | ERROR | — |")
            else:
                lines.append(
                    f"| {row['fixture']} "
                    f"| {row['f1']:.2f} | {row['crit']:.2f} | {row['all']:.2f} "
                    f"| {row['latency_ms']:.0f}ms | ${row['cost']:.5f} |"
                )
        lines += [""]

    lines += [
        "---",
        "",
        "## Failure Modes",
        "",
        "> _Fill in after reviewing per-fixture output above._",
        "",
        "---",
        "",
        "## Notes",
        "",
        "> _Model-specific observations, prompt changes tested, next steps._",
    ]
    return "\n".join(lines)


def _save_results(runs: list[tuple[dict, list[dict]]]) -> Path:
    RESULTS_DIR.mkdir(exist_ok=True)
    out = RESULTS_DIR / f"{date.today().strftime('%Y%m%d')}-eval-results.md"
    out.write_text(_render_markdown(runs), encoding="utf-8")
    return out


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--provider", choices=["gemini", "anthropic"])
    ap.add_argument("--model", default=None)
    ap.add_argument("--compare", action="store_true")
    ap.add_argument("--no-save", action="store_true", help="Skip writing results to evals/results/")
    args = ap.parse_args()

    runs = []
    if args.compare:
        for prov, model in (("gemini", "gemini-2.5-flash"), ("anthropic", "claude-sonnet-4-6")):
            print(f"\n--- Running {prov} ---")
            agg, rows = await run_provider(prov, model)
            _print_summary(agg)
            runs.append((agg, rows))
    else:
        agg, rows = await run_provider(args.provider or settings.ai_provider, args.model)
        _print_summary(agg)
        runs.append((agg, rows))

    if not args.no_save:
        out = _save_results(runs)
        print(f"\nResults saved → {out}")


if __name__ == "__main__":
    asyncio.run(main())