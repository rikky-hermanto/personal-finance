---
description: Python FastAPI AI service rules — LLM extraction patterns, structured output design, Pydantic models, cost discipline, and cross-service contract with .NET TransactionDto
globs: services/ai-service/**
---

# AI Service Development Rules (Python FastAPI)

## Cross-Service Contract with .NET API

The Python AI service is a downstream dependency of the .NET API. The .NET side calls `POST /parse`
and expects a response mapping directly to `TransactionDto` field names. NEVER rename these fields
without a corresponding change in `apps/api/src/PersonalFinance.Application/Dtos/TransactionDto.cs`.

### TransactionDto contract (frozen — see THINK-05 in governance.md)

| Python field    | .NET field      | JSON type | Notes                                  |
|-----------------|-----------------|-----------|----------------------------------------|
| `date`          | `Date`          | string    | ISO 8601 `YYYY-MM-DD` — `datetime.date` |
| `description`   | `Description`   | string    | Original bank text                     |
| `remarks`       | `Remarks`       | string    | Secondary description (may be `""`)    |
| `flow`          | `Flow`          | string    | `"DB"` (debit) or `"CR"` (credit)      |
| `type`          | `Type`          | string    | `"Expense"` or `"Income"`              |
| `amount_idr`    | `AmountIdr`     | number    | Always in IDR, positive value          |
| `currency`      | `Currency`      | string    | ISO 4217 code — default `"IDR"`        |
| `exchange_rate` | `ExchangeRate`  | number?   | FX rate (Wise only), null for IDR banks |
| `wallet`        | `Wallet`        | string    | Bank name (e.g. `"BCA"`, `"Superbank"`) |

## LLM Extraction Patterns

### Always use tool_use — never JSON mode

Claude's `tool_use` is the only supported extraction method because:
- Tool schemas are validated server-side before the response is returned
- Field types are enforced (number vs string) at the API level
- `stop_reason == "tool_use"` is unambiguous — no free-text parsing required

```python
tools = [{
    "name": "extract_transactions",
    "description": "Extract all transactions from the bank statement text",
    "input_schema": {
        "type": "object",
        "properties": {
            "transactions": {
                "type": "array",
                "items": {"$ref": "#/definitions/Transaction"}
            }
        },
        "required": ["transactions"]
    }
}]
response = await client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=4096,
    temperature=0.0,
    tools=tools,
    tool_choice={"type": "any"},  # Force tool use — never omit this
    messages=[{"role": "user", "content": prompt}]
)
```

### Always set temperature=0.0 for extraction

Extraction is deterministic — creativity introduces field hallucination.

```python
# CORRECT
response = await client.messages.create(temperature=0.0, ...)

# WRONG — never use temperature > 0 for data extraction
response = await client.messages.create(temperature=0.7, ...)
```

### Treat stop_reason == "max_tokens" as a hard error

A truncated extraction is worse than a failure — partial data creates phantom duplicates.

```python
if response.stop_reason == "max_tokens":
    raise LlmParseError(
        "Response truncated — statement too long for single extraction. "
        "Split into pages before re-extracting.",
        retriable=False
    )
```

### Pre-process PDFs before sending to LLM

Use PyMuPDF (`fitz`) to extract text before the LLM call. Reduces token cost 40–60%.

```python
import fitz  # PyMuPDF

def extract_pdf_text(pdf_bytes: bytes) -> str:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    return "\n".join(page.get_text() for page in doc)
```

**Exception:** Bank Jago screenshots MUST use Claude vision directly — there is no text layer to extract.

## Error Handling Contract

The .NET API maps these HTTP status codes to user-visible errors:

| Scenario                        | Status | Response body key         |
|---------------------------------|--------|---------------------------|
| Invalid request (missing fields) | 422   | Pydantic validation detail |
| LLM returned malformed output   | 502    | `"llm_parse_error"`       |
| Anthropic API unreachable       | 502    | `"provider_unavailable"`  |
| max_tokens truncation           | 502    | `"response_truncated"`    |
| Unexpected server error         | 500    | `"internal_error"`        |

Never return HTTP 200 with an empty transactions list when parsing fails — use 502.

## Pydantic Model Rules

- Pydantic v2 only — use `model_config = ConfigDict(...)` not v1 class `Config`
- All models: `str_strip_whitespace=True`
- Use `Decimal` not `float` for all monetary values (avoids IEEE 754 rounding)
- Date fields must validate to `datetime.date` (not raw strings)

```python
from pydantic import BaseModel, ConfigDict
from decimal import Decimal
from typing import Literal
import datetime

class TransactionResult(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    date: datetime.date
    description: str
    remarks: str = ""
    flow: Literal["DB", "CR"]
    type: Literal["Expense", "Income"]
    amount_idr: Decimal
    currency: str = "IDR"
    exchange_rate: Decimal | None = None
    wallet: str
```

## Bank-Specific Prompt Rules

Each bank has a prompt template in `app/prompts/{bank_id}_v1.py`:
- Include 2–3 real sanitized examples from the bank's actual format
- Specify the bank's date format explicitly (NeoBank: `"DD MMM YYYY"`, Superbank: `"DD/MM/YYYY"`)
- Specify the decimal convention (Indonesian: `"1.000.000,50"` → `1000000.50`)
- Clarify ambiguous field semantics (Superbank: `"Debit"` column = money out = `flow: "DB"`)

## Cost Discipline

- Log `response.usage.input_tokens` and `response.usage.output_tokens` for every LLM call
- Use `claude-haiku-4-5` for simple classification tasks (single decision, < 200 output tokens)
- Use `claude-sonnet-4-6` for full statement extraction (default for all parsers)
- Never use `claude-opus-*` in the extraction pipeline — cost is not justified for structured extraction

## Testing Rules

- Never call the real Anthropic API in tests — mock `anthropic.AsyncAnthropic`
- Use `pytest-asyncio` for all async test functions
- Every extractor must have a pytest fixture containing sanitized real bank statement text
- Explicitly test the `stop_reason == "max_tokens"` error path

```python
# Canonical mock pattern
from unittest.mock import AsyncMock, patch, MagicMock

@pytest.fixture
def mock_anthropic_client():
    tool_use_block = MagicMock()
    tool_use_block.type = "tool_use"
    tool_use_block.input = {"transactions": [...]}

    mock_response = MagicMock()
    mock_response.stop_reason = "tool_use"
    mock_response.content = [tool_use_block]
    mock_response.usage.input_tokens = 100
    mock_response.usage.output_tokens = 200

    with patch("app.services.llm_parser.anthropic.AsyncAnthropic") as mock_cls:
        instance = AsyncMock()
        instance.messages.create = AsyncMock(return_value=mock_response)
        mock_cls.return_value = instance
        yield instance
```

## Running the Service

```bash
# From repo root — activate venv, then start
cd services/ai-service
source .venv/bin/activate          # Windows: .venv\Scripts\activate
uvicorn app.main:app --reload --port 8000

# Health check
curl http://localhost:8000/health

# Run tests
pytest

# Via Docker (after docker-compose integration in PF-011)
docker compose up --build ai-service
```
