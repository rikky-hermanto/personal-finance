from enum import Enum
from typing import Literal
from pydantic import BaseModel, Field


class FlowType(str, Enum):
    DB = "DB"   # Debit / withdrawal
    CR = "CR"   # Credit / deposit


class TransactionResult(BaseModel):
    date: str                                          # ISO 8601: YYYY-MM-DD
    description: str
    remarks: str = ""                                  # secondary bank description
    flow: FlowType
    type: Literal["Expense", "Income"] = "Expense"    # categorization hint
    amount_idr: float
    currency: str = "IDR"
    exchange_rate: float | None = None                 # Wise FX only, null for IDR banks
    wallet: str = ""
    category: str = "Untracked Expense"               # .NET ICategoryRuleService re-categorizes
    raw_text: str = ""                                 # original bank line (audit trail)


class ParseRequest(BaseModel):
    text: str = Field(..., min_length=1)
    bank_hint: str | None = None   # e.g. "bca", "neobank" — used in system prompt


class ParseResponse(BaseModel):
    transactions: list[TransactionResult]
    total_parsed: int
    skipped_rows: int = 0          # rows that failed Pydantic validation


class PdfParseResponse(ParseResponse):
    pages_processed: int


class HealthResponse(BaseModel):
    status: str
    version: str
