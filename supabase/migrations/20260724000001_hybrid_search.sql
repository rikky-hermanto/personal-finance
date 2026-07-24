-- PF-AI006: Hybrid search (BM25 + vector + RRF).
-- 'simple' config: whitespace tokenization, no stemming — correct for terse
-- Indonesian bank descriptions (BELANJA MAKAN, TRANSFER PLN, etc.) where BM25
-- on exact tokens outperforms stemming-based approaches.
--
-- Note: statement_chunks (sentence-window + auto-merging) deferred to
-- PF-AI006-PART2 — see .claude/plans/learning/PF-AI006-PART2-sentence-window-automerging-todo.md
ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS description_tsv tsvector
        GENERATED ALWAYS AS (to_tsvector('simple', COALESCE(description, ''))) STORED;

CREATE INDEX IF NOT EXISTS idx_transactions_description_tsv
    ON transactions USING GIN (description_tsv);
