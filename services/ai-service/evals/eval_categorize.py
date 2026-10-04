"""Versioned categorization benchmark. Live calls require explicit budgets.

Offline inventory:
    .venv/Scripts/python.exe evals/eval_categorize.py --list

Live examples (run only with separate authorization and configured keys):
    .venv/Scripts/python.exe evals/eval_categorize.py --provider gemini \
        --confirm-live --max-requests 10 --max-spend-usd 0.01
    .venv/Scripts/python.exe evals/eval_categorize.py --provider jev \
        --jev-threshold 0.8 --confirm-live --max-requests 10 --max-spend-usd 0.01

Historical --provider, --compare, --filter, and --no-save options remain available.
--compare still means Gemini versus Anthropic; --compare-jev adds the targeted
configured-baseline versus Jev comparison.
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import sys
import time
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).parent.parent))

from typesafe_sdk import AsyncTypeSafeClient, RetryPolicy

from app.config import settings
from app.models import CategorizeRequest
from app.observability import estimate_cost_usd
from app.providers.anthropic import AnthropicProvider
from app.providers.gemini import GeminiProvider
from app.services.categorizer import PROMPT_VERSION, Categorizer, _SYSTEM_PROMPT
from app.services.jev_categorizer import (
    JEV_INSTRUCTIONS,
    JEV_PROMPT_VERSION,
    JevCategorizationObservation,
    JevCategorizer,
)
from evals.scoring_categorize import (
    CaseResult,
    CategorizeScore,
    accepted_labels,
    case_categories,
    score_case,
)

EVALS_DIR = Path(__file__).parent
CASES_FILE = EVALS_DIR / "categorize_cases.json"
RESULTS_DIR = EVALS_DIR / "results" / "categorize"
ARTIFACT_SCHEMA_VERSION = 1


def _sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _load() -> tuple[dict[str, Any], list[str], list[dict]]:
    raw = CASES_FILE.read_bytes()
    data = json.loads(raw)
    cases = list(data.get("cases", []))
    for group in data.get("case_groups", []):
        shared = {key: value for key, value in group.items() if key != "examples"}
        for example in group["examples"]:
            cases.append({**shared, **example})

    ids = [case["id"] for case in cases]
    if len(ids) != len(set(ids)):
        raise ValueError("categorization dataset case ids must be unique")
    if any(case.get("split") not in {"tuning", "holdout"} for case in cases):
        raise ValueError("every categorization case must declare tuning or holdout split")
    if any(not case.get("merchant_family") for case in cases):
        raise ValueError("every categorization case must declare merchant_family")

    family_splits: dict[str, set[str]] = {}
    for case in cases:
        family_splits.setdefault(case["merchant_family"], set()).add(case["split"])
    leaking = sorted(family for family, splits in family_splits.items() if len(splits) > 1)
    if leaking:
        raise ValueError(f"merchant families leak across tuning/holdout: {', '.join(leaking)}")

    metadata = {
        "version": data["dataset_version"],
        "sha256": _sha256_bytes(raw),
        "created_on": data["created_on"],
        "provenance": data["provenance"],
        "pricing": data["pricing"],
    }
    return metadata, list(data["default_categories"]), cases


def _select_cases(cases: list[dict], split: str, case_filter: str | None) -> list[dict]:
    selected = cases if split == "all" else [case for case in cases if case["split"] == split]
    if case_filter:
        selected = [case for case in selected if case_filter in case["id"]]
    if not selected:
        raise ValueError("no categorization cases match the requested split/filter")
    return selected


def list_cases(split: str = "all", case_filter: str | None = None) -> None:
    metadata, defaults, cases = _load()
    selected = _select_cases(cases, split, case_filter)
    tuning = sum(case["split"] == "tuning" for case in cases)
    holdout = sum(case["split"] == "holdout" for case in cases)
    print(
        f"dataset={metadata['version']} sha256={metadata['sha256'][:12]} "
        f"cases={len(cases)} tuning={tuning} holdout={holdout}"
    )
    print(f"selected={len(selected)} split={split}\n")
    print(f"{'id':<24} {'family':<30} {'flow':<5} {'expected'}")
    print("-" * 100)
    for case in selected:
        expected = "ABSTAIN" if case.get("expected_abstain") else " | ".join(accepted_labels(case))
        scoped = " (scoped vocab)" if case.get("available_categories") else ""
        print(
            f"{case['id']:<24} {case['merchant_family'][:28]:<30} "
            f"{case['flow']:<5} {expected}{scoped}"
        )
    print(f"\nDefault categories ({len(defaults)}): {', '.join(defaults)}")


def _make_legacy_provider(name: str, model: str | None):
    if name == "gemini":
        return GeminiProvider(api_key=settings.gemini_api_key, model=model or "gemini-2.5-flash")
    if name == "anthropic":
        return AnthropicProvider(
            api_key=settings.anthropic_api_key,
            model=model or "claude-sonnet-4-6",
        )
    raise ValueError(name)


def _prompt_fingerprint(provider: str) -> tuple[str, str]:
    if provider == "jev":
        version = JEV_PROMPT_VERSION
        material = json.dumps(JEV_INSTRUCTIONS, ensure_ascii=False, sort_keys=True)
    else:
        version = PROMPT_VERSION
        material = _SYSTEM_PROMPT
    return version, _sha256_bytes(material.encode("utf-8"))


def _validate_live_budget(
    *,
    confirmed: bool,
    max_requests: int | None,
    max_spend_usd: Decimal | None,
) -> None:
    if not confirmed:
        raise ValueError("live evaluation requires --confirm-live")
    if max_requests is None or max_requests <= 0:
        raise ValueError("live evaluation requires --max-requests > 0")
    if max_spend_usd is None or max_spend_usd <= 0:
        raise ValueError("live evaluation requires --max-spend-usd > 0")


def _legacy_cost(model: str, usage: dict[str, int] | None) -> Decimal | None:
    if usage is None:
        return None
    input_tokens = usage.get("input")
    output_tokens = usage.get("output")
    if not isinstance(input_tokens, int) or not isinstance(output_tokens, int):
        return None
    estimated = estimate_cost_usd(model, input_tokens, output_tokens)
    if estimated == 0.0 and input_tokens + output_tokens > 0:
        return None
    return Decimal(str(estimated))


async def run_provider(
    name: str,
    model: str | None,
    *,
    cases: list[dict],
    defaults: list[str],
    jev_threshold: float | None,
    max_requests: int,
    max_spend_usd: Decimal,
    existing_results: list[CaseResult] | None = None,
) -> CategorizeScore:
    observations: list[JevCategorizationObservation] = []
    closeable: AsyncTypeSafeClient | None = None
    legacy_provider = None
    if name == "jev":
        if not settings.typesafe_api_key.strip():
            raise ValueError("TYPESAFE_API_KEY is required for --provider jev")
        if jev_threshold is None or not 0.0 < jev_threshold <= 1.0:
            raise ValueError("--jev-threshold in (0, 1] is required for Jev evaluation")
        selected_model = model or settings.jev_model
        closeable = AsyncTypeSafeClient(
            api_key=settings.typesafe_api_key,
            model=selected_model,
            retry=RetryPolicy(max_retries=0),
            timeout=settings.jev_timeout_seconds,
        )
        categorizer = JevCategorizer(
            closeable,
            model=selected_model,
            acceptance_threshold=jev_threshold,
            deadline_seconds=settings.jev_timeout_seconds,
            observer=observations.append,
        )
    else:
        legacy_provider = _make_legacy_provider(name, model)
        selected_model = legacy_provider._model
        categorizer = Categorizer(provider=legacy_provider)

    score = CategorizeScore(results=list(existing_results or []))
    completed_ids = {result.id for result in score.results}
    spent = sum(
        (result.cost_usd for result in score.results if result.cost_usd is not None),
        Decimal("0"),
    )
    requests_this_run = 0
    prompt_version, _ = _prompt_fingerprint(name)
    print(f"\n--- {name} ({selected_model}) — {len(cases)} selected cases ---")

    try:
        for case in cases:
            if case["id"] in completed_ids:
                continue
            if requests_this_run >= max_requests or spent >= max_spend_usd:
                print("  budget reached; save the artifact and resume explicitly if authorized")
                break

            offered = case_categories(case, defaults)
            request = CategorizeRequest(
                description=case["description"],
                remarks=case.get("remarks", ""),
                flow=case["flow"],
                amount_idr=Decimal(str(case["amount_idr"])),
                account_name=case.get("account_name", ""),
                available_categories=offered,
            )
            if legacy_provider is not None:
                legacy_provider.last_usage = None
            observation_count = len(observations)
            started = time.perf_counter()
            reason = "accepted"
            try:
                response = await categorizer.categorize(request)
            except Exception as exc:
                response = None
                reason = "provider_error"
                print(f"  {case['id']:<24} ERROR {type(exc).__name__}")
            latency_ms = (time.perf_counter() - started) * 1000
            requests_this_run += 1

            observation = (
                observations[-1]
                if len(observations) > observation_count
                else None
            )
            if observation is not None:
                reason = observation.reason
                actual_model = observation.model
                input_tokens = observation.input_tokens
                output_tokens = observation.output_tokens
                winner_probability = observation.winner_probability
                cost_usd = observation.cost_usd
            else:
                actual_model = selected_model
                usage = legacy_provider.last_usage if legacy_provider is not None else None
                input_tokens = usage.get("input") if usage else None
                output_tokens = usage.get("output") if usage else None
                winner_probability = None
                cost_usd = _legacy_cost(selected_model, usage)

            predicted = response.category if response is not None else "Uncategorized"
            confidence = response.confidence if response is not None else 0.0
            result = score_case(
                case,
                predicted,
                confidence,
                offered,
                reason=reason,
                winner_probability=winner_probability,
            )
            result.latency_ms = latency_ms
            result.input_tokens = input_tokens
            result.output_tokens = output_tokens
            result.cost_usd = cost_usd
            result.model = actual_model
            result.prompt_version = prompt_version
            score.results.append(result)
            if cost_usd is not None:
                spent += cost_usd

            mark = "PASS" if result.correct else "FAIL"
            cost_text = "unknown" if result.cost_usd is None else f"${result.cost_usd:.8f}"
            print(
                f"  {result.id:<24} {mark} {result.outcome:<9} "
                f"{result.predicted:<18} conf={result.confidence:.2f} "
                f"{latency_ms:6.0f}ms {cost_text}"
            )
    finally:
        if closeable is not None:
            await closeable.aclose()

    return score


def _money(value: Decimal | None) -> str:
    return "unknown" if value is None else f"${value:.8f}"


def _print_summary(name: str, model: str | None, score: CategorizeScore) -> None:
    print(f"\n=== {name} ({model or 'configured default'}) ===")
    print(f"  Cases              : {score.total}")
    print(f"  Accepted precision : {score.accepted_precision:.3f}")
    print(f"  Coverage           : {score.coverage:.3f}")
    print(f"  Abstention correct : {score.abstention_correctness:.3f}")
    print(f"  OOV rate           : {score.oov_rate:.3f}")
    print(f"  Failure rate       : {score.failure_rate:.3f}")
    print(f"  p50 / p95 latency  : {score.p50_latency_ms:.0f}ms / {score.p95_latency_ms:.0f}ms")
    print(f"  Total measured cost: {_money(score.total_cost_usd)}")
    print(f"  Cost/correct accept: {_money(score.cost_per_correct_accepted_usd)}")


def _summary_dict(score: CategorizeScore) -> dict[str, Any]:
    return {
        "cases": score.total,
        "accuracy": score.accuracy,
        "accepted_precision": score.accepted_precision,
        "coverage": score.coverage,
        "abstention_rate": score.abstention_rate,
        "abstention_correctness": score.abstention_correctness,
        "oov_rate": score.oov_rate,
        "failure_rate": score.failure_rate,
        "mean_confidence_correct": score.mean_confidence_correct,
        "mean_confidence_wrong": score.mean_confidence_wrong,
        "p50_latency_ms": score.p50_latency_ms,
        "p95_latency_ms": score.p95_latency_ms,
        "total_cost_usd": (
            str(score.total_cost_usd) if score.total_cost_usd is not None else None
        ),
        "cost_per_correct_accepted_usd": (
            str(score.cost_per_correct_accepted_usd)
            if score.cost_per_correct_accepted_usd is not None
            else None
        ),
    }


def _new_run_id(provider: str, dataset_hash: str) -> str:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    return f"{timestamp}-{provider}-{dataset_hash[:8]}"


def _render_markdown(artifact: dict[str, Any]) -> str:
    summary = artifact["summary"]
    lines = [
        "# Categorization Eval Run",
        "",
        f"- Run: `{artifact['run_id']}`",
        f"- Dataset: `{artifact['dataset']['version']}` (`{artifact['dataset']['sha256'][:12]}`)",
        f"- Split: `{artifact['dataset']['split']}`",
        f"- Provider/model: `{artifact['provider']['name']}` / `{artifact['provider']['requested_model']}`",
        f"- Prompt: `{artifact['prompt']['version']}` (`{artifact['prompt']['sha256'][:12]}`)",
        f"- Complete: `{artifact['complete']}`",
        "",
        "| Cases | Accepted precision | Coverage | Abstention correctness | OOV | Failure | p50 | p95 | Cost/correct accept |",
        "|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
        (
            f"| {summary['cases']} | {summary['accepted_precision']:.3f} | {summary['coverage']:.3f} "
            f"| {summary['abstention_correctness']:.3f} | {summary['oov_rate']:.3f} "
            f"| {summary['failure_rate']:.3f} | {summary['p50_latency_ms']:.0f}ms "
            f"| {summary['p95_latency_ms']:.0f}ms "
            f"| {summary['cost_per_correct_accepted_usd'] or 'unknown'} |"
        ),
        "",
        "| Case | Outcome | Correct | Predicted | Confidence | Winner p | Model | Input tokens | Latency | Cost |",
        "|---|---|---:|---|---:|---:|---|---:|---:|---:|",
    ]
    for result in artifact["results"]:
        predicted = result["predicted"].replace("|", "\\|")
        lines.append(
            f"| {result['id']} | {result['outcome']} | {'yes' if result['correct'] else 'no'} "
            f"| {predicted} | {result['confidence']:.2f} "
            f"| {result['winner_probability'] if result['winner_probability'] is not None else ''} "
            f"| {result['model'] or ''} | {result['input_tokens'] if result['input_tokens'] is not None else ''} "
            f"| {result['latency_ms']:.0f}ms | {result['cost_usd'] or 'unknown'} |"
        )
    return "\n".join(lines) + "\n"


def _save_run(
    *,
    provider: str,
    requested_model: str,
    split: str,
    selected_case_count: int,
    metadata: dict[str, Any],
    score: CategorizeScore,
    max_requests: int,
    max_spend_usd: Decimal,
    resumed_from: str | None = None,
    output_dir: Path = RESULTS_DIR,
) -> tuple[Path, Path]:
    run_id = _new_run_id(provider, metadata["sha256"])
    prompt_version, prompt_hash = _prompt_fingerprint(provider)
    artifact = {
        "schema_version": ARTIFACT_SCHEMA_VERSION,
        "run_id": run_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "resumed_from": resumed_from,
        "dataset": {
            "version": metadata["version"],
            "sha256": metadata["sha256"],
            "split": split,
            "selected_case_count": selected_case_count,
            "provenance": metadata["provenance"],
        },
        "provider": {
            "name": provider,
            "requested_model": requested_model,
            "returned_models": sorted(
                {result.model for result in score.results if result.model is not None}
            ),
        },
        "prompt": {"version": prompt_version, "sha256": prompt_hash},
        "budget": {
            "max_requests": max_requests,
            "max_spend_usd": str(max_spend_usd),
        },
        "complete": score.total >= selected_case_count,
        "summary": _summary_dict(score),
        "results": [result.to_dict() for result in score.results],
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / f"{run_id}.json"
    markdown_path = output_dir / f"{run_id}.md"
    json_path.write_text(json.dumps(artifact, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    markdown_path.write_text(_render_markdown(artifact), encoding="utf-8")
    return json_path, markdown_path


def _load_resume(
    path: Path,
    *,
    provider: str,
    requested_model: str,
    metadata: dict[str, Any],
    split: str,
) -> tuple[list[CaseResult], str]:
    artifact = json.loads(path.read_text(encoding="utf-8"))
    if artifact.get("schema_version") != ARTIFACT_SCHEMA_VERSION:
        raise ValueError("resume artifact schema is not supported")
    if artifact["provider"]["name"] != provider:
        raise ValueError("resume artifact provider does not match")
    if artifact["provider"]["requested_model"] != requested_model:
        raise ValueError("resume artifact model does not match")
    if artifact["dataset"]["sha256"] != metadata["sha256"]:
        raise ValueError("resume artifact dataset hash does not match")
    if artifact["dataset"]["split"] != split:
        raise ValueError("resume artifact split does not match")
    return [CaseResult.from_dict(result) for result in artifact["results"]], artifact["run_id"]


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    parser.add_argument("--list", action="store_true", help="print cases and exit without API calls")
    parser.add_argument("--provider", choices=["gemini", "anthropic", "jev"])
    parser.add_argument("--model", default=None)
    parser.add_argument("--compare", action="store_true", help="historical Gemini/Anthropic comparison")
    parser.add_argument("--compare-jev", action="store_true", help="configured baseline versus Jev")
    parser.add_argument("--baseline-provider", choices=["gemini", "anthropic"], default=None)
    parser.add_argument("--jev-threshold", type=float, default=None)
    parser.add_argument("--split", choices=["tuning", "holdout", "all"], default="holdout")
    parser.add_argument("--filter", default=None, help="run only case ids containing this substring")
    parser.add_argument("--confirm-live", action="store_true")
    parser.add_argument("--max-requests", type=int, default=None)
    parser.add_argument("--max-spend-usd", type=Decimal, default=None)
    parser.add_argument("--resume", type=Path, default=None)
    parser.add_argument("--no-save", action="store_true")
    return parser


async def main() -> None:
    parser = _parser()
    args = parser.parse_args()
    if args.list:
        split_was_explicit = any(argument.startswith("--split") for argument in sys.argv)
        list_cases(args.split if split_was_explicit else "all", args.filter)
        return
    try:
        _validate_live_budget(
            confirmed=args.confirm_live,
            max_requests=args.max_requests,
            max_spend_usd=args.max_spend_usd,
        )
    except ValueError as exc:
        parser.error(str(exc))
    if args.resume and (args.compare or args.compare_jev):
        parser.error("--resume supports one provider at a time")

    metadata, defaults, all_cases = _load()
    try:
        cases = _select_cases(all_cases, args.split, args.filter)
    except ValueError as exc:
        parser.error(str(exc))

    if args.compare:
        requested_runs = [
            ("gemini", "gemini-2.5-flash"),
            ("anthropic", "claude-sonnet-4-6"),
        ]
    elif args.compare_jev:
        baseline = args.baseline_provider or settings.ai_provider
        baseline_model = args.model or settings.ai_model
        requested_runs = [(baseline, baseline_model), ("jev", settings.jev_model)]
    else:
        provider = args.provider or (
            "jev" if settings.categorization_backend == "jev" else settings.ai_provider
        )
        requested_runs = [(provider, args.model or (settings.jev_model if provider == "jev" else settings.ai_model))]

    for provider, requested_model in requested_runs:
        existing_results: list[CaseResult] | None = None
        resumed_from = None
        if args.resume:
            try:
                existing_results, resumed_from = _load_resume(
                    args.resume,
                    provider=provider,
                    requested_model=requested_model,
                    metadata=metadata,
                    split=args.split,
                )
            except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
                parser.error(str(exc))

        score = await run_provider(
            provider,
            requested_model,
            cases=cases,
            defaults=defaults,
            jev_threshold=args.jev_threshold or settings.jev_acceptance_threshold,
            max_requests=args.max_requests,
            max_spend_usd=args.max_spend_usd,
            existing_results=existing_results,
        )
        _print_summary(provider, requested_model, score)
        if not args.no_save:
            json_path, markdown_path = _save_run(
                provider=provider,
                requested_model=requested_model,
                split=args.split,
                selected_case_count=len(cases),
                metadata=metadata,
                score=score,
                max_requests=args.max_requests,
                max_spend_usd=args.max_spend_usd,
                resumed_from=resumed_from,
            )
            print(f"Results saved -> {json_path} and {markdown_path}")


if __name__ == "__main__":
    asyncio.run(main())
