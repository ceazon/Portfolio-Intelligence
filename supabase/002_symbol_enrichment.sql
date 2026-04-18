alter table public.symbols
  add column if not exists currency text,
  add column if not exists figi text,
  add column if not exists mic text,
  add column if not exists logo_url text,
  add column if not exists web_url text,
  add column if not exists market_cap numeric,
  add column if not exists ipo_date date,
  add column if not exists raw_profile jsonb,
  add column if not exists last_profile_sync_at timestamptz,
  add column if not exists last_quote_sync_at timestamptz;

create table if not exists public.symbol_price_snapshots (
  symbol_id uuid primary key references public.symbols(id) on delete cascade,
  price numeric,
  change numeric,
  percent_change numeric,
  high numeric,
  low numeric,
  open numeric,
  previous_close numeric,
  fetched_at timestamptz not null default now()
);
