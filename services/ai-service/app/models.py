from enum import Enum
from pydantic import BaseModel, Field


class FlowType(str, Enum):
    DB = "DB"   # Debit / withdrawal
    CR = "CR"   # Credit / deposit


class TransactionResult(BaseModel):
    date: str                            # ISO 8601: YYYY-MM-DD
    description: str
    flow: FlowType
    amount_idr: float
    currency: str = "IDR"
    wallet: str = ""
    category: str = "Untracked Expense"  # .NET ICategoryRuleService re-categorizes this
    raw_text: str = ""                   # original line from bank statement (for audit)


class ParseRequest(BaseModel):
    text: str = Field(..., min_length=1)
    bank_hint: str | None = None         # e.g. "bca", "neobank" — used in system prompt


class ParseResponse(BaseModel):
    transactions: list[TransactionResult]
    total_parsed: int
    skipped_rows: int = 0                # rows that failed Pydantic validation


class HealthResponse(BaseModel):
    status: str
    version: str
