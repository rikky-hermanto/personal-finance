-- The legacy permissive policy would OR with the private function role policy.
-- Assets endpoints remain closed and user JWTs have no direct valuation grant.
BEGIN;
DROP POLICY IF EXISTS valuations_open ON public.valuations;
COMMIT;
