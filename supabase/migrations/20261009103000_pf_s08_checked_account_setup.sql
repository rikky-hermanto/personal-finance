-- New pilot users can create their own institutions/accounts through checked
-- functions. Parent ownership is checked under the same per-owner import lock.
BEGIN;

GRANT SELECT, INSERT ON public.institutions TO pf_cashflow_mutator;
GRANT INSERT ON public.accounts TO pf_cashflow_mutator;
CREATE POLICY cashflow_mutator_institutions ON public.institutions
  FOR ALL TO pf_cashflow_mutator
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY cashflow_mutator_accounts_insert ON public.accounts
  FOR INSERT TO pf_cashflow_mutator
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE FUNCTION public.create_cashflow_institution(
  p_name text, p_type text, p_country text DEFAULT 'ID', p_logo_url text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, auth AS $fn$
DECLARE
  v_owner uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_owner IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'authenticated_user_required';
  END IF;
  IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 200
     OR p_type NOT IN ('bank', 'broker', 'crypto_exchange', 'insurer', 'other')
     OR p_type IS NULL OR p_country IS NULL OR p_country !~ '^[A-Z]{2}$'
     OR length(coalesce(p_logo_url, '')) > 2048
     OR (p_logo_url IS NOT NULL AND p_logo_url !~ '^https?://') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_institution';
  END IF;
  PERFORM pg_catalog.set_config('lock_timeout', '3s', true);
  PERFORM pg_catalog.pg_advisory_xact_lock(8108, pg_catalog.hashtext(v_owner::text));
  INSERT INTO public.institutions (user_id, name, type, country, logo_url)
    VALUES (v_owner, btrim(p_name), p_type, p_country, p_logo_url)
    RETURNING id INTO v_id;
  RETURN v_id;
END $fn$;

CREATE FUNCTION public.create_cashflow_account(
  p_institution_id uuid, p_name text, p_account_type text, p_currency text,
  p_opening_balance numeric, p_opening_date date,
  p_color text DEFAULT NULL, p_icon text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, auth AS $fn$
DECLARE
  v_owner uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_owner IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'authenticated_user_required';
  END IF;
  IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 200
     OR p_account_type IS NULL OR p_account_type NOT IN
       ('checking', 'savings', 'credit_card', 'brokerage', 'wallet', 'loan')
     OR p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$'
     OR p_opening_balance IS NULL OR p_opening_balance < 0
     OR p_opening_balance <> round(p_opening_balance, 2)
     OR p_opening_date IS NULL OR length(coalesce(p_color, '')) > 100
     OR length(coalesce(p_icon, '')) > 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_account';
  END IF;
  PERFORM pg_catalog.set_config('lock_timeout', '3s', true);
  PERFORM pg_catalog.pg_advisory_xact_lock(8108, pg_catalog.hashtext(v_owner::text));
  IF p_institution_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.institutions
    WHERE user_id = v_owner AND id = p_institution_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'institution_unavailable';
  END IF;
  INSERT INTO public.accounts (user_id, institution_id, name, account_type,
    currency, opening_balance, opening_date, include_in_cashflow, color, icon)
  VALUES (v_owner, p_institution_id, btrim(p_name), p_account_type, p_currency,
    p_opening_balance, p_opening_date, p_account_type NOT IN ('brokerage', 'loan'),
    p_color, p_icon)
  RETURNING id INTO v_id;
  RETURN v_id;
END $fn$;

GRANT pf_cashflow_mutator TO postgres WITH SET TRUE;
GRANT CREATE ON SCHEMA public TO pf_cashflow_mutator;
ALTER FUNCTION public.create_cashflow_institution(text, text, text, text)
  OWNER TO pf_cashflow_mutator;
ALTER FUNCTION public.create_cashflow_account(uuid, text, text, text, numeric, date, text, text)
  OWNER TO pf_cashflow_mutator;
REVOKE ALL ON FUNCTION public.create_cashflow_institution(text, text, text, text),
  public.create_cashflow_account(uuid, text, text, text, numeric, date, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_cashflow_institution(text, text, text, text),
  public.create_cashflow_account(uuid, text, text, text, numeric, date, text, text)
  TO authenticated;
REVOKE CREATE ON SCHEMA public FROM pf_cashflow_mutator;
REVOKE pf_cashflow_mutator FROM postgres;

COMMIT;
