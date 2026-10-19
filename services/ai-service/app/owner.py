"""Caller identity for owner-scoped routes. The .NET API is the only caller."""
from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import secrets
import time
import uuid
from contextlib import asynccontextmanager

import asyncpg
from fastapi import Depends, Header, HTTPException

from app.config import settings


_OWNER_TOKEN_MAX_AGE_SECONDS = 60


def _verify_owner_token(token: str) -> uuid.UUID:
    """Token format: '<user-uuid>.<unix-ts>.<hex hmac-sha256 of "<user-uuid>.<unix-ts>">'."""
    user_part, _, rest = token.partition(".")
    ts_part, _, signature = rest.partition(".")
    expected = hmac.new(
        settings.owner_signing_secret.encode(), f"{user_part}.{ts_part}".encode(), hashlib.sha256
    ).hexdigest()
    if not secrets.compare_digest(signature.encode(), expected.encode()):
        raise ValueError("bad signature")
    if abs(time.time() - int(ts_part)) > _OWNER_TOKEN_MAX_AGE_SECONDS:
        raise ValueError("stale token")
    return uuid.UUID(user_part)


async def require_owner(
    x_internal_api_key: str = Header(default=""),
    x_pf_owner_token: str = Header(default=""),
) -> uuid.UUID:
    if not settings.internal_api_key or not secrets.compare_digest(
        x_internal_api_key.encode(), settings.internal_api_key.encode()
    ):
        raise HTTPException(status_code=401, detail="Internal authentication required")
    if not settings.owner_signing_secret:
        raise HTTPException(status_code=401, detail="Owner required")
    try:
        return _verify_owner_token(x_pf_owner_token)
    except ValueError:  # also covers a non-UUID or non-integer part
        raise HTTPException(status_code=401, detail="Owner required") from None


def _token_subject(token: str) -> str:
    """The unverified `sub` of a JWT. The .NET API verifies the token when it is used."""
    payload = token.split(".")[1]
    claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    return str(claims["sub"])


async def require_user_token(
    owner_id: uuid.UUID = Depends(require_owner),
    x_pf_user_token: str = Header(default=""),
) -> str:
    """The caller's own Supabase token, for routes that read data back through the API.

    It must name the same user as the signed owner token, so memory keyed by owner
    and data fetched with this token always belong to one person.
    """
    try:
        subject = _token_subject(x_pf_user_token)
    except (IndexError, KeyError, TypeError, ValueError, binascii.Error):
        raise HTTPException(status_code=401, detail="User token required") from None
    if subject != str(owner_id):
        raise HTTPException(status_code=401, detail="User token required")
    return x_pf_user_token


@asynccontextmanager
async def owner_connection(db_url: str, owner_id: uuid.UUID):
    """One transaction acting as the user, so RLS backs up every explicit filter."""
    conn = await asyncpg.connect(db_url)
    try:
        async with conn.transaction():
            await conn.execute("SET LOCAL ROLE authenticated")
            await conn.execute(
                "SELECT set_config('request.jwt.claims', $1, true)",
                json.dumps({"sub": str(owner_id), "role": "authenticated"}),
            )
            yield conn
    finally:
        await conn.close()
