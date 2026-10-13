-- Personal category rules are provisioned per verified owner after enforcement.
-- Shared presets are created by the historical category_presets migrations.
-- This replay-safe seed only ensures a generic shared preset exists.
INSERT INTO public.category_presets (keyword, category, type, flow, keyword_length, version)
SELECT 'TARIKAN ATM', 'Withdrawing', 'Expense', 'DB', 11, 1
WHERE NOT EXISTS (
    SELECT 1 FROM public.category_presets
    WHERE keyword = 'TARIKAN ATM' AND category = 'Withdrawing'
      AND type = 'Expense' AND flow = 'DB' AND version = 1
);
