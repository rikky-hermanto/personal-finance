-- Private category-rule CRUD shares the owner's import lock. Shared presets
-- remain read-only and are never copied from another user's custom rules.
BEGIN;
GRANT UPDATE, DELETE ON public.category_rules TO pf_cashflow_mutator;

CREATE FUNCTION public.create_cashflow_rule(
  p_keyword text, p_type text, p_category text, p_flow text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, auth AS $fn$
DECLARE
  v_owner uuid := auth.uid();
  v_id integer;
BEGIN
  IF v_owner IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'authenticated_user_required';
  END IF;
  IF p_keyword IS NULL OR length(btrim(p_keyword)) NOT BETWEEN 1 AND 100
     OR p_type IS NULL OR length(btrim(p_type)) NOT BETWEEN 1 AND 50
     OR p_category IS NULL OR length(btrim(p_category)) NOT BETWEEN 1 AND 100
     OR (p_flow IS NOT NULL AND p_flow NOT IN ('DB', 'CR')) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_category_rule';
  END IF;
  PERFORM pg_catalog.set_config('lock_timeout', '3s', true);
  PERFORM pg_catalog.pg_advisory_xact_lock(8108, pg_catalog.hashtext(v_owner::text));
  SELECT id INTO v_id FROM public.category_rules
    WHERE user_id = v_owner AND lower(keyword) = lower(btrim(p_keyword))
      AND lower(type) = lower(btrim(p_type))
      AND flow IS NOT DISTINCT FROM p_flow
    ORDER BY id LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('id', v_id, 'created', false);
  END IF;
  INSERT INTO public.category_rules
    (user_id, keyword, type, category, keyword_length, flow)
  VALUES (v_owner, btrim(p_keyword), btrim(p_type), btrim(p_category),
          char_length(btrim(p_keyword)), p_flow)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'created', true);
END $fn$;

CREATE FUNCTION public.update_cashflow_rule(
  p_id integer, p_keyword text, p_type text, p_category text, p_flow text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, auth AS $fn$
DECLARE v_owner uuid := auth.uid();
BEGIN
  IF v_owner IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'authenticated_user_required';
  END IF;
  IF p_id IS NULL OR p_id <= 0 OR p_keyword IS NULL
     OR length(btrim(p_keyword)) NOT BETWEEN 1 AND 100
     OR p_type IS NULL OR length(btrim(p_type)) NOT BETWEEN 1 AND 50
     OR p_category IS NULL OR length(btrim(p_category)) NOT BETWEEN 1 AND 100
     OR (p_flow IS NOT NULL AND p_flow NOT IN ('DB', 'CR')) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_category_rule';
  END IF;
  PERFORM pg_catalog.set_config('lock_timeout', '3s', true);
  PERFORM pg_catalog.pg_advisory_xact_lock(8108, pg_catalog.hashtext(v_owner::text));
  IF EXISTS (SELECT 1 FROM public.category_rules
             WHERE user_id = v_owner AND id <> p_id
               AND lower(keyword) = lower(btrim(p_keyword))
               AND lower(type) = lower(btrim(p_type))
               AND flow IS NOT DISTINCT FROM p_flow) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'rule_exists';
  END IF;
  UPDATE public.category_rules SET keyword = btrim(p_keyword), type = btrim(p_type),
    category = btrim(p_category), keyword_length = char_length(btrim(p_keyword)),
    flow = p_flow
  WHERE user_id = v_owner AND id = p_id;
  RETURN FOUND;
END $fn$;

CREATE FUNCTION public.delete_cashflow_rule(p_id integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, auth AS $fn$
DECLARE v_owner uuid := auth.uid();
BEGIN
  IF v_owner IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'authenticated_user_required';
  END IF;
  IF p_id IS NULL OR p_id <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_category_rule';
  END IF;
  PERFORM pg_catalog.set_config('lock_timeout', '3s', true);
  PERFORM pg_catalog.pg_advisory_xact_lock(8108, pg_catalog.hashtext(v_owner::text));
  DELETE FROM public.category_rules WHERE user_id = v_owner AND id = p_id;
  RETURN FOUND;
END $fn$;

CREATE FUNCTION public.reset_cashflow_rules()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, auth AS $fn$
DECLARE v_owner uuid := auth.uid();
DECLARE v_deleted integer;
BEGIN
  IF v_owner IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'authenticated_user_required';
  END IF;
  PERFORM pg_catalog.set_config('lock_timeout', '3s', true);
  PERFORM pg_catalog.pg_advisory_xact_lock(8108, pg_catalog.hashtext(v_owner::text));
  DELETE FROM public.category_rules WHERE user_id = v_owner;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END $fn$;

GRANT pf_cashflow_mutator TO postgres WITH SET TRUE;
GRANT CREATE ON SCHEMA public TO pf_cashflow_mutator;
ALTER FUNCTION public.create_cashflow_rule(text, text, text, text)
  OWNER TO pf_cashflow_mutator;
ALTER FUNCTION public.update_cashflow_rule(integer, text, text, text, text)
  OWNER TO pf_cashflow_mutator;
ALTER FUNCTION public.delete_cashflow_rule(integer) OWNER TO pf_cashflow_mutator;
ALTER FUNCTION public.reset_cashflow_rules() OWNER TO pf_cashflow_mutator;
REVOKE ALL ON FUNCTION public.create_cashflow_rule(text, text, text, text),
  public.update_cashflow_rule(integer, text, text, text, text),
  public.delete_cashflow_rule(integer), public.reset_cashflow_rules()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_cashflow_rule(text, text, text, text),
  public.update_cashflow_rule(integer, text, text, text, text),
  public.delete_cashflow_rule(integer), public.reset_cashflow_rules()
  TO authenticated;
REVOKE CREATE ON SCHEMA public FROM pf_cashflow_mutator;
REVOKE pf_cashflow_mutator FROM postgres;
COMMIT;
