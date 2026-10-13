-- Run read-only against a disposable PF-S08 database after all pilot migrations.
-- PostgREST exposes public and graphql_public; Storage has its own API/RLS.
\set ON_ERROR_STOP on

DO $audit$
DECLARE
  unexpected text;
BEGIN
  SELECT string_agg(n.nspname || '.' || c.relname, ', ' ORDER BY n.nspname, c.relname)
  INTO unexpected
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('public', 'graphql_public')
    AND c.relkind IN ('r', 'v', 'm', 'p', 'f')
    AND (
      has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE')
      OR has_table_privilege('authenticated', c.oid, 'INSERT, UPDATE, DELETE')
      OR (has_table_privilege('authenticated', c.oid, 'SELECT')
          AND (n.nspname, c.relname) NOT IN (
            ('public', 'accounts'), ('public', 'bucket_category_overrides'),
            ('public', 'bucket_settings'), ('public', 'cashflow_import_receipts'),
            ('public', 'category_presets'), ('public', 'category_rules'),
            ('public', 'institutions'), ('public', 'transactions'),
            ('public', 'uploaded_files'), ('public', 'v_transactions_with_balance'),
            ('public', 'wallet_account_aliases')))
    );
  IF unexpected IS NOT NULL THEN
    RAISE EXCEPTION 'Unexpected exposed relation grants: %', unexpected;
  END IF;

  SELECT string_agg(n.nspname || '.' || p.proname, ', ' ORDER BY n.nspname, p.proname)
  INTO unexpected
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('public', 'graphql_public')
    AND (has_function_privilege('anon', p.oid, 'EXECUTE')
         OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
    AND NOT EXISTS (
      SELECT 1 FROM pg_depend d
      WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
    AND NOT (n.nspname = 'graphql_public' AND p.proname = 'graphql'
             AND NOT p.prosecdef)
    AND NOT (n.nspname = 'public'
             AND p.proname = ANY (ARRAY[
               'create_cashflow_account', 'create_cashflow_institution',
               'create_cashflow_rule', 'delete_cashflow_account',
               'delete_cashflow_institution', 'delete_cashflow_rule',
               'demote_cashflow_committed_item', 'get_cashflow_liquid_total',
               'reset_cashflow', 'reset_cashflow_rules',
               'set_cashflow_account_flag', 'set_cashflow_future_plan',
               'set_cashflow_opening_balance', 'submit_cashflow_import',
               'update_cashflow_account', 'update_cashflow_institution',
               'update_cashflow_rule'])
             AND p.prosecdef
             AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
             AND has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  IF unexpected IS NOT NULL THEN
    RAISE EXCEPTION 'Unexpected exposed application functions: %', unexpected;
  END IF;

  -- In the pilot, Storage has no client policy for historical bank objects.
  -- Table grants alone do not confer access while its RLS is enabled.
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage') THEN
    RAISE EXCEPTION 'Storage policies need owner audit before pilot release';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'storage' AND c.relname IN ('objects', 'buckets')
               AND NOT c.relrowsecurity) THEN
    RAISE EXCEPTION 'Storage objects/buckets RLS is disabled';
  END IF;
END $audit$;

SELECT 'PF-S08 exposed grants and Storage policy audit passed' AS result;
