"""Score accepted labels, abstentions, OOV output, and operational failures separately."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from decimal import Decimal
from typing import Literal

ABSTENTION_LABEL = "Uncategorized"
Outcome = Literal["accepted", "abstained", "oov", "error"]
_ERROR_REASONS = {"provider_error", "timeout", "invalid_response"}


def accepted_labels(case: dict) -> list[str]:
    if case.get("expected_abstain"):
        return []
    if "expected_any" in case:
        return list(case["expected_any"])
    return [case["expected"]]


def case_categories(case: dict, defaults: list[str]) -> list[str]:
    return list(case.get("available_categories") or defaults)


@dataclass
class CaseResult:
    id: str
    split: str
    merchant_family: str
    predicted: str
    confidence: float
    correct: bool
    outcome: Outcome
    reason: str
    expected_abstain: bool
    winner_probability: float | None = None
    latency_ms: float = 0.0
    input_tokens: int | None = None
    output_tokens: int | None = None
    cost_usd: Decimal | None = None
    model: str | None = None
    prompt_version: str | None = None

    @property
    def out_of_vocab(self) -> bool:
        return self.outcome == "oov"

    def to_dict(self) -> dict:
        data = asdict(self)
        data["cost_usd"] = str(self.cost_usd) if self.cost_usd is not None else None
        return data

    @classmethod
    def from_dict(cls, data: dict) -> "CaseResult":
        values = dict(data)
        if values.get("cost_usd") is not None:
            values["cost_usd"] = Decimal(values["cost_usd"])
        return cls(**values)


def _percentile(values: list[float], percentile: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, int((len(ordered) - 1) * percentile + 0.5)))
    return ordered[index]


@dataclass
class CategorizeScore:
    results: list[CaseResult] = field(default_factory=list)

    @property
    def total(self) -> int:
        return len(self.results)

    @property
    def accuracy(self) -> float:
        return sum(result.correct for result in self.results) / self.total if self.total else 0.0

    @property
    def accepted(self) -> list[CaseResult]:
        return [result for result in self.results if result.outcome == "accepted"]

    @property
    def accepted_precision(self) -> float:
        return (
            sum(result.correct for result in self.accepted) / len(self.accepted)
            if self.accepted
            else 0.0
        )

    @property
    def coverage(self) -> float:
        return len(self.accepted) / self.total if self.total else 0.0

    @property
    def abstention_rate(self) -> float:
        abstained = sum(result.outcome == "abstained" for result in self.results)
        return abstained / self.total if self.total else 0.0

    @property
    def abstention_correctness(self) -> float:
        abstained = [result for result in self.results if result.outcome == "abstained"]
        return (
            sum(result.correct for result in abstained) / len(abstained)
            if abstained
            else 0.0
        )

    @property
    def oov_rate(self) -> float:
        return sum(result.outcome == "oov" for result in self.results) / self.total if self.total else 0.0

    @property
    def failure_rate(self) -> float:
        return sum(result.outcome == "error" for result in self.results) / self.total if self.total else 0.0

    @property
    def mean_confidence_correct(self) -> float:
        values = [result.confidence for result in self.accepted if result.correct]
        return sum(values) / len(values) if values else 0.0

    @property
    def mean_confidence_wrong(self) -> float:
        values = [result.confidence for result in self.accepted if not result.correct]
        return sum(values) / len(values) if values else 0.0

    @property
    def calibration_gap(self) -> float:
        return self.mean_confidence_correct - self.mean_confidence_wrong

    @property
    def p50_latency_ms(self) -> float:
        return _percentile([result.latency_ms for result in self.results], 0.50)

    @property
    def p95_latency_ms(self) -> float:
        return _percentile([result.latency_ms for result in self.results], 0.95)

    @property
    def total_cost_usd(self) -> Decimal | None:
        if not self.results or any(result.cost_usd is None for result in self.results):
            return None
        return sum((result.cost_usd for result in self.results), Decimal("0"))

    @property
    def cost_per_correct_accepted_usd(self) -> Decimal | None:
        correct_accepted = sum(result.correct for result in self.accepted)
        total_cost = self.total_cost_usd
        if total_cost is None or correct_accepted == 0:
            return None
        return total_cost / Decimal(correct_accepted)

    @property
    def failures(self) -> list[CaseResult]:
        return [result for result in self.results if not result.correct]


def score_case(
    case: dict,
    predicted: str,
    confidence: float,
    offered: list[str],
    *,
    reason: str = "accepted",
    winner_probability: float | None = None,
) -> CaseResult:
    normalized = predicted.strip().casefold()
    accepted = {label.strip().casefold() for label in accepted_labels(case)}
    offered_normalized = {category.strip().casefold() for category in offered}
    expected_abstain = bool(case.get("expected_abstain"))

    if reason in _ERROR_REASONS:
        outcome: Outcome = "error"
        correct = False
    elif normalized == ABSTENTION_LABEL.casefold():
        outcome = "abstained"
        correct = expected_abstain
    elif normalized not in offered_normalized:
        outcome = "oov"
        correct = False
    else:
        outcome = "accepted"
        correct = normalized in accepted and not expected_abstain

    return CaseResult(
        id=case["id"],
        split=case.get("split", "unspecified"),
        merchant_family=case.get("merchant_family", case["id"]),
        predicted=predicted,
        confidence=confidence,
        correct=correct,
        outcome=outcome,
        reason=reason,
        expected_abstain=expected_abstain,
        winner_probability=winner_probability,
    )
