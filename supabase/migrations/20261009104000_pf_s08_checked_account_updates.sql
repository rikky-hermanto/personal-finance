-- Account/institution edits are owner-scoped and serialized with imports.
-- Deletions remain closed while deferred Assets references are not pilot-scoped.
BEGIN;
GRANT UPDATE ON public.accounts, public.institutions TO pf_cashflow_mutator;
CREATE POLICY cashflow_mutator_accounts_update ON public.accounts
  FOR UPDATE TO pf_cashflow_mutator
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE FUNCTION public.update_cashflow_account(
  p_id uuid, p_name text, p_account_type text, p_currency text,
  p_is_active boolean, p_color text DEFAULT NULL, p_icon text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, auth AS $fn$
DECLARE v_owner uuid := auth.uid();
BEGIN
  IF v_owner IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'authenticated_user_required';
  END IF;
  IF p_id IS NULL OR p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 200
     OR p_account_type IS NULL OR p_account_type NOT IN
       ('checking', 'savings', 'credit_card', 'brokerage', 'wallet', 'loan')
     OR p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$'
     OR p_is_active IS NULL OR length(coalesce(p_color, '')) > 100
     OR length(coalesce(p_icon, '')) > 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_account';
  END IF;
  PERFORM pg_catalog.set_config('lock_timeout', '3s', true);
  PERFORM pg_catalog.pg_advisory_xact_lock(8108, pg_catalog.hashtext(v_owner::text));
  UPDATE public.accounts SET name = btrim(p_name), account_type = p_account_type,
    currency = p_currency, is_active = p_is_active, color = p_color,
    icon = p_icon, updated_at = now()
  WHERE user_id = v_owner AND id = p_id;
  RETURN FOUND;
END $fn$;

CREATE FUNCTION public.set_cashflow_account_flag(p_id uuid, p_include boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, auth AS $fn$
DECLARE v_owner uuid := auth.uid();
BEGIN
  IF v_owner IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'authenticated_user_required';
  END IF;
  IF p_id IS NULL OR p_include IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_account';
  END IF;
  PERFORM pg_catalog.set_config('lock_timeout', '3s', true);
  PERFORM pg_catalog.pg_advisory_xact_lock(8108, pg_catalog.hashtext(v_owner::text));
  UPDATE public.accounts SET include_in_cashflow = p_include, updated_at = now()
  WHERE user_id = v_owner AND id = p_id;
  RETURN FOUND;
END $fn$;

CREATE FUNCTION public.set_cashflow_opening_balance(
  p_id uuid, p_opening_balance numeric, p_opening_date date)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, auth AS $fn$
DECLARE v_owner uuid := auth.uid();
BEGIN
  IF v_owner IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'authenticated_user_required';
  END IF;
  IF p_id IS NULL OR p_opening_balance IS NULL OR p_opening_balance < 0
     OR p_opening_balance <> round(p_opening_balance, 2)
     OR p_opening_date IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_opening_balance';
  END IF;
  PERFORM pg_catalog.set_config('lock_timeout', '3s', true);
  PERFORM pg_catalog.pg_advisory_xact_lock(8108, pg_catalog.hashtext(v_owner::text));
  UPDATE public.accounts SET opening_balance = p_opening_balance,
    opening_date = p_opening_date, updated_at = now()
  WHERE user_id = v_owner AND id = p_id;
  RETURN FOUND;
END $fn$;

CREATE FUNCTION public.update_cashflow_institution(
  p_id uuid, p_name text, p_type text, p_country text,
  p_logo_url text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, auth AS $fn$
DECLARE v_owner uuid := auth.uid();
BEGIN
  IF v_owner IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'authenticated_user_required';
  END IF;
  IF p_id IS NULL OR p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 200
     OR p_type IS NULL OR p_type NOT IN ('bank', 'broker', 'crypto_exchange', 'insurer', 'other')
     OR p_country IS NULL OR p_country !~ '^[A-Z]{2}$'
     OR length(coalesce(p_logo_url, '')) > 2048
     OR (p_logo_url IS NOT NULL AND p_logo_url !~ '^https?://') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_institution';
  END IF;
  PERFORM pg_catalog.set_config('lock_timeout', '3s', true);
  PERFORM pg_catalog.pg_advisory_xact_lock(8108, pg_catalog.hashtext(v_owner::text));
  UPDATE public.institutions SET name = btrim(p_name), type = p_type,
    country = p_country, logo_url = p_logo_url, updated_at = now()
  WHERE user_id = v_owner AND id = p_id;
  RETURN FOUND;
END $fn$;

GRANT pf_cashflow_mutator TO postgres WITH SET TRUE;
GRANT CREATE ON SCHEMA public TO pf_cashflow_mutator;
ALTER FUNCTION public.update_cashflow_account(uuid, text, text, text, boolean, text, text)
  OWNER TO pf_cashflow_mutator;
ALTER FUNCTION public.set_cashflow_account_flag(uuid, boolean)
  OWNER TO pf_cashflow_mutator;
ALTER FUNCTION public.set_cashflow_opening_balance(uuid, numeric, date)
  OWNER TO pf_cashflow_mutator;
ALTER FUNCTION public.update_cashflow_institution(uuid, text, text, text, text)
  OWNER TO pf_cashflow_mutator;
REVOKE ALL ON FUNCTION
  public.update_cashflow_account(uuid, text, text, text, boolean, text, text),
  public.set_cashflow_account_flag(uuid, boolean),
  public.set_cashflow_opening_balance(uuid, numeric, date),
  public.update_cashflow_institution(uuid, text, text, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.update_cashflow_account(uuid, text, text, text, boolean, text, text),
  public.set_cashflow_account_flag(uuid, boolean),
  public.set_cashflow_opening_balance(uuid, numeric, date),
  public.update_cashflow_institution(uuid, text, text, text, text)
  TO authenticated;
REVOKE CREATE ON SCHEMA public FROM pf_cashflow_mutator;
REVOKE pf_cashflow_mutator FROM postgres;
COMMIT;
