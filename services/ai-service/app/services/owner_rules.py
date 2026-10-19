"""The categorizer agent's rule snapshot, per owner (PF-S15 STEP 14).

The caller's private category rules come first and win over a shared preset with the
same keyword, mirroring CategoryRuleService's layer order. Another user's private rules
are never read: the query filters by owner and runs as that user, so RLS backs it up.
"""
from __future__ import annotations

import logging
import uuid

from app.owner import owner_connection

logger = logging.getLogger(__name__)


async def load_owner_rules(db_url: str, owner_id: uuid.UUID) -> dict[str, str]:
    """Lower-cased keyword -> category. A DB failure degrades the rule tool, never the request."""
    try:
        async with owner_connection(db_url, owner_id) as conn:
            private = await conn.fetch(
                "SELECT keyword, category FROM category_rules "
                "WHERE user_id = $1 ORDER BY keyword_length DESC, id",
                owner_id,
            )
            presets = await conn.fetch(
                "SELECT keyword, category FROM category_presets ORDER BY keyword_length DESC, id"
            )
    except Exception:
        logger.exception("failed to load category rules — agent rule tool will return no matches")
        return {}

    rules: dict[str, str] = {}
    for row in [*private, *presets]:
        rules.setdefault(row["keyword"].lower(), row["category"])
    return rules
