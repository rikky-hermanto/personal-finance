-- Disposable local PF-S08 database only. All fixtures roll back.
-- Reset must cascade derived embeddings and remove only caller import metadata.
\set ON_ERROR_STOP on
BEGIN;
SELECT gen_random_uuid() AS a_user, gen_random_uuid() AS b_user,
       gen_random_uuid() AS a_account, gen_random_uuid() AS b_account \gset
SELECT set_config('app.pf_s08_a_user', :'a_user', true) AS a_setting,
       set_config('app.pf_s08_b_user', :'b_user', true) AS b_setting,
       set_config('app.pf_s08_a_account', :'a_account', true) AS a_account_setting,
       set_config('app.pf_s08_b_account', :'b_account', true) AS b_account_setting \gset
INSERT INTO auth.users (id, instance_id, aud, role, created_at, updated_at)
VALUES (:'a_user', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', now(), now()),
       (:'b_user', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', now(), now());
INSERT INTO public.accounts (id, user_id, name, account_type, currency, opening_date)
VALUES (:'a_account', :'a_user', 'PF-S08 reset A', 'checking', 'IDR', current_date),
       (:'b_account', :'b_user', 'PF-S08 reset B', 'checking', 'IDR', current_date);
INSERT INTO public.transactions
  (user_id, account_id, date, description, remarks, flow, type, category,
   amount_idr, currency)
VALUES (:'a_user', :'a_account', now(), 'PF-S08 reset A', '', 'CR',
        'Income', 'Test', 10, 'IDR') RETURNING id AS a_transaction \gset
INSERT INTO public.transactions
  (user_id, account_id, date, description, remarks, flow, type, category,
   amount_idr, currency)
VALUES (:'b_user', :'b_account', now(), 'PF-S08 reset B', '', 'CR',
        'Income', 'Test', 20, 'IDR') RETURNING id AS b_transaction \gset
SELECT set_config('app.pf_s08_a_transaction', :'a_transaction', true) AS a_transaction_setting,
       set_config('app.pf_s08_b_transaction', :'b_transaction', true) AS b_transaction_setting \gset
INSERT INTO public.transaction_embeddings (transaction_id, embedding, search_text)
VALUES (:'a_transaction', array_fill(0::real, ARRAY[1536])::vector, 'A private text'),
       (:'b_transaction', array_fill(0::real, ARRAY[1536])::vector, 'B private text');
INSERT INTO public.uploaded_files (user_id, file_hash, file_name)
VALUES (:'a_user', 'pf-s08-reset-same-file', 'a.csv'),
       (:'b_user', 'pf-s08-reset-same-file', 'b.csv');
INSERT INTO public.cashflow_import_receipts
  (user_id, request_id, payload_digest, file_hash, committed_result)
VALUES (:'a_user', gen_random_uuid(), 'fixture-a', 'pf-s08-reset-same-file', '{}'),
       (:'b_user', gen_random_uuid(), 'fixture-b', 'pf-s08-reset-same-file', '{}');
INSERT INTO public.category_rules
  (user_id, keyword, type, category, keyword_length)
VALUES (:'a_user', 'PF-S08 reset rule', 'Income', 'Test', 17);
INSERT INTO public.bucket_settings (user_id, future_monthly_amount)
VALUES (:'a_user', 123), (:'b_user', 456);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'a_user', true) AS sub_setting,
       set_config('request.jwt.claim.role', 'authenticated', true) AS role_setting \gset
DO $reset$
BEGIN
  IF public.reset_cashflow() <> 1 THEN
    RAISE EXCEPTION 'Owner A reset did not report one deleted transaction';
  END IF;
END $reset$;
RESET ROLE;

DO $verify$
BEGIN
  IF EXISTS (SELECT 1 FROM public.transactions
             WHERE user_id = current_setting('app.pf_s08_a_user')::uuid)
     OR EXISTS (SELECT 1 FROM public.transaction_embeddings
                WHERE transaction_id = current_setting('app.pf_s08_a_transaction')::integer)
     OR EXISTS (SELECT 1 FROM public.uploaded_files
                WHERE user_id = current_setting('app.pf_s08_a_user')::uuid)
     OR EXISTS (SELECT 1 FROM public.cashflow_import_receipts
                WHERE user_id = current_setting('app.pf_s08_a_user')::uuid) THEN
    RAISE EXCEPTION 'Owner A reset left transaction-derived data';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.transactions
                 WHERE user_id = current_setting('app.pf_s08_b_user')::uuid)
     OR NOT EXISTS (SELECT 1 FROM public.transaction_embeddings
                    WHERE transaction_id = current_setting('app.pf_s08_b_transaction')::integer)
     OR NOT EXISTS (SELECT 1 FROM public.uploaded_files
                    WHERE user_id = current_setting('app.pf_s08_b_user')::uuid)
     OR NOT EXISTS (SELECT 1 FROM public.cashflow_import_receipts
                    WHERE user_id = current_setting('app.pf_s08_b_user')::uuid)
     OR (SELECT count(*) FROM public.accounts
         WHERE id IN (current_setting('app.pf_s08_a_account')::uuid,
                      current_setting('app.pf_s08_b_account')::uuid)) <> 2
     OR NOT EXISTS (SELECT 1 FROM public.category_rules
                    WHERE user_id = current_setting('app.pf_s08_a_user')::uuid
                      AND keyword = 'PF-S08 reset rule')
     OR (SELECT count(*) FROM public.bucket_settings
         WHERE user_id IN (current_setting('app.pf_s08_a_user')::uuid,
                           current_setting('app.pf_s08_b_user')::uuid)) <> 2 THEN
    RAISE EXCEPTION 'Owner A reset changed B data or retained preferences';
  END IF;
END $verify$;
ROLLBACK;
SELECT 'PF-S08 reset derived-data isolation passed' AS result;
