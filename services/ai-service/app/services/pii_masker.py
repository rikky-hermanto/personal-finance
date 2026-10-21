"""Masks Indonesian PII identifier classes in LLM-bound text.

Scope: unambiguous identifiers only (NIK, phone, account numbers, email).
Person/merchant names deliberately NOT masked — indistinguishable without NER,
and a wrong mask destroys categorization signal. Residual risk documented in
docs/security/ai-threat-model.md.
"""
import re

_RULES: list[tuple[str, re.Pattern[str], str]] = [
    # NIK: exactly 16 digits, optionally after an explicit label
    ("nik", re.compile(r"\b(?:NIK\s*:?\s*)?\d{16}\b"), "[NIK]"),
    # Indonesian mobile: +62 / 62 / 08 prefix, 9-13 digits total.
    # (?<!\w) not \b: \b cannot sit before "+", so \b\+?62 would leave a stray "+" behind.
    ("phone", re.compile(r"(?<!\w)(?:\+62|62|0)8\d{2}[\s-]?\d{3,4}[\s-]?\d{3,5}\b"), "[PHONE]"),
    # Account numbers: 10-15 digits following an account cue word
    ("account", re.compile(r"\b(?:rek(?:ening)?|acct?|a/?c|norek)\s*\.?\s*:?\s*\d{10,15}\b", re.I), "[ACCOUNT]"),
    ("email", re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.]+\b"), "[EMAIL]"),
]


def mask_pii(text: str) -> str:
    for _name, pattern, placeholder in _RULES:
        text = pattern.sub(placeholder, text)
    return text
