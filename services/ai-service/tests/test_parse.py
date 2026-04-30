import pytest
from unittest.mock import AsyncMock
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.services.llm_parser import LlmParser


def _fake_extraction(transactions: list[dict]) -> dict:
    return {"transactions": transactions}


@pytest.mark.anyio
async def test_parse_happy_path():
    """Valid text + provider returns data → 200 with parsed transactions."""
    fake_tx = {
        "date": "2024-03-14",
        "description": "GOPAY MERCHANT",
        "flow": "DB",
        "amount_idr": 85000.0,
    }
    mock_provider = AsyncMock()
    mock_provider.extract_structured = AsyncMock(return_value=_fake_extraction([fake_tx]))
    app.state.parser = LlmParser(provider=mock_provider)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/parse", json={"text": "some bank text"})

    assert response.status_code == 200
    data = response.json()
    assert data["total_parsed"] == 1
    assert data["transactions"][0]["description"] == "GOPAY MERCHANT"


@pytest.mark.anyio
async def test_parse_empty_text_returns_422():
    """Empty text fails Pydantic min_length=1 before reaching the provider."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/parse", json={"text": ""})
    assert response.status_code == 422


@pytest.mark.anyio
async def test_parse_provider_error_returns_502():
    """Provider raises an exception → 502 Bad Gateway."""
    mock_provider = AsyncMock()
    mock_provider.extract_structured = AsyncMock(side_effect=Exception("provider down"))
    app.state.parser = LlmParser(provider=mock_provider)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/parse", json={"text": "some bank text"})

    assert response.status_code == 502


@pytest.mark.anyio
async def test_parse_skips_invalid_rows():
    """Provider returns a malformed row → skipped_rows=1, valid rows returned."""
    valid_tx = {"date": "2024-03-14", "description": "VALID", "flow": "DB", "amount_idr": 1000.0}
    invalid_tx = {"date": "bad-date", "flow": "UNKNOWN", "amount_idr": "not-a-number"}
    mock_provider = AsyncMock()
    mock_provider.extract_structured = AsyncMock(
        return_value=_fake_extraction([valid_tx, invalid_tx])
    )
    app.state.parser = LlmParser(provider=mock_provider)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/parse", json={"text": "some bank text"})

    assert response.status_code == 200
    data = response.json()
    assert data["total_parsed"] == 1
    assert data["skipped_rows"] == 1
