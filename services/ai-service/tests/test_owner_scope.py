"""PF-S15 owner scoping: the route gate, the owner token, and the SQL every
owner route runs. Mocked DB and providers only; the live two-user check is
scripts/pf_s15_ai_isolation.py.
"""
import hashlib
import hmac
import json
import pathlib
import time
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.main import app
from app.models import QueryPlan, SearchResult
from app.owner import _verify_owner_token, owner_connection, require_owner
from app.services.aggregator import AggregationService
from app.services.embedder import EmbeddingService, EmbedItem
from app.services.retriever import RetrievalService
from app.services.vocabulary import CategoryVocabulary
from tests.conftest import make_owner_conn

OWNER_A = uuid.UUID("11111111-1111-1111-1111-111111111111")
OWNER_B = uuid.UUID("22222222-2222-2222-2222-222222222222")
KEY = "test-internal-key"
SECRET = "pf-s15-fixture-secret"  # commit-skill:allow

# Shared with OwnerTokenSignerTests.cs: the same secret, user and timestamp must
# produce this exact token on both sides of the service boundary.
FIXTURE_TS = 1700000000
FIXTURE_TOKEN = (
    "11111111-1111-1111-1111-111111111111.1700000000."
    "4aa59c656e15ddc2e63799a0ce43e596c95e82be0c2d301c0865461573326887"
)


def _sign(owner: uuid.UUID, ts: int | None = None, secret: str = SECRET) -> str:
    ts = int(time.time()) if ts is None else ts
    prefix = f"{owner}.{ts}"
    return f"{prefix}.{hmac.new(secret.encode(), prefix.encode(), hashlib.sha256).hexdigest()}"


@pytest.fixture
def secrets_set(monkeypatch):
    monkeypatch.setattr(settings, "internal_api_key", KEY)
    monkeypatch.setattr(settings, "owner_signing_secret", SECRET)


# ── owner token ──────────────────────────────────────────────────────────────

def test_verify_owner_token_accepts_shared_fixture(secrets_set):
    with patch("app.owner.time.time", return_value=FIXTURE_TS + 5):
        assert _verify_owner_token(FIXTURE_TOKEN) == OWNER_A


def test_verify_owner_token_rejects_stale_token(secrets_set):
    with patch("app.owner.time.time", return_value=FIXTURE_TS + 61):
        with pytest.raises(ValueError):
            _verify_owner_token(FIXTURE_TOKEN)


@pytest.mark.parametrize("token", [
    "",
    "not-a-token",
    _sign(OWNER_A, secret="some-other-secret"),               # wrongly signed  # commit-skill:allow
    _sign(OWNER_A).replace(str(OWNER_A), str(OWNER_B)),      # user swapped, old signature
    _sign(OWNER_A)[:-1] + ("0" if _sign(OWNER_A)[-1] != "0" else "1"),  # tampered signature
    "not-a-uuid.123." + "0" * 64,
])
def test_verify_owner_token_rejects_bad_tokens(secrets_set, token):
    with pytest.raises(ValueError):
        _verify_owner_token(token)


@pytest.mark.asyncio
async def test_require_owner_rejects_missing_or_wrong_key(secrets_set):
    for key in ("", "wrong-key"):
        with pytest.raises(HTTPException) as exc:
            await require_owner(x_internal_api_key=key, x_pf_owner_token=_sign(OWNER_A))
        assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_require_owner_rejects_when_signing_secret_unset(monkeypatch):
    monkeypatch.setattr(settings, "internal_api_key", KEY)
    monkeypatch.setattr(settings, "owner_signing_secret", "")
    with pytest.raises(HTTPException) as exc:
        await require_owner(x_internal_api_key=KEY, x_pf_owner_token=_sign(OWNER_A, secret=""))
    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_require_owner_returns_signed_owner(secrets_set):
    assert await require_owner(x_internal_api_key=KEY, x_pf_owner_token=_sign(OWNER_B)) == OWNER_B


