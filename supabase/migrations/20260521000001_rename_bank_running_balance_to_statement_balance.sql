-- Rename bank_running_balance → statement_balance.
-- The column represents the running balance as printed on the bank's own statement
-- for each transaction row — it is source metadata, NOT an app-calculated balance.

-- Drop the composite dedup index (references the column by old name)
DROP INDEX IF EXISTS idx_transactions_deduplication_composite;

-- Rename the column
ALTER TABLE public.transactions
  RENAME COLUMN bank_running_balance TO statement_balance;

-- Rebuild the composite dedup index with the new column name
CREATE UNIQUE INDEX idx_transactions_deduplication_composite
  ON public.transactions (
    date,
    amount_idr,
    description,
    COALESCE(account_id, '00000000-0000-0000-0000-000000000000'::uuid),
    flow,
    COALESCE(statement_balance, -999999999)
  );
