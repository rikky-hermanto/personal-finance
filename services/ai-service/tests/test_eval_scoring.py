from evals.scoring import score_fixture, CRITICAL_FIELDS

TRUTH = [
    {"date": "2024-03-14", "description": "GOPAY", "flow": "DB", "amount_idr": 500000.0, "type": "Expense"},
    {"date": "2024-03-15", "description": "SALARY", "flow": "CR", "amount_idr": 9000000.0, "type": "Income"},
]


def test_perfect_extraction_scores_one():
    s = score_fixture("t", TRUTH, TRUTH)
    assert s.f1 == 1.0
    assert s.field_accuracy(CRITICAL_FIELDS) == 1.0


def test_missed_row_drops_recall():
    s = score_fixture("t", TRUTH[:1], TRUTH)  # predicted only 1 of 2
    assert s.recall == 0.5
    assert s.precision == 1.0
    assert s.missed == 1


def test_phantom_row_drops_precision():
    extra = TRUTH + [{"date": "2024-03-16", "description": "GHOST", "flow": "DB", "amount_idr": 1.0}]
    s = score_fixture("t", extra, TRUTH)
    assert s.recall == 1.0
    assert s.precision < 1.0
    assert s.phantom == 1


def test_amount_formatting_tolerated():
    pred = [{"date": "2024-03-14", "description": "GOPAY", "flow": "DB", "amount_idr": "500000.00"}]
    s = score_fixture("t", pred, TRUTH[:1])
    assert s.matched == 1  # string "500000.00" matches float 500000.0


def test_flow_flip_caught_as_critical_error():
    pred = [{"date": "2024-03-14", "description": "GOPAY", "flow": "CR", "amount_idr": 500000.0}]
    s = score_fixture("t", pred, TRUTH[:1])
    assert s.matched == 1                       # same date+amount -> matched
    assert s.field_accuracy(("flow",)) == 0.0   # but flow is wrong
