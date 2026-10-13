-- Read-only blocking gate after explicit owner mapping, before PF-S08 enforce.
-- Run with an administrative DB role in maintenance. Review the separate
-- ownership-preflight report and baseline counts before this gate.
\set ON_ERROR_STOP on
DO $gate$
DECLARE
  table_name text;
  invalid_count bigint;
  zero_owner uuid := '00000000-0000-0000-0000-000000000000';
  placeholder_owner uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations
                 WHERE version = '20261009080000') THEN
    RAISE EXCEPTION 'PF-S08 owner-expand migration is missing';
  END IF;

  -- Deferred rows are checked too: their APIs remain closed, but they must not
  -- retain invented/invalid owners when shared account parents are remapped.
  FOREACH table_name IN ARRAY ARRAY[
    'transactions', 'uploaded_files', 'category_rules',
    'wallet_account_aliases', 'accounts', 'institutions',
    'bucket_settings', 'bucket_category_overrides',
    'assets', 'holdings', 'valuations', 'liabilities',
    'investment_setups', 'user_journey_state',
    'journey_indicator_snapshots', 'journey_achievements',
    'desk_broker_accounts', 'desk_positions', 'desk_mandate_versions',
    'desk_recon_issues', 'desk_journal_entries', 'desk_open_trades',
    'macro_scenarios']
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM public.%I t LEFT JOIN auth.users u ON u.id = t.user_id '
      || 'WHERE t.user_id IS NULL OR t.user_id IN ($1, $2) OR u.id IS NULL',
      table_name)
      INTO invalid_count USING zero_owner, placeholder_owner;
    IF invalid_count <> 0 THEN
      RAISE EXCEPTION 'PF-S08 owner gate: % has % unmapped/invalid owners',
        table_name, invalid_count;
    END IF;
  END LOOP;

  SELECT count(*) INTO invalid_count
  FROM public.transactions t JOIN public.accounts a ON a.id = t.account_id
  WHERE t.user_id IS DISTINCT FROM a.user_id;
  IF invalid_count <> 0 THEN
    RAISE EXCEPTION 'PF-S08 owner gate: transaction/account mismatch (%)', invalid_count;
  END IF;
  SELECT count(*) INTO invalid_count
  FROM public.accounts a JOIN public.institutions i ON i.id = a.institution_id
  WHERE a.user_id IS DISTINCT FROM i.user_id;
  IF invalid_count <> 0 THEN
    RAISE EXCEPTION 'PF-S08 owner gate: account/institution mismatch (%)', invalid_count;
  END IF;
  SELECT count(*) INTO invalid_count
  FROM public.wallet_account_aliases w JOIN public.accounts a ON a.id = w.account_id
  WHERE w.user_id IS DISTINCT FROM a.user_id;
  IF invalid_count <> 0 THEN
    RAISE EXCEPTION 'PF-S08 owner gate: alias/account mismatch (%)', invalid_count;
  END IF;
  SELECT count(*) INTO invalid_count
  FROM public.assets x JOIN public.accounts a ON a.id = x.account_id
  WHERE x.user_id IS DISTINCT FROM a.user_id;
  IF invalid_count <> 0 THEN
    RAISE EXCEPTION 'PF-S08 owner gate: asset/account mismatch (%)', invalid_count;
  END IF;
  SELECT count(*) INTO invalid_count
  FROM public.holdings x JOIN public.accounts a ON a.id = x.account_id
  WHERE x.user_id IS DISTINCT FROM a.user_id;
  IF invalid_count <> 0 THEN
    RAISE EXCEPTION 'PF-S08 owner gate: holding/account mismatch (%)', invalid_count;
  END IF;
  SELECT count(*) INTO invalid_count
  FROM public.liabilities x JOIN public.accounts a ON a.id = x.account_id
  WHERE x.user_id IS DISTINCT FROM a.user_id;
  IF invalid_count <> 0 THEN
    RAISE EXCEPTION 'PF-S08 owner gate: liability/account mismatch (%)', invalid_count;
  END IF;
END $gate$;
SELECT 'PF-S08 owner mapping gate passed' AS result;
