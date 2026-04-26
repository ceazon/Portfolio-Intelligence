create table if not exists public.rebalancing_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  portfolio_id uuid references public.portfolios(id) on delete cascade,
  engine_name text not null default 'analyst-rebalance-v1',
  status text not null default 'completed',
  summary text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.rebalance_recommendations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  portfolio_id uuid references public.portfolios(id) on delete cascade,
  symbol_id uuid not null references public.symbols(id) on delete cascade,
  rebalancing_run_id uuid not null references public.rebalancing_runs(id) on delete cascade,
  action text not null,
  rank integer,
  current_weight numeric(6,2),
  target_weight numeric(6,2),
  weight_delta numeric(6,2),
  current_price numeric(12,4),
  consensus_target numeric(12,4),
  implied_upside_pct numeric(8,2),
  rationale text,
  confidence text,
  created_at timestamptz not null default now()
);

create index if not exists idx_rebalancing_runs_owner_created
  on public.rebalancing_runs(owner_id, created_at desc);

create index if not exists idx_rebalance_recommendations_run
  on public.rebalance_recommendations(rebalancing_run_id);

create index if not exists idx_rebalance_recommendations_owner_portfolio
  on public.rebalance_recommendations(owner_id, portfolio_id, created_at desc);

alter table public.rebalancing_runs enable row level security;
alter table public.rebalance_recommendations enable row level security;

create policy "users can view own rebalancing runs"
on public.rebalancing_runs
for select
using (owner_id = auth.uid());

create policy "users can insert own rebalancing runs"
on public.rebalancing_runs
for insert
with check (owner_id = auth.uid());

create policy "users can update own rebalancing runs"
on public.rebalancing_runs
for update
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "users can delete own rebalancing runs"
on public.rebalancing_runs
for delete
using (owner_id = auth.uid());

create policy "users can view own rebalance recommendations"
on public.rebalance_recommendations
for select
using (owner_id = auth.uid());

create policy "users can insert own rebalance recommendations"
on public.rebalance_recommendations
for insert
with check (owner_id = auth.uid());

create policy "users can update own rebalance recommendations"
on public.rebalance_recommendations
for update
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "users can delete own rebalance recommendations"
on public.rebalance_recommendations
for delete
using (owner_id = auth.uid());
