create table if not exists public.discovery_provider_attempts (
  id uuid primary key default gen_random_uuid(),
  universe text not null default 'sp500',
  ticker text not null,
  provider text not null,
  purpose text not null default 'fundamentals',
  last_success_at timestamptz,
  last_failure_at timestamptz,
  failure_count integer not null default 0,
  last_error text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (universe, ticker, provider, purpose)
);

create index if not exists idx_discovery_provider_attempts_lookup
  on public.discovery_provider_attempts(universe, provider, purpose, ticker);

create index if not exists idx_discovery_provider_attempts_failures
  on public.discovery_provider_attempts(provider, last_failure_at desc nulls last, failure_count desc);

alter table public.discovery_provider_attempts enable row level security;

create policy "authenticated users can view discovery provider attempts"
on public.discovery_provider_attempts
for select
to authenticated
using (true);
