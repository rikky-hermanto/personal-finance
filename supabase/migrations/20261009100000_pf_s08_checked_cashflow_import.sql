-- PF-S08 checked import boundary. Apply only after owner-enforce and its A/B preflight.
-- This migration does not open the .NET write pilot. Authenticated callers receive
-- only the two checked RPC entry points below; direct table DML remains revoked.
BEGIN;

DO $role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'pf_cashflow_mutator') THEN
    CREATE ROLE pf_cashflow_mutator NOLOGIN NOBYPASSRLS;
  END IF;
END $role$;

-- Supabase's migration role is CREATEROLE but not SUPERUSER. It needs temporary
-- SET membership and schema CREATE permission to transfer function ownership.
GRANT pf_cashflow_mutator TO postgres WITH SET TRUE;
GRANT CREATE ON SCHEMA public TO pf_cashflow_mutator;

GRANT USAGE ON SCHEMA public, auth TO pf_cashflow_mutator;
GRANT SELECT ON public.accounts, public.transactions, public.uploaded_files,
  public.cashflow_import_receipts, public.wallet_account_aliases,
  public.category_rules TO pf_cashflow_mutator;
GRANT INSERT ON public.transactions, public.uploaded_files,
  public.cashflow_import_receipts, public.wallet_account_aliases,
  public.category_rules TO pf_cashflow_mutator;
GRANT DELETE ON public.transactions, public.uploaded_files,
  public.cashflow_import_receipts TO pf_cashflow_mutator;
GRANT USAGE ON SEQUENCE public.transactions_id_seq,
  public.uploaded_files_id_seq, public.category_rules_id_seq,
  public.cashflow_import_receipts_id_seq TO pf_cashflow_mutator;

CREATE POLICY cashflow_mutator_accounts_read ON public.accounts
  FOR SELECT TO pf_cashflow_mutator USING ((SELECT auth.uid()) = user_id);
