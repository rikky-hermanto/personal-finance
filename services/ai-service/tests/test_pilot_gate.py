"""Cashflow pilot route gate; no provider or database calls are made."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.main import app


@pytest.mark.asyncio
async def test_pilot_gate_denies_unscoped_routes(monkeypatch):
    monkeypatch.setattr(settings, "cashflow_pilot_enabled", True)
    monkeypatch.setattr(settings, "internal_api_key", "test-internal-key")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        for path in ("/ask", "/ask/stream", "/search", "/categorize-agent", "/advisor"):
            response = await client.post(path, json={}, headers={"X-Internal-Api-Key": "test-internal-key"})
            assert response.status_code == 404, path


@pytest.mark.asyncio
async def test_pilot_gate_requires_internal_key_for_extraction(monkeypatch):
    monkeypatch.setattr(settings, "cashflow_pilot_enabled", True)
    monkeypatch.setattr(settings, "internal_api_key", "test-internal-key")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.post("/parse", json={})).status_code == 401
        # Authenticated malformed input reaches FastAPI validation, not the provider.
        assert (await client.post(
            "/parse", json={}, headers={"X-Internal-Api-Key": "test-internal-key"}
        )).status_code == 422


@pytest.mark.asyncio
async def test_pilot_gate_stays_closed_when_disabled(monkeypatch):
    monkeypatch.setattr(settings, "cashflow_pilot_enabled", False)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.post("/parse", json={})).status_code == 404
        assert (await client.get("/health")).status_code == 200


@pytest.mark.asyncio
async def test_pilot_gate_allows_payload_only_advice_routes_with_internal_key(monkeypatch):
    monkeypatch.setattr(settings, "cashflow_pilot_enabled", True)
    monkeypatch.setattr(settings, "internal_api_key", "test-internal-key")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        for path in ("/journey/advise", "/portfolio-review"):
            assert (await client.post(path, json={})).status_code == 401, path
            # Authenticated malformed input reaches validation, not the provider.
            response = await client.post(path, json={}, headers={"X-Internal-Api-Key": "test-internal-key"})
            assert response.status_code == 422, path
