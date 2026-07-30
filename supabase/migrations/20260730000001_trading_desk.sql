-- Trading Desk (Risk OS) — PF-133
create table if not exists desk_broker_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  external_key text not null,
  name text not null,
  currency text not null default 'IDR',
  reported_equity numeric(20,2) not null default 0,
  reported_equity_native numeric(20,2),
  cash numeric(20,2) not null default 0,
  cash_native numeric(20,2),
  cash_currency_native text,
  buying_power numeric(20,2),
  buying_power_currency text,
  status text not null default 'Needs reconciliation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, external_key)
);

create table if not exists desk_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  broker text not null,
  symbol text not null,
  asset_class text not null,
  qty numeric(24,8),
  qty_shares numeric(24,8),
  qty_lots numeric(24,8),
  avg_price numeric(24,8),
  avg_price_native numeric(24,8),
  last_price numeric(24,8),
  last_price_native numeric(24,8),
  cost_idr numeric(20,2) not null default 0,
  mv_idr numeric(20,2) not null default 0,
  pnl_idr numeric(20,2) not null default 0,
  pnl_pct numeric(10,4) not null default 0,
  weight numeric(10,4) not null default 0,
  sleeve text not null default 'Legacy / Unclassified',
  stop_price numeric(24,8),
  unconfirmed boolean not null default false,
  estimated_cost_basis boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists desk_mandate_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  version integer not null,
  status text not null default 'draft',
  preset text,
  params jsonb not null,
  effective_date date,
  change_reason text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, version)
);

create table if not exists desk_recon_issues (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  external_key text not null,
  label text not null,
  account text not null,
  amount numeric(20,2),
  currency text,
  resolution text not null default 'unresolved',
  options jsonb not null default '[]'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, external_key)
);

create table if not exists desk_journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  trade_date date not null,
  symbol text not null,
  broker text not null,
  strategy text,
  planned_qty numeric(24,8),
  actual_qty numeric(24,8),
  entry_price numeric(24,8),
  exit_price numeric(24,8),
  net_pnl numeric(20,2) not null default 0,
  realized_r numeric(10,4),
  compliant boolean not null default true,
  tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists desk_open_trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  symbol text not null,
  broker text not null,
  initial_risk numeric(20,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_desk_positions_user on desk_positions(user_id);
create index if not exists idx_desk_journal_user_date on desk_journal_entries(user_id, trade_date desc);
create index if not exists idx_desk_mandate_user_version on desk_mandate_versions(user_id, version desc);
create index if not exists idx_desk_recon_user on desk_recon_issues(user_id);
create index if not exists idx_desk_open_trades_user on desk_open_trades(user_id);

alter table desk_broker_accounts enable row level security;
alter table desk_positions enable row level security;
alter table desk_mandate_versions enable row level security;
alter table desk_recon_issues enable row level security;
alter table desk_journal_entries enable row level security;
alter table desk_open_trades enable row level security;

create policy desk_broker_accounts_all on desk_broker_accounts for all using (true) with check (true);
create policy desk_positions_all on desk_positions for all using (true) with check (true);
create policy desk_mandate_versions_all on desk_mandate_versions for all using (true) with check (true);
create policy desk_recon_issues_all on desk_recon_issues for all using (true) with check (true);
create policy desk_journal_entries_all on desk_journal_entries for all using (true) with check (true);
create policy desk_open_trades_all on desk_open_trades for all using (true) with check (true);
