"""Hidden acceptance suite for the plan trial. The executing model never sees this file."""
from decimal import Decimal

import pytest

from app.models import FlowType, TransactionResult
from app.services.balance_reconciler import ReconciliationResult, reconcile_balance


def t(amount, flow):
    return TransactionResult(date="2026-01-01", description="x", flow=flow, amount_idr=amount)


def test_balanced_statement():
    r = reconcile_balance([t(50, FlowType.CR), t(20, FlowType.DB)], Decimal("100"), Decimal("130"))
    assert r.balanced is True and r.difference == 0 and r.expected_closing == Decimal("130")


def test_credit_adds_debit_subtracts():
    assert reconcile_balance([t(10, FlowType.DB)], Decimal("100"), Decimal("90")).balanced is True
    assert reconcile_balance([t(10, FlowType.CR)], Decimal("100"), Decimal("110")).balanced is True


def test_difference_is_closing_minus_expected():
    r = reconcile_balance([t(50, FlowType.CR)], Decimal("100"), Decimal("140"))
    assert r.difference == Decimal("-10") and r.balanced is False


def test_float_amounts_stay_exact():
    r = reconcile_balance([t(0.1, FlowType.CR), t(0.2, FlowType.CR)], Decimal("0"), Decimal("0.3"))
    assert r.expected_closing == Decimal("0.3") and r.balanced is True


def test_many_small_floats_do_not_drift():
    r = reconcile_balance([t(0.1, FlowType.CR)] * 1000, Decimal("0"), Decimal("100"))
    assert r.expected_closing == Decimal("100") and r.balanced is True


def test_empty_statement():
    r = reconcile_balance([], Decimal("5"), Decimal("5"))
    assert r.expected_closing == Decimal("5") and r.balanced is True


def test_tolerance_boundary_is_inclusive():
    assert reconcile_balance([], Decimal("100"), Decimal("101"), tolerance=Decimal("1")).balanced is True
    assert reconcile_balance([], Decimal("100"), Decimal("99"), tolerance=Decimal("1")).balanced is True


def test_outside_tolerance_is_not_balanced():
    assert reconcile_balance([], Decimal("100"), Decimal("102"), tolerance=Decimal("1")).balanced is False


def test_default_tolerance_is_zero():
    assert reconcile_balance([], Decimal("100"), Decimal("100.01")).balanced is False


def test_negative_tolerance_raises():
    with pytest.raises(ValueError):
        reconcile_balance([], Decimal("0"), Decimal("0"), tolerance=Decimal("-1"))


def test_result_fields_are_decimal():
    r = reconcile_balance([t(1.5, FlowType.CR)], Decimal("0"), Decimal("1.5"))
    assert isinstance(r, ReconciliationResult)
    assert isinstance(r.expected_closing, Decimal) and isinstance(r.difference, Decimal)


def test_project_pydantic_rule_followed():
    """Stated only in .claude/rules/ai-service.md, not in plan B and not shown by TransactionResult."""
    assert ReconciliationResult.model_config.get("str_strip_whitespace") is True
