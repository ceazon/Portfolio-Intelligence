create extension if not exists pgcrypto;

create table if not exists public.symbols (
  id uuid primary key default gen_random_uuid(),
  ticker text not null unique,
  name text,
  exchange text,
  country text,
  asset_type text not null default 'stock',
  sector text,
  industry text,
  is_etf boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.watchlists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  owner_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.watchlist_items (
  id uuid primary key default gen_random_uuid(),
  watchlist_id uuid not null references public.watchlists(id) on delete cascade,
  symbol_id uuid not null references public.symbols(id) on delete cascade,
  status text not null default 'watch',
  notes text,
  created_at timestamptz not null default now(),
  unique (watchlist_id, symbol_id)
);

create table if not exists public.portfolios (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  benchmark text default 'SPY',
  owner_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.portfolio_positions (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  symbol_id uuid not null references public.symbols(id) on delete cascade,
  status text not null default 'watch',
  target_weight numeric(6,2),
  current_weight numeric(6,2),
  conviction_score numeric(6,2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (portfolio_id, symbol_id)
);

create table if not exists public.recommendations (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid references public.portfolios(id) on delete cascade,
  symbol_id uuid references public.symbols(id) on delete cascade,
  action text not null,
  status text not null default 'open',
  target_weight numeric(6,2),
  conviction_score numeric(6,2),
  summary text,
  risks text,
  confidence text,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent_name text not null,
  run_type text not null,
  status text not null default 'queued',
  summary text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
