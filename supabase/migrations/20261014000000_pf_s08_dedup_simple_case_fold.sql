-- Match .NET's duplicate description key exactly. The database collation uses
-- ICU, whose lower() applies context rules (word-final capital sigma becomes
-- U+03C2, dotted capital I becomes i + U+0307), while .NET lowercases one
-- character at a time. The builtin pg_c_utf8 collation gives the same simple
-- per-character mapping on every platform; .NET folds U+0130 explicitly to
-- match it. Shared cases: supabase/tests/fixtures/pf-s08-dedup-parity.json.
-- No index or stored value depends on this function.
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
    repeat(' ', 24)) COLLATE pg_c_utf8), '[[:space:]]+', ' ', 'g'));
$fn$;

RESET ROLE;
REVOKE CREATE ON SCHEMA public FROM pf_cashflow_mutator;
REVOKE pf_cashflow_mutator FROM postgres;
COMMIT;
