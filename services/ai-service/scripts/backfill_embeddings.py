"""One-off backfill: embed all transactions that don't have an embedding yet.

    python scripts/backfill_embeddings.py [--batch-size 50] [--dry-run]
"""
import argparse
import asyncio
import sys
from pathlib import Path

# Allow running from scripts/ without pip install -e .
sys.path.insert(0, str(Path(__file__).parent.parent))

import asyncpg
from pgvector.asyncpg import register_vector

from app.config import settings
from app.services.embedder import EmbeddingService, EmbedItem


async def backfill(batch_size: int, dry_run: bool) -> None:
    conn = await asyncpg.connect(settings.database_url)
    await register_vector(conn)

    # Fetch transactions that don't have an embedding yet.
    # LEFT JOIN accounts to get wallet/account name for richer embedding.
    rows = await conn.fetch(
        """
        SELECT t.id, t.description, t.remarks, t.category,
               COALESCE(a.name, '') AS wallet
        FROM transactions t
        LEFT JOIN accounts a ON a.id = t.account_id
        LEFT JOIN transaction_embeddings te ON te.transaction_id = t.id
        WHERE te.transaction_id IS NULL
        ORDER BY t.id
        """
    )
    await conn.close()

    total = len(rows)
    print(f"Found {total} transactions without embeddings.")
    if dry_run:
        print("Dry run — not embedding anything.")
        return

    service = EmbeddingService()
    for i in range(0, total, batch_size):
        batch = rows[i:i + batch_size]
        items = [
            EmbedItem(
                transaction_id=r["id"],
                description=r["description"],
                remarks=r["remarks"] or "",
                category=r["category"] or "",
                wallet=r["wallet"] or "",
            )
            for r in batch
        ]
        embedded, skipped = await service.embed_and_store(items)
        print(f"Batch {i // batch_size + 1}: embedded={embedded}, skipped={skipped}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--batch-size", type=int, default=50)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    asyncio.run(backfill(args.batch_size, args.dry_run))
