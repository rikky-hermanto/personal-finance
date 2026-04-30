import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app


@pytest.mark.anyio
async def test_health_returns_200():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy", "version": "0.1.0"}
