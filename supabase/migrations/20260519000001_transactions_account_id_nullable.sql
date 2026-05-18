-- Make account_id nullable — auto-resolved by backend, not required at upload time
-- Rebuild dedup index to handle NULL account_id via COALESCE

DROP INDEX IF EXISTS idx_transactions_deduplication_composite;

ALTER TABLE public.transactions
  ALTER COLUMN account_id DROP NOT NULL;

CREATE UNIQUE INDEX idx_transactions_deduplication_composite
  ON public.transactions (
    date,
    amount_idr,
    description,
    COALESCE(account_id, '00000000-0000-0000-0000-000000000000'::uuid),
    flow,
    COALESCE(bank_running_balance, -999999999)
  );
