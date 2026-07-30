-- Trading Desk (Risk OS) seed data — PF-133
-- Ported verbatim from docs/ideas/prototypes/trading-desk/pf-desk-data.js
-- Placeholder user_id (all-zeros UUID) matches the pre-PF-S08 convention used across the codebase.

insert into desk_broker_accounts
  (user_id, external_key, name, currency, reported_equity, reported_equity_native, cash, cash_native, cash_currency_native, buying_power, buying_power_currency, status)
values
  ('00000000-0000-0000-0000-000000000000', 'mandiri', 'Mandiri Sekuritas', 'IDR', 784938961.72, null, 37359961.72, null, null, 1404710882.16, null, 'Needs reconciliation'),
  ('00000000-0000-0000-0000-000000000000', 'stockbit_cash', 'Stockbit — cash only', 'IDR', 33178117, null, 33178117, null, null, null, null, 'Needs reconciliation'),
  ('00000000-0000-0000-0000-000000000000', 'stockbit_stocks', 'Stockbit — stocks', 'IDR', 104243623, null, 15812623, null, null, null, null, 'Reconciles'),
  ('00000000-0000-0000-0000-000000000000', 'binance', 'Binance', 'USD', 140679062.69, 7793.85, 22750, 1.26, null, null, null, 'Instrument unconfirmed'),
  ('00000000-0000-0000-0000-000000000000', 'ibkr', 'IBKR', 'USD', 1913300, 106.00, 172661, 12.38, 'SGD', 9.60, 'USD', 'Estimated cost basis')
on conflict do nothing;

insert into desk_positions
  (user_id, broker, symbol, asset_class, qty, qty_shares, qty_lots, avg_price, avg_price_native, last_price, last_price_native, cost_idr, mv_idr, pnl_idr, pnl_pct, weight, sleeve, stop_price, unconfirmed, estimated_cost_basis)
values
  ('00000000-0000-0000-0000-000000000000', 'Mandiri', 'ELTY', 'IDX Stock', null, 18000, 180, 102.78, null, 29, null, 1850040, 522000, -1328040, -71.78, 0.05, 'Legacy / Unclassified', null, false, false),
  ('00000000-0000-0000-0000-000000000000', 'Mandiri', 'GOTO', 'IDX Stock', null, 907500, 9075, 99.85, null, 50, null, 90613875, 45375000, -45238875, -49.92, 4.64, 'Legacy / Unclassified', null, false, false),
  ('00000000-0000-0000-0000-000000000000', 'Mandiri', 'BBCA', 'IDX Stock', null, 23300, 233, 9969.85, null, 6300, null, 232297505, 146790000, -85507505, -36.81, 15.01, 'Legacy / Unclassified', null, false, false),
  ('00000000-0000-0000-0000-000000000000', 'Mandiri', 'HMSP', 'IDX Stock', null, 62600, 626, 2121.51, null, 715, null, 132806526, 44759000, -88047526, -66.30, 4.58, 'Legacy / Unclassified', null, false, false),
  ('00000000-0000-0000-0000-000000000000', 'Mandiri', 'BBRI', 'IDX Stock', null, 174000, 1740, 4270.78, null, 2930, null, 743115720, 509820000, -233295720, -31.39, 52.12, 'Legacy / Unclassified', null, false, false),
  ('00000000-0000-0000-0000-000000000000', 'Stockbit', 'AADI', 'IDX Stock', null, 7100, 71, 9963.86, null, 9100, null, 70743455, 64610000, -6133455, -8.67, 6.61, 'Legacy / Unclassified', null, false, false),
  ('00000000-0000-0000-0000-000000000000', 'Stockbit', 'ANTM', 'IDX Stock', null, 8300, 83, 3560.51, null, 2870, null, 29552262, 23821000, -5731262, -19.39, 2.44, 'Legacy / Unclassified', null, false, false),
  ('00000000-0000-0000-0000-000000000000', 'Binance', 'USDT', 'Crypto', 1.26, null, null, null, 1.00, null, 1.00, 22723.82, 22723.82, 0, 0.00, 0.005, 'Legacy / Unclassified', null, false, false),
  ('00000000-0000-0000-0000-000000000000', 'Binance', 'BTC/USDT', 'Crypto', 0.09449, null, null, null, 71069, null, 64281.37, 121210541, 109634737, -11575804, -9.55, 11.21, 'Legacy / Unclassified', null, false, false),
  ('00000000-0000-0000-0000-000000000000', 'Binance', 'Gold (unconfirmed)', 'Crypto', 0.421, null, null, null, 4748, null, 4082.30, 36078802, 31021602, -5057200, -14.02, 3.17, 'Legacy / Unclassified', null, true, false),
  ('00000000-0000-0000-0000-000000000000', 'IBKR', 'IBM', 'US Stock', 0.4265, null, null, null, 214.07, null, 226.25, 1647965, 1738215, 90250, 5.48, 0.18, 'Legacy / Unclassified', null, false, true)
