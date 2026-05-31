import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.services.categorizer import Categorizer
from app.models import CategorizeResponse


def _mock_categorizer(category: str = "Food", confidence: float = 0.95) -> Categorizer:
    mock = AsyncMock(spec=Categorizer)
    mock.categorize = AsyncMock(return_value=CategorizeResponse(
        category=category, confidence=confidence))
    return mock


@pytest.mark.anyio
async def test_categorize_happy_path():
    app.state.categorizer = _mock_categorizer("Food", 0.95)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/categorize", json={
            "description": "Go Mie Go",
            "remarks": "QRIS (PAYMENT)",
            "flow": "DB",
            "amount_idr": 37500,
            "account_name":"NeoBank",
            "available_categories": ["Food", "Bill", "Groceries"],
        })
    assert response.status_code == 200
    data = response.json()
    assert data["category"] == "Food"
    assert data["confidence"] == pytest.approx(0.95)


@pytest.mark.anyio
async def test_categorize_empty_categories_returns_422():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/categorize", json={
            "description": "Netflix",
            "flow": "DB",
            "amount_idr": 46500,
            "account_name":"SeaBank",
            "available_categories": [],
        })
    assert response.status_code == 422


@pytest.mark.anyio
async def test_categorize_low_confidence_still_returns_response():
    app.state.categorizer = _mock_categorizer("Groceries", 0.40)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/categorize", json={
            "description": "Sunset Vet Ubud",
            "flow": "DB",
            "amount_idr": 172000,
            "account_name":"SeaBank",
            "available_categories": ["Food", "Vet and Dog Supply", "Groceries"],
        })
    assert response.status_code == 200
    assert response.json()["confidence"] == pytest.approx(0.40)