# ── owner_connection ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_owner_connection_acts_as_authenticated_user_and_closes(owner_db):
    async with owner_connection("postgresql://test", OWNER_A) as conn:
        assert conn is owner_db

    calls = [c.args for c in owner_db.execute.call_args_list]
    assert calls[0] == ("SET LOCAL ROLE authenticated",)
    assert "set_config('request.jwt.claims', $1, true)" in calls[1][0]
    assert json.loads(calls[1][1]) == {"sub": str(OWNER_A), "role": "authenticated"}
    owner_db.transaction.assert_called_once()
    owner_db.close.assert_called_once()


# ── SQL shape: every statement filters by the bound owner ────────────────────

def _row(data: dict) -> MagicMock:
    row = MagicMock()
    row.__getitem__ = MagicMock(side_effect=lambda key: data[key])
    return row


def _search_row(tid: int = 1) -> MagicMock:
    return _row({
        "transaction_id": tid, "id": tid, "similarity": 0.9, "description": "TX",
        "date": "2026-03-01", "amount_idr": 1000.0, "flow": "DB", "wallet": "BCA",
        "category": "Food",
    })


def _assert_owner_scoped(fetch_calls, owner: uuid.UUID) -> None:
    assert fetch_calls, "no SQL was run"
    for call in fetch_calls:
        sql, params = call.args[0], call.args[1:]
        assert "t.user_id = $" in sql, sql
        assert owner in params, sql


@pytest.mark.asyncio
@pytest.mark.parametrize("mode", ["vector", "bm25", "hybrid"])
async def test_retriever_every_statement_is_owner_scoped(owner_db, mode):
    owner_db.fetch = AsyncMock(return_value=[_search_row()])
    provider = MagicMock(model="m")
    provider.embed_query = AsyncMock(return_value=[0.1, 0.2])
    service = RetrievalService(provider=provider, db_url="postgresql://test")

    with patch("app.services.retriever.register_vector", new_callable=AsyncMock):
        await service.search("food", top_k=5, search_mode=mode, owner_id=OWNER_B)

    _assert_owner_scoped(owner_db.fetch.call_args_list, OWNER_B)
    executed = [c.args[0] for c in owner_db.execute.call_args_list]
    assert "SET LOCAL ivfflat.probes = 10" in executed
    assert "SET LOCAL ivfflat.iterative_scan = relaxed_order" in executed


@pytest.mark.asyncio
async def test_aggregator_every_statement_is_owner_scoped(owner_db):
    owner_db.fetchrow = AsyncMock(return_value=_row({"total": 100, "n": 1}))
    owner_db.fetch = AsyncMock(return_value=[])
    service = AggregationService(db_url="postgresql://test")

    await service.aggregate(QueryPlan(intent="aggregate", categories=["Food"], flow="DB"),
                            owner_id=OWNER_A)

    _assert_owner_scoped(owner_db.fetchrow.call_args_list + owner_db.fetch.call_args_list, OWNER_A)


# ── per-owner vocabulary ─────────────────────────────────────────────────────

def _vocab_db(owner_db, by_owner: dict[uuid.UUID, list[str]]) -> None:
    async def fetch(sql, owner):
        assert "user_id = $1" in sql
        return [_row({"category": c}) for c in by_owner.get(owner, [])]
    owner_db.fetch = AsyncMock(side_effect=fetch)


@pytest.mark.asyncio
async def test_vocabulary_two_owners_get_their_own_lists(owner_db):
    _vocab_db(owner_db, {OWNER_A: ["Food"], OWNER_B: ["Secret B Category"]})
    vocab = CategoryVocabulary(db_url="postgresql://test")

    assert await vocab.for_owner(OWNER_A) == ["Food"]
    assert await vocab.for_owner(OWNER_B) == ["Secret B Category"]


@pytest.mark.asyncio
async def test_vocabulary_new_user_gets_empty_list(owner_db):
    _vocab_db(owner_db, {})
    assert await CategoryVocabulary(db_url="postgresql://test").for_owner(OWNER_A) == []


