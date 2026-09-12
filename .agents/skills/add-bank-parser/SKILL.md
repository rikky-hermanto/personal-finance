---
name: add-bank-parser
description: "Add a deterministic bank parser or bank signature to Personal Finance, or route an unstructured bank format to its AI extractor. Use when supporting a new bank statement format."
---

# add-bank-parser

Read [shared Codex workflow conventions](../../WORKFLOWS.md) before using this skill.

Read API and AI rules. Inspect actual bank samples (sanitize personal data), BankKeys,
BankProbeContext, CsvTokenizer, IBankSignature, BankIdentifier, parser implementations,
and Program.cs registrations. Decide from the actual format whether deterministic
parsing is reliable; CSV and fixed-layout PDFs can both be deterministic.

For a direct parser: add a bank key when missing, a content-type-aware signature,
and an IBankStatementParser implementation using the current interface. Match unique
headers/first-page markers, not generic bank words. Check scan limits against sample
headers; order specific signatures before generic fallbacks. Register the concrete
parser, import-service mapping, and signature using the existing DI structure.
Do not edit the central identifier just to add another bank.

Map Date, Description, Remarks, Flow, Type, AmountIdr, Currency, AccountName, and
optional statement balances from the current DTO. Preserve original text, locale
decimal conventions, positive amounts plus DB/CR direction, and date semantics.
Run existing validation/deduplication and batch categorization once per operation.

For unstructured output: verify existing detection/routing first, then use the
add-llm-extractor skill. Do not assume every PDF needs LLM processing or invent
a bank-profile configuration subsystem.

Tests must cover real sanitized headers/rows, negative signature matches, fallback
ordering, scan boundaries, missing fields, amount/date edge cases, and correct
routing. Inspect existing BankSignatureTests and parser tests for current patterns.
Verify upload preview locally when requested and available; submitting transactions
or calling paid extraction needs the actual task's authorization. Report checks and
remaining integration work.
