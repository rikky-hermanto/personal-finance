# PF-999 — Balance reconciliation check for parsed statements

> **Status:** To Do
> **Started:** 2026-11-05

## Objective

After extraction we cannot tell whether a statement was misread. Add a pure helper that checks opening balance plus credits minus debits against the closing balance.

## Acceptance Criteria

- [ ] `reconcile_balance(transactions, opening_balance, closing_balance, tolerance=Decimal("0"))` in `app/services/balance_reconciler.py` returns a `ReconciliationResult` model with `expected_closing`, `difference` (closing minus expected) and `balanced`
- [ ] Credits add to the opening balance and debits subtract from it
- [ ] Totals are exact: 0.1 and 0.2 credited from 0 give `expected_closing == Decimal("0.3")` and are balanced against a closing balance of 0.3
- [ ] A statement is balanced when the absolute difference is at most the tolerance
- [ ] A negative tolerance raises `ValueError`
- [ ] Tests cover the above and pass

## Approach

A pure function with no I/O, so it can run on any parsed result. Wiring it into an endpoint is out of scope. Follow the project's rules for models and money.

## References

| Look at | For |
|---------|-----|
| `services/ai-service/app/models.py` | `TransactionResult`, `FlowType` |
| `services/ai-service/app/services/aggregator.py` | How money is handled in a service |
| `services/ai-service/tests/test_aggregator.py` | Test style |

## Affected Files

| File | Change |
|------|--------|
| `services/ai-service/app/services/balance_reconciler.py` | Create |
| `services/ai-service/tests/test_balance_reconciler.py` | Create |

---

## TODO

### [ ] STEP 1 — Build the reconciler and its tests

> **Check:** `python -m pytest tests/test_balance_reconciler.py -q` from `services/ai-service` passes, and every acceptance criterion is covered.

---

## Notes

Keep the change to these two files.
