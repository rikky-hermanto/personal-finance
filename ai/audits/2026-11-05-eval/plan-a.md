# PF-999 — Balance reconciliation check for parsed statements

> **Status:** To Do
> **Started:** 2026-11-05

## Objective

After extraction we cannot tell whether a statement was misread. Add a pure helper that checks opening balance plus credits minus debits against the closing balance.

## Acceptance Criteria

- [ ] `services/ai-service/app/services/balance_reconciler.py` exists as specified below
- [ ] `services/ai-service/tests/test_balance_reconciler.py` exists and passes

## Approach

A pure function with no I/O, so it can run on any parsed result. Wiring it into an endpoint is out of scope.

## Affected Files

| File | Change |
|------|--------|
| `services/ai-service/app/services/balance_reconciler.py` | Create |
| `services/ai-service/tests/test_balance_reconciler.py` | Create |

---

## TODO

### [ ] STEP 1 — Create the reconciler

Create `services/ai-service/app/services/balance_reconciler.py` with exactly this content:

```python
"""Balance reconciliation: does a parsed statement add up?

Pure logic, no I/O. Money stays Decimal end to end (FIN-01).
"""
from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.models import FlowType, TransactionResult


class ReconciliationResult(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    expected_closing: Decimal
    difference: Decimal
    balanced: bool


def _to_decimal(value: float) -> Decimal:
    # str() gives the shortest round-trip form, so 0.1 stays 0.1 with no binary noise.
    return Decimal(str(value))


def reconcile_balance(
    transactions: list[TransactionResult],
    opening_balance: Decimal,
    closing_balance: Decimal,
    tolerance: Decimal = Decimal("0"),
) -> ReconciliationResult:
    if tolerance < 0:
        raise ValueError("tolerance must not be negative")

    expected = opening_balance
    for transaction in transactions:
        amount = _to_decimal(transaction.amount_idr)
        expected += amount if transaction.flow == FlowType.CR else -amount

    difference = closing_balance - expected
    return ReconciliationResult(
        expected_closing=expected,
        difference=difference,
        balanced=abs(difference) <= tolerance,
    )
```

> **Why:** `amount_idr` arrives as a float, so summing it directly would drift.
> **Check:** the file imports without error.

### [ ] STEP 2 — Add the tests

Create `services/ai-service/tests/test_balance_reconciler.py` with exactly this content:

```python
"""Unit tests for reconcile_balance. Pure logic, no mocks needed."""
from decimal import Decimal

import pytest

from app.models import FlowType, TransactionResult
from app.services.balance_reconciler import reconcile_balance


def _txn(amount: float, flow: FlowType) -> TransactionResult:
    return TransactionResult(date="2026-01-01", description="x", flow=flow, amount_idr=amount)


def test_reconcile_balance_matching_statement_is_balanced():
    result = reconcile_balance([_txn(50, FlowType.CR), _txn(20, FlowType.DB)], Decimal("100"), Decimal("130"))
    assert result.balanced is True
    assert result.difference == Decimal("0")


def test_reconcile_balance_float_amounts_stay_exact():
    result = reconcile_balance([_txn(0.1, FlowType.CR), _txn(0.2, FlowType.CR)], Decimal("0"), Decimal("0.3"))
    assert result.expected_closing == Decimal("0.3")
    assert result.balanced is True


def test_reconcile_balance_negative_tolerance_raises():
    with pytest.raises(ValueError):
        reconcile_balance([], Decimal("0"), Decimal("0"), tolerance=Decimal("-1"))
```

> **Why:** these pin the behaviour that would otherwise fail silently.
> **Check:** `python -m pytest tests/test_balance_reconciler.py -q` from `services/ai-service` reports 3 passed.

---

## Notes

Keep the change to these two files.
