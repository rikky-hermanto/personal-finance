-- PF-152: Quest Engine v1. Append-only completions, plus focus, snoozes and raw
-- indicator values on user_journey_state. Owner-only, same pattern as PF-S08.
BEGIN;

CREATE TABLE public.quest_completions (
  id              bigserial PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES auth.users(id),
  quest_code      text NOT NULL,
  rung            smallint NOT NULL DEFAULT 0 CHECK (rung >= 0),
  catalog_version smallint NOT NULL,
  evidence        jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_at    timestamptz NOT NULL DEFAULT now(),
  seen_at         timestamptz,
  UNIQUE (user_id, quest_code, rung)
);

CREATE INDEX quest_completions_unseen
  ON public.quest_completions (user_id) WHERE seen_at IS NULL;

ALTER TABLE public.quest_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY quest_completions_owner ON public.quest_completions
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- Append-only at the database level: no DELETE, and only seen_at can be updated.
GRANT SELECT, INSERT ON public.quest_completions TO authenticated;
GRANT UPDATE (seen_at) ON public.quest_completions TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.quest_completions_id_seq TO authenticated;

ALTER TABLE public.user_journey_state
  ADD COLUMN indicator_raw    jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN focus_quest_code text,
  ADD COLUMN quest_snoozes    jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMIT;
