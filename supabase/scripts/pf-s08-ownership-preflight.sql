-- Read-only aggregate preflight after expand. Run in the target environment
-- under a database administration role; capture counts without exporting rows.
-- Any nonzero unmapped or mismatch count blocks the enforce stage.

SELECT 'transactions' AS object_name, count(*) AS total,
       count(*) FILTER (WHERE user_id IS NULL) AS unmapped,
       count(*) FILTER (WHERE user_id = '00000000-0000-0000-0000-000000000000') AS zero_owner,
       count(*) FILTER (WHERE user_id = '00000000-0000-0000-0000-000000000001') AS placeholder_owner,
       count(*) FILTER (WHERE account_id IS NULL) AS without_account
FROM public.transactions
UNION ALL
SELECT 'uploaded_files', count(*), count(*) FILTER (WHERE user_id IS NULL),
       count(*) FILTER (WHERE user_id = '00000000-0000-0000-0000-000000000000'),
       count(*) FILTER (WHERE user_id = '00000000-0000-0000-0000-000000000001'), 0
FROM public.uploaded_files
UNION ALL
SELECT 'category_rules', count(*), count(*) FILTER (WHERE user_id IS NULL),
       count(*) FILTER (WHERE user_id = '00000000-0000-0000-0000-000000000000'),
       count(*) FILTER (WHERE user_id = '00000000-0000-0000-0000-000000000001'), 0
FROM public.category_rules
UNION ALL
SELECT 'wallet_account_aliases', count(*), count(*) FILTER (WHERE user_id IS NULL),
       count(*) FILTER (WHERE user_id = '00000000-0000-0000-0000-000000000000'),
       count(*) FILTER (WHERE user_id = '00000000-0000-0000-0000-000000000001'), 0
FROM public.wallet_account_aliases
UNION ALL
SELECT 'accounts', count(*), 0,
       count(*) FILTER (WHERE user_id = '00000000-0000-0000-0000-000000000000'),
       count(*) FILTER (WHERE user_id = '00000000-0000-0000-0000-000000000001'), 0
FROM public.accounts
UNION ALL
SELECT 'institutions', count(*), 0,
       count(*) FILTER (WHERE user_id = '00000000-0000-0000-0000-000000000000'),
       count(*) FILTER (WHERE user_id = '00000000-0000-0000-0000-000000000001'), 0
FROM public.institutions
UNION ALL
SELECT 'bucket_settings', count(*), 0,
       count(*) FILTER (WHERE user_id = '00000000-0000-0000-0000-000000000000'),
       count(*) FILTER (WHERE user_id = '00000000-0000-0000-0000-000000000001'), 0
FROM public.bucket_settings
UNION ALL
SELECT 'bucket_category_overrides', count(*), 0,
       count(*) FILTER (WHERE user_id = '00000000-0000-0000-0000-000000000000'),
       count(*) FILTER (WHERE user_id = '00000000-0000-0000-0000-000000000001'), 0
FROM public.bucket_category_overrides;

SELECT 'transaction_account_owner' AS check_name, count(*) AS conflicts
FROM public.transactions t
JOIN public.accounts a ON a.id = t.account_id
WHERE t.user_id IS DISTINCT FROM a.user_id
UNION ALL
SELECT 'account_institution_owner', count(*)
FROM public.accounts a
JOIN public.institutions i ON i.id = a.institution_id
WHERE a.user_id IS DISTINCT FROM i.user_id
UNION ALL
SELECT 'alias_account_owner', count(*)
FROM public.wallet_account_aliases w
JOIN public.accounts a ON a.id = w.account_id
WHERE w.user_id IS DISTINCT FROM a.user_id;

