-- Add include_in_cashflow flag to accounts
-- Default true for transactional accounts; false for investment/loan accounts
ALTER TABLE public.accounts
  ADD COLUMN include_in_cashflow boolean NOT NULL DEFAULT true;

-- Retroactively set false for accounts at broker/crypto institutions
UPDATE public.accounts a
  SET include_in_cashflow = false
  FROM public.institutions i
  WHERE a.institution_id = i.id
    AND i.type IN ('broker', 'crypto_exchange');

-- Also set false for brokerage/loan accounts with no institution
UPDATE public.accounts
  SET include_in_cashflow = false
  WHERE account_type IN ('brokerage', 'loan')
    AND institution_id IS NULL;
