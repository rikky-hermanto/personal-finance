import logging

from app.providers.base import LlmProvider
from app.models import ParseRequest, ParseResponse, TransactionResult

logger = logging.getLogger(__name__)


class LlmParseError(Exception):
    pass


# Shared extraction schema — both providers receive this exact dict.
# Gemini maps it to response_schema; Anthropic maps it to tool input_schema.
EXTRACT_SCHEMA = {
    "type": "object",
    "properties": {
        "transactions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "date":        {"type": "string", "description": "ISO 8601: YYYY-MM-DD"},
                    "description": {"type": "string"},
                    "flow":        {"type": "string", "enum": ["DB", "CR"]},
                    "amount_idr":  {"type": "number"},
                    "currency":    {"type": "string"},
                    "wallet":      {"type": "string"},
                    "raw_text":    {"type": "string"},
                },
                "required": ["date", "description", "flow", "amount_idr"],
            },
        }
    },
    "required": ["transactions"],
}

SYSTEM_PROMPT = (
    "You are a financial data extraction assistant. "
    "Extract ALL transactions from the bank statement text. "
    "Normalize dates to YYYY-MM-DD format. "
    "Use DB for debit/withdrawal, CR for credit/deposit. "
)


class LlmParser:
    def __init__(self, provider: LlmProvider) -> None:
        self._provider = provider

    async def parse(self, request: ParseRequest) -> ParseResponse:
        system = SYSTEM_PROMPT + f"Bank context: {request.bank_hint or 'unknown'}."

        try:
            result = await self._provider.extract_structured(
                system_prompt=system,
                user_text=request.text,
                schema=EXTRACT_SCHEMA,
            )
        except Exception as e:
            logger.error("LLM extraction failed: %s", e)
            raise LlmParseError(f"LLM extraction error: {e}") from e

        raw_rows = result.get("transactions", [])
        parsed, skipped = [], 0
        for row in raw_rows:
            try:
                parsed.append(TransactionResult(**row))
            except Exception as e:
                logger.warning("Skipping invalid row | row=%s | error=%s", row, e)
                skipped += 1

        logger.info("Parse complete | parsed=%d | skipped=%d", len(parsed), skipped)
        return ParseResponse(
            transactions=parsed,
            total_parsed=len(parsed),
            skipped_rows=skipped,
        )
