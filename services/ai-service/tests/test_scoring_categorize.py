from evals.scoring_categorize import (
    CategorizeScore, accepted_labels, case_categories, score_case,
)
from decimal import Decimal

DEFAULTS = ["Food & Dining", "Transport", "Groceries"]


def test_score_case_exact_match_is_correct():
    # Arrange
    case = {"id": "a", "expected": "Transport"}
    # Act
    r = score_case(case, "Transport", 0.9, DEFAULTS)
    # Assert
    assert r.correct
    assert not r.out_of_vocab


def test_score_case_casing_difference_still_correct():
    # Arrange
    case = {"id": "a", "expected": "Transport"}
    # Act
    r = score_case(case, "transport", 0.9, DEFAULTS)
    # Assert
    assert r.correct


def test_score_case_expected_any_accepts_either_label():
    # Arrange
    case = {"id": "a", "expected_any": ["Groceries", "Shopping"]}
    # Act
    r = score_case(case, "Shopping", 0.6, DEFAULTS + ["Shopping"])
    # Assert
    assert r.correct


def test_score_case_invented_category_flagged_out_of_vocab():
    # Arrange
    case = {"id": "a", "expected": "Transport"}
    # Act
    r = score_case(case, "Ride Hailing", 0.8, DEFAULTS)
    # Assert
    assert not r.correct
    assert r.out_of_vocab


def test_case_categories_prefers_per_case_override():
    # Arrange
    case = {"id": "a", "available_categories": ["Health"]}
    # Act
    offered = case_categories(case, DEFAULTS)
    # Assert
    assert offered == ["Health"]


def test_calibration_gap_positive_when_confident_only_on_correct():
    # Arrange
    s = CategorizeScore()
    s.results.append(score_case({"id": "a", "expected": "Transport"}, "Transport", 0.9, DEFAULTS))
    s.results.append(score_case({"id": "b", "expected": "Transport"}, "Groceries", 0.3, DEFAULTS))
    # Act
    gap = s.calibration_gap
    # Assert
    assert s.accuracy == 0.5
    assert gap > 0


def test_expected_abstention_is_distinct_from_oov_and_error():
    case = {"id": "none", "expected_abstain": True}

    abstained = score_case(case, "Uncategorized", 0.0, DEFAULTS, reason="no_match")
    errored = score_case(case, "Uncategorized", 0.0, DEFAULTS, reason="provider_error")
    oov = score_case(case, "Invented", 0.9, DEFAULTS)

    assert abstained.outcome == "abstained"
    assert abstained.correct
    assert errored.outcome == "error"
    assert not errored.correct
    assert oov.outcome == "oov"
    assert oov.out_of_vocab


def test_score_reports_precision_coverage_latency_and_cost_per_correct_accept():
    score = CategorizeScore()
    accepted = score_case(
        {"id": "a", "expected": "Transport"},
        "Transport",
        0.9,
        DEFAULTS,
    )
    accepted.latency_ms = 10
    accepted.cost_usd = Decimal("0.000002")
    abstained = score_case(
        {"id": "b", "expected_abstain": True},
        "Uncategorized",
        0.0,
        DEFAULTS,
        reason="no_match",
    )
    abstained.latency_ms = 30
    abstained.cost_usd = Decimal("0.000001")
    score.results.extend([accepted, abstained])

    assert score.accepted_precision == 1.0
    assert score.coverage == 0.5
    assert score.abstention_correctness == 1.0
    assert score.failure_rate == 0.0
    assert score.p50_latency_ms == 30
    assert score.p95_latency_ms == 30
    assert score.total_cost_usd == Decimal("0.000003")
    assert score.cost_per_correct_accepted_usd == Decimal("0.000003")


def test_unknown_usage_does_not_become_measured_zero_cost():
    score = CategorizeScore()
    result = score_case(
        {"id": "a", "expected": "Transport"},
        "Transport",
        0.9,
        DEFAULTS,
    )
    result.cost_usd = None
    score.results.append(result)

    assert score.total_cost_usd is None
    assert score.cost_per_correct_accepted_usd is None


def test_case_result_decimal_cost_round_trips_through_artifact_dict():
    result = score_case(
        {"id": "a", "expected": "Transport"},
        "Transport",
        0.9,
        DEFAULTS,
    )
    result.cost_usd = Decimal("0.00000125")

    restored = type(result).from_dict(result.to_dict())

    assert restored.cost_usd == Decimal("0.00000125")
