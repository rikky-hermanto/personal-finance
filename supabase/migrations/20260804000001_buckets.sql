-- Buckets budgeting (Committed / Future / Free) — docs/features/budgeting/buckets-build-plan.md
-- Not an execution system: these tables hold the plan (Future per month) and the one correction a
-- user can make (demoting a mis-inferred commitment). Everything else is derived live from
-- transactions, never persisted.

create table if not exists bucket_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  future_monthly_amount numeric(20,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists bucket_category_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  item_key text not null,
  bucket text not null default 'free',
  created_at timestamptz not null default now(),
  unique (user_id, item_key)
);

create index if not exists idx_bucket_overrides_user on bucket_category_overrides(user_id);

alter table bucket_settings enable row level security;
alter table bucket_category_overrides enable row level security;

create policy bucket_settings_all on bucket_settings for all using (true) with check (true);
create policy bucket_category_overrides_all on bucket_category_overrides for all using (true) with check (true);
