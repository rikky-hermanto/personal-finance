-- PF-138 — promote desk_broker_accounts rows to an explicit portfolio grain.
-- Additive only: no data is moved between tables, so PF-133's migrations stay reproducible.

alter table desk_broker_accounts
  add column if not exists broker_key text,
  add column if not exists portfolio_label text;

alter table desk_positions
  add column if not exists account_external_key text;

-- Backfill broker_key from the existing external_key prefix convention.
update desk_broker_accounts set broker_key = coalesce(broker_key, split_part(external_key, '_', 1));

-- Positions currently carry only a free-text broker name; attribute the unambiguous ones.
update desk_positions p
   set account_external_key = a.external_key
  from desk_broker_accounts a
 where p.account_external_key is null
   and p.user_id = a.user_id
   and lower(p.broker) = lower(a.broker_key)
   and (select count(*) from desk_broker_accounts a2
         where a2.user_id = p.user_id and a2.broker_key = a.broker_key) = 1;

-- Stockbit is ambiguous by broker name alone (two portfolios) and stays null out of the backfill
-- above. This migration runs before the seed edit could set account_external_key inline on
-- INSERT (that column does not exist yet when 20260730000002_trading_desk_seed.sql runs), so the
-- explicit attribution promised for the Stockbit rows happens here instead, keyed on symbol + lot
-- count, which is unambiguous between the two seeded portfolios.
update desk_positions
   set account_external_key = 'stockbit_trading'
 where user_id = '00000000-0000-0000-0000-000000000000'
   and broker = 'Stockbit' and symbol = 'ANTM' and qty_lots = 110
   and account_external_key is null;

update desk_positions
   set account_external_key = 'stockbit_sectoral'
 where user_id = '00000000-0000-0000-0000-000000000000'
   and broker = 'Stockbit' and symbol in ('AADI', 'ANTM') and qty_lots in (71, 83)
   and account_external_key is null;

-- portfolio_label is free text with no derivable convention from external_key (unlike
-- broker_key), so the two Stockbit portfolios are labelled explicitly here — same ordering
-- reason as the position attribution above.
update desk_broker_accounts set portfolio_label = 'Trading'
 where user_id = '00000000-0000-0000-0000-000000000000' and external_key = 'stockbit_trading';
update desk_broker_accounts set portfolio_label = 'Sectoral Rotation'
 where user_id = '00000000-0000-0000-0000-000000000000' and external_key = 'stockbit_sectoral';

alter table desk_broker_accounts alter column broker_key set not null;

create index if not exists idx_desk_positions_account
  on desk_positions(user_id, account_external_key);
create index if not exists idx_desk_accounts_broker
  on desk_broker_accounts(user_id, broker_key);
