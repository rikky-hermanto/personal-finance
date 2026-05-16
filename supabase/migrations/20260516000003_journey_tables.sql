-- user_journey_state: 1 row per user, current scoring snapshot
CREATE TABLE user_journey_state (
    user_id UUID PRIMARY KEY,
    current_level SMALLINT NOT NULL DEFAULT 1 CHECK (current_level BETWEEN 1 AND 5),
    total_score NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (total_score BETWEEN 0 AND 100),
    level_scores JSONB NOT NULL DEFAULT '{}',       -- {"L1": 73.5, "L2": 40.0, ...}
    indicator_scores JSONB NOT NULL DEFAULT '{}',   -- {"spend_lt_income": 80, ...}
    last_computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- journey_indicator_snapshots: append-only history (1 row per indicator per day)
CREATE TABLE journey_indicator_snapshots (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    snapshot_date DATE NOT NULL,
    indicator_code TEXT NOT NULL,   -- e.g. 'spend_lt_income', 'liquid_savings_ratio'
    score NUMERIC(5,2) NOT NULL,
    raw_value NUMERIC(20,4),        -- underlying metric (e.g. 0.85 for 85% spend ratio)
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, snapshot_date, indicator_code)
);

CREATE INDEX idx_journey_snapshots_user_date
    ON journey_indicator_snapshots(user_id, snapshot_date DESC);

-- journey_achievements: unlocked badges (one row per user per achievement)
CREATE TABLE journey_achievements (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    achievement_code TEXT NOT NULL,   -- e.g. 'positive_cashflow_3mo', 'emergency_ready'
    unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, achievement_code)
);

-- RLS — permissive placeholder until PF-S08 (matches existing pattern)
ALTER TABLE user_journey_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_indicator_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_journey_state"
    ON user_journey_state USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_journey_snapshots"
    ON journey_indicator_snapshots USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_journey_achievements"
    ON journey_achievements USING (true) WITH CHECK (true);