on conflict do nothing;

insert into desk_journal_entries
  (user_id, trade_date, symbol, broker, strategy, planned_qty, actual_qty, entry_price, exit_price, net_pnl, realized_r, compliant, tags)
values
  ('00000000-0000-0000-0000-000000000000', '2026-05-04', 'AADI', 'Stockbit', 'Breakout', 60, 60, 9800, 10630, 49800, 2.4, true, '["Process compliant"]'::jsonb),
  ('00000000-0000-0000-0000-000000000000', '2026-05-11', 'ANTM', 'Stockbit', 'Pullback', 80, 80, 3050, 2850, -16000, -1.0, true, '["Process compliant"]'::jsonb),
  ('00000000-0000-0000-0000-000000000000', '2026-05-19', 'BTC/USDT', 'Binance', 'Trend', 0.02, 0.02, 68500, 71850, 67, 1.8, true, '["Process compliant"]'::jsonb),
  ('00000000-0000-0000-0000-000000000000', '2026-06-02', 'AADI', 'Stockbit', 'Breakout', 60, 90, 9700, 9400, -27000, -1.0, false, '["Sized too large"]'::jsonb),
  ('00000000-0000-0000-0000-000000000000', '2026-06-10', 'ANTM', 'Stockbit', 'Range', 70, 70, 2900, 2820, -5600, -0.6, true, '["Process compliant"]'::jsonb),
  ('00000000-0000-0000-0000-000000000000', '2026-06-21', 'BTC/USDT', 'Binance', 'Trend', 0.015, 0.015, 65200, 71300, 91.5, 3.1, true, '["Process compliant"]'::jsonb),
  ('00000000-0000-0000-0000-000000000000', '2026-07-05', 'AADI', 'Stockbit', 'Breakout', 55, 80, 9550, 9300, -20000, -1.0, false, '["Moved stop", "Sized too large"]'::jsonb),
  ('00000000-0000-0000-0000-000000000000', '2026-07-18', 'ANTM', 'Stockbit', 'Pullback', 75, 75, 2950, 3060, 8250, 0.9, true, '["Process compliant"]'::jsonb)
on conflict do nothing;

insert into desk_open_trades
  (user_id, symbol, broker, initial_risk)
values
  ('00000000-0000-0000-0000-000000000000', 'AADI', 'Stockbit', 450000),
  ('00000000-0000-0000-0000-000000000000', 'ANTM', 'Stockbit', 380000)
on conflict do nothing;

insert into desk_recon_issues
  (user_id, external_key, label, account, amount, currency, resolution, options)
values
  ('00000000-0000-0000-0000-000000000000', 'r1', 'Duplicate cash section', 'Stockbit', 33178117, null, 'unresolved', '[["include", "Distinct wallet — include"], ["exclude", "Duplicate — exclude"]]'::jsonb),
  ('00000000-0000-0000-0000-000000000000', 'r2', 'Market value difference', 'Mandiri', 20000, null, 'unresolved', '[["broker", "Accept broker total"], ["rowsum", "Accept row sum"], ["unresolved", "Leave unresolved"]]'::jsonb),
  ('00000000-0000-0000-0000-000000000000', 'r3', 'Instrument unconfirmed', 'Binance Gold', null, null, 'unresolved', '[["confirm", "Confirm symbol"], ["unresolved", "Leave unconfirmed"]]'::jsonb),
  ('00000000-0000-0000-0000-000000000000', 'r4', 'Estimated cost basis', 'IBKR IBM', 214.07, 'USD', 'unresolved', '[["confirm", "Confirm"], ["edit", "Edit"]]'::jsonb)
on conflict do nothing;
