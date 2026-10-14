-- Populated target, single legacy owner: map every legacy row to one explicit,
-- already-provisioned Auth user after owner-expand and before enforce.
-- Use only when the operator has decided that all existing data belongs to one
-- person. Both the UUID and the email must be supplied and must agree, so a
-- typo cannot assign data to the wrong user. Rows that already belong to a
-- different real owner abort the run: that target needs a reviewed
-- multi-owner mapping instead.
--
--   psql -v owner_id=<uuid> -v owner_email=<email> -f pf-s08-map-single-owner.sql
--
-- Runs in one transaction. Review the NOTICE counts against the baseline, then
-- run pf-s08-ownership-preflight.sql and pf-s08-ownership-gate.sql.
\set ON_ERROR_STOP on
SELECT set_config('pf_s08.owner_id', :'owner_id', false),
       set_config('pf_s08.owner_email', :'owner_email', false);

BEGIN;
DO $map$
DECLARE
  owner uuid := current_setting('pf_s08.owner_id')::uuid;
  owner_email text := lower(btrim(current_setting('pf_s08.owner_email')));
  zero_owner uuid := '00000000-0000-0000-0000-000000000000';
  placeholder_owner uuid := '00000000-0000-0000-0000-000000000001';
  table_name text;
  foreign_count bigint;
  mapped_count bigint;
  owned_tables text[] := ARRAY[
    'transactions', 'uploaded_files', 'category_rules',
    'wallet_account_aliases', 'accounts', 'institutions',
    'bucket_settings', 'bucket_category_overrides',
    'assets', 'holdings', 'valuations', 'liabilities',
    'investment_setups', 'user_journey_state',
    'journey_indicator_snapshots', 'journey_achievements',
    'desk_broker_accounts', 'desk_positions', 'desk_mandate_versions',
    'desk_recon_issues', 'desk_journal_entries', 'desk_open_trades',
    'macro_scenarios'];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations
                 WHERE version = '20261009080000')
     OR EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations
                WHERE version >= '20261009090000') THEN
    RAISE EXCEPTION 'PF-S08 single-owner map requires a target at owner-expand, before enforce';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = owner
      AND lower(u.email) = owner_email
      AND u.email_confirmed_at IS NOT NULL
      AND (u.banned_until IS NULL OR u.banned_until < now())
      AND u.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'PF-S08 owner % is not a confirmed, active Auth user with the given email', owner;
  END IF;

  FOREACH table_name IN ARRAY owned_tables LOOP
    EXECUTE format(
      'SELECT count(*) FROM public.%I WHERE user_id IS NOT NULL AND user_id NOT IN ($1, $2, $3)',
      table_name)
      INTO foreign_count USING zero_owner, placeholder_owner, owner;
    IF foreign_count <> 0 THEN
      RAISE EXCEPTION 'PF-S08 single-owner map: % has % rows owned by another user; use a reviewed multi-owner mapping',
        table_name, foreign_count;
    END IF;
  END LOOP;

  FOREACH table_name IN ARRAY owned_tables LOOP
    EXECUTE format(
      'UPDATE public.%I SET user_id = $1 WHERE user_id IS NULL OR user_id IN ($2, $3)',
      table_name)
      USING owner, zero_owner, placeholder_owner;
    GET DIAGNOSTICS mapped_count = ROW_COUNT;
    RAISE NOTICE 'mapped % % rows', table_name, mapped_count;
  END LOOP;
END $map$;
COMMIT;
