-- ── Enums ────────────────────────────────────────────────────────────────────
CREATE TYPE public.asset_class AS ENUM (
  'cash', 'investments', 'fixed_income', 'crypto',
  'real_estate', 'tangibles', 'vehicles', 'receivables', 'retirement'
);

CREATE TYPE public.valuation_strategy AS ENUM (
  'RealTime', 'Algorithmic', 'Amortized', 'Manual'
);

CREATE TYPE public.valuation_source AS ENUM (
  'manual', 'price_feed', 'computed'
);

CREATE TYPE public.liability_type AS ENUM (
  'revolving', 'installment', 'personal'
);

-- ── institutions ──────────────────────────────────────────────────────────────
CREATE TABLE public.institutions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  name        text NOT NULL,
  type        text NOT NULL CHECK (type IN ('bank','broker','crypto_exchange','insurer','other')),
  country     text NOT NULL DEFAULT 'ID',
  logo_url    text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ── accounts ─────────────────────────────────────────────────────────────────
CREATE TABLE public.accounts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL,
  institution_id   uuid REFERENCES public.institutions(id) ON DELETE SET NULL,
  name             text NOT NULL,
  account_type     text NOT NULL CHECK (account_type IN
                     ('checking','savings','credit_card','brokerage','wallet','loan')),
  currency         text NOT NULL DEFAULT 'IDR',
  opening_balance  numeric(20,2) NOT NULL DEFAULT 0,
  opening_date     date NOT NULL,
  is_active        boolean NOT NULL DEFAULT true,
  color            text,
  icon             text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ── assets ────────────────────────────────────────────────────────────────────
CREATE TABLE public.assets (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL,
  name                text NOT NULL,
  asset_class         public.asset_class NOT NULL,
  account_id          uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  acquired_date       date,
  acquisition_cost    numeric(20,2),
  currency            text NOT NULL DEFAULT 'IDR',
  valuation_strategy  public.valuation_strategy NOT NULL DEFAULT 'Manual',
  metadata            jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ── holdings (fungible: MF units, stocks, crypto coins) ──────────────────────
CREATE TABLE public.holdings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  account_id  uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  ticker      text NOT NULL,
  quantity    numeric(30,10) NOT NULL DEFAULT 0,
  cost_basis  numeric(20,2) NOT NULL DEFAULT 0,
  currency    text NOT NULL DEFAULT 'IDR',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, ticker)
);

-- ── valuations (polymorphic time-series — the heart of the module) ────────────
CREATE TABLE public.valuations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL,
  subject_type    text NOT NULL CHECK (subject_type IN ('account','asset','holding')),
  subject_id      uuid NOT NULL,
  value_native    numeric(30,2) NOT NULL,
  currency        text NOT NULL DEFAULT 'IDR',
  fx_rate_to_idr  numeric(20,6) NOT NULL DEFAULT 1,
  value_idr       numeric(30,2) NOT NULL,
  source          public.valuation_source NOT NULL DEFAULT 'manual',
  notes           text,
  valued_at       timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_valuations_subject ON public.valuations (subject_type, subject_id, valued_at DESC);

-- ── liabilities ───────────────────────────────────────────────────────────────
CREATE TABLE public.liabilities (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL,
  name             text NOT NULL,
  liability_type   public.liability_type NOT NULL,
  account_id       uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  asset_id         uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  principal        numeric(20,2) NOT NULL,
  interest_rate    numeric(8,4),
  start_date       date NOT NULL,
  end_date         date,
  monthly_payment  numeric(20,2),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_liability_link CHECK (
    NOT (account_id IS NOT NULL AND asset_id IS NOT NULL)
  )
);

-- ── fx_rates cache (JISDOR daily) ────────────────────────────────────────────
CREATE TABLE public.fx_rates (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  currency_from  text NOT NULL,
  currency_to    text NOT NULL DEFAULT 'IDR',
  rate           numeric(20,6) NOT NULL,
  source         text NOT NULL DEFAULT 'jisdor',
  rate_date      date NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (currency_from, currency_to, rate_date, source)
);

-- ── price_quotes placeholder (populated in Phase 2) ──────────────────────────
CREATE TABLE public.price_quotes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker       text NOT NULL,
  price        numeric(30,6) NOT NULL,
  currency     text NOT NULL DEFAULT 'IDR',
  source       text NOT NULL,
  quoted_at    timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ── RLS (permissive until PF-S08 auth flip) ───────────────────────────────────
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['institutions','accounts','assets','holdings',
                            'valuations','liabilities','fx_rates','price_quotes']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "%s_open" ON public.%I USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;
