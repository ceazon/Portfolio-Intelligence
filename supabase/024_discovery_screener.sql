create table if not exists public.discovery_universe_symbols (
  id uuid primary key default gen_random_uuid(),
  universe text not null default 'sp500',
  ticker text not null,
  provider_ticker text not null,
  name text,
  sector text,
  industry text,
  source text not null default 'slickcharts',
  is_active boolean not null default true,
  added_at timestamptz not null default now(),
  removed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (universe, ticker)
);

create table if not exists public.discovery_snapshots (
  id uuid primary key default gen_random_uuid(),
  universe text not null default 'sp500',
  ticker text not null,
  provider_ticker text not null,
  name text,
  sector text,
  industry text,
  price numeric(12,4),
  currency text,
  consensus_target numeric(12,4),
  median_target numeric(12,4),
  high_target numeric(12,4),
  low_target numeric(12,4),
  implied_upside_pct numeric(9,3),
  market_cap numeric(20,2),
  pe_ttm numeric(12,4),
  revenue_growth_ttm numeric(10,4),
  score numeric(8,3),
  score_breakdown_json jsonb not null default '{}'::jsonb,
  flags_json jsonb not null default '[]'::jsonb,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (universe, ticker)
);

create index if not exists idx_discovery_universe_active
  on public.discovery_universe_symbols(universe, is_active, ticker);

create index if not exists idx_discovery_snapshots_universe_score
  on public.discovery_snapshots(universe, score desc nulls last);

create index if not exists idx_discovery_snapshots_universe_upside
  on public.discovery_snapshots(universe, implied_upside_pct desc nulls last);

alter table public.discovery_universe_symbols enable row level security;
alter table public.discovery_snapshots enable row level security;

create policy "authenticated users can view discovery universe"
on public.discovery_universe_symbols
for select
to authenticated
using (true);

create policy "authenticated users can view discovery snapshots"
on public.discovery_snapshots
for select
to authenticated
using (true);
