-- SECURITY DEFINER does not bypass RLS for the limited non-login role.
-- Upsert also needs read privileges for its conflict path.
BEGIN;
GRANT SELECT ON public.bucket_settings, public.bucket_category_overrides
  TO pf_cashflow_mutator;
CREATE POLICY cashflow_mutator_bucket_settings ON public.bucket_settings
  FOR ALL TO pf_cashflow_mutator
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY cashflow_mutator_bucket_overrides ON public.bucket_category_overrides
  FOR ALL TO pf_cashflow_mutator
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
COMMIT;
