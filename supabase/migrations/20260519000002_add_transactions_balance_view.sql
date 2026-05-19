CREATE VIEW v_transactions_with_balance AS
SELECT
  t.*,
  SUM(
    CASE WHEN t.flow = 'CR' THEN t.amount_idr ELSE -t.amount_idr END
  ) OVER (
    PARTITION BY t.account_id
    ORDER BY t.date ASC, t.id ASC
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) AS running_balance
FROM transactions t;
