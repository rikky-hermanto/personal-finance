"""/parse-image under the Cashflow pilot gate; the LLM parser is mocked."""

import pytest
from unittest.mock import AsyncMock
from httpx import AsyncClient, ASGITransport

from app.config import settings
from app.main import app
from app.models import ParseResponse, TransactionResult
from app.services.llm_parser import LlmParser

_PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


@pytest.fixture(autouse=True)
def internal_pilot(monkeypatch):
    monkeypatch.setattr(settings, "cashflow_pilot_enabled", True)
    monkeypatch.setattr(settings, "internal_api_key", "test-internal-key")


@pytest.fixture
def mock_parser():
    parser = AsyncMock(spec=LlmParser)
    parser.parse_image = AsyncMock(return_value=ParseResponse(
        transactions=[TransactionResult(
            date="2024-03-14", description="JAGO TRANSFER", flow="CR", amount_idr=150000.0)],
        total_parsed=1,
    ))
    app.state.parser = parser
    return parser


@pytest.mark.anyio
async def test_parse_image_with_internal_key_returns_transactions(mock_parser):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test",
                           headers={"X-Internal-Api-Key": "test-internal-key"}) as client:
        response = await client.post(
            "/parse-image",
            files={"file": ("jago.png", _PNG_BYTES, "image/png")},
            data={"bank_hint": "Jago"},
        )

    assert response.status_code == 200
    data = response.json()
    assert data["total_parsed"] == 1
    assert data["transactions"][0]["description"] == "JAGO TRANSFER"
    mock_parser.parse_image.assert_awaited_once()
    assert mock_parser.parse_image.await_args.kwargs["media_type"] == "image/png"


@pytest.mark.anyio
async def test_parse_image_without_internal_key_never_reaches_parser(mock_parser):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/parse-image",
            files={"file": ("jago.png", _PNG_BYTES, "image/png")},
        )

    assert response.status_code == 401
    mock_parser.parse_image.assert_not_awaited()
