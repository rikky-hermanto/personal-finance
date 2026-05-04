-- Migration to add unique constraint to transactions table to prevent duplicates at the database level.
-- We use a COALESCE for bank_running_balance because NULL values in Postgres are not considered equal in unique indexes.

CREATE UNIQUE INDEX idx_transactions_deduplication_composite 
ON transactions (
    date, 
    amount_idr, 
    description, 
    wallet, 
    flow, 
    COALESCE(bank_running_balance, -999999999)
);
