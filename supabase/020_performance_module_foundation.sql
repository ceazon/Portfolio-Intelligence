create table if not exists public.analyst_target_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  symbol_id uuid not null references public.symbols(id) on delete cascade,
  ticker text not null,
  source text not null,
  captured_at timestamptz not null default now(),
  current_price numeric(12,4),
  current_price_currency text,
  mean_target numeric(12,4),
  median_target numeric(12,4),
  high_target numeric(12,4),
  low_target numeric(12,4),
  created_at timestamptz not null default now()
);

create table if not exists public.symbol_price_history (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  symbol_id uuid not null references public.symbols(id) on delete cascade,
  ticker text not null,
  source text not null,
  price numeric(12,4) not null,
  currency text,
  captured_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.analyst_target_performance (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  target_snapshot_id uuid not null references public.analyst_target_snapshots(id) on delete cascade,
  symbol_id uuid not null references public.symbols(id) on delete cascade,
  evaluation_window_days integer not null,
  price_at_evaluation numeric(12,4),
  actual_return_pct numeric(8,3),
  expected_return_pct_at_capture numeric(8,3),
  alpha_vs_consensus_pct numeric(8,3),
  hit_target boolean,
  days_to_target_hit integer,
  evaluated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (target_snapshot_id, evaluation_window_days)
);

create index if not exists idx_analyst_target_snapshots_symbol_captured
  on public.analyst_target_snapshots(symbol_id, captured_at desc);

create index if not exists idx_symbol_price_history_symbol_captured
  on public.symbol_price_history(symbol_id, captured_at desc);

create index if not exists idx_analyst_target_performance_symbol_window
  on public.analyst_target_performance(symbol_id, evaluation_window_days, evaluated_at desc);

create index if not exists idx_analyst_target_performance_snapshot_window
  on public.analyst_target_performance(target_snapshot_id, evaluation_window_days);

alter table public.analyst_target_snapshots enable row level security;
alter table public.symbol_price_history enable row level security;
alter table public.analyst_target_performance enable row level security;

create policy "users can view own analyst target snapshots"
on public.analyst_target_snapshots
for select
using (owner_id = auth.uid() or owner_id is null);

create policy "users can insert own analyst target snapshots"
on public.analyst_target_snapshots
for insert
with check (owner_id = auth.uid() or owner_id is null);

create policy "users can update own analyst target snapshots"
on public.analyst_target_snapshots
for update
using (owner_id = auth.uid() or owner_id is null)
with check (owner_id = auth.uid() or owner_id is null);

create policy "users can delete own analyst target snapshots"
on public.analyst_target_snapshots
for delete
using (owner_id = auth.uid() or owner_id is null);

create policy "users can view own symbol price history"
on public.symbol_price_history
for select
using (owner_id = auth.uid() or owner_id is null);

create policy "users can insert own symbol price history"
on public.symbol_price_history
for insert
with check (owner_id = auth.uid() or owner_id is null);

create policy "users can update own symbol price history"
on public.symbol_price_history
for update
using (owner_id = auth.uid() or owner_id is null)
with check (owner_id = auth.uid() or owner_id is null);

create policy "users can delete own symbol price history"
on public.symbol_price_history
for delete
using (owner_id = auth.uid() or owner_id is null);

create policy "users can view own analyst target performance"
on public.analyst_target_performance
for select
using (owner_id = auth.uid() or owner_id is null);

create policy "users can insert own analyst target performance"
on public.analyst_target_performance
for insert
with check (owner_id = auth.uid() or owner_id is null);

create policy "users can update own analyst target performance"
on public.analyst_target_performance
for update
using (owner_id = auth.uid() or owner_id is null)
with check (owner_id = auth.uid() or owner_id is null);

create policy "users can delete own analyst target performance"
on public.analyst_target_performance
for delete
using (owner_id = auth.uid() or owner_id is null);