CREATE POLICY cashflow_mutator_transactions ON public.transactions
  FOR ALL TO pf_cashflow_mutator
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY cashflow_mutator_files ON public.uploaded_files
  FOR ALL TO pf_cashflow_mutator
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY cashflow_mutator_receipts ON public.cashflow_import_receipts
  FOR ALL TO pf_cashflow_mutator
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY cashflow_mutator_aliases ON public.wallet_account_aliases
  FOR ALL TO pf_cashflow_mutator
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY cashflow_mutator_rules ON public.category_rules
  FOR ALL TO pf_cashflow_mutator
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE FUNCTION public.cashflow_round_even(p_value numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog AS $fn$
  SELECT sign(p_value) *
    (CASE
      WHEN abs(p_value) * 100 - trunc(abs(p_value) * 100) < 0.5
        THEN trunc(abs(p_value) * 100)
      WHEN abs(p_value) * 100 - trunc(abs(p_value) * 100) > 0.5
        THEN trunc(abs(p_value) * 100) + 1
      WHEN mod(trunc(abs(p_value) * 100), 2) = 0
        THEN trunc(abs(p_value) * 100)
      ELSE trunc(abs(p_value) * 100) + 1
    END) / 100;
$fn$;

CREATE FUNCTION public.cashflow_normalize_description(p_value text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog AS $fn$
  SELECT regexp_replace(lower(btrim(p_value)), '[[:space:]]+', ' ', 'g');
$fn$;

ALTER FUNCTION public.cashflow_round_even(numeric) OWNER TO pf_cashflow_mutator;
ALTER FUNCTION public.cashflow_normalize_description(text) OWNER TO pf_cashflow_mutator;
REVOKE ALL ON FUNCTION public.cashflow_round_even(numeric),
  public.cashflow_normalize_description(text) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.submit_cashflow_import(
  p_request_id uuid, p_rows jsonb, p_file_hash text DEFAULT NULL,
  p_file_name text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, auth AS $fn$
DECLARE
  v_owner uuid := auth.uid();
  v_row jsonb;
  v_rule jsonb;
  v_canonical jsonb := '[]'::jsonb;
  v_digest text;
  v_receipt public.cashflow_import_receipts%ROWTYPE;
  v_date timestamptz;
  v_date_text text;
  v_amount numeric;
  v_balance numeric;
  v_rate numeric;
  v_account uuid;
  v_description text;
  v_remarks text;
  v_flow text;
  v_type text;
  v_category text;
  v_currency text;
  v_account_name text;
  v_rule_keyword text;
  v_rule_type text;
  v_rule_flow text;
  v_inserted jsonb := '[]'::jsonb;
  v_inserted_id integer;
  v_inserted_count integer := 0;
  v_duplicate_count integer := 0;
  v_result jsonb;
BEGIN
  IF v_owner IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'authenticated_user_required';
  END IF;
  IF p_request_id IS NULL OR p_request_id = '00000000-0000-0000-0000-000000000000'::uuid
     OR p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array'
     OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 5000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_import';
  END IF;
  IF p_file_hash IS NOT NULL AND p_file_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_file_hash';
  END IF;
  IF length(coalesce(p_file_name, '')) > 255 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_file_name';
  END IF;

  PERFORM pg_catalog.set_config('lock_timeout', '3s', true);
  PERFORM pg_catalog.set_config('statement_timeout', '30s', true);
  PERFORM pg_catalog.pg_advisory_xact_lock(8108, pg_catalog.hashtext(v_owner::text));

  -- The digest excludes preview flags and client IDs. Numeric values are rendered
  -- without trailing zeros; dates are rendered in UTC. Row order is significant.
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    IF jsonb_typeof(v_row) <> 'object' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_import_row';
    END IF;
    v_date_text := v_row->>'date';
    IF v_date_text IS NULL OR v_date_text !~ '([zZ]|[+-][0-9]{2}:[0-9]{2})$' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'date_requires_offset';
    END IF;
    v_date := v_date_text::timestamptz;
    v_amount := (v_row->>'amount_idr')::numeric;
    v_balance := (v_row->>'statement_balance')::numeric;
    v_rate := (v_row->>'exchange_rate')::numeric;
    v_account := (v_row->>'account_id')::uuid;
    v_description := v_row->>'description';
    v_remarks := coalesce(v_row->>'remarks', '');
    v_flow := v_row->>'flow';
    v_type := v_row->>'type';
    v_category := v_row->>'category';
    v_currency := v_row->>'currency';
    v_account_name := nullif(btrim(v_row->>'account_name'), '');
    v_rule := v_row->'category_rule';
    IF v_amount IS NULL OR v_amount <= 0 OR v_amount = 'NaN'::numeric
       OR v_description IS NULL OR btrim(v_description) = '' OR length(v_description) > 500
       OR length(v_remarks) > 500 OR v_flow NOT IN ('DB', 'CR')
       OR v_type IS NULL OR length(v_type) NOT BETWEEN 1 AND 15
       OR v_category IS NULL OR length(v_category) NOT BETWEEN 1 AND 100
       OR v_currency IS NULL OR length(v_currency) NOT BETWEEN 1 AND 10
       OR length(coalesce(v_account_name, '')) > 255
       OR (v_rate IS NOT NULL AND (v_rate <= 0 OR v_rate = 'NaN'::numeric))
       OR (v_balance IS NOT NULL AND v_balance = 'NaN'::numeric)
       OR (v_rule IS NOT NULL AND jsonb_typeof(v_rule) NOT IN ('object', 'null')) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_import_row';
    END IF;
    IF jsonb_typeof(v_rule) = 'object' THEN
      v_rule_keyword := nullif(btrim(v_rule->>'keyword'), '');
      IF v_rule_keyword IS NULL OR length(v_rule_keyword) > 100 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_category_rule';
      END IF;
    END IF;
    v_canonical := v_canonical || jsonb_build_array(jsonb_build_object(
      'date', to_char(v_date AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'amount_idr', trim_scale(v_amount)::text,
      'statement_balance', CASE WHEN v_balance IS NULL THEN NULL ELSE trim_scale(v_balance)::text END,
      'exchange_rate', CASE WHEN v_rate IS NULL THEN NULL ELSE trim_scale(v_rate)::text END,
      'description', v_description, 'remarks', v_remarks, 'flow', v_flow,
      'type', v_type, 'category', v_category, 'currency', v_currency,
      'account_id', v_account, 'account_name', v_account_name,
      'category_rule', v_rule));
  END LOOP;

  v_digest := 'v1:' || encode(sha256(convert_to(
    v_canonical::text || '|' || coalesce(p_file_hash, '') || '|' || coalesce(p_file_name, ''),
    'UTF8')), 'hex');
  SELECT * INTO v_receipt FROM public.cashflow_import_receipts
    WHERE user_id = v_owner AND request_id = p_request_id;
  IF FOUND THEN
    IF v_receipt.payload_digest <> v_digest THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'idempotency_conflict';
    END IF;
    RETURN v_receipt.committed_result;
  END IF;
  IF p_file_hash IS NOT NULL THEN
    SELECT * INTO v_receipt FROM public.cashflow_import_receipts
      WHERE user_id = v_owner AND file_hash = p_file_hash;
    IF FOUND THEN
      IF v_receipt.payload_digest <> v_digest THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'file_already_processed';
      END IF;
      RETURN v_receipt.committed_result;
    END IF;
    IF EXISTS (SELECT 1 FROM public.uploaded_files
               WHERE user_id = v_owner AND file_hash = p_file_hash) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'file_already_processed';
    END IF;
  END IF;

  -- Inserts are visible to later iterations, preserving the existing ordered,
  -- non-transitive NULL-balance wildcard predicate within a batch.
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_date := (v_row->>'date')::timestamptz;
    v_amount := (v_row->>'amount_idr')::numeric;
    v_balance := (v_row->>'statement_balance')::numeric;
    v_rate := (v_row->>'exchange_rate')::numeric;
    v_account := (v_row->>'account_id')::uuid;
    v_description := v_row->>'description';
    v_remarks := coalesce(v_row->>'remarks', '');
    v_flow := v_row->>'flow';
    v_type := v_row->>'type';
    v_category := v_row->>'category';
    v_currency := v_row->>'currency';
    v_account_name := nullif(btrim(v_row->>'account_name'), '');
    v_rule := v_row->'category_rule';

    IF v_account IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.accounts WHERE user_id = v_owner AND id = v_account
    ) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'account_unavailable';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.transactions t
      WHERE t.user_id = v_owner
        AND t.date >= date_trunc('second', v_date)
        AND t.date < date_trunc('second', v_date) + interval '1 second'
        AND public.cashflow_round_even(t.amount_idr) = public.cashflow_round_even(v_amount)
        AND public.cashflow_normalize_description(t.description) =
            public.cashflow_normalize_description(v_description)
        AND t.account_id IS NOT DISTINCT FROM v_account
        AND t.flow = v_flow
        AND (t.statement_balance IS NULL OR v_balance IS NULL
             OR abs(t.statement_balance - v_balance) < 0.01)
    ) THEN
      v_duplicate_count := v_duplicate_count + 1;
    ELSE
      INSERT INTO public.transactions (user_id, date, description, remarks,
        flow, type, category, account_id, amount_idr, currency, exchange_rate,
        statement_balance)
      VALUES (v_owner, v_date, v_description, v_remarks, v_flow, v_type,
        v_category, v_account, v_amount, v_currency, v_rate, v_balance)
      RETURNING id INTO v_inserted_id;
      v_inserted := v_inserted || jsonb_build_array(v_inserted_id);
      v_inserted_count := v_inserted_count + 1;
    END IF;

    IF v_account IS NOT NULL AND v_account_name IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.wallet_account_aliases
      WHERE user_id = v_owner AND alias_text = v_account_name AND account_id = v_account
    ) THEN
      INSERT INTO public.wallet_account_aliases (user_id, alias_text, account_id)
        VALUES (v_owner, v_account_name, v_account);
    END IF;
    IF jsonb_typeof(v_rule) = 'object' THEN
      v_rule_keyword := btrim(v_rule->>'keyword');
      v_rule_type := coalesce(nullif(v_rule->>'type', ''), v_type);
      v_rule_flow := nullif(v_rule->>'flow', '');
      IF length(v_rule_type) > 50 OR (v_rule_flow IS NOT NULL AND v_rule_flow NOT IN ('DB', 'CR')) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_category_rule';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.category_rules
                     WHERE user_id = v_owner AND lower(keyword) = lower(v_rule_keyword)
                       AND type = v_rule_type AND flow IS NOT DISTINCT FROM v_rule_flow) THEN
        INSERT INTO public.category_rules (user_id, keyword, type, category, keyword_length, flow)
          VALUES (v_owner, v_rule_keyword, v_rule_type, v_category,
                  char_length(v_rule_keyword), v_rule_flow);
      END IF;
    END IF;
  END LOOP;

  IF p_file_hash IS NOT NULL THEN
    INSERT INTO public.uploaded_files (user_id, file_hash, file_name)
      VALUES (v_owner, p_file_hash, coalesce(nullif(p_file_name, ''), 'uploaded_file'));
  END IF;
  v_result := jsonb_build_object('insertedIds', v_inserted,
    'insertedCount', v_inserted_count, 'duplicateCount', v_duplicate_count);
  INSERT INTO public.cashflow_import_receipts
    (user_id, request_id, payload_digest, file_hash, committed_result)
  VALUES (v_owner, p_request_id, v_digest, p_file_hash, v_result);
  RETURN v_result;
