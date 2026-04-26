alter table public.portfolios
  add column if not exists recommendation_cash_mode text;

update public.portfolios
set recommendation_cash_mode = coalesce(recommendation_cash_mode, 'managed-cash')
where recommendation_cash_mode is null;
