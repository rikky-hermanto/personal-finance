from evals.scoring_categorize import (
    CategorizeScore, accepted_labels, case_categories, score_case,
)

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
