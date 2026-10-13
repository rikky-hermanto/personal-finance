-- Bucket preferences are private. Writes share the owner import lock and
-- never accept a caller-supplied user_id.
BEGIN;
GRANT INSERT, UPDATE ON public.bucket_settings TO pf_cashflow_mutator;
GRANT INSERT ON public.bucket_category_overrides TO pf_cashflow_mutator;

CREATE FUNCTION public.set_cashflow_future_plan(p_amount numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, auth AS $fn$
DECLARE v_owner uuid := auth.uid();
BEGIN
  IF v_owner IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'authenticated_user_required';
  END IF;
  IF p_amount IS NULL OR p_amount < 0 OR p_amount > 999999999999999999.99
     OR round(p_amount, 2) <> p_amount THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_future_plan';
  END IF;
  PERFORM pg_catalog.set_config('lock_timeout', '3s', true);
  PERFORM pg_catalog.pg_advisory_xact_lock(8108, pg_catalog.hashtext(v_owner::text));
  INSERT INTO public.bucket_settings(user_id, future_monthly_amount)
  VALUES (v_owner, p_amount)
  ON CONFLICT (user_id) DO UPDATE SET
    future_monthly_amount = EXCLUDED.future_monthly_amount,
    updated_at = now();
END $fn$;

CREATE FUNCTION public.demote_cashflow_committed_item(p_item_key text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, auth AS $fn$
DECLARE v_owner uuid := auth.uid();
BEGIN
  IF v_owner IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'authenticated_user_required';
  END IF;
  IF p_item_key IS NULL OR length(btrim(p_item_key)) NOT BETWEEN 1 AND 200
     OR p_item_key <> btrim(p_item_key) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_item_key';
  END IF;
  PERFORM pg_catalog.set_config('lock_timeout', '3s', true);
  PERFORM pg_catalog.pg_advisory_xact_lock(8108, pg_catalog.hashtext(v_owner::text));
  INSERT INTO public.bucket_category_overrides(user_id, item_key, bucket)
  VALUES (v_owner, p_item_key, 'free')
  ON CONFLICT (user_id, item_key) DO NOTHING;
END $fn$;

GRANT pf_cashflow_mutator TO postgres WITH SET TRUE;
GRANT CREATE ON SCHEMA public TO pf_cashflow_mutator;
ALTER FUNCTION public.set_cashflow_future_plan(numeric) OWNER TO pf_cashflow_mutator;
ALTER FUNCTION public.demote_cashflow_committed_item(text) OWNER TO pf_cashflow_mutator;
REVOKE ALL ON FUNCTION public.set_cashflow_future_plan(numeric),
  public.demote_cashflow_committed_item(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_cashflow_future_plan(numeric),
  public.demote_cashflow_committed_item(text) TO authenticated;
REVOKE CREATE ON SCHEMA public FROM pf_cashflow_mutator;
REVOKE pf_cashflow_mutator FROM postgres;
COMMIT;
