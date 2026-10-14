-- Disposable local PF-S08 database only. All fixture and trigger changes roll back.
-- Fail at the hash and receipt writes, and right after a row insert, to prove
-- the whole checked import rolls back.
\set ON_ERROR_STOP on
BEGIN;
SELECT gen_random_uuid() AS owner_id, gen_random_uuid() AS account_id \gset
SELECT set_config('app.pf_s08_fault_owner', :'owner_id', true) AS owner_setting,
       set_config('app.pf_s08_fault_account', :'account_id', true) AS account_setting \gset
INSERT INTO auth.users (id, instance_id, aud, role, created_at, updated_at)
VALUES (:'owner_id', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', now(), now());
INSERT INTO public.accounts (id, user_id, name, account_type, currency, opening_date)
VALUES (:'account_id', :'owner_id', 'PF-S08 fault account', 'checking', 'IDR', current_date);

CREATE FUNCTION pg_temp.pf_s08_inject_import_fault() RETURNS trigger
LANGUAGE plpgsql AS $fault$
BEGIN
  RAISE EXCEPTION 'pf_s08_fault_injected';
END $fault$;
CREATE TRIGGER pf_s08_fault_before_hash
BEFORE INSERT ON public.uploaded_files
FOR EACH ROW EXECUTE FUNCTION pg_temp.pf_s08_inject_import_fault();

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'owner_id', true) AS sub_setting,
       set_config('request.jwt.claim.role', 'authenticated', true) AS role_setting \gset
DO $test$
DECLARE
  row_payload jsonb := jsonb_build_array(jsonb_build_object(
    'date', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'description', 'PF-S08 fault row', 'remarks', '', 'flow', 'CR',
    'type', 'Income', 'category', 'Test', 'currency', 'IDR',
    'amount_idr', 10, 'account_id', current_setting('app.pf_s08_fault_account'),
    'account_name', 'PF-S08 fault alias',
    'category_rule', jsonb_build_object('keyword', 'PF-S08 fault rule',
                                        'type', 'Income', 'flow', 'CR')));
BEGIN
  BEGIN
    PERFORM public.submit_cashflow_import(gen_random_uuid(), row_payload,
                                          repeat('a', 64), 'fault.csv');
    RAISE EXCEPTION 'Checked import unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'pf_s08_fault_injected' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM public.transactions WHERE description = 'PF-S08 fault row')
     OR EXISTS (SELECT 1 FROM public.wallet_account_aliases
                WHERE alias_text = 'PF-S08 fault alias')
     OR EXISTS (SELECT 1 FROM public.category_rules WHERE keyword = 'PF-S08 fault rule')
     OR EXISTS (SELECT 1 FROM public.uploaded_files WHERE file_hash = repeat('a', 64))
     OR EXISTS (SELECT 1 FROM public.cashflow_import_receipts) THEN
    RAISE EXCEPTION 'Failure before hash left a partial import';
  END IF;
END $test$;

RESET ROLE;
DROP TRIGGER pf_s08_fault_before_hash ON public.uploaded_files;
CREATE TRIGGER pf_s08_fault_before_receipt
BEFORE INSERT ON public.cashflow_import_receipts
FOR EACH ROW EXECUTE FUNCTION pg_temp.pf_s08_inject_import_fault();

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'owner_id', true) AS sub_setting,
       set_config('request.jwt.claim.role', 'authenticated', true) AS role_setting \gset
DO $test$
DECLARE
  row_payload jsonb := jsonb_build_array(jsonb_build_object(
    'date', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'description', 'PF-S08 fault row', 'remarks', '', 'flow', 'CR',
    'type', 'Income', 'category', 'Test', 'currency', 'IDR',
    'amount_idr', 10, 'account_id', current_setting('app.pf_s08_fault_account'),
    'account_name', 'PF-S08 fault alias',
    'category_rule', jsonb_build_object('keyword', 'PF-S08 fault rule',
                                        'type', 'Income', 'flow', 'CR')));
BEGIN
  BEGIN
    PERFORM public.submit_cashflow_import(gen_random_uuid(), row_payload,
                                          repeat('b', 64), 'fault.csv');
    RAISE EXCEPTION 'Checked import unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'pf_s08_fault_injected' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM public.transactions WHERE description = 'PF-S08 fault row')
     OR EXISTS (SELECT 1 FROM public.wallet_account_aliases
                WHERE alias_text = 'PF-S08 fault alias')
     OR EXISTS (SELECT 1 FROM public.category_rules WHERE keyword = 'PF-S08 fault rule')
     OR EXISTS (SELECT 1 FROM public.uploaded_files WHERE file_hash = repeat('b', 64))
     OR EXISTS (SELECT 1 FROM public.cashflow_import_receipts) THEN
    RAISE EXCEPTION 'Failure before receipt left a partial import';
  END IF;
END $test$;

RESET ROLE;
DROP TRIGGER pf_s08_fault_before_receipt ON public.cashflow_import_receipts;
CREATE TRIGGER pf_s08_fault_after_row
AFTER INSERT ON public.transactions
FOR EACH ROW EXECUTE FUNCTION pg_temp.pf_s08_inject_import_fault();

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'owner_id', true) AS sub_setting,
       set_config('request.jwt.claim.role', 'authenticated', true) AS role_setting \gset
DO $test$
DECLARE
  row_payload jsonb := jsonb_build_array(jsonb_build_object(
    'date', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'description', 'PF-S08 fault row', 'remarks', '', 'flow', 'CR',
    'type', 'Income', 'category', 'Test', 'currency', 'IDR',
    'amount_idr', 10, 'account_id', current_setting('app.pf_s08_fault_account'),
    'account_name', 'PF-S08 fault alias',
    'category_rule', jsonb_build_object('keyword', 'PF-S08 fault rule',
                                        'type', 'Income', 'flow', 'CR')));
BEGIN
  BEGIN
    PERFORM public.submit_cashflow_import(gen_random_uuid(), row_payload,
                                          repeat('c', 64), 'fault.csv');
    RAISE EXCEPTION 'Checked import unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'pf_s08_fault_injected' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM public.transactions WHERE description = 'PF-S08 fault row')
     OR EXISTS (SELECT 1 FROM public.wallet_account_aliases
                WHERE alias_text = 'PF-S08 fault alias')
     OR EXISTS (SELECT 1 FROM public.category_rules WHERE keyword = 'PF-S08 fault rule')
     OR EXISTS (SELECT 1 FROM public.uploaded_files WHERE file_hash = repeat('c', 64))
     OR EXISTS (SELECT 1 FROM public.cashflow_import_receipts) THEN
    RAISE EXCEPTION 'Failure after row insert left a partial import';
  END IF;
END $test$;
RESET ROLE;
ROLLBACK;
SELECT 'PF-S08 import fault rollback passed' AS result;
