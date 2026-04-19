create table if not exists public.symbol_fundamentals (
  id uuid primary key default gen_random_uuid(),
  symbol_id uuid not null references public.symbols(id) on delete cascade,
  pe_ttm numeric(14,2),
  pb_ttm numeric(14,2),
  ps_ttm numeric(14,2),
  revenue_growth_ttm numeric(14,2),
  eps_growth_5y numeric(14,2),
  net_margin_ttm numeric(14,2),
  operating_margin_ttm numeric(14,2),
  roe_ttm numeric(14,2),
  current_ratio_quarterly numeric(14,2),
  market_cap_m numeric(18,2),
  raw_metrics jsonb,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(symbol_id)
);

create index if not exists idx_symbol_fundamentals_symbol on public.symbol_fundamentals(symbol_id);
