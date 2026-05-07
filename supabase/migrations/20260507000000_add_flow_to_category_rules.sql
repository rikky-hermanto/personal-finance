-- Add nullable flow column to category_rules.
-- NULL means the rule applies to any flow direction (backwards-compatible default).
-- 'DB' or 'CR' means the rule only fires for that specific flow.
ALTER TABLE category_rules
    ADD COLUMN flow character varying(5) NULL;

-- Seed 6 high-confidence flow-specific rules that the existing keyword-only system
-- gets wrong when the keyword appears on the wrong side of the ledger.
-- These augment the existing 106 rules; they do not replace them.
INSERT INTO category_rules (keyword, type, category, keyword_length, flow) VALUES
    ('SAVING INTEREST',  'Income',  'Saving Interest',    14, 'CR'),
    ('INTEREST',         'Income',  'Saving Interest',     8, 'CR'),
    ('Neo Rewards',      'Income',  'Reward',              10, 'CR'),
    ('TOP-UP & BILLS REFUND', 'Income', 'Refund',         18, 'CR'),
    ('TARIKAN ATM',      'Expense', 'Withdrawing',         10, 'DB'),
    ('BIAYA ADM',        'Expense', 'Transfer/Admin Fee',   8, 'DB');
