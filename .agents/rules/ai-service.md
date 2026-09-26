# Codex AI service rules

Scope: `services/ai-service/**` and its .NET extraction clients. Read service AGENTS.md.
Use pyproject.toml for runtime/dependencies and retain intentional upper bounds.

## Extraction contract

| Python extraction field | .NET DTO field | Meaning |
|---|---|---|
| date | Date | ISO date; distinguish date-only from timestamp behavior |
| description / remarks | Description / Remarks | Original and secondary bank text |
| flow | Flow | DB debit/outflow, CR credit/inflow |
| type | Type | Expense / Income hint |
| amount_idr | AmountIdr | Positive amount in IDR, flow gives direction |
| currency | Currency | Currency code |
| exchange_rate | ExchangeRate | Nullable conversion rate |
| account_name | AccountName | Transient parsed account name |
| statement_balance | StatementBalance | Nullable statement balance |

This is a review aid; inspect `app/models.py`, `app/services/llm_parser.py`,
`TransactionDto.cs`, and the .NET client mapping for the complete current contract.
Do not rename wallet fields in separate retrieval/chat models indiscriminately.

Use provider abstraction: Gemini structured JSON and Anthropic forced tool use are
both supported. Validate responses, reject truncation/malformed data, and preserve
error translation. Never turn failed parsing into HTTP 200 with fabricated empty data.
Use low-variance extraction settings when supported by the selected provider; don't
hardcode another provider's model names or parameters.

Preprocess PDFs to text where possible; use vision for content without a usable text
layer. Prompts need sanitized format examples, explicit dates/separators, debit/credit
semantics, and opening-balance/footer exclusion. Reuse the bank prompt dispatch map;
do not invent an extract/pdf route or a BankProfiles YAML system absent from code.

Pydantic v2 is current. Existing TransactionResult uses string dates and float money;
new financial calculations should use Decimal, with deliberate compatibility work
when changing serialization. Preserve async behavior, observability, bounded retries,
and token/cost measurement without exposing private statements or credentials.

Mock provider calls in pytest; cover prompt selection, generic fallback, malformed
output, truncation, and provider failures. Paid evaluations are a separate workflow.
