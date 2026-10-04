from decimal import Decimal

import pytest

from evals.eval_categorize import (
    _load,
    _load_resume,
    _legacy_cost,
    _save_run,
    _select_cases,
    _validate_live_budget,
    list_cases,
)
from evals.scoring_categorize import CategorizeScore, score_case


def test_versioned_dataset_has_tuning_and_one_hundred_heldout_cases_without_family_leakage():
    metadata, defaults, cases = _load()

    assert metadata["version"] == "pf-141-v1"
    assert len(defaults) == 16
    assert len(_select_cases(cases, "tuning", None)) == 20
    assert len(_select_cases(cases, "holdout", None)) == 100
    assert len(cases) == 120
    assert len({case["id"] for case in cases}) == 120
    family_splits = {
        family: {case["split"] for case in cases if case["merchant_family"] == family}
        for family in {case["merchant_family"] for case in cases}
    }
    assert all(len(splits) == 1 for splits in family_splits.values())


def test_dataset_contains_required_adversarial_and_boundary_cases():
    _, _, cases = _load()
    by_id = {case["id"]: case for case in cases}

    assert by_id["transfer_in_01"]["flow"] == "CR"
    assert by_id["transfer_out_01"]["flow"] == "DB"
    assert by_id["edge_01"]["description"].startswith("TOKO SERBAGUNA")
    assert by_id["edge_02"]["description"].startswith("REFUND TOKO SERBAGUNA")
    assert "☕" in by_id["edge_03"]["description"]
    assert by_id["edge_04"]["available_categories"] == ["cat_000", "n000", "Subscriptions"]
    assert by_id["no_fit_05"]["expected_abstain"] is True
    assert by_id["edge_05"]["description"] == ""
    assert by_id["edge_05"]["expected_abstain"] is True


def test_list_is_offline_and_can_filter_without_provider_construction(capsys):
    list_cases("holdout", "edge_04")

    output = capsys.readouterr().out
    assert "selected=1 split=holdout" in output
    assert "edge_04" in output
    assert "scoped vocab" in output


@pytest.mark.parametrize(
    ("confirmed", "max_requests", "max_spend", "message"),
    [
        (False, 1, Decimal("0.01"), "confirm-live"),
        (True, None, Decimal("0.01"), "max-requests"),
        (True, 0, Decimal("0.01"), "max-requests"),
        (True, 1, None, "max-spend-usd"),
        (True, 1, Decimal("0"), "max-spend-usd"),
    ],
)
def test_live_evaluation_requires_explicit_request_and_spend_budgets(
    confirmed,
    max_requests,
    max_spend,
    message,
):
    with pytest.raises(ValueError, match=message):
        _validate_live_budget(
            confirmed=confirmed,
            max_requests=max_requests,
            max_spend_usd=max_spend,
        )


def test_unknown_baseline_model_usage_is_not_reported_as_zero_cost():
    assert _legacy_cost("unknown-model", {"input": 100, "output": 10}) is None
    assert _legacy_cost("unknown-model", {"input": 0, "output": 0}) == Decimal("0.0")


def test_unique_artifacts_are_resumable_and_validate_dataset_identity(tmp_path):
    metadata, defaults, cases = _load()
    selected = _select_cases(cases, "holdout", "ride_01")
    result = score_case(
        selected[0],
        "Transportation",
        0.9,
        defaults,
    )
    result.cost_usd = Decimal("0.000001")
    result.model = "jev-1.13.0"
    result.prompt_version = "jev-categorizer-v1"
    score = CategorizeScore(results=[result])

    first_json, first_markdown = _save_run(
        provider="jev",
        requested_model="jev-1.13.0",
        split="holdout",
        selected_case_count=1,
        metadata=metadata,
        score=score,
        max_requests=1,
        max_spend_usd=Decimal("0.01"),
        output_dir=tmp_path,
    )
    second_json, _ = _save_run(
        provider="jev",
        requested_model="jev-1.13.0",
        split="holdout",
        selected_case_count=1,
        metadata=metadata,
        score=score,
        max_requests=1,
        max_spend_usd=Decimal("0.01"),
        output_dir=tmp_path,
    )

    restored, run_id = _load_resume(
        first_json,
        provider="jev",
        requested_model="jev-1.13.0",
        metadata=metadata,
        split="holdout",
    )

    assert first_json != second_json
    assert first_json.exists()
    assert first_markdown.exists()
    assert run_id in first_json.name
    assert restored[0].id == "ride_01"
    assert restored[0].cost_usd == Decimal("0.000001")
