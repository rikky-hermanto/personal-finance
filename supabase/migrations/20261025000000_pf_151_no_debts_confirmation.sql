-- supabase/migrations/20261025000000_pf_151_no_debts_confirmation.sql
-- PF-151: the owner can confirm "I have no debts" so manageable_dti can be evaluated with no
-- liability row. NULL means not confirmed. The existing user_journey_state_owner policy
-- (FOR ALL TO authenticated, user_id = auth.uid()) and the table-level grants already cover a
-- new column, so no policy or grant changes.
BEGIN;

ALTER TABLE public.user_journey_state
  ADD COLUMN IF NOT EXISTS no_debts_confirmed_at timestamptz;

COMMENT ON COLUMN public.user_journey_state.no_debts_confirmed_at IS
  'When the owner confirmed they have no debts. NULL = not confirmed. A recorded liability overrides it at scoring time.';

COMMIT;
