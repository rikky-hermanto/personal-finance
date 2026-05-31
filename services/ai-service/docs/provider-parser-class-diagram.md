# Provider + Parser Class Diagram

Format: Plain text / ASCII art
Render: any Markdown viewer, GitHub, VS Code Preview — no plugin required

Scope: `providers/base.py` · `providers/factory.py` · `services/llm_parser.py`
       + all related classes (config, models, other services)

---

## 1 — LlmProvider Protocol and Concrete Implementations

```
  ┌───────────────────────────────────────────────────────────────────────────┐
  │  «Protocol»  LlmProvider                         providers/base.py        │
  │  @runtime_checkable                                                        │
  │  ─────────────────────────────────────────────────────────────────────── │
  │  + extract_structured(system_prompt: str, user_text: str, schema: dict,   │
  │                        image?: tuple[bytes, str]) → dict                  │
  │  + generate_json(system_prompt: str, user_prompt: str,                    │
  │                  schema: dict) → dict                                      │
  └──────────────────────────────┬────────────────────────────────────────────┘
                                  │   △  both implement this protocol
                    ┌─────────────┴──────────────┐
                    │                            │
                    ▼                            ▼
  ┌──────────────────────────────┐   ┌───────────────────────────────────┐
  │  GeminiProvider              │   │  AnthropicProvider                │
  │  providers/gemini.py         │   │  providers/anthropic.py           │
  │  ──────────────────────────  │   │  ─────────────────────────────── │
  │  − _api_key : str            │   │  − _client : AsyncAnthropic       │
  │  − _model   : str            │   │  − _model  : str                  │
  │  − _client  : genai.Client?  │   │  ─────────────────────────────── │
  │  ──────────────────────────  │   │  + extract_structured() → dict    │
  │  + extract_structured()→dict │   │  + generate_json()      → dict    │
  │  + generate_json()   → dict  │   └───────────────────────────────────┘
  │  − _get_client()             │
  └──────────────────────────────┘
              ▲ created by
  ┌────────────────────────────────────────────────────────────────────────┐
  │  ProviderFactory                                 providers/factory.py  │
  │  ────────────────────────────────────────────────────────────────────  │
  │  + create(settings: Settings) → LlmProvider          «static method»   │
  │            └── "gemini"     → GeminiProvider(api_key, model)           │
  │            └── "anthropic"  → AnthropicProvider(api_key, model)        │
  │            └── other        → raises ValueError                         │
  └──────────────────────────────┬─────────────────────────────────────────┘
                                  │  reads
                                  ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │  Settings                                              config.py     │
  │  ────────────────────────────────────────────────────────────────── │
  │  ai_provider       : str  = "gemini"                                 │
  │  gemini_api_key    : str  = ""                                       │
  │  anthropic_api_key : str  = ""                                       │
  │  ai_model          : str  = "gemini-2.5-flash"                       │
  │  log_level         : str  = "INFO"                                   │
  │  cors_origins      : list = ["http://localhost:7208"]                │
  │  ────────────────────────────────────────────────────────────────── │
  │  + validate_provider_key()                                           │
  └──────────────────────────────────────────────────────────────────────┘
```

---

## 2 — Services: All Inject LlmProvider

```
  LlmProvider (protocol — see §1)
  │
  │   injected via __init__(provider: LlmProvider) in all four services
  │
  ├──► ┌──────────────────────────────────────────────────────────┐
  │    │  LlmParser                      services/llm_parser.py  │
  │    │  ──────────────────────────────────────────────────────  │
  │    │  − _provider : LlmProvider                              │
  │    │  ──────────────────────────────────────────────────────  │
  │    │  + parse(request: ParseRequest) → ParseResponse          │
  │    │  + parse_image(image_bytes: bytes,                        │
  │    │                media_type: str,                           │
  │    │                request: ParseImageRequest) → ParseResponse│
  │    └──────────────────────────────────────────────────────────┘
  │
  ├──► ┌──────────────────────────────────────────────────────────┐
  │    │  Categorizer                    services/categorizer.py  │
  │    │  ──────────────────────────────────────────────────────  │
  │    │  − _provider : LlmProvider                              │
  │    │  ──────────────────────────────────────────────────────  │
  │    │  + categorize(request: CategorizeRequest)               │
  │    │             → CategorizeResponse                         │
  │    └──────────────────────────────────────────────────────────┘
  │
  ├──► ┌──────────────────────────────────────────────────────────┐
  │    │  MerchantSuggester         services/merchant_suggester.py│
  │    │  ──────────────────────────────────────────────────────  │
  │    │  − _provider : LlmProvider                              │
  │    │  ──────────────────────────────────────────────────────  │
  │    │  + suggest_batch(merchant_patterns: list[str],           │
  │    │                  available_categories: list[str])        │
  │    │             → list[dict]                                  │
  │    └──────────────────────────────────────────────────────────┘
  │
  └──► ┌──────────────────────────────────────────────────────────┐
       │  PortfolioReviewer         services/portfolio_reviewer.py│
       │  ──────────────────────────────────────────────────────  │
       │  − _provider : LlmProvider                              │
       │  ──────────────────────────────────────────────────────  │
       │  + review(request: PortfolioReviewRequest)               │
       │         → PortfolioReviewResponse                        │
       └──────────────────────────────────────────────────────────┘

  Note: journey_advise() in services/journey_advisor.py is a module-level
  async function, not a class — it creates its own LlmProvider at call time.
```