@pytest.mark.asyncio
async def test_vocabulary_caches_then_expires(owner_db):
    _vocab_db(owner_db, {OWNER_A: ["Food"]})
    vocab = CategoryVocabulary(db_url="postgresql://test", ttl_seconds=300)

    with patch("app.services.vocabulary.time.monotonic", return_value=1000.0):
        await vocab.for_owner(OWNER_A)
        await vocab.for_owner(OWNER_A)
    assert owner_db.fetch.call_count == 1

    with patch("app.services.vocabulary.time.monotonic", return_value=1301.0):
        await vocab.for_owner(OWNER_A)
    assert owner_db.fetch.call_count == 2


@pytest.mark.asyncio
async def test_vocabulary_is_bounded(owner_db):
    _vocab_db(owner_db, {})
    vocab = CategoryVocabulary(db_url="postgresql://test", max_owners=2)
    for _ in range(3):
        await vocab.for_owner(uuid.uuid4())
    assert len(vocab._cache) == 2


@pytest.mark.asyncio
async def test_vocabulary_failure_returns_empty_and_is_not_cached(owner_db):
    owner_db.fetch = AsyncMock(side_effect=Exception("db down"))
    vocab = CategoryVocabulary(db_url="postgresql://test")

    assert await vocab.for_owner(OWNER_A) == []
    assert OWNER_A not in vocab._cache


# ── owner-checked embedding writes ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_embed_other_users_transaction_stores_nothing_and_counts_skipped():
    provider = MagicMock(model="m", last_token_count=1)
    provider.embed_documents = AsyncMock(return_value=[[0.1], [0.2]])
    conn = AsyncMock()
    # tx 1 is the caller's; tx 2 belongs to someone else, so the guarded INSERT matches nothing.
    conn.execute = AsyncMock(side_effect=["INSERT 0 1", "INSERT 0 0"])
    with patch("app.services.embedder.asyncpg.connect", new_callable=AsyncMock, return_value=conn), \
         patch("app.services.embedder.register_vector", new_callable=AsyncMock):
        service = EmbeddingService(provider=provider, db_url="postgresql://test")
        embedded, skipped = await service.embed_and_store(
            [EmbedItem(transaction_id=1, description="A"), EmbedItem(transaction_id=2, description="B")],
            OWNER_A,
        )

    assert (embedded, skipped) == (1, 1)
    for call in conn.execute.call_args_list:
        sql, params = call.args[0], call.args[1:]
        assert "FROM transactions t" in sql and "t.user_id = $5" in sql
        assert params[-1] == OWNER_A


# ── route gate (STEP 7) ──────────────────────────────────────────────────────

_OWNER_ROUTES = ("/ask", "/ask/stream", "/ask/followups", "/search", "/embed-transactions")


def _client(headers: dict | None = None) -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=headers or {})


@pytest.mark.asyncio
async def test_owner_routes_404_when_flag_off(secrets_set, monkeypatch):
    monkeypatch.setattr(settings, "ai_chat_enabled", False)
    async with _client({"X-Internal-Api-Key": KEY, "X-Pf-Owner-Token": _sign(OWNER_A)}) as client:
        for path in _OWNER_ROUTES:
            assert (await client.post(path, json={})).status_code == 404, path


@pytest.mark.asyncio
@pytest.mark.parametrize("headers", [
    {},                                                                    # no key
    {"X-Internal-Api-Key": KEY},                                           # key, no owner
    {"X-Internal-Api-Key": KEY, "X-Pf-Owner-Token": "garbage"},            # malformed
    {"X-Internal-Api-Key": KEY, "X-Pf-Owner-Token": _sign(OWNER_A, secret="x")},  # wrongly signed
    {"X-Internal-Api-Key": KEY, "X-Pf-Owner-Token": _sign(OWNER_A, ts=int(time.time()) - 120)},  # stale
    {"X-Internal-Api-Key": "wrong", "X-Pf-Owner-Token": _sign(OWNER_A)},   # wrong key
])
async def test_owner_routes_401_without_key_and_valid_owner_token(secrets_set, monkeypatch, headers):
    monkeypatch.setattr(settings, "ai_chat_enabled", True)
    async with _client(headers) as client:
        for path in _OWNER_ROUTES:
            assert (await client.post(path, json={"query": "q", "items": []})).status_code == 401, path


