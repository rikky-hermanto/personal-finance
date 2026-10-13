-- Preserve Buckets' latest-valuation liquid total without exposing Assets
-- valuations directly to an end-user JWT. Both the account and valuation must
-- belong to the caller; older cross-owner polymorphic references contribute 0.
BEGIN;
GRANT SELECT ON public.valuations TO pf_cashflow_mutator;
CREATE POLICY cashflow_mutator_valuations_read ON public.valuations
  FOR SELECT TO pf_cashflow_mutator
  USING ((SELECT auth.uid()) = user_id);

CREATE FUNCTION public.get_cashflow_liquid_total()
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, auth AS $fn$
DECLARE v_owner uuid := auth.uid();
DECLARE v_total numeric;
BEGIN
  IF v_owner IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'authenticated_user_required';
  END IF;
  SELECT coalesce(sum(latest.value_idr), 0) INTO v_total
  FROM public.accounts a
  LEFT JOIN LATERAL (
    SELECT v.value_idr FROM public.valuations v
    WHERE v.user_id = v_owner AND v.subject_type = 'account'
      AND v.subject_id = a.id
    ORDER BY v.valued_at DESC, v.id DESC LIMIT 1
  ) latest ON true
  WHERE a.user_id = v_owner AND lower(a.account_type) = 'savings';
  RETURN v_total;
END $fn$;

GRANT pf_cashflow_mutator TO postgres WITH SET TRUE;
GRANT CREATE ON SCHEMA public TO pf_cashflow_mutator;
ALTER FUNCTION public.get_cashflow_liquid_total() OWNER TO pf_cashflow_mutator;
REVOKE ALL ON FUNCTION public.get_cashflow_liquid_total() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cashflow_liquid_total() TO authenticated;
REVOKE CREATE ON SCHEMA public FROM pf_cashflow_mutator;
REVOKE pf_cashflow_mutator FROM postgres;
COMMIT;
