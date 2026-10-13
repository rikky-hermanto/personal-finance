-- Delete only caller-owned parent records. An account with financial history or
-- deferred Assets references cannot be deleted; aliases are removed atomically.
BEGIN;
GRANT DELETE ON public.accounts, public.institutions,
  public.wallet_account_aliases TO pf_cashflow_mutator;
GRANT SELECT ON public.assets, public.holdings, public.liabilities
  TO pf_cashflow_mutator;
CREATE POLICY cashflow_mutator_accounts_delete ON public.accounts
  FOR DELETE TO pf_cashflow_mutator
  USING ((SELECT auth.uid()) = user_id);

CREATE FUNCTION public.delete_cashflow_account(p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, auth AS $fn$
DECLARE v_owner uuid := auth.uid();
BEGIN
  IF v_owner IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'authenticated_user_required';
  END IF;
  IF p_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_account';
  END IF;
  PERFORM pg_catalog.set_config('lock_timeout', '3s', true);
  PERFORM pg_catalog.pg_advisory_xact_lock(8108, pg_catalog.hashtext(v_owner::text));
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE user_id = v_owner AND id = p_id) THEN
    RETURN false;
  END IF;
  IF EXISTS (SELECT 1 FROM public.transactions WHERE account_id = p_id)
     OR EXISTS (SELECT 1 FROM public.assets WHERE account_id = p_id)
     OR EXISTS (SELECT 1 FROM public.holdings WHERE account_id = p_id)
     OR EXISTS (SELECT 1 FROM public.liabilities WHERE account_id = p_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'account_in_use';
  END IF;
  DELETE FROM public.wallet_account_aliases
    WHERE user_id = v_owner AND account_id = p_id;
  DELETE FROM public.accounts WHERE user_id = v_owner AND id = p_id;
  RETURN FOUND;
END $fn$;

CREATE FUNCTION public.delete_cashflow_institution(p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, auth AS $fn$
DECLARE v_owner uuid := auth.uid();
BEGIN
  IF v_owner IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'authenticated_user_required';
  END IF;
  IF p_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_institution';
  END IF;
  PERFORM pg_catalog.set_config('lock_timeout', '3s', true);
  PERFORM pg_catalog.pg_advisory_xact_lock(8108, pg_catalog.hashtext(v_owner::text));
  -- The composite FK sets institution_id to NULL on this owner's accounts.
  DELETE FROM public.institutions WHERE user_id = v_owner AND id = p_id;
  RETURN FOUND;
END $fn$;

GRANT pf_cashflow_mutator TO postgres WITH SET TRUE;
GRANT CREATE ON SCHEMA public TO pf_cashflow_mutator;
ALTER FUNCTION public.delete_cashflow_account(uuid) OWNER TO pf_cashflow_mutator;
ALTER FUNCTION public.delete_cashflow_institution(uuid) OWNER TO pf_cashflow_mutator;
REVOKE ALL ON FUNCTION public.delete_cashflow_account(uuid),
  public.delete_cashflow_institution(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_cashflow_account(uuid),
  public.delete_cashflow_institution(uuid) TO authenticated;
REVOKE CREATE ON SCHEMA public FROM pf_cashflow_mutator;
REVOKE pf_cashflow_mutator FROM postgres;
COMMIT;
