# AI Service — Endpoint Testing Guide

How to test the FastAPI AI microservice (`services/ai-service/`).

Two paths: **automated tests** (no API key, no server) and **live manual tests** (real LLM call).

---

## Prerequisites

```bash
cd services/ai-service
pip install -e ".[dev]"   # if not already installed
```

---

## Path 1 — Automated Tests

No API key or running server needed. The LLM provider is replaced by a mock.

```bash
cd services/ai-service
pytest tests/ -v
```

> `conftest.py` sets `AI_PROVIDER=anthropic` and a dummy key automatically — no env var export needed.

### What each test file covers

| File | What it covers | Tests |
|------|---------------|-------|
| `test_health.py` | `GET /health` returns 200 + version string | 1 |
| `test_parse.py` | `/parse` happy path, empty-text 422, provider error 502, malformed-row skipping | 4 |
| `test_parse_pdf.py` | `/parse-pdf` happy path, wrong MIME 422, corrupted bytes 422 | 3 |
| `test_pdf_extractor.py` | `PdfExtractor` unit: single-page, multi-page page markers, empty PDF, corrupted bytes | 4 |
| `test_categorize.py` | `/categorize` happy path, empty-categories 422, low-confidence passthrough, malformed LLM response fallback | 4 |
| `test_merchant_suggester.py` | `/suggest-categories` batch, empty input, PII keyword filtering + `_is_pii_keyword` parametrized | 12 |
| `test_portfolio_reviewer.py` | `PortfolioReviewer` response shape, provider called once, prompt contains setup name, model validation | 5 |
| `test_journey_advisor.py` | `advise()` quest count, deeplink mapping, `max_tokens` error, missing tool-use block error, `tool_choice` param | 5 |
| `test_superbank_extractor.py` | Superbank prompt dispatch (case-insensitive), fallback for unknown hints, extraction, positive amounts, error surfacing | 9 |
| `test_eval_scoring.py` | Scoring harness: perfect score, missed row drops recall, phantom row drops precision, amount tolerance, flow-flip detection | 5 |
| **Total** | | **52** |

---

## Path 2 — Live Manual Tests

Makes real calls to Gemini or Anthropic. Requires an API key.

### Step 1 — Configure `.env`

Create `services/ai-service/.env`:

```env
# Gemini (primary — used in production pipeline)
AI_PROVIDER=gemini
GEMINI_API_KEY=your-gemini-key-here
AI_MODEL=gemini-2.5-flash

# Anthropic (alternate)
# AI_PROVIDER=anthropic
# ANTHROPIC_API_KEY=your-anthropic-key-here
# AI_MODEL=claude-sonnet-4-6
```

### Step 2 — Start the server

```bash
cd services/ai-service
.venv/Scripts/python -m uvicorn app.main:app --reload --port 8000
```

Expected startup log:

```json
{"level":"INFO","logger":"app.main","msg":"AI service starting up | provider=gemini | model=gemini-2.5-flash"}
```

### Step 3 — Health check

```bash
curl http://localhost:8000/health
```

Expected:

```json
{"status":"healthy","version":"0.1.0"}
```

---

## Testing `POST /parse` (text extraction)

### Happy path

```bash
curl -X POST http://localhost:8000/parse \
  -H "Content-Type: application/json" \
  -d '{
    "text": "14/03/2024 TRANSFER TO GOFOOD GEPREK BENSU 85000.00\n15/03/2024 GAJI MASUK PT CONTOH 10000000.00\n16/03/2024 GRAB-GRABCAR BALI 35000.00",
    "bank_hint": "bca"
  }'
```

Expected response:

```json
{
  "transactions": [
    {
      "date": "2024-03-14",
      "description": "TRANSFER TO GOFOOD GEPREK BENSU",
      "remarks": "",
      "flow": "DB",
      "type": "Expense",
      "amount_idr": 85000.0,
      "currency": "IDR",
      "exchange_rate": null,
      "statement_balance": null,
      "account_name": "",
      "category": "Uncategorized",
      "raw_text": ""
    }
  ],
  "total_parsed": 3,
  "skipped_rows": 0
}
```

