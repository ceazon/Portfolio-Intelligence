create table if not exists public.agent_outputs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  research_run_id uuid references public.research_runs(id) on delete set null,
  agent_name text not null,
  symbol_id uuid references public.symbols(id) on delete cascade,
  scope_type text not null default 'symbol',
  scope_key text,
  stance text,
  normalized_score numeric(6,2),
  confidence_score numeric(6,2),
  action_bias text,
  target_weight_delta numeric(6,2),
  time_horizon text,
  thesis text,
  summary text,
  evidence_json jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create table if not exists public.synthesis_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  model text,
  status text not null default 'queued',
  trigger_type text not null default 'manual',
  summary text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.recommendations
  add column if not exists synthesis_run_id uuid references public.synthesis_runs(id) on delete set null,
  add column if not exists recommendation_engine text not null default 'rules-v1';

create index if not exists idx_agent_outputs_owner_symbol_created on public.agent_outputs(owner_id, symbol_id, created_at desc);
create index if not exists idx_synthesis_runs_owner_created on public.synthesis_runs(owner_id, created_at desc);
create index if not exists idx_recommendations_synthesis_run on public.recommendations(synthesis_run_id);

alter table public.agent_outputs enable row level security;
alter table public.synthesis_runs enable row level security;

create policy "users can view own agent outputs"
on public.agent_outputs
for select
using (owner_id = auth.uid());

create policy "users can insert own agent outputs"
on public.agent_outputs
for insert
with check (owner_id = auth.uid());

create policy "users can update own agent outputs"
on public.agent_outputs
for update
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "users can delete own agent outputs"
on public.agent_outputs
for delete
using (owner_id = auth.uid());

create policy "users can view own synthesis runs"
on public.synthesis_runs
for select
using (owner_id = auth.uid());

create policy "users can insert own synthesis runs"
on public.synthesis_runs
for insert
with check (owner_id = auth.uid());

create policy "users can update own synthesis runs"
on public.synthesis_runs
for update
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "users can delete own synthesis runs"
on public.synthesis_runs
for delete
using (owner_id = auth.uid());
