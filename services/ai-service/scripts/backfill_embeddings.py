"""Backfill: embed transactions missing an embedding or from a stale provider model.

    python scripts/backfill_embeddings.py [--batch-size 50] [--dry-run] [--yes]

Detects two cases:
  1. Missing   — transactions with no row in transaction_embeddings
  2. Mismatch  — transactions whose stored model != the active EMBEDDING_PROVIDER model

If mismatch rows exist and --yes is not set, prints a destructive-action warning
and requires interactive [y/N] confirmation before proceeding.

--dry-run   Reports both counts without embedding anything.
--yes       Skips the interactive confirmation (non-interactive / CI use).
"""
import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import asyncpg
from pgvector.asyncpg import register_vector

from app.config import settings
from app.providers.embedding_factory import create_embedding_provider
from app.services.embedder import EmbeddingService, EmbedItem


async def backfill(batch_size: int, dry_run: bool, yes: bool) -> None:
    provider = create_embedding_provider(settings)
    active_model = provider.model

    conn = await asyncpg.connect(settings.database_url)
    await register_vector(conn)

    # Transactions with no embedding row at all
    missing_rows = await conn.fetch(
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

    # Transactions whose stored embedding model differs from the active model
    mismatch_rows = await conn.fetch(
        """
        SELECT t.id, t.description, t.remarks, t.category,
               COALESCE(a.name, '') AS wallet,
               te.model AS stored_model
        FROM transactions t
        LEFT JOIN accounts a ON a.id = t.account_id
        JOIN transaction_embeddings te ON te.transaction_id = t.id
        WHERE te.model != $1
        ORDER BY t.id
        """,
        active_model,
    )

    await conn.close()

    missing_count = len(missing_rows)
    mismatch_count = len(mismatch_rows)

    print(f"Active embedding model : {active_model}")
    print(f"Missing embeddings     : {missing_count}")
    print(f"Model-mismatch rows    : {mismatch_count}")

    if dry_run:
        print("\nDry run — not embedding anything.")
        return

    if mismatch_count > 0:
        # Collect distinct old model names for the warning message
        old_models = sorted({r["stored_model"] for r in mismatch_rows})
        print(
            f"\nWARNING: Found {mismatch_count} embeddings from model(s) {old_models!r}.\n"
            f"Active model is '{active_model}'. ALL {mismatch_count} existing embeddings "
            f"will be replaced."
        )
        if not yes:
            answer = input("Proceed? [y/N] ").strip().lower()
            if answer != "y":
                print("Aborted.")
                return

    total_rows = list(missing_rows) + list(mismatch_rows)
    total = len(total_rows)

    if total == 0:
        print("\nNothing to embed.")
        return

    print(f"\nEmbedding {total} transactions using {active_model} ...")
    service = EmbeddingService(provider=provider, db_url=settings.database_url)

    for i in range(0, total, batch_size):
        batch = total_rows[i : i + batch_size]
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

    print("\nDone.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--batch-size", type=int, default=50, help="Rows per embedding API call (default: 50)")
    ap.add_argument("--dry-run", action="store_true", help="Report counts only — do not embed anything")
    ap.add_argument("--yes", action="store_true", help="Skip interactive confirmation for destructive actions")
    args = ap.parse_args()
    asyncio.run(backfill(args.batch_size, args.dry_run, args.yes))
