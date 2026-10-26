-- PF-153: one row per harvested month per owner, plus the two functions that write it.
-- Same owner pattern as 20261014010000_pf_s08_owner_scope_deferred_modules.sql.
BEGIN;

CREATE TABLE public.harvest_months (
  user_id          uuid        NOT NULL REFERENCES auth.users(id),
  month            date        NOT NULL CHECK (extract(day FROM month) = 1),
  income_idr       numeric(20,2) NOT NULL CHECK (income_idr >= 0),
  expense_idr      numeric(20,2) NOT NULL CHECK (expense_idr >= 0),
  result           text        NOT NULL CHECK (result IN ('green', 'red', 'neutral')),
  accounts_covered smallint    NOT NULL CHECK (accounts_covered >= 0),
  accounts_total   smallint    NOT NULL CHECK (accounts_total >= accounts_covered),
  computed_at      timestamptz NOT NULL DEFAULT now(),
  seen_at          timestamptz,
  PRIMARY KEY (user_id, month)
);

ALTER TABLE public.harvest_months ENABLE ROW LEVEL SECURITY;

CREATE POLICY harvest_months_owner ON public.harvest_months FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- PF-S08 revoked every table privilege from authenticated; each new table needs an explicit grant.
-- No DELETE: a harvest row is never removed. Update is column-level, so user_id and month (the key)
-- can never be changed. This does not stop the owner writing seen_at through PostgREST directly;
-- the promise below is about the app's own refresh path, not the table.
GRANT SELECT, INSERT ON public.harvest_months TO authenticated;
GRANT UPDATE (income_idr, expense_idr, result, accounts_covered, accounts_total, computed_at, seen_at)
  ON public.harvest_months TO authenticated;

-- Insert or refresh the figures. seen_at is deliberately absent from this function's update list, so a
-- late upload that changes "4 of 5" to "5 of 5" can never re-open a harvest that was already seen.
CREATE OR REPLACE FUNCTION public.upsert_harvest_months(p_rows jsonb, p_seen boolean DEFAULT false)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_owner uuid := auth.uid();
  v_count integer;
  -- p_seen only matters for an owner whose ledger is still empty: months that already existed before
  -- this feature are history, not a new harvest, so they start out seen. It never applies on conflict.
  v_seed_seen boolean := p_seen AND NOT EXISTS (SELECT 1 FROM public.harvest_months);
BEGIN
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 36 THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.harvest_months
    (user_id, month, income_idr, expense_idr, result, accounts_covered, accounts_total, seen_at)
  SELECT v_owner, r.month, r.income_idr, r.expense_idr, r.result, r.accounts_covered, r.accounts_total,
         CASE WHEN v_seed_seen THEN now() END
  FROM jsonb_to_recordset(p_rows) AS r(
    month date, income_idr numeric, expense_idr numeric, result text,
    accounts_covered smallint, accounts_total smallint)
  ON CONFLICT (user_id, month) DO UPDATE SET
    income_idr       = EXCLUDED.income_idr,
    expense_idr      = EXCLUDED.expense_idr,
    result           = EXCLUDED.result,
    accounts_covered = EXCLUDED.accounts_covered,
    accounts_total   = EXCLUDED.accounts_total,
    computed_at      = now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END
$$;

-- Mark a reveal as seen in one transaction: the listed completions, and every unseen ledger month
-- up to p_through_month. RLS limits both updates to the caller's own rows, so foreign ids do nothing.
CREATE OR REPLACE FUNCTION public.mark_harvest_seen(p_completion_ids bigint[], p_through_month date)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF coalesce(array_length(p_completion_ids, 1), 0) > 200 THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  UPDATE public.quest_completions
     SET seen_at = now()
   WHERE id = ANY (coalesce(p_completion_ids, ARRAY[]::bigint[])) AND seen_at IS NULL;

  IF p_through_month IS NOT NULL THEN
    UPDATE public.harvest_months
       SET seen_at = now()
     WHERE month <= p_through_month AND seen_at IS NULL;
  END IF;
END
$$;

REVOKE ALL ON FUNCTION public.upsert_harvest_months(jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_harvest_months(jsonb, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.mark_harvest_seen(bigint[], date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_harvest_seen(bigint[], date) TO authenticated;

COMMIT;
