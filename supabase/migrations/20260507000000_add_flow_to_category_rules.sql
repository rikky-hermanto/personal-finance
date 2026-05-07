-- Add nullable flow column to category_rules.
-- NULL means the rule applies to any flow direction (backwards-compatible default).
-- 'DB' or 'CR' means the rule only fires for that specific flow.
ALTER TABLE category_rules
    ADD COLUMN flow character varying(5) NULL;


