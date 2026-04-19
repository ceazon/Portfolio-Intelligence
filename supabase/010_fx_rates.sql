create table if not exists public.fx_rate_snapshots (
  pair text primary key,
  rate numeric(18,8) not null,
  fetched_at timestamptz not null default now(),
  source text,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.fx_refresh_runs (
  id uuid primary key default gen_random_uuid(),
  trigger_type text not null default 'manual',
  status text not null default 'queued',
  pair text not null default 'USD/CAD',
  summary text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_fx_refresh_runs_created_at on public.fx_refresh_runs(created_at desc);

alter table public.fx_rate_snapshots enable row level security;
alter table public.fx_refresh_runs enable row level security;

create policy "fx snapshots are readable by authenticated users"
on public.fx_rate_snapshots
for select
using (auth.uid() is not null);

create policy "fx refresh runs are readable by authenticated users"
on public.fx_refresh_runs
for select
using (auth.uid() is not null);
