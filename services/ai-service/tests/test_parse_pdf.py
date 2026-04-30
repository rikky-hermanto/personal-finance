import pytest
import fitz
from unittest.mock import AsyncMock
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.models import ParseResponse, TransactionResult
from app.services.llm_parser import LlmParser
from app.services.pdf_extractor import PdfExtractor


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
    app.state.pdf_extractor = PdfExtractor()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/parse-pdf",
            files={"file": ("bad.pdf", b"this is not a pdf", "application/pdf")},
        )
    assert response.status_code == 422