### Error cases

**Empty text → 422** (LLM never called):
```bash
curl -X POST http://localhost:8000/parse \
  -H "Content-Type: application/json" \
  -d '{"text": ""}'
```

**Missing body → 422:**
```bash
curl -X POST http://localhost:8000/parse \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

## Testing `POST /parse-pdf` (PDF upload)

### Is it connected to the frontend UI?

**No.** The Upload page calls the .NET API (`POST /api/transactions/upload-preview`), which uses its own built-in parsers. The Python service is not in that path yet — it will be wired in via Supabase Storage webhooks in PF-S11.

`/parse-pdf` is currently useful for:
- Direct testing of PDF extraction quality with real bank statements
- Verifying the PyMuPDF + LLM chain before PF-S11 integration

### Happy path — curl

```bash
curl -X POST http://localhost:8000/parse-pdf \
  -F "file=@/path/to/statement.pdf" \
  -F "bank_hint=neobank"
```

Windows PowerShell:
```powershell
curl.exe -X POST http://localhost:8000/parse-pdf `
  -F "file=@C:\path\to\statement.pdf" `
  -F "bank_hint=neobank"
```

Expected response:

```json
{
  "transactions": [
    {
      "date": "2024-03-14",
      "description": "TRANSFER GOFOOD",
      "remarks": "",
      "flow": "DB",
      "type": "Expense",
      "amount_idr": 85000.0,
      "currency": "IDR",
      "exchange_rate": null,
      "statement_balance": 1234567.89,
      "account_name": "NeoBank",
      "category": "Uncategorized",
      "raw_text": ""
    }
  ],
  "total_parsed": 5,
  "skipped_rows": 0,
  "pages_processed": 3
}
```

Key field to check: `pages_processed` should match the actual page count of your PDF.

Server log sequence to verify the full chain worked:

```json
{"msg":"PDF upload received | filename=statement.pdf | size=84231 bytes"}
{"msg":"PDF extracted | pages=3 | chars=4821"}
{"msg":"Parse complete | parsed=5 | skipped=0"}
```

### Happy path — Swagger UI (easier)

With the server running, open `http://localhost:8000/docs`:

1. Click **POST /parse-pdf** → **Try it out**
2. Upload a PDF via the file picker
3. Optionally fill in `bank_hint` (e.g. `neobank`, `superbank`)
4. Click **Execute**

### Error cases

**Wrong file type → 422:**
```bash
curl -X POST http://localhost:8000/parse-pdf \
  -F "file=@transactions.csv;type=text/csv"
```

**Password-protected PDF → 422:**
```bash
curl -X POST http://localhost:8000/parse-pdf \
  -F "file=@protected.pdf"
```

Expected: `422` with `detail: "PDF is password-protected"`.

**Corrupted / non-PDF bytes with PDF extension → 422:**
```bash
echo "not a real pdf" > fake.pdf
curl -X POST http://localhost:8000/parse-pdf \
  -F "file=@fake.pdf"
```

### `bank_hint` values

| Bank | `bank_hint` |
|------|-------------|
| BCA | `bca` |
| NeoBank | `neobank` |
| Superbank | `superbank` |
| Bank Jago | `bankjago` |
| Wise | `wise` |

Omitting `bank_hint` is fine — the LLM falls back to generic extraction. Superbank uses a bank-specific system prompt when `bank_hint=superbank` is set (PF-128).

---

## Testing `POST /parse-image` (screenshot / image upload)

Accepts PNG, JPEG, and WebP. Max 10 MB. Bypasses PyMuPDF — bytes go directly to LLM vision.

### Happy path

```bash
curl -X POST http://localhost:8000/parse-image \
  -F "file=@screenshot.png" \
  -F "bank_hint=bankjago"
```

