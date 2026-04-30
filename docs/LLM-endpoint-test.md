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

### What each test covers

| Test | Covers |
|------|--------|
| `test_health_returns_200` | `GET /health` returns `{"status":"healthy","version":"0.1.0"}` |
| `test_parse_happy_path` | Valid text → 200, transactions returned |
| `test_parse_empty_text_returns_422` | Empty string → 422 before the LLM is called |
| `test_parse_provider_error_returns_502` | LLM throws → 502 Bad Gateway |
| `test_parse_skips_invalid_rows` | One malformed row from LLM → `skipped_rows=1`, valid rows still returned |
| `test_parse_pdf_happy_path` | Valid PDF upload → 200, `pages_processed` in response |
| `test_parse_pdf_wrong_content_type_returns_422` | Non-PDF file → 422 before extraction runs |
| `test_parse_pdf_corrupted_bytes_returns_422` | Garbage bytes with PDF MIME → 422 from PyMuPDF |
| `TestPdfExtractor::test_extract_single_page_returns_text_and_page_count` | 1-page PDF → text contains content, `pages=1` |
| `TestPdfExtractor::test_extract_multi_page_includes_page_markers` | 3-page PDF → `--- PAGE 1/2/3 ---` markers present |
| `TestPdfExtractor::test_extract_empty_pdf_returns_empty_text` | Blank page → no crash, returns empty string |
| `TestPdfExtractor::test_extract_corrupted_bytes_raises_extraction_error` | `b"not a pdf"` → `PdfExtractionError` raised |

Expected output:

```
tests/test_health.py::test_health_returns_200 PASSED
tests/test_parse.py::test_parse_happy_path PASSED
tests/test_parse.py::test_parse_empty_text_returns_422 PASSED
tests/test_parse.py::test_parse_provider_error_returns_502 PASSED
tests/test_parse.py::test_parse_skips_invalid_rows PASSED
tests/test_parse_pdf.py::test_parse_pdf_happy_path PASSED
tests/test_parse_pdf.py::test_parse_pdf_wrong_content_type_returns_422 PASSED
tests/test_parse_pdf.py::test_parse_pdf_corrupted_bytes_returns_422 PASSED
tests/test_pdf_extractor.py::TestPdfExtractor::test_extract_single_page_returns_text_and_page_count PASSED
tests/test_pdf_extractor.py::TestPdfExtractor::test_extract_multi_page_includes_page_markers PASSED
tests/test_pdf_extractor.py::TestPdfExtractor::test_extract_empty_pdf_returns_empty_text PASSED
tests/test_pdf_extractor.py::TestPdfExtractor::test_extract_corrupted_bytes_raises_extraction_error PASSED

12 passed
```

---

## Path 2 — Live Manual Tests

Makes real calls to Gemini or Anthropic. Requires an API key.

### Step 1 — Configure `.env`

Create `services/ai-service/.env`:

```env
# Anthropic (recommended — used in production pipeline)
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=your-anthropic-key-here
AI_MODEL=claude-sonnet-4-6

# Gemini (alternative)
# AI_PROVIDER=gemini
# GEMINI_API_KEY=your-gemini-key-here
# AI_MODEL=gemini-2.5-flash
```

### Step 2 — Start the server

```bash
cd services/ai-service
.venv/Scripts/python -m uvicorn app.main:app --reload --port 8000
```

Expected startup log:

```json
{"level":"INFO","logger":"app.main","msg":"AI service starting up | provider=anthropic | model=claude-sonnet-4-6"}
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
      "wallet": "",
      "category": "Untracked Expense",
      "raw_text": ""
    },
    ...
  ],
  "total_parsed": 3,
  "skipped_rows": 0
}
```

Server logs will include token usage:

```json
{"msg":"Parse complete | parsed=3 | skipped=0"}
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
      "wallet": "",
      "category": "Untracked Expense",
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

Expected: `422 Unprocessable Entity` — MIME check fires before the file is read into memory.

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

Expected: `422` with `detail: "Failed to open PDF: ..."`.

**LLM extraction fails → 502:**

Only happens if the Anthropic/Gemini API is unreachable or returns an unexpected response. The frontend (when integrated) will surface this as a processing error.

### `bank_hint` values

The `bank_hint` query param is injected into the system prompt to help the LLM understand the source format. Use the lowercase bank identifier:

| Bank | `bank_hint` |
|------|-------------|
| BCA | `bca` |
| NeoBank | `neobank` |
| Superbank | `superbank` |
| Bank Jago | `bankjago` |
| Wise | `wise` |

Omitting `bank_hint` is fine — the LLM falls back to generic extraction.

---

## Swagger UI

With the server running, open `http://localhost:8000/docs`. FastAPI auto-generates an interactive UI for all endpoints — useful for exploring request/response shapes without writing curl commands. Both `/parse` and `/parse-pdf` are available.

---

## Switching Providers

No code changes needed. Edit `.env` and restart:

| Provider | `.env` settings |
|----------|----------------|
| Anthropic (recommended) | `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY=...`, `AI_MODEL=claude-sonnet-4-6` |
| Gemini | `AI_PROVIDER=gemini`, `GEMINI_API_KEY=...`, `AI_MODEL=gemini-2.5-flash` |

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
| Swagger UI | `http://localhost:8000/docs` |
