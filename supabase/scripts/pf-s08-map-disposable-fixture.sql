-- Only for the brand-new disposable PF-S08 harness, after expand and before
-- enforce. The strict guards prevent applying this to a populated target.
-- This creates a fixture identity with no email, password, or login identity.
DO $fixture$
DECLARE fixture_owner uuid := gen_random_uuid();
DECLARE zero_owner uuid := '00000000-0000-0000-0000-000000000000'::uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version = '20261009080000'
  ) OR EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version >= '20261009090000'
  ) OR EXISTS (SELECT 1 FROM auth.users)
    OR EXISTS (SELECT 1 FROM public.transactions)
    OR EXISTS (SELECT 1 FROM public.accounts)
    OR EXISTS (SELECT 1 FROM public.institutions)
    OR EXISTS (SELECT 1 FROM public.uploaded_files)
    OR EXISTS (SELECT 1 FROM public.category_rules)
    OR EXISTS (SELECT 1 FROM public.wallet_account_aliases)
    OR EXISTS (SELECT 1 FROM public.bucket_settings)
    OR EXISTS (SELECT 1 FROM public.bucket_category_overrides)
  THEN
    RAISE EXCEPTION 'PF-S08 fixture map requires a new empty harness at owner-expand';
  END IF;

  IF (SELECT count(*) FROM public.desk_broker_accounts WHERE user_id = zero_owner) <> 5
    OR (SELECT count(*) FROM public.desk_positions WHERE user_id = zero_owner) <> 12
    OR (SELECT count(*) FROM public.desk_journal_entries WHERE user_id = zero_owner) <> 8
    OR (SELECT count(*) FROM public.desk_open_trades WHERE user_id = zero_owner) <> 2
    OR (SELECT count(*) FROM public.desk_recon_issues WHERE user_id = zero_owner) <> 3
    OR EXISTS (SELECT 1 FROM public.desk_mandate_versions)
    OR EXISTS (SELECT 1 FROM public.macro_scenarios)
  THEN
    RAISE EXCEPTION 'PF-S08 fixture counts differ from inspected fresh migrations';
  END IF;

  INSERT INTO auth.users (
    instance_id, id, aud, role, created_at, updated_at,
    banned_until, raw_app_meta_data
  ) VALUES (
    '00000000-0000-0000-0000-000000000000'::uuid,
    fixture_owner, 'authenticated', 'authenticated', now(), now(),
    'infinity'::timestamptz,
    '{"provider":"fixture_blocked","providers":[]}'::jsonb
  );

  UPDATE public.desk_broker_accounts SET user_id = fixture_owner WHERE user_id = zero_owner;
  UPDATE public.desk_positions SET user_id = fixture_owner WHERE user_id = zero_owner;
  UPDATE public.desk_journal_entries SET user_id = fixture_owner WHERE user_id = zero_owner;
  UPDATE public.desk_open_trades SET user_id = fixture_owner WHERE user_id = zero_owner;
  UPDATE public.desk_recon_issues SET user_id = fixture_owner WHERE user_id = zero_owner;
END $fixture$;
