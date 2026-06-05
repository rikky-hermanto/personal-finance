"""Score extracted transactions against ground truth.

Two axes:
  - Row level: did we extract the right SET of transactions? (precision / recall / F1)
  - Field level: for correctly-matched rows, are the fields right? (per-field accuracy)

Alignment is a matching problem: predicted rows are matched to ground-truth rows
on a natural key (date + rounded amount), the same key the .NET dedup uses.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation

# Fields we score, split by financial criticality.
CRITICAL_FIELDS = ("date", "amount_idr", "flow")
COSMETIC_FIELDS = ("description", "remarks", "type", "currency", "exchange_rate")
SCORED_FIELDS = CRITICAL_FIELDS + COSMETIC_FIELDS


# Converts any value to a whole-rupiah Decimal (sub-rupiah rounded off). Returns -1 on invalid input.
def _norm_amount(v) -> Decimal:
    try:
        return Decimal(str(v)).quantize(Decimal("1"))  # whole-rupiah tolerance
    except (InvalidOperation, TypeError):
        return Decimal("-1")


# Builds a (date, rounded_amount) tuple that identifies a transaction — mirrors the .NET dedup key.
def _row_key(tx: dict) -> tuple[str, Decimal]:
    return (str(tx.get("date", "")).strip(), _norm_amount(tx.get("amount_idr")))


# Field-aware equality: amounts use rounded decimal; text fields are case-insensitive substring-tolerant; exchange_rate treats both-null as equal; everything else uppercased string compare.
def _field_equal(field_name: str, a, b) -> bool:
    if field_name == "amount_idr":
        return _norm_amount(a) == _norm_amount(b)
    if field_name in ("description", "remarks"):
        # cosmetic text: case-insensitive, whitespace-collapsed substring tolerance
        sa = " ".join(str(a or "").lower().split())
        sb = " ".join(str(b or "").lower().split())
        return sa == sb or sa in sb or sb in sa
    if field_name == "exchange_rate":
        if a in (None, "") and b in (None, ""):
            return True
        return _norm_amount(a) == _norm_amount(b)
    return str(a or "").strip().upper() == str(b or "").strip().upper()


@dataclass
class FixtureScore:
    name: str
    matched: int = 0
    missed: int = 0          # in truth, not predicted  -> recall hit
    phantom: int = 0         # predicted, not in truth   -> precision hit
    field_correct: dict = field(default_factory=lambda: {f: 0 for f in SCORED_FIELDS})
    field_total: dict = field(default_factory=lambda: {f: 0 for f in SCORED_FIELDS})

    # Fraction of predicted rows that were real (matched / (matched + phantom)).
    @property
    def precision(self) -> float:
        denom = self.matched + self.phantom
        return self.matched / denom if denom else 0.0

    # Fraction of ground-truth rows that were found (matched / (matched + missed)).
    @property
    def recall(self) -> float:
        denom = self.matched + self.missed
        return self.matched / denom if denom else 0.0

    # Harmonic mean of precision and recall.
    @property
    def f1(self) -> float:
        p, r = self.precision, self.recall
        return 2 * p * r / (p + r) if (p + r) else 0.0

    # Fraction of field values that were correct across matched rows. Pass a subset (e.g. CRITICAL_FIELDS) to scope it.
    def field_accuracy(self, fields=SCORED_FIELDS) -> float:
        c = sum(self.field_correct[f] for f in fields)
        t = sum(self.field_total[f] for f in fields)
        return c / t if t else 0.0


# Main entry point. Aligns predicted rows to ground truth by row key; tallies matches, phantoms, misses, and per-field correctness.
def score_fixture(name: str, predicted: list[dict], truth: list[dict]) -> FixtureScore:
    s = FixtureScore(name=name)
    truth_by_key = {_row_key(t): t for t in truth}
    used = set()

    for p in predicted:
        key = _row_key(p)
        if key in truth_by_key and key not in used:
            used.add(key)
            s.matched += 1
            t = truth_by_key[key]
            for f in SCORED_FIELDS:
                s.field_total[f] += 1
                if _field_equal(f, p.get(f), t.get(f)):
                    s.field_correct[f] += 1
        else:
            s.phantom += 1

    s.missed = len(truth) - len(used)
    return s