SELECT 'transactions' AS object_name, count(*) AS missing_auth_user
FROM public.transactions t LEFT JOIN auth.users u ON u.id = t.user_id
WHERE t.user_id IS NOT NULL AND u.id IS NULL
UNION ALL
SELECT 'accounts', count(*)
FROM public.accounts a LEFT JOIN auth.users u ON u.id = a.user_id
WHERE u.id IS NULL
UNION ALL
SELECT 'institutions', count(*)
FROM public.institutions i LEFT JOIN auth.users u ON u.id = i.user_id
WHERE u.id IS NULL
UNION ALL
SELECT 'uploaded_files', count(*)
FROM public.uploaded_files f LEFT JOIN auth.users u ON u.id = f.user_id
WHERE f.user_id IS NOT NULL AND u.id IS NULL
UNION ALL
SELECT 'category_rules', count(*)
FROM public.category_rules r LEFT JOIN auth.users u ON u.id = r.user_id
WHERE r.user_id IS NOT NULL AND u.id IS NULL
UNION ALL
SELECT 'wallet_account_aliases', count(*)
FROM public.wallet_account_aliases a LEFT JOIN auth.users u ON u.id = a.user_id
WHERE a.user_id IS NOT NULL AND u.id IS NULL
UNION ALL
SELECT 'bucket_settings', count(*)
FROM public.bucket_settings b LEFT JOIN auth.users u ON u.id = b.user_id
WHERE u.id IS NULL
UNION ALL
SELECT 'bucket_category_overrides', count(*)
FROM public.bucket_category_overrides b LEFT JOIN auth.users u ON u.id = b.user_id
WHERE u.id IS NULL;

-- Deferred modules stay inaccessible, but their links must be accounted for
-- before mapping account/institution owners. These are counts, not an auto-map.
SELECT 'assets_account_owner' AS check_name, count(*) AS conflicts
FROM public.assets x JOIN public.accounts a ON a.id = x.account_id
WHERE x.user_id IS DISTINCT FROM a.user_id
UNION ALL
SELECT 'holdings_account_owner', count(*)
FROM public.holdings x JOIN public.accounts a ON a.id = x.account_id
WHERE x.user_id IS DISTINCT FROM a.user_id
UNION ALL
SELECT 'liabilities_account_owner', count(*)
FROM public.liabilities x JOIN public.accounts a ON a.id = x.account_id
WHERE x.user_id IS DISTINCT FROM a.user_id;

-- Advisory review only. SQL lower/regex and numeric rounding may not exactly
-- match the C# canonicalizer; parity fixtures are still required before submit.
WITH groups AS (
  SELECT count(*) AS size
  FROM public.transactions
  WHERE user_id IS NOT NULL
  GROUP BY user_id, date_trunc('second', date), round(amount_idr, 2),
           lower(regexp_replace(btrim(description), '[[:space:]]+', ' ', 'g')),
           account_id, flow
  HAVING count(*) > 1
)
SELECT count(*) AS potential_collision_groups,
       coalesce(sum(size), 0) AS affected_rows
FROM groups;

WITH deferred AS (
  SELECT 'assets' AS object_name, user_id FROM public.assets
  UNION ALL SELECT 'holdings', user_id FROM public.holdings
  UNION ALL SELECT 'valuations', user_id FROM public.valuations
  UNION ALL SELECT 'liabilities', user_id FROM public.liabilities
  UNION ALL SELECT 'investment_setups', user_id FROM public.investment_setups
  UNION ALL SELECT 'user_journey_state', user_id FROM public.user_journey_state
  UNION ALL SELECT 'journey_indicator_snapshots', user_id FROM public.journey_indicator_snapshots
  UNION ALL SELECT 'journey_achievements', user_id FROM public.journey_achievements
  UNION ALL SELECT 'desk_broker_accounts', user_id FROM public.desk_broker_accounts
  UNION ALL SELECT 'desk_positions', user_id FROM public.desk_positions
  UNION ALL SELECT 'desk_mandate_versions', user_id FROM public.desk_mandate_versions
  UNION ALL SELECT 'desk_recon_issues', user_id FROM public.desk_recon_issues
  UNION ALL SELECT 'desk_journal_entries', user_id FROM public.desk_journal_entries
  UNION ALL SELECT 'desk_open_trades', user_id FROM public.desk_open_trades
  UNION ALL SELECT 'macro_scenarios', user_id FROM public.macro_scenarios
)
SELECT object_name,
       count(*) AS total,
       count(*) FILTER (WHERE d.user_id IS NULL) AS unmapped,
       count(*) FILTER (WHERE d.user_id = '00000000-0000-0000-0000-000000000000') AS zero_owner,
       count(*) FILTER (WHERE d.user_id = '00000000-0000-0000-0000-000000000001') AS placeholder_owner,
       count(*) FILTER (WHERE d.user_id IS NOT NULL AND u.id IS NULL) AS missing_auth_user
FROM deferred d LEFT JOIN auth.users u ON u.id = d.user_id
GROUP BY object_name
ORDER BY object_name;
