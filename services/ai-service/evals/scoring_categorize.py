"""Score categorization predictions against expected labels.

Three axes, deliberately kept separate:
  - Accuracy          : did the model pick an acceptable category?
  - OOV rate          : did it invent a category outside available_categories?
  - Calibration gap   : mean confidence when right minus mean confidence when wrong.

A model can be 80% accurate and still be useless if its confidence is flat —
the 4-layer categorization engine (PF-103) uses confidence to decide whether to
accept the LLM's answer, so a model that is equally confident when wrong is a
worse production dependency than a less accurate but well-calibrated one.
"""
from __future__ import annotations
from dataclasses import dataclass, field


def accepted_labels(case: dict) -> list[str]:
    """The set of categories that count as correct for this case."""
    if "expected_any" in case:
        return list(case["expected_any"])
    return [case["expected"]]


def case_categories(case: dict, defaults: list[str]) -> list[str]:
    """The category list offered to the model for this case."""
    return list(case.get("available_categories") or defaults)


@dataclass
class CaseResult:
    id: str
    predicted: str
    confidence: float
    correct: bool
    out_of_vocab: bool
    latency_ms: float = 0.0
    cost_usd: float = 0.0


@dataclass
class CategorizeScore:
    results: list[CaseResult] = field(default_factory=list)

    @property
    def total(self) -> int:
        return len(self.results)

    @property
    def accuracy(self) -> float:
        return sum(r.correct for r in self.results) / self.total if self.total else 0.0

    @property
    def oov_rate(self) -> float:
        """Fraction of predictions that were not in the offered category list."""
        return sum(r.out_of_vocab for r in self.results) / self.total if self.total else 0.0

    @property
    def mean_confidence_correct(self) -> float:
        vals = [r.confidence for r in self.results if r.correct]
        return sum(vals) / len(vals) if vals else 0.0

    @property
    def mean_confidence_wrong(self) -> float:
        vals = [r.confidence for r in self.results if not r.correct]
        return sum(vals) / len(vals) if vals else 0.0

    @property
    def calibration_gap(self) -> float:
        """Positive = model is more confident when right. Near zero = confidence is noise."""
        return self.mean_confidence_correct - self.mean_confidence_wrong

    @property
    def failures(self) -> list[CaseResult]:
        return [r for r in self.results if not r.correct]


def score_case(case: dict, predicted: str, confidence: float,
               offered: list[str]) -> CaseResult:
    norm = predicted.strip().casefold()
    accepted = {a.strip().casefold() for a in accepted_labels(case)}
    offered_norm = {c.strip().casefold() for c in offered}
    return CaseResult(
        id=case["id"],
        predicted=predicted,
        confidence=confidence,
        correct=norm in accepted,
        out_of_vocab=norm not in offered_norm,
    )
