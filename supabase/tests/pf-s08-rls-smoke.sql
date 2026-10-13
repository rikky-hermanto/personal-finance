-- Run only against a disposable local database after PF-S08 enforce.
-- All fixtures roll back. This tests database roles and claims, not JWT transport.
\set ON_ERROR_STOP on
BEGIN;
SELECT gen_random_uuid() AS a_user, gen_random_uuid() AS b_user,
       gen_random_uuid() AS a_account, gen_random_uuid() AS b_account \gset
SELECT set_config('app.pf_s08_a_user', :'a_user', true) AS a_setting,
       set_config('app.pf_s08_b_account', :'b_account', true) AS b_setting \gset

INSERT INTO auth.users (id, instance_id, aud, role, created_at, updated_at)
VALUES
  (:'a_user', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now()),
  (:'b_user', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now());
INSERT INTO public.accounts (id, user_id, name, account_type, currency, opening_date)
VALUES
  (:'a_account', :'a_user', 'Test A', 'checking', 'IDR', current_date),
  (:'b_account', :'b_user', 'Test B', 'checking', 'IDR', current_date);
INSERT INTO public.transactions
  (user_id, account_id, date, description, remarks, flow, type, category, amount_idr, currency)
VALUES
  (:'a_user', :'a_account', now(), 'Fixture', '', 'CR', 'Income', 'Test', 100, 'IDR'),
  (:'b_user', :'b_account', now(), 'Fixture', '', 'CR', 'Income', 'Test', 50, 'IDR');
INSERT INTO public.uploaded_files (user_id, file_hash, file_name)
VALUES (:'a_user', 'same-file-test-hash', 'a.csv'),
       (:'b_user', 'same-file-test-hash', 'b.csv');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'a_user', true) AS claim_setting \gset
DO $check_a$
BEGIN
  IF (SELECT count(*) FROM public.transactions) <> 1
    OR (SELECT count(*) FROM public.accounts) <> 1
    OR (SELECT count(*) FROM public.uploaded_files) <> 1
    OR (SELECT running_balance FROM public.v_transactions_with_balance) <> 100
    OR has_table_privilege(current_user, 'public.transactions', 'INSERT')
    OR has_table_privilege(current_user, 'public.desk_positions', 'SELECT')
  THEN RAISE EXCEPTION 'User A isolation/grant check failed'; END IF;
END $check_a$;

SELECT set_config('request.jwt.claim.sub', :'b_user', true) AS claim_setting \gset
DO $check_b$
BEGIN
  IF (SELECT count(*) FROM public.transactions) <> 1
    OR (SELECT count(*) FROM public.accounts) <> 1
    OR (SELECT count(*) FROM public.uploaded_files) <> 1
    OR (SELECT running_balance FROM public.v_transactions_with_balance) <> 50
  THEN RAISE EXCEPTION 'User B isolation check failed'; END IF;
END $check_b$;

RESET ROLE;
DO $cross_parent$
BEGIN
  BEGIN
    INSERT INTO public.transactions
      (user_id, account_id, date, description, remarks, flow, type, category, amount_idr, currency)
    VALUES
      (current_setting('app.pf_s08_a_user')::uuid,
       current_setting('app.pf_s08_b_account')::uuid,
       now(), 'Foreign account', '', 'CR', 'Income', 'Test', 1, 'IDR');
    RAISE EXCEPTION 'Foreign account link was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
END $cross_parent$;
ROLLBACK;
