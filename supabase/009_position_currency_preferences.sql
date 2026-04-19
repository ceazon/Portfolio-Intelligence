alter table public.portfolio_positions
  add column if not exists average_cost_currency text not null default 'USD';

alter table public.portfolios
  add column if not exists display_currency text not null default 'USD';

update public.portfolio_positions
set average_cost_currency = coalesce(nullif(average_cost_currency, ''), 'USD')
where average_cost_currency is null or average_cost_currency = '';

update public.portfolios
set display_currency = coalesce(nullif(display_currency, ''), 'USD')
where display_currency is null or display_currency = '';
