alter table public.symbol_price_history
  add column if not exists market_day date;

update public.symbol_price_history
set market_day = (captured_at at time zone 'utc')::date
where market_day is null;

alter table public.symbol_price_history
  alter column market_day set not null;

create unique index if not exists idx_symbol_price_history_owner_symbol_market_day_unique
  on public.symbol_price_history(owner_id, symbol_id, market_day);

create index if not exists idx_symbol_price_history_symbol_market_day
  on public.symbol_price_history(symbol_id, market_day desc);