---

## 3 — LlmParser: Module Constants + Exception

```
  services/llm_parser.py (module scope)
  ┌────────────────────────────────────────────────────────────────────────┐
  │  EXTRACT_SCHEMA : dict                       «module-level constant»   │
  │  ────────────────────────────────────────────────────────────────────  │
  │  JSON Schema sent to BOTH providers — Gemini maps to response_schema,  │
  │  Anthropic maps to tool input_schema. Required fields: date,           │
  │  description, flow, amount_idr. Optional: remarks, type, currency,     │
  │  exchange_rate, wallet, raw_text.                                       │
  └────────────────────────────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────────────────────────────┐
  │  SYSTEM_PROMPT : str                         «module-level constant»   │
  │  ────────────────────────────────────────────────────────────────────  │
  │  Shared base prompt for all bank extraction calls. LlmParser appends   │
  │  "Bank context: {bank_hint}" before passing to provider.               │
  └────────────────────────────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────────────────────────────┐
  │  LlmParseError(Exception)                                              │
  │  ────────────────────────────────────────────────────────────────────  │
  │  Raised by LlmParser when extract_structured() fails.                  │
  │  Caught in main.py and translated to HTTP 502.                         │
  └────────────────────────────────────────────────────────────────────────┘

  LlmParser calls flow:
  ┌──────────────────────────────────────────────────────────────────────┐
  │  parse(request)                                                      │
  │    1. builds system = SYSTEM_PROMPT + bank_hint                      │
  │    2. await self._provider.extract_structured(                       │
  │           system, request.text, EXTRACT_SCHEMA)                      │
  │    3. for each row: TransactionResult(**row) — skip on Pydantic error │
  │    4. return ParseResponse(transactions, total_parsed, skipped_rows) │
  │                                                                      │
  │  parse_image(image_bytes, media_type, request)                       │
  │    1. same as parse() but passes image=(image_bytes, media_type)     │
  │       to extract_structured — triggers multimodal path in provider   │
  └──────────────────────────────────────────────────────────────────────┘
```

---

## 4 — Models: Parsing (used directly by LlmParser)

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │  ParseRequest                                          models.py     │
  │  ────────────────────────────────────────────────────────────────── │
  │  text      : str   (Field min_length=1)                              │
  │  bank_hint : str?  (e.g. "bca", "neobank")                           │
  └──────────────────────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────────────────────┐
  │  ParseImageRequest                                     models.py     │
  │  ────────────────────────────────────────────────────────────────── │
  │  bank_hint : str?  (e.g. "jago", "superbank")                        │
  └──────────────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────────────────┐
  │  ParseResponse                                        models.py     │
  │  ─────────────────────────────────────────────────────────────────  │
  │  transactions  : list[TransactionResult]                             │
  │  total_parsed  : int                                                 │
  │  skipped_rows  : int = 0                                             │
  └─────────────────────┬───────────────────────────────────────────────┘
                         │   △  extends
  ┌──────────────────────┴──────────────────────────────────────────────┐
  │  PdfParseResponse                                     models.py     │
  │  ─────────────────────────────────────────────────────────────────  │
  │  (inherits all ParseResponse fields)                                 │
  │  pages_processed : int                                               │
  └─────────────────────────────────────────────────────────────────────┘

  ParseResponse ◆──────────────────────────────────── list[TransactionResult]
  (composition)
  ┌─────────────────────────────────────────────────────────────────────┐
  │  TransactionResult  (Pydantic BaseModel)              models.py     │
  │  ─────────────────────────────────────────────────────────────────  │
  │  date              : str           ISO 8601: YYYY-MM-DD              │
  │  description       : str                                             │
  │  remarks           : str     = ""                                    │
  │  flow              : FlowType      DB | CR                           │
  │  type              : Literal       "Expense" | "Income"              │
  │  amount_idr        : float                                           │
  │  currency          : str     = "IDR"                                 │
  │  exchange_rate     : float?  = None  (Wise FX only)                  │
  │  statement_balance : float?  = None  (balance from bank statement)   │
  │  wallet            : str     = ""                                    │
  │  category          : str     = "Uncategorized"                       │
  │  raw_text          : str     = ""    (original bank line)            │
  └──────────────────────────────────────┬──────────────────────────────┘
                                          │  uses
                                          ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │  «Enum»  FlowType(str, Enum)                          models.py     │
  │  ─────────────────────────────────────────────────────────────────  │
  │  DB = "DB"    debit / withdrawal                                     │
  │  CR = "CR"    credit / deposit                                       │
  └─────────────────────────────────────────────────────────────────────┘
