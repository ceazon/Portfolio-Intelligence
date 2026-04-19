alter table public.recommendations
  add column if not exists target_price numeric(14,2);

create index if not exists idx_recommendations_target_price
  on public.recommendations(target_price);
