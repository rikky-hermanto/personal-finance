-- PF-S08 follow-up: reopen Assets, Investment, Journey, Desk and Macro Lab for
-- signed-in users with owner-only access. Apply after enforce; the ownership
-- gate already guarantees every row here has a real Auth owner.
--
-- The API calls PostgREST with the caller's JWT, so these policies are the
-- isolation boundary. Parent links (account, asset, holding, setup) must belong
-- to the same owner on write. Shared market caches stay read-only for users;
-- the API writes the FX cache through its own service-role client.
BEGIN;

-- Legacy permissive policies (USING true) would OR with the owner policies.
DO $drop$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public' AND qual = 'true'
      AND tablename IN ('assets', 'holdings', 'liabilities', 'valuations',
        'investment_setups', 'investment_holdings', 'investment_snapshots',
        'user_journey_state', 'journey_indicator_snapshots', 'journey_achievements',
        'macro_scenarios', 'desk_broker_accounts', 'desk_positions',
        'desk_mandate_versions', 'desk_recon_issues', 'desk_journal_entries',
        'desk_open_trades', 'fx_rates', 'price_quotes')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END $drop$;

-- Tables owned directly by user_id with no cross-table parent.
DO $owner$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'investment_setups', 'user_journey_state', 'journey_indicator_snapshots',
    'journey_achievements', 'macro_scenarios',
    'desk_broker_accounts', 'desk_positions', 'desk_mandate_versions',
    'desk_recon_issues', 'desk_journal_entries', 'desk_open_trades']
  LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
      'USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()))',
      t || '_owner', t);
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conrelid = format('public.%I', t)::regclass
                     AND conname = t || '_user_id_auth_fkey') THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (user_id) REFERENCES auth.users(id)',
        t, t || '_user_id_auth_fkey');
    END IF;
  END LOOP;
END $owner$;

-- Asset-side tables: the owner must also own any linked account or asset.
CREATE POLICY assets_owner ON public.assets FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid())
    AND (account_id IS NULL OR EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = account_id AND a.user_id = (SELECT auth.uid()))));

CREATE POLICY holdings_owner ON public.holdings FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid())
    AND (account_id IS NULL OR EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = account_id AND a.user_id = (SELECT auth.uid()))));

CREATE POLICY liabilities_owner ON public.liabilities FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid())
    AND (account_id IS NULL OR EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = account_id AND a.user_id = (SELECT auth.uid())))
    AND (asset_id IS NULL OR EXISTS (
      SELECT 1 FROM public.assets x
      WHERE x.id = asset_id AND x.user_id = (SELECT auth.uid()))));

CREATE POLICY valuations_owner ON public.valuations FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid())
    AND CASE subject_type
      WHEN 'account' THEN EXISTS (SELECT 1 FROM public.accounts a
        WHERE a.id = subject_id AND a.user_id = (SELECT auth.uid()))
      WHEN 'asset' THEN EXISTS (SELECT 1 FROM public.assets x
        WHERE x.id = subject_id AND x.user_id = (SELECT auth.uid()))
      WHEN 'holding' THEN EXISTS (SELECT 1 FROM public.holdings h
        WHERE h.id = subject_id AND h.user_id = (SELECT auth.uid()))
      ELSE false
    END);

DO $fk$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['assets', 'holdings', 'liabilities', 'valuations'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conrelid = format('public.%I', t)::regclass
                     AND conname = t || '_user_id_auth_fkey') THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (user_id) REFERENCES auth.users(id)',
        t, t || '_user_id_auth_fkey');
    END IF;
  END LOOP;
END $fk$;

-- Investment children have no user_id; ownership comes from the setup.
CREATE POLICY investment_holdings_owner ON public.investment_holdings FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.investment_setups s
                 WHERE s.id = setup_id AND s.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.investment_setups s
                      WHERE s.id = setup_id AND s.user_id = (SELECT auth.uid())));
CREATE POLICY investment_snapshots_owner ON public.investment_snapshots FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.investment_setups s
                 WHERE s.id = setup_id AND s.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.investment_setups s
                      WHERE s.id = setup_id AND s.user_id = (SELECT auth.uid())));

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.assets, public.holdings, public.liabilities, public.valuations,
  public.investment_setups, public.investment_holdings, public.investment_snapshots,
  public.user_journey_state, public.journey_indicator_snapshots, public.journey_achievements,
  public.macro_scenarios,
  public.desk_broker_accounts, public.desk_positions, public.desk_mandate_versions,
  public.desk_recon_issues, public.desk_journal_entries, public.desk_open_trades
  TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE
  public.journey_indicator_snapshots_id_seq, public.journey_achievements_id_seq
  TO authenticated;

-- Shared market data: readable by signed-in users, written only by the API's
-- service-role client. No anon access.
CREATE POLICY fx_rates_read ON public.fx_rates FOR SELECT TO authenticated USING (true);
CREATE POLICY price_quotes_read ON public.price_quotes FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.fx_rates, public.price_quotes TO authenticated;

COMMIT;
