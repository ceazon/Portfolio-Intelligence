create table if not exists public.quote_refresh_runs (
  id uuid primary key default gen_random_uuid(),
  trigger_type text not null default 'manual',
  status text not null default 'queued',
  cadence_label text,
  symbols_considered integer not null default 0,
  symbols_refreshed integer not null default 0,
  summary text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_quote_refresh_runs_created_at on public.quote_refresh_runs(created_at desc);

alter table public.quote_refresh_runs enable row level security;

create policy "quote refresh runs are readable by authenticated users"
on public.quote_refresh_runs
for select
using (auth.uid() is not null);
