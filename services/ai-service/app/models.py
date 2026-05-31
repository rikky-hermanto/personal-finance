from enum import Enum
from typing import Literal
from decimal import Decimal
from pydantic import BaseModel, Field, ConfigDict


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
    statement_balance: float | None = None             # balance from bank statement
    account_name: str = ""
    category: str = "Uncategorized"                    # .NET ICategoryRuleService re-categorizes
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


class ParseImageRequest(BaseModel):
    bank_hint: str | None = None   # e.g. "jago", "superbank"


class HealthResponse(BaseModel):
    status: str
    version: str

class CategorizeRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    description: str
    remarks: str = ""
    flow: Literal["DB", "CR"]
    amount_idr: Decimal
    account_name: str = ""
    available_categories: list[str]

class CategorizeResponse(BaseModel):
    category: str
    confidence: float  # 0.0 – 1.0

class SuggestCategoriesRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    merchant_patterns: list[str]
    available_categories: list[str]

class MerchantSuggestion(BaseModel):
    merchant_pattern: str
    suggested_category: str
    suggested_keyword: str
    confidence: float

class SuggestCategoriesResponse(BaseModel):
    suggestions: list[MerchantSuggestion]


# ── Journey Advisor ───────────────────────────────────────────────────────────

class IndicatorSnapshot(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    code: str
    level: Literal["L1", "L2", "L3", "L4", "L5"]
    score: Decimal
    raw_value: Decimal | None = None
    status: Literal["achieved", "in_progress", "not_started", "no_data"]


class JourneyAdviseRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    user_id: str
    current_level: int
    total_score: Decimal
    indicators: list[IndicatorSnapshot]


class Quest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    title: str
    description: str
    target_indicator: str
    estimated_score_gain: Decimal
    difficulty: Literal["easy", "medium", "hard"]
    action_deeplink: str | None = None


class JourneyAdviseResponse(BaseModel):
    quests: list[Quest]


# ── Portfolio Review ──────────────────────────────────────────────────────────

class PortfolioHolding(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    ticker: str | None = None
    name: str
    asset_class: Literal["equity", "bond", "crypto", "forex", "commodity", "property", "cash", "other"]
    sector: str | None = None
    allocation_pct: Decimal | None = None
    quantity: Decimal | None = None
    avg_buy_price: Decimal | None = None


class PortfolioReviewRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    setup_name: str
    archetype: dict   # full archetype context block sent to AI
    snapshot_label: str
    total_value: Decimal | None = None
    currency: str = "IDR"
    holdings: list[PortfolioHolding]
    provider: str | None = None   # override AI_PROVIDER per-call
    model: str | None = None


# 7-section analysis response — each section is a flexible dict so the schema
# can evolve without breaking the .NET DTO (raw JsonObject on the .NET side).

class PortfolioReviewResponse(BaseModel):
    diagnostics: dict
    holdings_evaluation: dict
    macro_map: dict
    scenarios: dict
    resilience_test: dict
    decision_tree: dict
    recommended_portfolio: dict
