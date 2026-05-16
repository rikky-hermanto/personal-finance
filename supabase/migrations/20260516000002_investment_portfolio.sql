CREATE TABLE public.investment_setups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  archetype_id text NOT NULL,
  base_currency text NOT NULL DEFAULT 'IDR',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.investment_holdings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setup_id uuid NOT NULL REFERENCES public.investment_setups(id) ON DELETE CASCADE,
  ticker text,
  name text NOT NULL,
  asset_class text NOT NULL,
  sector text,
  allocation_pct numeric(6,3),
  quantity numeric(20,8),
  avg_buy_price numeric(20,4),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_investment_holdings_setup ON public.investment_holdings(setup_id);

CREATE TABLE public.investment_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setup_id uuid NOT NULL REFERENCES public.investment_setups(id) ON DELETE CASCADE,
  label text NOT NULL,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  total_value numeric(20,2),
  currency text NOT NULL DEFAULT 'IDR',
  ai_provider text NOT NULL,
  ai_model text NOT NULL,
  analysis_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_investment_snapshots_setup ON public.investment_snapshots(setup_id, snapshot_date DESC);

-- RLS permissive placeholder pending PF-S08
ALTER TABLE public.investment_setups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_investment_setups" ON public.investment_setups USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_investment_holdings" ON public.investment_holdings USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_investment_snapshots" ON public.investment_snapshots USING (true) WITH CHECK (true);
