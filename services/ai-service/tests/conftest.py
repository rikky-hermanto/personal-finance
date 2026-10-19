"""Shared fixtures. No real DB or LLM is ever reached from the test suite."""
import base64
import json
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.fixture(autouse=True)
def _rollout_flags_off(monkeypatch):
    """Start every test with the PF-S15 rollout flags off, whatever the local .env says.

    A developer who enables chat locally must not change what the gate tests see.
    Tests that need a flag on set it themselves.
    """
    from app.config import settings

    monkeypatch.setattr(settings, "ai_chat_enabled", False)
    monkeypatch.setattr(settings, "ai_agents_enabled", False)


def make_owner_conn() -> AsyncMock:
    """An asyncpg connection mock whose .transaction() works as `async with`."""
    conn = AsyncMock()

    @asynccontextmanager
    async def _txn():
        yield

    conn.transaction = MagicMock(side_effect=lambda: _txn())
    return conn


@pytest.fixture
def owner_db():
    """Patch the only asyncpg.connect owner_connection uses; yield the mock connection.

    owner_connection itself runs for real, so tests also see its SET LOCAL ROLE and
    set_config calls in conn.execute.
    """
    conn = make_owner_conn()
    with patch("app.owner.asyncpg.connect", new_callable=AsyncMock) as connect:
        connect.return_value = conn
        yield conn


def fake_jwt(sub: str) -> str:
    """An unsigned JWT-shaped string with this `sub`. The AI service only reads the
    subject to match the owner token; the .NET API is what verifies a real token."""
    def part(data: dict) -> str:
        return base64.urlsafe_b64encode(json.dumps(data).encode()).rstrip(b"=").decode()
    return f"{part({'alg': 'none'})}.{part({'sub': sub, 'role': 'authenticated'})}.sig"
