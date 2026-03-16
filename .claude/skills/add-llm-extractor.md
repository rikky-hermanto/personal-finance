# Skill: add-llm-extractor

Scaffold a new bank's LLM extractor in the Python AI service. This is the AI service equivalent of `/add-bank-parser` for the .NET side.

**Before starting:** Confirm this bank cannot use a direct CSV parser (THINK-01 in governance.md). If the bank provides CSV output, implement `IBankStatementParser` in .NET instead.

## Steps

### 1. Create the prompt template

Create `services/ai-service/app/prompts/{bank_id}_v1.py`:

```python
# Example: app/prompts/superbank_v1.py

SYSTEM_PROMPT = """You are extracting transactions from a Superbank bank statement.

Date format: DD/MM/YYYY (e.g. "15/03/2025")
Decimal convention: Indonesian (1.000.000,50 means 1,000,000.50 IDR)
"Debit" column = money OUT = flow "DB"
"Credit" column = money IN = flow "CR"

Example transaction row:
  Date: 15/03/2025
  Description: TRANSFER TO JOHN DOE
  Debit: 500.000,00
  Credit: -
  → flow: "DB", amount_idr: 500000.00
"""

USER_PROMPT_TEMPLATE = """Extract all transactions from this Superbank statement:

{text}
"""
```

**Rules for the prompt:**
- Include 2–3 real sanitized examples showing the bank's actual format
- Specify the date format explicitly
- Specify the decimal/thousands separator convention
- Clarify any ambiguous column semantics (which column is debit vs credit)

### 2. Define the tool_use schema

In `services/ai-service/app/services/llm_parser.py` (or a new `{bank_id}_extractor.py`), define the extraction tool:

```python
EXTRACT_TOOL = {
    "name": "extract_transactions",
    "description": "Extract all transactions from the bank statement text",
    "input_schema": {
        "type": "object",
        "properties": {
            "transactions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "date": {"type": "string", "description": "YYYY-MM-DD"},
                        "description": {"type": "string"},
                        "remarks": {"type": "string"},
                        "flow": {"type": "string", "enum": ["DB", "CR"]},
                        "type": {"type": "string", "enum": ["Expense", "Income"]},
                        "amount_idr": {"type": "number"},
                        "currency": {"type": "string"},
                        "exchange_rate": {"type": ["number", "null"]},
                        "wallet": {"type": "string"}
                    },
                    "required": ["date", "description", "flow", "type", "amount_idr", "wallet"]
                }
            }
        },
        "required": ["transactions"]
    }
}
```

**Before writing this schema**, list every field with its JSON type, an example value from the bank's actual output, and the corresponding `TransactionDto` field name (THINK-03 in governance.md).

### 3. Add bank detection in the router

In `services/ai-service/app/routers/extract.py`, add a case for the new bank:

```python
@router.post("/extract/pdf")
async def extract_pdf(bank_id: str, file: UploadFile):
    match bank_id:
        case "superbank":
            from app.prompts.superbank_v1 import SYSTEM_PROMPT, USER_PROMPT_TEMPLATE
        case "neobank":
            from app.prompts.neobank_v1 import SYSTEM_PROMPT, USER_PROMPT_TEMPLATE
        case "your_new_bank":  # ← add here
            from app.prompts.your_new_bank_v1 import SYSTEM_PROMPT, USER_PROMPT_TEMPLATE
        case _:
            raise HTTPException(status_code=400, detail=f"Unknown bank_id: {bank_id}")
    ...
```

### 4. Add the bank profile YAML (in .NET)

Create `apps/api/src/PersonalFinance.Infrastructure/BankProfiles/{bank_id}.yaml`:

```yaml
bank_id: your_bank_id
display_name: "Your Bank Name"
format: pdf          # or: image
parser: llm_extraction
currency: "IDR"
llm_prompt_template: "your_bank_id_v1"
extraction_model: "claude-sonnet-4-6"
```

### 5. Write the pytest fixture and tests

Create `services/ai-service/tests/test_{bank_id}_extractor.py`:

```python
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from decimal import Decimal
import datetime

# Real (sanitized) statement text — replace with actual bank sample
SAMPLE_STATEMENT = """
Date        Description                  Debit          Credit
15/03/2025  TRANSFER TO JOHN DOE         500.000,00     -
16/03/2025  SALARY PAYMENT               -              5.000.000,00
"""

@pytest.fixture
def mock_anthropic_response():
    tool_block = MagicMock()
    tool_block.type = "tool_use"
    tool_block.input = {
        "transactions": [
            {
                "date": "2025-03-15",
                "description": "TRANSFER TO JOHN DOE",
                "remarks": "",
                "flow": "DB",
                "type": "Expense",
                "amount_idr": 500000.00,
                "currency": "IDR",
                "exchange_rate": None,
                "wallet": "YourBank"
            }
        ]
    }
    response = MagicMock()
    response.stop_reason = "tool_use"
    response.content = [tool_block]
    response.usage.input_tokens = 150
    response.usage.output_tokens = 80
    return response

@pytest.mark.asyncio
async def test_extract_happy_path(mock_anthropic_response):
    with patch("app.services.llm_parser.anthropic.AsyncAnthropic") as mock_cls:
        instance = AsyncMock()
        instance.messages.create = AsyncMock(return_value=mock_anthropic_response)
        mock_cls.return_value = instance

        # Call your extractor
        result = await extract_transactions(SAMPLE_STATEMENT, bank_id="your_bank")

        assert len(result) == 1
        assert result[0].flow == "DB"
        assert result[0].amount_idr == Decimal("500000.00")
        assert result[0].date == datetime.date(2025, 3, 15)

@pytest.mark.asyncio
async def test_extract_max_tokens_raises():
    """Truncated responses must raise, not return partial data."""
    truncated_response = MagicMock()
    truncated_response.stop_reason = "max_tokens"

    with patch("app.services.llm_parser.anthropic.AsyncAnthropic") as mock_cls:
        instance = AsyncMock()
        instance.messages.create = AsyncMock(return_value=truncated_response)
        mock_cls.return_value = instance

        with pytest.raises(LlmParseError, match="truncated"):
            await extract_transactions(SAMPLE_STATEMENT, bank_id="your_bank")
```

### 6. End-to-end smoke test

With the service running (`/run-ai-service`):

```bash
curl -X POST http://localhost:8000/extract/pdf \
  -F "file=@path/to/real_statement.pdf" \
  -F "bank_id=your_bank_id" | python -m json.tool
```

Verify: correct number of transactions, correct flow direction, correct amount values.

### 7. Checklist before committing

- [ ] Prompt template created in `app/prompts/{bank_id}_v1.py`
- [ ] Tool schema fields verified against `TransactionDto.cs` (THINK-03)
- [ ] Bank case added to router
- [ ] Bank profile YAML created in .NET `BankProfiles/`
- [ ] Tests pass: `pytest tests/test_{bank_id}_extractor.py -v`
- [ ] No real Anthropic API calls in tests (all mocked)
- [ ] `temperature=0.0` set on LLM call
- [ ] `stop_reason == "max_tokens"` error path tested

## Related

- Rules: `.claude/rules/ai-service.md`
- .NET equivalent: `/add-bank-parser`
- Start service: `/run-ai-service`
