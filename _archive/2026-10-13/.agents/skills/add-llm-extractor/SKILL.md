---
name: add-llm-extractor
description: "Implement a bank-specific structured extractor using Personal Finance's existing Gemini and Anthropic provider abstraction, prompt dispatch, and cross-service contract."
---

# add-llm-extractor

Read [shared Codex workflow conventions](../../WORKFLOWS.md) before using this skill.

Read AI rules and service instructions. First confirm direct parsing is not reliable.
Inspect app/services/llm_parser.py, app/models.py, app/providers/, and existing bank
prompts/tests. Use the actual parse/parse-pdf/parse-image routes and dispatch structure;
do not scaffold obsolete extract/pdf routes or unimplemented BankProfiles YAML.

Write a versioned bank prompt with 2–3 sanitized format examples, date/period rules,
decimal/thousands separators, debit/credit column semantics, account-name extraction,
remarks, opening-balance/footer exclusions, and image/PDF considerations.
Register it in the existing bank prompt dispatch map. Check .NET bank hints and
routing; use add-bank-parser if signatures or DI mappings are missing.

Before altering the shared extraction schema, record each field's JSON type,
sanitized example, and corresponding TransactionDto/client mapping. Reuse the shared
schema where possible. Extraction uses account_name; independent chat/retrieval
wallet fields are separate contracts. Coordinate all producers and consumers.

Preserve Gemini structured JSON and Anthropic forced tool use. Reject malformed or
truncated responses, preserve provider/error mapping, bound retries, and retain
token/latency observability. Use configured models rather than a hardcoded Claude tier.

Mock providers in tests. Cover bank prompt selection, generic fallback, exact field
semantics, malformed output, truncation, provider failure, and optional balances.
Run targeted pytest and affected API tests. Report real-provider smoke tests as not
run unless authorized; do not upload personal statements merely to validate a skill.
