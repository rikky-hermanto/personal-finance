-- Disposable local PF-S08 database only. All fixtures roll back.
-- Owner-only access for the reopened Assets, Investment, Journey, Desk and
-- Macro tables: B cannot read, change or link to A's rows; A keeps full use;
-- shared market caches are read-only; anon has no access.
\set ON_ERROR_STOP on
BEGIN;
SELECT gen_random_uuid() AS a, gen_random_uuid() AS b,
       gen_random_uuid() AS account_a, gen_random_uuid() AS asset_a,
       gen_random_uuid() AS setup_a \gset
SELECT set_config('pf_s08.a', :'a', true), set_config('pf_s08.b', :'b', true),
       set_config('pf_s08.account_a', :'account_a', true),
       set_config('pf_s08.asset_a', :'asset_a', true),
       set_config('pf_s08.setup_a', :'setup_a', true) \gset
INSERT INTO auth.users (id, instance_id, aud, role, created_at, updated_at) VALUES
  (:'a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now()),
  (:'b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now());
INSERT INTO public.accounts (id, user_id, name, account_type, currency, opening_date)
VALUES (:'account_a', :'a', 'PF-S08 A account', 'checking', 'IDR', current_date);

-- A creates one row per module through RLS.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'a', true),
       set_config('request.jwt.claim.role', 'authenticated', true) \gset
INSERT INTO public.assets (id, user_id, name, asset_class, account_id)
VALUES (:'asset_a', :'a', 'PF-S08 A asset', 'cash', :'account_a');
INSERT INTO public.holdings (user_id, account_id, ticker) VALUES (:'a', :'account_a', 'PFSA');
INSERT INTO public.valuations (user_id, subject_type, subject_id, value_native, value_idr)
VALUES (:'a', 'asset', :'asset_a', 1, 1);
INSERT INTO public.liabilities (user_id, name, liability_type, principal, start_date, asset_id)
SELECT :'a', 'PF-S08 A loan', (enum_range(NULL::liability_type))[1], 1, current_date, :'asset_a';
INSERT INTO public.investment_setups (id, user_id, name, archetype_id)
VALUES (:'setup_a', :'a', 'PF-S08 A setup', 'balanced');
INSERT INTO public.investment_holdings (setup_id, name, asset_class) VALUES (:'setup_a', 'PF-S08 A fund', 'equity');
INSERT INTO public.desk_positions (user_id, broker, symbol, asset_class) VALUES (:'a', 'PF-S08', 'PFSA', 'IDX Stock');
INSERT INTO public.macro_scenarios (user_id, name, drivers_json) VALUES (:'a', 'PF-S08 A scenario', '{}');
INSERT INTO public.user_journey_state (user_id) VALUES (:'a');

DO $owner_a$
BEGIN
  IF (SELECT count(*) FROM public.assets) <> 1 OR (SELECT count(*) FROM public.holdings) <> 1
     OR (SELECT count(*) FROM public.valuations) <> 1 OR (SELECT count(*) FROM public.liabilities) <> 1
     OR (SELECT count(*) FROM public.investment_holdings) <> 1
     OR (SELECT count(*) FROM public.desk_positions) <> 1
     OR (SELECT count(*) FROM public.macro_scenarios) <> 1
     OR (SELECT count(*) FROM public.user_journey_state) <> 1 THEN
    RAISE EXCEPTION 'Owner A does not see exactly its own module rows';
  END IF;
  BEGIN
    INSERT INTO public.fx_rates (currency_from, rate, rate_date) VALUES ('PFS', 1, current_date);
    RAISE EXCEPTION 'Authenticated user wrote the shared FX cache';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $owner_a$;

-- B sees nothing of A's, cannot change it, and cannot link to A's parents.
SELECT set_config('request.jwt.claim.sub', :'b', true) \gset
DO $owner_b$
DECLARE
  a uuid := current_setting('pf_s08.a')::uuid;
  account_a uuid := current_setting('pf_s08.account_a')::uuid;
  asset_a uuid := current_setting('pf_s08.asset_a')::uuid;
  setup_a uuid := current_setting('pf_s08.setup_a')::uuid;
  b uuid := current_setting('pf_s08.b')::uuid;
  changed bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM public.assets) OR EXISTS (SELECT 1 FROM public.holdings)
     OR EXISTS (SELECT 1 FROM public.valuations) OR EXISTS (SELECT 1 FROM public.liabilities)
     OR EXISTS (SELECT 1 FROM public.investment_setups)
     OR EXISTS (SELECT 1 FROM public.investment_holdings)
     OR EXISTS (SELECT 1 FROM public.desk_positions)
     OR EXISTS (SELECT 1 FROM public.macro_scenarios)
     OR EXISTS (SELECT 1 FROM public.user_journey_state) THEN
    RAISE EXCEPTION 'Owner B can read owner A module rows';
  END IF;

  UPDATE public.assets SET name = 'hijacked' WHERE id = asset_a;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 0 THEN RAISE EXCEPTION 'Owner B updated owner A asset'; END IF;
  DELETE FROM public.investment_setups WHERE id = setup_a;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 0 THEN RAISE EXCEPTION 'Owner B deleted owner A setup'; END IF;

  BEGIN
    INSERT INTO public.assets (user_id, name, asset_class) VALUES (a, 'forged owner', 'cash');
    RAISE EXCEPTION 'Owner B inserted a row owned by A';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.assets (user_id, name, asset_class, account_id) VALUES (b, 'foreign account', 'cash', account_a);
    RAISE EXCEPTION 'Owner B linked an asset to A''s account';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.valuations (user_id, subject_type, subject_id, value_native, value_idr)
    VALUES (b, 'asset', asset_a, 1, 1);
    RAISE EXCEPTION 'Owner B valued A''s asset';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.investment_holdings (setup_id, name, asset_class) VALUES (setup_a, 'foreign setup', 'equity');
    RAISE EXCEPTION 'Owner B added a holding to A''s setup';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $owner_b$;

RESET ROLE;
SET LOCAL ROLE anon;
DO $anon$
BEGIN
  PERFORM 1 FROM public.assets;
  RAISE EXCEPTION 'anon can read assets';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $anon$;
RESET ROLE;
ROLLBACK;
SELECT 'PF-S08 deferred module RLS passed' AS result;
