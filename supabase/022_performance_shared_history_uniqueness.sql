drop index if exists public.idx_symbol_price_history_owner_symbol_market_day_unique;

drop index if exists public.idx_symbol_price_history_owner_symbol_market_day_expr_unique;

create unique index if not exists idx_symbol_price_history_owner_symbol_market_day_expr_unique
  on public.symbol_price_history (
    coalesce(owner_id, '00000000-0000-0000-0000-000000000000'::uuid),
    symbol_id,
    market_day
  );
