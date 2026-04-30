# PF-012 — PDF Text Extraction with PyMuPDF

> **GitHub Issue:** [#20](https://github.com/rikky-hermanto/personal-finance/issues/20)
> **Status:** DONE — 2026-04-30
> **Depends on:** PF-011 (FastAPI scaffold — DONE as of 2026-04-30)
> **Feeds into:** PF-S11 (event-driven webhook pipeline — NOT PF-013, which is superseded)

## Objective

Add PDF upload to the FastAPI AI service. PyMuPDF extracts raw text from each page, then the text is sent to `LlmParser.parse()` (already working from PF-011) for structured extraction. The result is the end-to-end chain: `PDF upload → PyMuPDF text extraction → LLM tool_use → ParseResponse`.

This unblocks Sprint 1 bank parsers for Superbank and NeoBank (both PDF format). It also aligns `TransactionResult` with the full `TransactionDto` contract — the model currently shipped in PF-011 is missing `remarks`, `type`, and `exchange_rate` fields required by the .NET side.

PF-011 is done. The Python scaffolding (`/parse`, LlmParser, AnthropicProvider/GeminiProvider) is live. This ticket layers PDF parsing on top without touching the existing `/parse` endpoint.

**Architecture note (2026-04-28):** The downstream consumer of this PDF parsing capability is now PF-S11 (Supabase Database Webhook → `POST /webhooks/process`), not PF-013. PF-013 (direct .NET → Python HTTP call for PDFs) is superseded by the event-driven pipeline. PF-012 still delivers value as the pure parsing core that PF-S11 will call internally.

## Acceptance Criteria

- [x] `TransactionResult` model includes all 9 fields from the TransactionDto contract: `date`, `description`, `remarks`, `flow`, `type`, `amount_idr`, `currency`, `exchange_rate`, `wallet`
- [x] `EXTRACT_SCHEMA` in `llm_parser.py` updated to include `remarks`, `type`, `exchange_rate`
- [x] `POST /parse-pdf` accepts a PDF file upload (multipart/form-data)
- [x] PyMuPDF extracts text from all pages
- [x] Extracted text is sent to `LlmParser.parse()` for structured extraction
- [x] End-to-end chain works: PDF upload → text extraction → LLM → `PdfParseResponse`
- [x] Multi-page PDFs are handled (pages concatenated with a page-break separator)
- [x] Graceful 422 for corrupted or password-protected PDFs (no 500s)
- [x] `POST /parse-pdf` is tested with mocked LLM (no real API calls in tests)
- [x] PDF extractor unit tests cover: happy path, multi-page, password-protected, corrupted bytes

## Approach

`PdfExtractor` is a thin synchronous wrapper around PyMuPDF (`fitz`) that takes raw bytes and returns `(text: str, page_count: int)`. It has no LLM dependency and is tested independently. The `/parse-pdf` endpoint composes `PdfExtractor` + the existing `LlmParser`: extract text, then call `parse()`.

Contract alignment comes first: before adding any new endpoint, complete `TransactionResult` with the missing fields so all downstream consumers get the full data shape.

Chunking: concatenate pages separated by `\n--- PAGE N ---\n` markers. Claude handles multi-page context within `max_tokens=4096`. Per-statement chunking for 60+ page documents is out of scope — flagged in Notes.

Out of scope: Supabase Storage integration, webhook trigger, Bank Jago vision (screenshot, not PDF), per-bank prompt templates, OpenAI provider, Wise FX conversion.

## Affected Files

| File | Change |
|------|--------|
| `services/ai-service/pyproject.toml` | Add `pymupdf>=1.25.0` and `python-multipart>=0.0.20` to runtime deps |
| `services/ai-service/app/models.py` | Complete `TransactionResult` — add `remarks`, `type`, `exchange_rate`; add `PdfParseResponse` |
| `services/ai-service/app/services/llm_parser.py` | Add `remarks`, `type`, `exchange_rate` to `EXTRACT_SCHEMA` |
| `services/ai-service/app/services/pdf_extractor.py` | Create — PyMuPDF extraction, returns `(text, page_count)` |
| `services/ai-service/app/main.py` | Add `POST /parse-pdf` endpoint; update lifespan to initialize `PdfExtractor` |
| `services/ai-service/tests/test_pdf_extractor.py` | Create — unit tests for `PdfExtractor` (no mock needed, uses real bytes) |
| `services/ai-service/tests/test_parse_pdf.py` | Create — endpoint tests with mocked `LlmParser` |

---

## TODO

### [x] STEP 1 — Add PyMuPDF and python-multipart to dependencies

Edit `services/ai-service/pyproject.toml` — add to the `dependencies` list:

```toml
dependencies = [
    "google-genai>=0.1.0",
    "anthropic>=0.49.0",
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.34.0",
    "pydantic>=2.11.0",
    "pydantic-settings>=2.8.0",
    "pymupdf>=1.25.0",
    "python-multipart>=0.0.20",
]
```

Then reinstall:
```bash
cd services/ai-service
source .venv/Scripts/activate   # Windows
pip install -e ".[dev]"
```

Verify:
```bash
python -c "import fitz; print(fitz.__version__)"
```

> **Why `python-multipart`?** FastAPI requires this package to handle `multipart/form-data` file uploads. Without it, `UploadFile` parameters in endpoint functions throw a runtime error on first use — FastAPI does not bundle this dependency.
>
> **Why `pymupdf` (not `pdfminer`, `pypdf2`, etc.)?** PyMuPDF is best-in-class: fastest, handles the most edge cases (multi-column, rotated text, embedded fonts), and actively maintained. The import name is `fitz` (legacy naming from MuPDF's C library history). `pdfminer` is 3× slower and drops more characters on Indonesian bank statement layouts.

---

### [x] STEP 2 — Complete TransactionResult model to match full TransactionDto contract

The PF-011 model ships only 6 of 9 required fields. The .NET `TransactionDto` contract (frozen per THINK-05 in governance.md) requires `remarks`, `type`, and `exchange_rate`. Complete the model now — before any PDF endpoint work — so all extraction output is contract-compliant from this ticket forward.

Edit `services/ai-service/app/models.py`:

```python
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
```

> **Why add `remarks` and `type` as defaults instead of required fields?**
> LLMs often omit these for simple transactions — they're optional in the source statement. Making them required would increase `skipped_rows` for otherwise valid extractions. The .NET side accepts empty string for `remarks` and defaults `type` for re-categorization via `ICategoryRuleService`.
>
> **Why `exchange_rate: float | None` (not `Decimal`)?**
> The existing `amount_idr` is `float` — mixing `Decimal` and `float` in the same model would complicate the JSON serialization path and break existing tests without adding precision benefit here (Wise FX rates are 4–6 sig figs, well within float64). A dedicated Wise FX ticket can standardize on `Decimal` across the board.
>
> **Why `PdfParseResponse` here (not a separate file)?**
> It extends `ParseResponse` with one field. Keeping it in `models.py` avoids a proliferation of tiny files. The .NET `LlmExtractionClient` reads `transactions`, `total_parsed`, and `skipped_rows` — `pages_processed` is additive and doesn't break the existing contract.

---

### [x] STEP 3 — Update EXTRACT_SCHEMA in llm_parser.py

Edit `services/ai-service/app/services/llm_parser.py` — add the three missing fields to `EXTRACT_SCHEMA.properties.transactions.items.properties`:

```python
EXTRACT_SCHEMA = {
    "type": "object",
    "properties": {
        "transactions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "date":          {"type": "string", "description": "ISO 8601: YYYY-MM-DD"},
                    "description":   {"type": "string"},
                    "remarks":       {"type": "string", "description": "Secondary description or memo"},
                    "flow":          {"type": "string", "enum": ["DB", "CR"]},
                    "type":          {"type": "string", "enum": ["Expense", "Income"]},
                    "amount_idr":    {"type": "number"},
                    "currency":      {"type": "string"},
                    "exchange_rate": {"type": "number"},
                    "wallet":        {"type": "string"},
                    "raw_text":      {"type": "string"},
                },
                "required": ["date", "description", "flow", "amount_idr"],
            },
        }
    },
    "required": ["transactions"],
}
```

Also update `SYSTEM_PROMPT` to mention the new fields:

```python
SYSTEM_PROMPT = (
    "You are a financial data extraction assistant. "
    "Extract ALL transactions from the bank statement text. "
    "Normalize dates to YYYY-MM-DD format. "
    "Use DB for debit/withdrawal, CR for credit/deposit. "
    "Set type to Expense for DB and Income for CR unless context clearly indicates otherwise. "
    "Populate remarks with any secondary description, reference number, or memo field present. "
)
```

> **Why add these to the schema even if most banks don't produce them?**
> The LLM will simply omit optional fields when they're absent in the source text — that's fine. Having them in the schema means Superbank (which has a remarks column) and Wise (which has exchange rates) will get correctly extracted without needing a bank-specific prompt for those fields.
>
> **Why `"required": ["date", "description", "flow", "amount_idr"]` stays unchanged?**
> Making `remarks`, `type`, and `exchange_rate` required would cause extraction failures for simple BCA statements that don't carry those fields. Optional schema fields + Pydantic defaults is the right balance.

---

### [x] STEP 4 — Create `app/services/pdf_extractor.py`

Create `services/ai-service/app/services/pdf_extractor.py`:

```python
import logging

import fitz  # PyMuPDF

logger = logging.getLogger(__name__)


class PdfExtractionError(Exception):
    """Raised when the PDF cannot be opened or read."""
    pass


class PdfExtractor:
    """Extracts raw text from PDF bytes using PyMuPDF."""

    def extract(self, pdf_bytes: bytes) -> tuple[str, int]:
        """
        Extract text from all pages.

        Returns:
            (full_text, page_count) — text has page-break markers between pages.

        Raises:
            PdfExtractionError — for password-protected, corrupted, or unreadable PDFs.
        """
        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        except Exception as e:
            raise PdfExtractionError(f"Failed to open PDF: {e}") from e

        if doc.needs_pass:
            doc.close()
            raise PdfExtractionError("PDF is password-protected")

        pages: list[str] = []
        for i, page in enumerate(doc, start=1):
            try:
                text = page.get_text()
                pages.append(f"--- PAGE {i} ---\n{text.strip()}")
            except Exception as e:
                logger.warning("Failed to extract text from page %d: %s", i, e)
                pages.append(f"--- PAGE {i} --- [extraction failed]")

        doc.close()

        page_count = len(pages)
        full_text = "\n\n".join(pages)

        logger.info("PDF extracted | pages=%d | chars=%d", page_count, len(full_text))
        return full_text, page_count
```

> **Why `tuple[str, int]` return instead of a dataclass?**
> Two values — unpacking is clean (`text, pages = extractor.extract(bytes)`). A dataclass would be over-engineering here.
>
> **Why log per-page extraction failures instead of aborting?**
> Bank statements sometimes have decorative pages (cover, blank, legal notices) that produce garbled text. Skipping one bad page and continuing is better than aborting a 12-page statement because page 1 was a bank logo scan.
>
> **Why `doc.needs_pass` check before iterating?**
> `fitz.open()` succeeds on password-protected PDFs but silently returns empty text on every page. The `needs_pass` flag is the only reliable way to detect this — catch it early with a clear error message.
>
> **Why synchronous (not async)?**
> `fitz.open()` is CPU-bound, not I/O-bound. For now this is acceptable (one parse at a time, dev load). If concurrency matters later, wrap in `asyncio.to_thread()`.

---

### [x] STEP 5 — Add `POST /parse-pdf` to `main.py`

Replace the existing `main.py` content. The key fixes vs. the old plan:
- Lifespan correctly passes `provider` to `LlmParser(provider=provider)` — matching how PF-011 actually shipped
- `ParseRequest` imported at module level, not inside the function body
- `LlmParseError` caught in the parser call (not around model construction)

```python
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.models import HealthResponse, ParseRequest, ParseResponse, PdfParseResponse
from app.providers.factory import ProviderFactory
from app.services.llm_parser import LlmParser, LlmParseError
from app.services.pdf_extractor import PdfExtractor, PdfExtractionError

logging.basicConfig(
    level=getattr(logging, settings.log_level),
    format='{"time":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","msg":"%(message)s"}',
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    provider = ProviderFactory.create(settings)
    app.state.parser = LlmParser(provider=provider)
    app.state.pdf_extractor = PdfExtractor()
    logger.info("AI service starting up | provider=%s | model=%s", settings.ai_provider, settings.ai_model)
    yield
    logger.info("AI service shutting down")


app = FastAPI(
    title="Personal Finance AI Service",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="healthy", version="0.1.0")


@app.post("/parse", response_model=ParseResponse)
async def parse_transactions(request: ParseRequest) -> ParseResponse:
    try:
        return await app.state.parser.parse(request)
    except LlmParseError as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.post("/parse-pdf", response_model=PdfParseResponse)
async def parse_pdf(
    file: UploadFile = File(...),
    bank_hint: str | None = None,
) -> PdfParseResponse:
    if file.content_type != "application/pdf":
        raise HTTPException(
            status_code=422,
            detail=f"Expected application/pdf, got {file.content_type}",
        )

    pdf_bytes = await file.read()
    logger.info("PDF upload received | filename=%s | size=%d bytes", file.filename, len(pdf_bytes))

    try:
        text, page_count = app.state.pdf_extractor.extract(pdf_bytes)
    except PdfExtractionError as e:
        raise HTTPException(status_code=422, detail=str(e))

    try:
        parse_result = await app.state.parser.parse(
            ParseRequest(text=text, bank_hint=bank_hint)
        )
    except LlmParseError as e:
        raise HTTPException(status_code=502, detail=str(e))

    return PdfParseResponse(**parse_result.model_dump(), pages_processed=page_count)
```

> **Why 422 (not 400) for PDF extraction failures?**
> HTTP 422 = syntactically valid request, semantically unprocessable content. 400 implies a malformed request structure — the file upload itself was valid, the content is just unreadable.
>
> **Why check `content_type` before reading bytes?**
> `await file.read()` streams the entire file into memory. The MIME check is a fast first gate. Note: client-reported MIME is not trusted — `fitz.open()` is the authoritative check.
>
> **Why `try/except LlmParseError` around `parser.parse()` (not around `PdfParseResponse(...)` construction)?**
> `LlmParseError` is raised inside `parser.parse()`. The model construction `PdfParseResponse(**parse_result.model_dump(), ...)` cannot raise `LlmParseError` — wrapping it in that except block was a bug in the prior plan draft.

---

### [x] STEP 6 — Smoke test the full chain manually

With the server running (`uvicorn app.main:app --reload --port 8000`):

```bash
# Use any PDF — a real bank statement or any PDF
curl -X POST http://localhost:8000/parse-pdf \
  -F "file=@path/to/your/statement.pdf" \
  -F "bank_hint=neobank"
```

**Expected response structure:**
```json
{
  "transactions": [...],
  "total_parsed": N,
  "skipped_rows": 0,
  "pages_processed": 3
}
```

**What to verify:**
- `pages_processed` matches actual page count of the PDF
- `total_parsed` > 0 for a real bank statement
- Server logs show `PDF extracted | pages=N` then `Parse complete | parsed=N`
- No 500 errors
- Swagger docs at `http://localhost:8000/docs` show both `/parse` and `/parse-pdf`

---

### [x] STEP 7 — Unit tests for `PdfExtractor`

Create `services/ai-service/tests/test_pdf_extractor.py`:

```python
import pytest
import fitz

from app.services.pdf_extractor import PdfExtractor, PdfExtractionError


def _make_pdf_bytes(text: str = "Sample transaction 14/03/2024 IDR 100,000") -> bytes:
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((50, 100), text)
    return doc.tobytes()


def _make_empty_pdf_bytes() -> bytes:
    doc = fitz.open()
    doc.new_page()
    return doc.tobytes()


class TestPdfExtractor:
    def setup_method(self):
        self.extractor = PdfExtractor()

    def test_extract_single_page_returns_text_and_page_count(self):
        pdf_bytes = _make_pdf_bytes("TRANSFER GOFOOD 85000")
        text, pages = self.extractor.extract(pdf_bytes)
        assert pages == 1
        assert "TRANSFER GOFOOD" in text

    def test_extract_multi_page_includes_page_markers(self):
        doc = fitz.open()
        for i in range(3):
            page = doc.new_page()
            page.insert_text((50, 100), f"Page {i + 1} content")
        pdf_bytes = doc.tobytes()

        text, pages = self.extractor.extract(pdf_bytes)
        assert pages == 3
        assert "--- PAGE 1 ---" in text
        assert "--- PAGE 2 ---" in text
        assert "--- PAGE 3 ---" in text

    def test_extract_empty_pdf_returns_empty_text(self):
        pdf_bytes = _make_empty_pdf_bytes()
        text, pages = self.extractor.extract(pdf_bytes)
        assert pages == 1
        assert isinstance(text, str)

    def test_extract_corrupted_bytes_raises_extraction_error(self):
        with pytest.raises(PdfExtractionError, match="Failed to open PDF"):
            self.extractor.extract(b"not a pdf at all")
```

> **Why use real PyMuPDF in these tests (no mock)?**
> `PdfExtractor` has no LLM dependency — it's pure I/O. Testing with real PDFs generated by PyMuPDF is fast (< 100ms), deterministic, and actually exercises the extraction logic. Mocking `fitz.open` would only verify that we called fitz.

---

### [x] STEP 8 — Endpoint tests for `POST /parse-pdf`

Create `services/ai-service/tests/test_parse_pdf.py`:

```python
import pytest
import fitz
from unittest.mock import AsyncMock
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.models import ParseResponse, TransactionResult
from app.services.llm_parser import LlmParser


def _make_pdf_bytes() -> bytes:
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((50, 100), "14/03/2024 GOFOOD GEPREK BENSU 85000")
    return doc.tobytes()


def _mock_parse_response() -> ParseResponse:
    tx = TransactionResult(
        date="2024-03-14",
        description="GOFOOD GEPREK BENSU",
        flow="DB",
        amount_idr=85000.0,
    )
    return ParseResponse(transactions=[tx], total_parsed=1)


@pytest.mark.anyio
async def test_parse_pdf_happy_path():
    mock_parser = AsyncMock(spec=LlmParser)
    mock_parser.parse = AsyncMock(return_value=_mock_parse_response())
    app.state.parser = mock_parser

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/parse-pdf",
            files={"file": ("statement.pdf", _make_pdf_bytes(), "application/pdf")},
        )

    assert response.status_code == 200
    data = response.json()
    assert data["total_parsed"] == 1
    assert data["pages_processed"] == 1
    assert data["transactions"][0]["description"] == "GOFOOD GEPREK BENSU"


@pytest.mark.anyio
async def test_parse_pdf_wrong_content_type_returns_422():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/parse-pdf",
            files={"file": ("data.csv", b"date,amount\n2024-03-14,85000", "text/csv")},
        )
    assert response.status_code == 422


@pytest.mark.anyio
async def test_parse_pdf_corrupted_bytes_returns_422():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/parse-pdf",
            files={"file": ("bad.pdf", b"this is not a pdf", "application/pdf")},
        )
    assert response.status_code == 422
```

> **Why mock at `app.state.parser` level (not `AsyncAnthropic`)?**
> These tests verify the HTTP orchestration layer — not LLM integration (that's `test_parse.py`'s job). Mocking at `parser.parse` keeps each test suite responsible for exactly one concern.

---

### [x] STEP 9 — Run all tests

```bash
cd services/ai-service
pytest tests/ -v
```

**Expected:**
```
tests/test_health.py::test_health_returns_200 PASSED
tests/test_parse.py::test_parse_happy_path PASSED
tests/test_parse.py::test_parse_empty_text_returns_422 PASSED
tests/test_parse.py::test_parse_provider_error_returns_502 PASSED
tests/test_parse.py::test_parse_skips_invalid_rows PASSED
tests/test_pdf_extractor.py::TestPdfExtractor::test_extract_single_page_returns_text_and_page_count PASSED
tests/test_pdf_extractor.py::TestPdfExtractor::test_extract_multi_page_includes_page_markers PASSED
tests/test_pdf_extractor.py::TestPdfExtractor::test_extract_empty_pdf_returns_empty_text PASSED
tests/test_pdf_extractor.py::TestPdfExtractor::test_extract_corrupted_bytes_raises_extraction_error PASSED
tests/test_parse_pdf.py::test_parse_pdf_happy_path PASSED
tests/test_parse_pdf.py::test_parse_pdf_wrong_content_type_returns_422 PASSED
tests/test_parse_pdf.py::test_parse_pdf_corrupted_bytes_returns_422 PASSED

12 passed in X.XXs
```

---

### [x] STEP 10 — Commit

```bash
git add services/ai-service/pyproject.toml
git add services/ai-service/app/models.py
git add services/ai-service/app/services/llm_parser.py
git add services/ai-service/app/services/pdf_extractor.py
git add services/ai-service/app/main.py
git add services/ai-service/tests/test_pdf_extractor.py
git add services/ai-service/tests/test_parse_pdf.py
git status  # verify .env is NOT listed
git commit -m "PF-012: POST /parse-pdf — PyMuPDF text extraction + complete TransactionResult contract"
```

---

## Notes

- **PF-011 is done** — all provider abstraction, `/parse` endpoint, and tests are live. This ticket builds directly on top without touching any existing logic.
- **Contract completion is STEP 2, not optional** — the `remarks`, `type`, and `exchange_rate` fields are required by `.claude/rules/ai-service.md` (THINK-05). Skipping STEP 2 would leave the AI service missing fields that the .NET `TransactionDto` expects.
- **Token limit / chunking:** `max_tokens=4096` handles ~50–60 pages comfortably. If a statement hits `stop_reason == "max_tokens"`, `LlmParseError` fires with a clear message. Per-bank chunking is a PF-S11 concern.
- **Content-type validation is soft:** `file.content_type` is client-reported (not trusted). `fitz.open()` is the real gate — both checks are kept because the MIME check prevents loading large non-PDF files into memory needlessly.
- **PF-013 is superseded.** The original plan noted PF-013 as the next step ("wire .NET to call `/parse-pdf`"). PF-013 is now superseded by PF-S11 (event-driven: Supabase webhook → Python service downloads from Supabase Storage → calls internal extraction logic → writes back). The `/parse-pdf` endpoint remains useful for local dev and direct testing, but won't be the production integration path.
- **`google-genai` stays in `pyproject.toml`** — it's used by `GeminiProvider`. Don't remove it when adding `pymupdf`.
- **`PdfExtractor` is synchronous** — CPU-bound, not I/O-bound. Acceptable for dev load. Wrap in `asyncio.to_thread()` if high concurrency is needed later.
- **What's next after PF-012:** PF-S08 (Supabase Auth) → PF-S09 (Frontend Auth) → PF-S10 (Storage) → PF-S11 (Webhook + full AI pipeline)