Windows PowerShell:
```powershell
curl.exe -X POST http://localhost:8000/parse-image `
  -F "file=@C:\path\to\screenshot.png" `
  -F "bank_hint=bankjago"
```

Response shape is identical to `/parse` (no `pages_processed`):

```json
{
  "transactions": [...],
  "total_parsed": 4,
  "skipped_rows": 0
}
```

### Error cases

**Unsupported MIME type → 422:**
```bash
curl -X POST http://localhost:8000/parse-image \
  -F "file=@document.pdf;type=application/pdf"
```

**File over 10 MB → 413:**
```bash
curl -X POST http://localhost:8000/parse-image \
  -F "file=@large_screenshot.png"
```

Expected: `413 Request Entity Too Large`.

---

## Testing `POST /categorize` (single-transaction categorization)

Called by the .NET API during upload preview when the rule engine and history cache both miss.

### Happy path

```bash
curl -X POST http://localhost:8000/categorize \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Go Mie Go",
    "remarks": "QRIS (PAYMENT)",
    "flow": "DB",
    "amount_idr": 37500,
    "account_name": "NeoBank",
    "available_categories": ["Food", "Bill", "Groceries", "Transport"]
  }'
```

Expected:

```json
{
  "category": "Food",
  "confidence": 0.95
}
```

### Error cases

**Empty `available_categories` → 422** (validated in the route handler before LLM call):
```bash
curl -X POST http://localhost:8000/categorize \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Netflix",
    "flow": "DB",
    "amount_idr": 46500,
    "available_categories": []
  }'
```

---

## Testing `POST /suggest-categories` (batch merchant → category)

Used by the upload preview ✦ Suggest button (PF-122) to bulk-categorize uncategorized transactions. Sends a list of unique merchant patterns and gets back keyword + category suggestions.

### Happy path

```bash
curl -X POST http://localhost:8000/suggest-categories \
  -H "Content-Type: application/json" \
  -d '{
    "merchant_patterns": ["GOPAY/TOPUP", "ALFAMART 0123", "GRAB-GRABCAR BALI"],
    "available_categories": ["Food", "Transport", "E-Wallet", "Groceries"]
  }'
```

Expected:

```json
{
  "suggestions": [
    {
      "merchant_pattern": "GOPAY/TOPUP",
      "suggested_category": "E-Wallet",
      "suggested_keyword": "GOPAY",
      "confidence": 0.95
    },
    {
      "merchant_pattern": "ALFAMART 0123",
      "suggested_category": "Groceries",
      "suggested_keyword": "ALFAMART",
      "confidence": 0.92
    }
  ]
}
```

Results are filtered server-side: suggestions with `confidence == 0` are dropped, and any keyword that matches PII patterns (phone numbers, account numbers, `A/N` names, `REK` prefixes) is suppressed before the response is returned.

---

## Testing `POST /portfolio-review` (investment AI review)

Called by the Investment module. Accepts a portfolio snapshot and returns a 7-section structured analysis.

### Happy path

```bash
curl -X POST http://localhost:8000/portfolio-review \
  -H "Content-Type: application/json" \
  -d '{
    "setup_name": "Main Portfolio",
    "archetype": {"id": "balanced", "label": "Balanced / Moderate"},
    "snapshot_label": "June 2026 review",
    "total_value": 100000000,
    "currency": "IDR",
    "holdings": [
      {
        "name": "Bank Central Asia",
        "ticker": "BBCA",
        "asset_class": "equity",
        "allocation_pct": 40
      },
      {
        "name": "SBN ORI023",
        "asset_class": "bond",
        "allocation_pct": 30
      }
    ]
  }'
```

Response has 7 sections (each a flexible dict):

