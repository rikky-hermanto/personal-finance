-- PF-S08 enforce stage. Apply only after the expand stage, explicit legacy-owner
-- mapping, a verified backup, and a zero-conflict preflight. The API pilot flag
-- remains off until checked mutation RPCs and two-user tests are complete.
BEGIN;

DO $preflight$
DECLARE failures bigint;
BEGIN
  SELECT count(*) INTO failures FROM (
    SELECT user_id FROM public.transactions
    UNION ALL SELECT user_id FROM public.uploaded_files
    UNION ALL SELECT user_id FROM public.category_rules
    UNION ALL SELECT user_id FROM public.wallet_account_aliases
    UNION ALL SELECT user_id FROM public.accounts
    UNION ALL SELECT user_id FROM public.institutions
    UNION ALL SELECT user_id FROM public.bucket_settings
    UNION ALL SELECT user_id FROM public.bucket_category_overrides
    UNION ALL SELECT user_id FROM public.assets
    UNION ALL SELECT user_id FROM public.holdings
    UNION ALL SELECT user_id FROM public.valuations
    UNION ALL SELECT user_id FROM public.liabilities
    UNION ALL SELECT user_id FROM public.investment_setups
    UNION ALL SELECT user_id FROM public.user_journey_state
    UNION ALL SELECT user_id FROM public.journey_indicator_snapshots
    UNION ALL SELECT user_id FROM public.journey_achievements
    UNION ALL SELECT user_id FROM public.desk_broker_accounts
    UNION ALL SELECT user_id FROM public.desk_positions
    UNION ALL SELECT user_id FROM public.desk_mandate_versions
    UNION ALL SELECT user_id FROM public.desk_recon_issues
    UNION ALL SELECT user_id FROM public.desk_journal_entries
    UNION ALL SELECT user_id FROM public.desk_open_trades
    UNION ALL SELECT user_id FROM public.macro_scenarios
  ) owners LEFT JOIN auth.users users ON users.id = owners.user_id
  WHERE owners.user_id IS NULL
     OR owners.user_id IN ('00000000-0000-0000-0000-000000000000'::uuid,
                          '00000000-0000-0000-0000-000000000001'::uuid)
     OR users.id IS NULL;
  IF failures <> 0 THEN
    RAISE EXCEPTION 'PF-S08 owner preflight failed: % unmapped/invalid owner rows', failures;
  END IF;

  SELECT count(*) INTO failures FROM (
    SELECT 1 FROM public.transactions t JOIN public.accounts a ON a.id = t.account_id
      WHERE t.user_id IS DISTINCT FROM a.user_id
    UNION ALL
    SELECT 1 FROM public.accounts a JOIN public.institutions i ON i.id = a.institution_id
      WHERE a.user_id IS DISTINCT FROM i.user_id
    UNION ALL
    SELECT 1 FROM public.wallet_account_aliases w JOIN public.accounts a ON a.id = w.account_id
      WHERE w.user_id IS DISTINCT FROM a.user_id
  ) conflicts;
  IF failures <> 0 THEN
    RAISE EXCEPTION 'PF-S08 owner preflight failed: % parent/child conflicts', failures;
  END IF;
END $preflight$;

ALTER TABLE public.transactions ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.uploaded_files ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.category_rules ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.wallet_account_aliases ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.transactions ADD CONSTRAINT transactions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public.uploaded_files ADD CONSTRAINT uploaded_files_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public.category_rules ADD CONSTRAINT category_rules_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public.wallet_account_aliases ADD CONSTRAINT wallet_account_aliases_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public.accounts ADD CONSTRAINT accounts_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public.institutions ADD CONSTRAINT institutions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public.bucket_settings ADD CONSTRAINT bucket_settings_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public.bucket_category_overrides ADD CONSTRAINT bucket_category_overrides_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.accounts ADD CONSTRAINT accounts_owner_id_key UNIQUE (user_id, id);
ALTER TABLE public.institutions ADD CONSTRAINT institutions_owner_id_key UNIQUE (user_id, id);
ALTER TABLE public.accounts DROP CONSTRAINT accounts_institution_id_fkey;
ALTER TABLE public.accounts ADD CONSTRAINT accounts_owner_institution_fkey
  FOREIGN KEY (user_id, institution_id)
  REFERENCES public.institutions(user_id, id)
  ON DELETE SET NULL (institution_id);
