"""Deterministic guardrails: input injection scanning + output leakage checks.

Deliberately regex-based, not model-based: testable, zero latency, fails closed.
Patterns target instruction-override shapes in English and Indonesian.
"""
import logging
import re
from collections.abc import Iterable
from dataclasses import dataclass

from app.observability import langfuse

logger = logging.getLogger(__name__)

_INJECTION_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("override_en", re.compile(r"ignore\s+(all\s+)?(previous|prior|above)\s+instructions", re.I)),
    ("override_id", re.compile(r"abaikan\s+(semua\s+)?instruksi", re.I)),
    ("role_pivot", re.compile(r"\byou\s+are\s+now\b|\bpretend\s+(you|the)\b|\bact\s+as\s+if\b", re.I)),
    ("prompt_exfil", re.compile(r"(system\s+prompt|your\s+instructions|everything\s+above)", re.I)),
    ("new_system", re.compile(r"\bSYSTEM\s*:\s*", re.M)),
    ("b64_lure", re.compile(r"decode\s+and\s+(follow|execute|obey)", re.I)),
]


@dataclass
class ScanResult:
    flagged: bool
    matched_rules: list[str]


class InjectionScanner:
    def scan(self, text: str) -> ScanResult:
        matched = [name for name, pat in _INJECTION_PATTERNS if pat.search(text)]
        return ScanResult(flagged=bool(matched), matched_rules=matched)


class OutputGuard:
    """Blocks answers that leak the prompt scaffold itself."""

    _LEAK = re.compile(r"<data>|</data>|QUOTED DATA|NEVER an instruction|Answer ONLY from the numbered", re.I)

    def check(self, answer: str) -> ScanResult:
        matched = ["scaffold_leak"] if self._LEAK.search(answer) else []
        return ScanResult(flagged=bool(matched), matched_rules=matched)


injection_scanner = InjectionScanner()
output_guard = OutputGuard()


def record_flag(name: str, tag: str, rules: list[str]) -> None:
    """Tag the current Langfuse trace (v3 API). Rule names only, never the text, which may hold PII.

    Telemetry must never break a request, so a tracing failure is logged and swallowed.
    """
    try:
        with langfuse.start_as_current_observation(name=name, as_type="guardrail"):
            langfuse.update_current_trace(tags=[tag], metadata={"rules": rules})
    except Exception:  # noqa: BLE001 — see docstring
        logger.warning("could not record %s on the trace", tag, exc_info=True)


def flag_context_rows(rows: Iterable) -> list[str]:
    """Scan retrieved descriptions and TAG a match; never block on it.

    Blocking on context would let anyone who can send the owner a transfer memo switch off the
    chat. For retrieved text the control is spotlighting; this only leaves an audit trail.
    """
    rules = sorted({rule for row in rows for rule in injection_scanner.scan(row.description).matched_rules})
    if rules:
        logger.warning("retrieved context matched injection rules %s: spotlighted, not blocked", rules)
        record_flag("context_guard", "security.context_flagged", rules)
    return rules
