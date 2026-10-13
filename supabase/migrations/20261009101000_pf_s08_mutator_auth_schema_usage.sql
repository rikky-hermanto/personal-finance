-- Supabase owns the auth schema with supabase_admin. The migration role cannot
-- grant auth schema USAGE directly to a new role. Inheriting the anon role gives
-- the non-login mutator only that existing schema access; the owner-scoped table
-- grants and RLS from the preceding migration remain the write boundary.
BEGIN;

DO $check$
BEGIN
  IF pg_catalog.has_table_privilege('anon', 'public.transactions', 'INSERT,UPDATE,DELETE')
     OR pg_catalog.has_table_privilege('anon', 'public.uploaded_files', 'INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'PF-S08 expected anon direct DML to be revoked';
  END IF;
END $check$;

GRANT anon TO pf_cashflow_mutator WITH INHERIT TRUE;

DO $check$
BEGIN
  IF NOT pg_catalog.has_schema_privilege('pf_cashflow_mutator', 'auth', 'USAGE') THEN
    RAISE EXCEPTION 'PF-S08 mutator cannot invoke auth.uid()';
  END IF;
END $check$;

COMMIT;
