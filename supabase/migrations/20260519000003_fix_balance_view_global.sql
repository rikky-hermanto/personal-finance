-- Fix: change running_balance from per-account to global (cross-account) running total.
-- The previous VIEW used PARTITION BY account_id, giving an independent running balance
-- per bank account. This did not match the expected "master cashflow" behavior where
-- balance represents total net cash position across ALL accounts (as in the Excel reference).
DROP VIEW IF EXISTS v_transactions_with_balance;

CREATE VIEW v_transactions_with_balance AS
SELECT
  t.*,
  SUM(
    CASE WHEN t.flow = 'CR' THEN t.amount_idr ELSE -t.amount_idr END
  ) OVER (
    ORDER BY t.date ASC, t.id ASC
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) AS running_balance
FROM transactions t;