```

---

## 5 — Models: Categorizer + Suggester

```
  Categorizer ──────────────────────────────────────────────────────────
  ┌─────────────────────────────────────────────────────────────────────┐
  │  CategorizeRequest  (Pydantic BaseModel)              models.py     │
  │  ─────────────────────────────────────────────────────────────────  │
  │  description          : str                                          │
  │  remarks              : str = ""                                     │
  │  flow                 : Literal["DB", "CR"]                          │
  │  amount_idr           : Decimal                                      │
  │  wallet               : str = ""                                     │
  │  available_categories : list[str]                                    │
  └─────────────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────────────────┐
  │  CategorizeResponse  (Pydantic BaseModel)             models.py     │
  │  ─────────────────────────────────────────────────────────────────  │
  │  category   : str                                                    │
  │  confidence : float    0.0 – 1.0                                     │
  └─────────────────────────────────────────────────────────────────────┘

  MerchantSuggester ────────────────────────────────────────────────────
  ┌─────────────────────────────────────────────────────────────────────┐
  │  SuggestCategoriesRequest  (Pydantic BaseModel)       models.py     │
  │  ─────────────────────────────────────────────────────────────────  │
  │  merchant_patterns    : list[str]                                    │
  │  available_categories : list[str]                                    │
  └─────────────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────────────────┐
  │  SuggestCategoriesResponse  (Pydantic BaseModel)      models.py     │
  │  ─────────────────────────────────────────────────────────────────  │
  │  suggestions : list[MerchantSuggestion]                              │
  └─────────────────────────────────────────────────────────────────────┘
                      ◆
  ┌─────────────────────────────────────────────────────────────────────┐
  │  MerchantSuggestion  (Pydantic BaseModel)             models.py     │
  │  ─────────────────────────────────────────────────────────────────  │
  │  merchant_pattern    : str                                           │
  │  suggested_category  : str                                           │
  │  suggested_keyword   : str                                           │
  │  confidence          : float                                         │
  └─────────────────────────────────────────────────────────────────────┘
```

---

## 6 — Models: Portfolio Reviewer + Journey Advisor

```
  PortfolioReviewer ────────────────────────────────────────────────────
  ┌─────────────────────────────────────────────────────────────────────┐
  │  PortfolioReviewRequest  (Pydantic BaseModel)         models.py     │
  │  ─────────────────────────────────────────────────────────────────  │
  │  setup_name      : str                                               │
  │  archetype       : dict   (full archetype context for AI)            │
  │  snapshot_label  : str                                               │
  │  total_value     : Decimal?                                          │
  │  currency        : str = "IDR"                                       │
  │  holdings        : list[PortfolioHolding]                            │
  │  provider        : str?   (override AI_PROVIDER per-call)            │
  │  model           : str?                                              │
  └─────────────────────────────────────────────────────────────────────┘
                              ◆
  ┌─────────────────────────────────────────────────────────────────────┐
  │  PortfolioHolding  (Pydantic BaseModel)               models.py     │
  │  ─────────────────────────────────────────────────────────────────  │
  │  ticker          : str?                                              │
  │  name            : str                                               │
  │  asset_class     : Literal  equity|bond|crypto|forex|…              │
  │  sector          : str?                                              │
  │  allocation_pct  : Decimal?                                          │
  │  quantity        : Decimal?                                          │
  │  avg_buy_price   : Decimal?                                          │
  └─────────────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────────────────┐
  │  PortfolioReviewResponse  (Pydantic BaseModel)        models.py     │
  │  ─────────────────────────────────────────────────────────────────  │
  │  7 flexible dict sections (raw JsonObject on .NET side):            │
  │  diagnostics          : dict                                         │
  │  holdings_evaluation  : dict                                         │
  │  macro_map            : dict                                         │
  │  scenarios            : dict                                         │
  │  resilience_test      : dict                                         │
  │  decision_tree        : dict                                         │
  │  recommended_portfolio: dict                                         │
  └─────────────────────────────────────────────────────────────────────┘

  journey_advise() function (services/journey_advisor.py) ─────────────
  ┌─────────────────────────────────────────────────────────────────────┐
  │  JourneyAdviseRequest  (Pydantic BaseModel)           models.py     │
  │  ─────────────────────────────────────────────────────────────────  │
  │  user_id       : str                                                 │
  │  current_level : int                                                 │
  │  total_score   : Decimal                                             │
  │  indicators    : list[IndicatorSnapshot]                             │
  └─────────────────────────────────────────────────────────────────────┘
                              ◆
  ┌─────────────────────────────────────────────────────────────────────┐
  │  IndicatorSnapshot  (Pydantic BaseModel)              models.py     │
  │  ─────────────────────────────────────────────────────────────────  │
  │  code      : str                                                     │
  │  level     : Literal  "L1"|"L2"|"L3"|"L4"|"L5"                      │
  │  score     : Decimal                                                 │
  │  raw_value : Decimal?                                                │
  │  status    : Literal  achieved|in_progress|not_started|no_data      │
  └─────────────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────────────────┐
  │  JourneyAdviseResponse  (Pydantic BaseModel)          models.py     │
  │  ─────────────────────────────────────────────────────────────────  │
  │  quests : list[Quest]                                                │
  └─────────────────────────────────────────────────────────────────────┘
                              ◆
  ┌─────────────────────────────────────────────────────────────────────┐
  │  Quest  (Pydantic BaseModel)                          models.py     │
  │  ─────────────────────────────────────────────────────────────────  │
  │  title                  : str                                        │
  │  description            : str                                        │
  │  target_indicator       : str                                        │
  │  estimated_score_gain   : Decimal                                    │
  │  difficulty             : Literal  easy|medium|hard                  │
  │  action_deeplink        : str?                                       │
  └─────────────────────────────────────────────────────────────────────┘
