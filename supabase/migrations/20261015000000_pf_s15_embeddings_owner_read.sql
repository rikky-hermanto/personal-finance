-- PF-S15 STEP 2: authenticated users may read embeddings only for transactions they own.
--
-- The AI service's chat/search connection runs as `authenticated` with the caller's
-- JWT claims (app/owner.py), so vector search needs SELECT here. The owner condition
-- joins through transactions.user_id (PF-S08), so RLS still protects a query that
-- forgets its explicit `t.user_id` filter.
--
-- No INSERT/UPDATE/DELETE grant: writes stay on the service connection (embedder.py),
-- which checks ownership in the INSERT itself. A browser token can never plant vectors.
--
-- Rollback: DROP POLICY pf_s15_embeddings_owner_read; REVOKE SELECT FROM authenticated;
-- DISABLE ROW LEVEL SECURITY. Non-destructive: no data changes.

BEGIN;

REVOKE ALL ON public.transaction_embeddings FROM anon, authenticated;
ALTER TABLE public.transaction_embeddings ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.transaction_embeddings TO authenticated;

DROP POLICY IF EXISTS pf_s15_embeddings_owner_read ON public.transaction_embeddings;
CREATE POLICY pf_s15_embeddings_owner_read ON public.transaction_embeddings
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.transactions t
                 WHERE t.id = transaction_embeddings.transaction_id
                   AND t.user_id = (SELECT auth.uid())));

COMMIT;
