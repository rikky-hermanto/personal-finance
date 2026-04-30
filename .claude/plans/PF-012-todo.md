# PF-012 — PDF Text Extraction with PyMuPDF

> **GitHub Issue:** [#20](https://github.com/rikky-hermanto/personal-finance/issues/20)
> **Status:** Not Started
> **Depends on:** PF-011 (FastAPI scaffold — `.claude/plans/PF-011-todo.md`)

## Objective

Add PDF upload to the FastAPI AI service. PyMuPDF extracts raw text from each page, then the text is sent to Claude via `tool_use` for structured transaction extraction. The result is the end-to-end chain: `PDF upload → text extraction → LLM → ParseResponse`. This unblocks Sprint 1 bank parsers for Superbank and NeoBank (both PDF format).

PF-011 must be done first — this ticket adds a new endpoint and service on top of the existing `/parse` endpoint and `LlmParser`. No Supabase Storage, no webhooks — this is the pure parsing core.

## Acceptance Criteria

- [ ] `POST /parse-pdf` accepts a PDF file upload (multipart/form-data)
- [ ] PyMuPDF extracts text from all pages
- [ ] Extracted text is sent to `LlmParser.parse()` for structured extraction
- [ ] End-to-end chain works: PDF upload → text extraction → LLM → `ParseResponse`
- [ ] Multi-page PDFs are handled (pages concatenated with a page-break separator)
- [ ] Graceful 422 for corrupted or password-protected PDFs (no 500s)
- [ ] `POST /parse-pdf` is tested with mocked LLM (no real API calls in tests)
- [ ] PDF extractor unit tests cover: happy path, password-protected, corrupted bytes

## Approach

`PdfExtractor` is a thin wrapper around PyMuPDF (`fitz`) that takes raw bytes and returns a single string of extracted text. It is a pure function with no LLM dependency — tested independently. The `/parse-pdf` endpoint composes `PdfExtractor` + `LlmParser`: extract text, then call the existing `parse()` method. No new LLM logic is needed.

Chunking strategy: for now, concatenate all pages separated by `\n--- PAGE N ---\n` markers. Claude handles multi-page context well within `max_tokens=4096`. A chunking split (for statements > ~60 pages) is out of scope — flag it in Notes if we hit it.

Out of scope: Supabase Storage integration, webhook trigger, Bank Jago vision (screenshot, not PDF), provider abstraction, per-bank prompt templates (those are Sprint 1).

## Affected Files

| File | Change |
|------|--------|
| `services/ai-service/pyproject.toml` | Add `pymupdf>=1.25.0` and `python-multipart>=0.0.20` to runtime deps |
| `services/ai-service/app/services/pdf_extractor.py` | Create — PyMuPDF extraction, returns plain text string |
| `services/ai-service/app/models.py` | Add `PdfParseResponse` (extends `ParseResponse` with `pages_processed: int`) |
| `services/ai-service/app/main.py` | Add `POST /parse-pdf` endpoint |
| `services/ai-service/tests/test_pdf_extractor.py` | Create — unit tests for `PdfExtractor` (no mock needed, uses real bytes) |
| `services/ai-service/tests/test_parse_pdf.py` | Create — endpoint tests with mocked `LlmParser` |

---

## TODO

### [ ] STEP 1 — Add PyMuPDF and python-multipart to dependencies

Edit `services/ai-service/pyproject.toml` — add to the `dependencies` list:

```toml
dependencies = [
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
> **Why `pymupdf` (not `pdfminer`, `pypdf2`, etc.)?** PyMuPDF is the best-in-class PDF library for text extraction: fastest, handles the most edge cases (multi-column, rotated text, embedded fonts), and maintained. `pdfminer` is 3× slower and drops more characters. The import name is `fitz` (legacy naming from MuPDF's history).

---

### [ ] STEP 2 — Create `app/services/pdf_extractor.py`

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
            (full_text, page_count) — text has page break markers between pages.

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
> The caller only needs two values — unpacking a tuple is clean (`text, pages = extractor.extract(bytes)`). A dataclass would be over-engineering for a two-value return. Keep it simple.
>
> **Why log per-page extraction failures instead of aborting?**
> Bank statements sometimes have decorative pages (cover page, blank page, legal notices) that produce garbled text. Skipping one bad page and continuing is better than aborting a 12-page statement because page 1 was a bank logo scan.
>
> **Why `doc.needs_pass` check before iterating?**
> `fitz.open()` succeeds on password-protected PDFs but returns empty text on every page silently. The `needs_pass` flag is the only reliable way to detect this case — catch it early with a clear error message rather than returning an empty extraction.

---

### [ ] STEP 3 — Add `PdfParseResponse` to `models.py`

Add to `services/ai-service/app/models.py`:

```python
class PdfParseResponse(ParseResponse):
    pages_processed: int
```

> **Why extend `ParseResponse` instead of a new model?**
> The .NET `LlmExtractionClient` reads `transactions`, `total_parsed`, and `skipped_rows` from the response. Extending `ParseResponse` means the .NET side keeps working without changes — `pages_processed` is additive, not breaking.

---

### [ ] STEP 4 — Add `POST /parse-pdf` to `main.py`

Add imports at the top of `app/main.py`:
```python
from fastapi import HTTPException, UploadFile, File
from app.models import PdfParseResponse
from app.services.pdf_extractor import PdfExtractor, PdfExtractionError
```

Update the `lifespan` function to also initialize the PDF extractor:
```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.parser = LlmParser()
    app.state.pdf_extractor = PdfExtractor()
    logger.info("AI service starting up | model=%s", settings.anthropic_model)
    yield
    logger.info("AI service shutting down")
```

Add the endpoint after `POST /parse`:
```python
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

    from app.models import ParseRequest
    parse_result = await app.state.parser.parse(
        ParseRequest(text=text, bank_hint=bank_hint)
    )

    try:
        return PdfParseResponse(**parse_result.model_dump(), pages_processed=page_count)
    except Exception:
        raise HTTPException(status_code=502, detail="LLM extraction failed")
```

> **Why 422 (not 400) for PDF extraction failures?**
> HTTP 422 Unprocessable Entity = the request was syntactically valid (it's a file) but semantically unprocessable (the content is corrupted or encrypted). 400 Bad Request implies a malformed request, which isn't the case — the client sent a valid PDF upload, the content just cannot be processed.
>
> **Why check `content_type` before reading bytes?**
> `await file.read()` streams the entire file into memory. Checking the MIME type first avoids loading a 50MB Excel file just to reject it. Defense-in-depth: MIME type is client-reported (not trusted) but it's a fast first gate; PyMuPDF's `fitz.open()` is the authoritative check.
>
> **Why `from app.models import ParseRequest` inside the function?**
> Avoids a circular import at module load time. The LLM call re-uses the existing `ParseRequest` — no new request model is needed for PDF since the text is pre-extracted.

---

### [ ] STEP 5 — Smoke test the full chain manually

With the server running (`uvicorn app.main:app --reload --port 8000`):

```bash
# Use any PDF on your machine — a real bank statement or any PDF will do
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
- Server logs show `PDF extracted | pages=N` and then `Parse complete | parsed=N`
- No 500 errors

Also verify the Swagger docs updated:
```
http://localhost:8000/docs
```
Both `/parse` and `/parse-pdf` should appear.

---

### [ ] STEP 6 — Unit tests for `PdfExtractor`

Create `services/ai-service/tests/test_pdf_extractor.py`:

```python
import pytest
import fitz

from app.services.pdf_extractor import PdfExtractor, PdfExtractionError


def _make_pdf_bytes(text: str = "Sample transaction 14/03/2024 IDR 100,000") -> bytes:
    """Create a minimal single-page PDF with the given text."""
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((50, 100), text)
    return doc.tobytes()


def _make_empty_pdf_bytes() -> bytes:
    """Create a valid PDF with no text content."""
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
> `PdfExtractor` has no LLM dependency — it's pure I/O. Testing it with real PDFs generated by PyMuPDF itself is fast (< 100ms), deterministic, and actually tests the logic. Mocking `fitz.open` would only test that we called fitz, not that the extraction logic works.
>
> **Why no password-protected PDF test?**
> Creating a programmatically password-protected PDF requires additional PyMuPDF calls that differ across versions. The `needs_pass` branch is covered by the code path — add a real password-protected PDF fixture if you have one and want to close that gap.

---

### [ ] STEP 7 — Endpoint tests for `POST /parse-pdf`

Create `services/ai-service/tests/test_parse_pdf.py`:

```python
import io
import pytest
import fitz
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.models import ParseResponse, TransactionResult


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
    with patch.object(app.state, "parser", create=True) as mock_parser:
        mock_parser.parse = AsyncMock(return_value=_mock_parse_response())

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

> **Why mock `app.state.parser` here (not `AsyncAnthropic`)?**
> The endpoint tests verify the HTTP layer and PDF extraction orchestration — not the LLM integration (that's `test_parse.py`'s job). Mocking at the `parser.parse` level makes tests faster and keeps responsibilities clear.

---

### [ ] STEP 8 — Run all tests

```bash
cd services/ai-service
pytest tests/ -v
```

**Expected:**
```
tests/test_health.py::test_health_returns_200 PASSED
tests/test_parse.py::test_parse_happy_path PASSED
tests/test_parse.py::test_parse_empty_text_returns_422 PASSED
tests/test_parse.py::test_parse_llm_error_returns_502 PASSED
tests/test_parse.py::test_parse_no_tool_block_returns_502 PASSED
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

### [ ] STEP 9 — Commit

```bash
# From repo root
git add services/ai-service/pyproject.toml
git add services/ai-service/app/services/pdf_extractor.py
git add services/ai-service/app/models.py
git add services/ai-service/app/main.py
git add services/ai-service/tests/test_pdf_extractor.py
git add services/ai-service/tests/test_parse_pdf.py
git status  # verify .env is NOT listed
git commit -m "PF-012: POST /parse-pdf — PyMuPDF text extraction + LLM chain"
```

---

## Notes

- **Prerequisite:** PF-011 must be complete before any step here. The plan is at `.claude/plans/PF-011-todo.md`.
- **hello_llm.py used Gemini** — that was PF-009 exploration. This service uses Anthropic (Claude) for all extraction per `CLAUDE.md` and `.claude/rules/ai-service.md`. Keep `google-genai` in `pyproject.toml` only if PF-010 experiments are kept as scripts; it is not used in the FastAPI service.
- **Token limit / chunking:** `max_tokens=4096` handles ~50-60 pages comfortably. If a statement exceeds that, `stop_reason == "max_tokens"` will fire — the `LlmParser` raises `LlmParseError` with a clear message. Per-bank chunking is a Sprint 1 concern (PF-S11), not this ticket.
- **Content-type validation is soft:** `file.content_type` is client-reported. The real validation is `fitz.open()` — if PyMuPDF can't open it, `PdfExtractionError` is raised. Both checks are kept because the fast MIME check prevents loading large non-PDF files into memory unnecessarily.
- **`PdfExtractor` is synchronous** — `fitz.open()` is CPU-bound, not I/O-bound. For now this is fine (one parse at a time). If concurrency matters later, wrap in `asyncio.to_thread()`.
- **What's next after PF-012:**
  - PF-013: Wire the .NET API to call `POST /parse-pdf` (LlmExtractionClient)
  - PF-014: Persist extracted transactions to Supabase (deferred — Supabase parked for now)
  - PF-043: Wise CSV parser (independent of AI service)
  - PF-045: Bank profile YAML config (Sprint 1)