```

---

## 7 — Wiring: main.py Lifespan

```
  FastAPI lifespan() — runs at startup, all services share one provider instance
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  provider = ProviderFactory.create(settings)  → LlmProvider              │
  │                                                                           │
  │  app.state.parser             = LlmParser(provider=provider)              │
  │  app.state.categorizer        = Categorizer(provider=provider)            │
  │  app.state.suggester          = MerchantSuggester(provider=provider)      │
  │  app.state.portfolio_reviewer = PortfolioReviewer(provider=provider)      │
  │                                                                           │
  │  Note: journey_advise() is a free function — not stored in app.state     │
  └──────────────────────────────────────────────────────────────────────────┘

  HTTP endpoint → app.state service routing:
  ┌────────────────────────┬───────────────────────────────────────────────┐
  │  Endpoint              │  app.state service called                      │
  ├────────────────────────┼───────────────────────────────────────────────┤
  │  POST /parse           │  app.state.parser.parse(request)               │
  │  POST /parse-pdf       │  app.state.pdf_extractor.extract()             │
  │                        │  → app.state.parser.parse(text)                │
  │  POST /parse-image     │  app.state.parser.parse_image(bytes, type, req)│
  │  POST /categorize      │  app.state.categorizer.categorize(request)     │
  │  POST /suggest-cat...  │  app.state.suggester.suggest_batch(...)        │
  │  POST /portfolio-review│  app.state.portfolio_reviewer.review(req)      │
  │  POST /journey/advise  │  journey_advise(req)  (free function)          │
  │  GET  /health          │  (no service — returns static HealthResponse)  │
  └────────────────────────┴───────────────────────────────────────────────┘
```

---

## 8 — Complete Relationship Summary

```
  ◆──► composition (contains / owns)
  ──▷  implements / inherits (hollow triangle toward parent)
  ──►  uses / depends on
  ─ ─► creates / instantiates

  Settings ──► ProviderFactory ─ ─► GeminiProvider ──▷ LlmProvider
                                ─ ─► AnthropicProvider ──▷ LlmProvider

  LlmProvider ──► LlmParser ──► ParseRequest
                               ──► ParseImageRequest
                               ──► EXTRACT_SCHEMA (dict const)
                               ──► SYSTEM_PROMPT  (str const)
                               raises LlmParseError(Exception)
                               ──► ParseResponse ◆──► list[TransactionResult]
                                                          ──► FlowType (Enum)
                               PdfParseResponse ──▷ ParseResponse

  LlmProvider ──► Categorizer ──► CategorizeRequest
                                ──► CategorizeResponse

  LlmProvider ──► MerchantSuggester ──► SuggestCategoriesRequest
                                      ──► SuggestCategoriesResponse ◆──► MerchantSuggestion

  LlmProvider ──► PortfolioReviewer ──► PortfolioReviewRequest ◆──► PortfolioHolding
                                      ──► PortfolioReviewResponse

  (function) journey_advise ──► JourneyAdviseRequest ◆──► IndicatorSnapshot
                             ──► JourneyAdviseResponse ◆──► Quest
```