ALTER TABLE public.transactions DROP CONSTRAINT transactions_account_id_fkey;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_owner_account_fkey
  FOREIGN KEY (user_id, account_id)
  REFERENCES public.accounts(user_id, id) ON DELETE RESTRICT;
ALTER TABLE public.wallet_account_aliases DROP CONSTRAINT wallet_account_aliases_account_id_fkey;
ALTER TABLE public.wallet_account_aliases ADD CONSTRAINT wallet_aliases_owner_account_fkey
  FOREIGN KEY (user_id, account_id)
  REFERENCES public.accounts(user_id, id) ON DELETE CASCADE;

ALTER TABLE public.uploaded_files DROP CONSTRAINT uploaded_files_file_hash_key;
ALTER TABLE public.uploaded_files ADD CONSTRAINT uploaded_files_owner_hash_key UNIQUE (user_id, file_hash);
DROP INDEX public.idx_transactions_deduplication_composite;
CREATE UNIQUE INDEX idx_transactions_deduplication_composite
  ON public.transactions (
    user_id, date, amount_idr, description,
    COALESCE(account_id, '00000000-0000-0000-0000-000000000000'::uuid),
    flow, COALESCE(statement_balance, -999999999)
  );

DROP VIEW public.v_transactions_with_balance;
CREATE VIEW public.v_transactions_with_balance
  WITH (security_invoker = true) AS
SELECT t.*,
  SUM(CASE WHEN t.flow = 'CR' THEN t.amount_idr ELSE -t.amount_idr END)
    OVER (PARTITION BY t.user_id ORDER BY t.date ASC, t.id ASC
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_balance
FROM public.transactions t;

DROP POLICY "allow_all_transactions" ON public.transactions;
DROP POLICY "allow_all_category_rules" ON public.category_rules;
DROP POLICY "accounts_open" ON public.accounts;
DROP POLICY "institutions_open" ON public.institutions;
DROP POLICY "wallet_account_aliases_open" ON public.wallet_account_aliases;
DROP POLICY "bucket_settings_all" ON public.bucket_settings;
DROP POLICY "bucket_category_overrides_all" ON public.bucket_category_overrides;

ALTER TABLE public.uploaded_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY transactions_owner_read ON public.transactions FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY uploaded_files_owner_read ON public.uploaded_files FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY category_rules_owner_read ON public.category_rules FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY accounts_owner_read ON public.accounts FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY institutions_owner_read ON public.institutions FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY wallet_aliases_owner_read ON public.wallet_account_aliases FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY bucket_settings_owner_read ON public.bucket_settings FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY bucket_overrides_owner_read ON public.bucket_category_overrides FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY import_receipts_owner_read ON public.cashflow_import_receipts FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- No direct authenticated DML is granted. Checked mutation functions must be
-- installed and tested before the API pilot flag can be enabled.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.transactions, public.uploaded_files, public.category_rules,
  public.accounts, public.institutions, public.wallet_account_aliases,
  public.bucket_settings, public.bucket_category_overrides,
  public.cashflow_import_receipts, public.category_presets,
  public.v_transactions_with_balance TO authenticated;

-- The experimental storage route is disabled. Older bank-statement objects stay
-- in place but cannot be accessed through a user JWT while ownership is unmapped.
DROP POLICY IF EXISTS "Users can upload their own bank statements" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own bank statements" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own bank statements" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own bank statements" ON storage.objects;

COMMIT;
