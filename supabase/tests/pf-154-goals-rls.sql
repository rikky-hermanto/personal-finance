-- Disposable local database only. All fixtures roll back.
-- PF-154 goals: B cannot read A's goals, cannot attach a contribution or cost item to A's goal
-- (composite FK), cannot insert as A (RLS), and kind/tier cannot drift (goals_kind_tier).
-- Run: docker exec -i supabase_db_personal-finance psql -U postgres -d postgres < supabase/tests/pf-154-goals-rls.sql
\set ON_ERROR_STOP on
BEGIN;
SELECT gen_random_uuid() AS a, gen_random_uuid() AS b, gen_random_uuid() AS goal_a \gset
SELECT set_config('pf154.a', :'a', true), set_config('pf154.b', :'b', true),
       set_config('pf154.goal_a', :'goal_a', true);

INSERT INTO auth.users (id, instance_id, aud, role, email) VALUES
  (:'a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pf154-a@example.test'),
  (:'b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pf154-b@example.test');
INSERT INTO public.goals (id, user_id, kind, tier, category, name, target_amount)
  VALUES (:'goal_a', :'a', 'big_purchase', 'L3', 'vehicle', 'Test vehicle', 200000000);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', :'b', 'role', 'authenticated')::text, true);

DO $$
DECLARE
  a uuid := current_setting('pf154.a')::uuid;
  b uuid := current_setting('pf154.b')::uuid;
  goal_a uuid := current_setting('pf154.goal_a')::uuid;
BEGIN
  IF (SELECT count(*) FROM public.goals) <> 0 THEN
    RAISE EXCEPTION 'FAIL: owner B can read owner A goals';
  END IF;

  BEGIN
    INSERT INTO public.goal_contributions (user_id, goal_id, amount, contributed_on)
      VALUES (b, goal_a, 1000, current_date);
    RAISE EXCEPTION 'FAIL: contribution attached to another owner goal';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.goal_cost_items (user_id, goal_id, item_type, label, amount)
      VALUES (b, goal_a, 'fee', 'Fee', 1);
    RAISE EXCEPTION 'FAIL: cost item attached to another owner goal';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.goals (user_id, kind, tier, name, target_amount) VALUES (b, 'big_purchase', 'L2', 'Bad tier', 1);
    RAISE EXCEPTION 'FAIL: big_purchase accepted tier L2';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.goals (user_id, kind, tier, name, target_amount) VALUES (a, 'big_purchase', 'L3', 'Spoof', 1);
    RAISE EXCEPTION 'FAIL: B inserted a goal owned by A';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  INSERT INTO public.goals (user_id, kind, tier, category, name, target_amount)
    VALUES (b, 'big_purchase', 'L3', 'wedding', 'Own goal', 1);
  IF (SELECT count(*) FROM public.goals) <> 1 THEN
    RAISE EXCEPTION 'FAIL: B cannot read its own goal';
  END IF;

  RAISE NOTICE 'PASS: PF-154 goals RLS, composite FK and kind/tier checks';
END $$;

ROLLBACK;
