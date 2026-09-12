-- PF-140: Macro Scenario Lab — saved scenarios.
CREATE TABLE public.macro_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  drivers_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_macro_scenarios_user ON public.macro_scenarios(user_id, created_at DESC);

-- RLS permissive placeholder pending PF-S08
ALTER TABLE public.macro_scenarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_macro_scenarios" ON public.macro_scenarios USING (true) WITH CHECK (true);