```json
{
  "diagnostics": { "health_score": 72, "archetype_fit_score": 85, "strengths": [...], "gaps": [...], "allocation_summary": [...] },
  "holdings_evaluation": { "holdings": [...] },
  "macro_map": { "factors": [...] },
  "scenarios": { "scenarios": [...] },
  "resilience_test": { "overall_resilience_score": 65, "stress_tests": [...] },
  "decision_tree": { "nodes": [...] },
  "recommended_portfolio": { "rebalance_urgency": "QUARTERLY", "target_allocations": [...], "priority_actions": [...] }
}
```

**Valid `asset_class` values:** `equity`, `bond`, `crypto`, `forex`, `commodity`, `property`, `cash`, `other`

---

## Testing `POST /journey/advise` (financial journey advisor)

Called by the Journey module to generate personalized quest cards. Uses Claude `tool_use` (Anthropic always, regardless of `AI_PROVIDER`).

### Happy path

```bash
curl -X POST http://localhost:8000/journey/advise \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user-abc",
    "current_level": 1,
    "total_score": 35,
    "indicators": [
      {
        "code": "spend_lt_income",
        "level": "L1",
        "score": 20,
        "raw_value": 0.98,
        "status": "in_progress"
      },
      {
        "code": "liquid_savings_ratio",
        "level": "L2",
        "score": 5,
        "raw_value": 0.2,
        "status": "not_started"
      }
    ]
  }'
```

Expected:

```json
{
  "quests": [
    {
      "title": "Audit top 3 expense categories",
      "description": "Check your biggest spending categories and cut one by Rp 300.000 this month.",
      "target_indicator": "spend_lt_income",
      "estimated_score_gain": 12,
      "difficulty": "easy",
      "action_deeplink": "/cashflow/analysis"
    }
  ]
}
```

**Valid `status` values:** `achieved`, `in_progress`, `not_started`, `no_data`  
**Valid `difficulty` values:** `easy`, `medium`, `hard`

---

## Swagger UI

With the server running, open `http://localhost:8000/docs`. FastAPI auto-generates an interactive UI for all 8 endpoints — useful for exploring request/response shapes without writing curl commands.

---

## Switching Providers

No code changes needed. Edit `.env` and restart:

| Provider | `.env` settings |
|----------|----------------|
| Gemini (primary) | `AI_PROVIDER=gemini`, `GEMINI_API_KEY=...`, `AI_MODEL=gemini-2.5-flash` |
| Anthropic (alternate) | `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY=...`, `AI_MODEL=claude-sonnet-4-6` |

Note: `/journey/advise` always uses Anthropic directly (Claude `tool_use` — not routed through `AI_PROVIDER`).

---

## Quick Reference

| Task | Command |
|------|---------|
| Automated tests (no key needed) | `cd services/ai-service && pytest tests/ -v` |
| Start server | `uvicorn app.main:app --reload --port 8000` |
| Health check | `curl http://localhost:8000/health` |
| Parse raw text | `curl -X POST http://localhost:8000/parse -H "Content-Type: application/json" -d '{"text":"..."}'` |
| Parse PDF | `curl -X POST http://localhost:8000/parse-pdf -F "file=@statement.pdf"` |
| Parse PDF with bank hint | `curl -X POST http://localhost:8000/parse-pdf -F "file=@statement.pdf" -F "bank_hint=neobank"` |
| Parse image/screenshot | `curl -X POST http://localhost:8000/parse-image -F "file=@screenshot.png" -F "bank_hint=bankjago"` |
| Categorize transaction | `curl -X POST http://localhost:8000/categorize -H "Content-Type: application/json" -d '{...}'` |
| Suggest categories (batch) | `curl -X POST http://localhost:8000/suggest-categories -H "Content-Type: application/json" -d '{...}'` |
| Portfolio review | `curl -X POST http://localhost:8000/portfolio-review -H "Content-Type: application/json" -d '{...}'` |
| Journey advisor | `curl -X POST http://localhost:8000/journey/advise -H "Content-Type: application/json" -d '{...}'` |
| Swagger UI | `http://localhost:8000/docs` |