END $fn$;

CREATE FUNCTION public.reset_cashflow()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, auth AS $fn$
DECLARE
  v_owner uuid := auth.uid();
  v_deleted integer;
BEGIN
  IF v_owner IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'authenticated_user_required';
  END IF;
  PERFORM pg_catalog.set_config('lock_timeout', '3s', true);
  PERFORM pg_catalog.set_config('statement_timeout', '30s', true);
  PERFORM pg_catalog.pg_advisory_xact_lock(8108, pg_catalog.hashtext(v_owner::text));
  DELETE FROM public.transactions WHERE user_id = v_owner;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  DELETE FROM public.uploaded_files WHERE user_id = v_owner;
  DELETE FROM public.cashflow_import_receipts WHERE user_id = v_owner;
  RETURN v_deleted;
END $fn$;

ALTER FUNCTION public.submit_cashflow_import(uuid, jsonb, text, text)
  OWNER TO pf_cashflow_mutator;
ALTER FUNCTION public.reset_cashflow() OWNER TO pf_cashflow_mutator;
REVOKE ALL ON FUNCTION public.submit_cashflow_import(uuid, jsonb, text, text),
  public.reset_cashflow() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_cashflow_import(uuid, jsonb, text, text),
  public.reset_cashflow() TO authenticated;

REVOKE CREATE ON SCHEMA public FROM pf_cashflow_mutator;
REVOKE pf_cashflow_mutator FROM postgres;

COMMIT;
