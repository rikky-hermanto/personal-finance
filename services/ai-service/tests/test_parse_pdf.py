import pytest
import fitz
from unittest.mock import AsyncMock
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.models import ParseResponse, TransactionResult
from app.services.llm_parser import LlmParser
from app.services.pdf_extractor import PdfExtractor
from app.config import settings


@pytest.fixture(autouse=True)
def internal_pilot(monkeypatch):
    monkeypatch.setattr(settings, "cashflow_pilot_enabled", True)
    monkeypatch.setattr(settings, "internal_api_key", "test-internal-key")


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
    app.state.pdf_extractor = PdfExtractor()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers={"X-Internal-Api-Key": "test-internal-key"}) as client:
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
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers={"X-Internal-Api-Key": "test-internal-key"}) as client:
        response = await client.post(
            "/parse-pdf",
            files={"file": ("data.csv", b"date,amount\n2024-03-14,85000", "text/csv")},
        )
    assert response.status_code == 422


@pytest.mark.anyio
async def test_parse_pdf_corrupted_bytes_returns_422():
    app.state.pdf_extractor = PdfExtractor()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers={"X-Internal-Api-Key": "test-internal-key"}) as client:
        response = await client.post(
            "/parse-pdf",
            files={"file": ("bad.pdf", b"this is not a pdf", "application/pdf")},
        )
    assert response.status_code == 422


def _client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers={"X-Internal-Api-Key": "test-internal-key"})


@pytest.mark.anyio
async def test_parse_pdf_over_10mb_returns_413():
    app.state.pdf_extractor = PdfExtractor()
    oversized = b"%PDF-1.4\n" + b"0" * (10 * 1024 * 1024)
    async with _client() as client:
        response = await client.post("/parse-pdf", files={"file": ("big.pdf", oversized, "application/pdf")})
    assert response.status_code == 413
    assert response.json()["detail"] == "file_too_large"


@pytest.mark.anyio
async def test_parse_pdf_extraction_timeout_returns_502_internal_error(monkeypatch):
    import threading
    import app.main as main_module

    release = threading.Event()

    class HangingExtractor:
        def extract(self, pdf_bytes, password=None):
            release.wait(5)
            return "", 0

    monkeypatch.setattr(main_module, "_PDF_EXTRACT_TIMEOUT_SECONDS", 0.2)
    app.state.pdf_extractor = HangingExtractor()
    try:
        async with _client() as client:
            response = await client.post("/parse-pdf", files={"file": ("slow.pdf", _make_pdf_bytes(), "application/pdf")})
    finally:
        release.set()
    assert response.status_code == 502
    assert response.json()["detail"] == "internal_error"


@pytest.mark.anyio
async def test_parse_pdf_corrupt_detail_does_not_echo_exception_text():
    app.state.pdf_extractor = PdfExtractor()
    async with _client() as client:
        response = await client.post("/parse-pdf", files={"file": ("bad.pdf", b"this is not a pdf", "application/pdf")})
    assert response.status_code == 422
    assert response.json()["detail"] == "pdf_unreadable"


@pytest.mark.anyio
@pytest.mark.parametrize(
    "cause, code",
    [
        ("Response truncated — statement too long", "response_truncated"),
        ("503 UNAVAILABLE: model is overloaded", "provider_unavailable"),
        ("429 rate limit exceeded", "llm_rate_limited"),
        ("bad json SECRET-INTERNAL-PATH", "llm_parse_error"),
    ],
)
async def test_parse_pdf_llm_failure_returns_documented_code_not_exception_text(cause, code):
    from app.services.llm_parser import LlmParseError

    mock_parser = AsyncMock(spec=LlmParser)
    mock_parser.parse = AsyncMock(side_effect=LlmParseError(f"LLM extraction error: {cause}"))
    app.state.parser = mock_parser
    app.state.pdf_extractor = PdfExtractor()
    async with _client() as client:
        response = await client.post("/parse-pdf", files={"file": ("s.pdf", _make_pdf_bytes(), "application/pdf")})
    assert response.status_code == 502
    assert response.json()["detail"] == code
    assert "SECRET-INTERNAL-PATH" not in response.text


@pytest.mark.anyio
async def test_parse_endpoint_llm_failure_is_sanitized():
    from app.models import ParseRequest  # noqa: F401
    from app.services.llm_parser import LlmParseError

    mock_parser = AsyncMock(spec=LlmParser)
    mock_parser.parse = AsyncMock(side_effect=LlmParseError("LLM extraction error: SECRET-INTERNAL-PATH"))
    app.state.parser = mock_parser
    async with _client() as client:
        response = await client.post("/parse", json={"text": "14/03/2024 GOFOOD 85000"})
    assert response.status_code == 502
    assert response.json()["detail"] == "llm_parse_error"
    assert "SECRET-INTERNAL-PATH" not in response.text
