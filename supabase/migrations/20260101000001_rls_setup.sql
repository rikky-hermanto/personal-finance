-- Enable RLS on both tables.
-- Policies are permissive (USING (true)) until Auth is added in PF-S08.
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_transactions"
    ON transactions FOR ALL
    USING (true)
    WITH CHECK (true);

CREATE POLICY "allow_all_category_rules"
    ON category_rules FOR ALL
    USING (true)
    WITH CHECK (true);
