-- Drop existing dedup index (references wallet column — must drop before altering column)
DROP INDEX IF EXISTS idx_transactions_deduplication_composite;

-- Drop wallet column — data reset means no rows to preserve
ALTER TABLE public.transactions
  DROP COLUMN IF EXISTS wallet;

-- Add account_id as NOT NULL FK
-- NOTE: requires transactions table to be empty (enforced by data reset above)
ALTER TABLE public.transactions
  ADD COLUMN account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT;

-- Rebuild dedup index using account_id in place of wallet
CREATE UNIQUE INDEX idx_transactions_deduplication_composite
  ON public.transactions (
    date,
    amount_idr,
    description,
    account_id,
    flow,
    COALESCE(bank_running_balance, -999999999)
  );

-- Index for account-scoped queries
CREATE INDEX idx_transactions_account_id ON public.transactions (account_id);

-- Alias table: maps wallet text (from parser/AI) to account_id
CREATE TABLE public.wallet_account_aliases (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alias_text  text NOT NULL,
  account_id  uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (alias_text, account_id)
);

-- RLS: open (flip to auth.uid() in PF-S08)
ALTER TABLE public.wallet_account_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wallet_account_aliases_open" ON public.wallet_account_aliases
  FOR ALL USING (true) WITH CHECK (true);
