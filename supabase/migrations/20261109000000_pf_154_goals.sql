-- PF-154: shared, tier-tagged goals. Big Purchases (kind big_purchase, tier L3) is the first user.
-- Owner-only, same pattern as PF-152. Allocated is never stored: it is the sum of goal_contributions.
BEGIN;

CREATE TABLE public.goals (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                    uuid NOT NULL REFERENCES auth.users(id),
  kind                       text NOT NULL CHECK (kind IN ('big_purchase', 'emergency_fund', 'fire', 'custom')),
  tier                       text NOT NULL CHECK (tier IN ('L1', 'L2', 'L3', 'L4', 'L5')),
  category                   text NOT NULL DEFAULT 'other',
  name                       text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  notes                      text CHECK (notes IS NULL OR length(notes) <= 2000),
  priority                   smallint NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 4),
  recurrence                 text NOT NULL DEFAULT 'one_off' CHECK (recurrence IN ('one_off', 'monthly', 'annually')),
  target_amount              numeric(20,2) NOT NULL CHECK (target_amount > 0),
  currency                   char(3) NOT NULL DEFAULT 'IDR' CHECK (currency = 'IDR'),
  target_date                date,
  price_growth_rate          numeric(7,6) CHECK (price_growth_rate IS NULL OR price_growth_rate BETWEEN 0 AND 1),
  planned_monthly_instalment numeric(20,2) CHECK (planned_monthly_instalment IS NULL OR planned_monthly_instalment >= 0),
  status                     text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'achieved', 'cancelled')),
  achieved_at                timestamptz,
  color_index                smallint NOT NULL DEFAULT 0 CHECK (color_index >= 0),  -- stable display colour, set once at create
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, user_id),                                         -- target of the composite FKs below
  CONSTRAINT goals_kind_tier CHECK (
       (kind <> 'big_purchase'   OR tier = 'L3')
   AND (kind <> 'emergency_fund' OR tier = 'L2')
   AND (kind <> 'fire'           OR tier = 'L4')),
  CONSTRAINT goals_big_purchase_shape CHECK (
    kind <> 'big_purchase'
    OR (recurrence = 'one_off' AND category IN ('house_land', 'vehicle', 'education', 'wedding', 'other'))),
  CONSTRAINT goals_achieved_stamp CHECK ((status = 'achieved') = (achieved_at IS NOT NULL))
);

CREATE INDEX goals_owner_list ON public.goals (user_id, kind, status, priority, target_date);

CREATE TABLE public.goal_contributions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES auth.users(id),
  goal_id            uuid NOT NULL,
  amount             numeric(20,2) NOT NULL CHECK (amount <> 0),          -- negative = withdrawal
  contributed_on     date NOT NULL,
  held_in_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  note               text CHECK (note IS NULL OR length(note) <= 280),
  created_at         timestamptz NOT NULL DEFAULT now(),
  -- FKs bypass RLS; the composite key stops a row attaching to another owner's goal.
  FOREIGN KEY (goal_id, user_id) REFERENCES public.goals (id, user_id) ON DELETE CASCADE
);

CREATE INDEX goal_contributions_goal ON public.goal_contributions (goal_id, contributed_on DESC);
CREATE INDEX goal_contributions_held_in ON public.goal_contributions (user_id, held_in_account_id)
  WHERE held_in_account_id IS NOT NULL;

CREATE TABLE public.goal_cost_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id),
  goal_id    uuid NOT NULL,
  item_type  text NOT NULL CHECK (item_type IN ('purchase_price', 'down_payment', 'loan_principal', 'tax', 'fee', 'other')),
  label      text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 80),
  amount     numeric(20,2) NOT NULL CHECK (amount >= 0),
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (goal_id, user_id) REFERENCES public.goals (id, user_id) ON DELETE CASCADE
);

CREATE INDEX goal_cost_items_goal ON public.goal_cost_items (goal_id, sort_order);

ALTER TABLE public.goals              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_cost_items    ENABLE ROW LEVEL SECURITY;

CREATE POLICY goals_owner ON public.goals FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY goal_contributions_owner ON public.goal_contributions FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY goal_cost_items_owner ON public.goal_cost_items FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.goals, public.goal_contributions, public.goal_cost_items TO authenticated;

COMMIT;
