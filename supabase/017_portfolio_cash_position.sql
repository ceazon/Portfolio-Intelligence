alter table public.portfolios
  add column if not exists cash_position numeric,
  add column if not exists cash_currency text;

update public.portfolios
set
  cash_position = coalesce(cash_position, 0),
  cash_currency = coalesce(cash_currency, display_currency, 'USD')
where cash_position is null or cash_currency is null;
