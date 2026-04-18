alter table public.portfolio_positions
  add column if not exists quantity numeric(18,6),
  add column if not exists average_cost numeric(18,6);
