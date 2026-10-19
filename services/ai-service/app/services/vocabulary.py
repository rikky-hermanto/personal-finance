"""CategoryVocabulary: the closed category list the planner selects from, per owner.

The planner prompt and follow-up suggestions both contain this list, so a single
global list would leak one user's custom category names into another user's prompt
(PF-S15 STEP 5). Values are cached per owner for a short TTL in a bounded dict.
"""
from __future__ import annotations

import logging
import time
import uuid
from collections import OrderedDict

from app.owner import owner_connection

logger = logging.getLogger(__name__)

_TTL_SECONDS = 300.0
_MAX_OWNERS = 256


class CategoryVocabulary:
    def __init__(
        self, db_url: str, ttl_seconds: float = _TTL_SECONDS, max_owners: int = _MAX_OWNERS
    ) -> None:
        self._db_url = db_url
        self._ttl = ttl_seconds
        self._max_owners = max_owners
        self._cache: OrderedDict[uuid.UUID, tuple[float, list[str]]] = OrderedDict()

    async def for_owner(self, owner_id: uuid.UUID) -> list[str]:
        now = time.monotonic()
        cached = self._cache.get(owner_id)
        if cached is not None and now - cached[0] < self._ttl:
            self._cache.move_to_end(owner_id)
            return cached[1]

        categories = await self._load(owner_id)
        if categories is None:
            return []  # don't cache a failure; the next request retries
        self._cache[owner_id] = (now, categories)
        self._cache.move_to_end(owner_id)
        while len(self._cache) > self._max_owners:
            self._cache.popitem(last=False)
        return categories

    async def _load(self, owner_id: uuid.UUID) -> list[str] | None:
        """A DB failure degrades the planner to an empty menu, never fails the request."""
        try:
            async with owner_connection(self._db_url, owner_id) as conn:
                rows = await conn.fetch(
                    "SELECT DISTINCT category FROM transactions "
                    "WHERE user_id = $1 AND category <> '' ORDER BY category",
                    owner_id,
                )
            return [r["category"] for r in rows]
        except Exception:
            logger.exception("failed to load category vocabulary — planner will see an empty list")
            return None
