-- Match .NET's whitespace normalization for the duplicate description key.
-- [[:space:]] alone omits several Unicode separators in the local PG locale.
BEGIN;
GRANT pf_cashflow_mutator TO postgres WITH SET TRUE;
GRANT CREATE ON SCHEMA public TO pf_cashflow_mutator;
SET ROLE pf_cashflow_mutator;

CREATE OR REPLACE FUNCTION public.cashflow_normalize_description(p_value text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog AS $fn$
  SELECT btrim(regexp_replace(lower(translate(p_value,
    chr(9) || chr(10) || chr(11) || chr(12) || chr(13) ||
    chr(133) || chr(160) || chr(5760) ||
    chr(8192) || chr(8193) || chr(8194) || chr(8195) || chr(8196) ||
    chr(8197) || chr(8198) || chr(8199) || chr(8200) || chr(8201) || chr(8202) ||
    chr(8232) || chr(8233) || chr(8239) || chr(8287) || chr(12288),
    repeat(' ', 24))), '[[:space:]]+', ' ', 'g'));
$fn$;

RESET ROLE;
REVOKE CREATE ON SCHEMA public FROM pf_cashflow_mutator;
REVOKE pf_cashflow_mutator FROM postgres;
COMMIT;