@pytest.mark.asyncio
async def test_search_with_valid_token_reaches_service_with_that_owner(secrets_set, monkeypatch):
    monkeypatch.setattr(settings, "ai_chat_enabled", True)
    saved = getattr(app.state, "retriever", None)
    app.state.retriever = AsyncMock()
    app.state.retriever.search = AsyncMock(return_value=[SearchResult(
        transaction_id=7, similarity=0.9, description="TX", date="2026-03-01",
        amount_idr=1000.0, flow="DB", wallet="BCA",
    )])
    try:
        async with _client({"X-Internal-Api-Key": KEY, "X-Pf-Owner-Token": _sign(OWNER_B)}) as client:
            response = await client.post("/search", json={"query": "food"})
    finally:
        app.state.retriever = saved

    assert response.status_code == 200
    assert response.json()["results"][0]["transaction_id"] == 7


@pytest.mark.asyncio
async def test_followups_and_embed_receive_the_signed_owner(secrets_set, monkeypatch):
    monkeypatch.setattr(settings, "ai_chat_enabled", True)
    names = ("vocabulary", "followup_suggester", "embedder")
    saved = {n: getattr(app.state, n, None) for n in names}
    vocabulary = app.state.vocabulary = AsyncMock()
    vocabulary.for_owner = AsyncMock(return_value=["B only"])
    suggester = app.state.followup_suggester = AsyncMock()
    suggester.suggest = AsyncMock(return_value=["q1"])
    embedder = app.state.embedder = AsyncMock()
    embedder.embed_and_store = AsyncMock(return_value=(0, 1))
    try:
        headers = {"X-Internal-Api-Key": KEY, "X-Pf-Owner-Token": _sign(OWNER_B)}
        async with _client(headers) as client:
            r1 = await client.post("/ask/followups", json={"question": "q", "answer": "a"})
            r2 = await client.post("/embed-transactions", json={"items": [
                {"transaction_id": 99, "description": "A's row"}]})
    finally:
        for n, v in saved.items():
            setattr(app.state, n, v)

    assert r1.status_code == 200
    vocabulary.for_owner.assert_awaited_once_with(OWNER_B)
    assert suggester.suggest.call_args.args[1] == ["B only"]
    assert r2.status_code == 200 and r2.json()["embedded"] == 0
    assert embedder.embed_and_store.call_args.args[1] == OWNER_B


@pytest.mark.asyncio
async def test_pilot_route_unchanged_by_chat_flag(secrets_set, monkeypatch):
    monkeypatch.setattr(settings, "cashflow_pilot_enabled", True)
    monkeypatch.setattr(settings, "ai_chat_enabled", True)
    async with _client() as client:
        assert (await client.post("/parse", json={})).status_code == 401
        assert (await client.post("/parse", json={}, headers={"X-Internal-Api-Key": KEY})).status_code == 422


# ── guard: no unscoped connection can be added later ─────────────────────────

def test_asyncpg_connect_only_in_owner_helper_and_embedder_write_path():
    app_dir = pathlib.Path(__file__).resolve().parent.parent / "app"
    allowed = {app_dir / "owner.py", app_dir / "services" / "embedder.py"}
    offenders = [
        str(path.relative_to(app_dir))
        for path in app_dir.rglob("*.py")
        if path not in allowed and "asyncpg.connect" in path.read_text(encoding="utf-8")
    ]
    assert offenders == [], f"unscoped asyncpg.connect in {offenders}; use owner_connection"
