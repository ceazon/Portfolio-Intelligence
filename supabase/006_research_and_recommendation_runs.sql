create table if not exists public.research_runs (
  id uuid primary key default gen_random_uuid(),
  agent_name text not null,
  run_type text not null,
  scope_type text not null default 'global',
  scope_key text,
  status text not null default 'queued',
  summary text,
  model text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.research_insights (
  id uuid primary key default gen_random_uuid(),
  research_run_id uuid not null references public.research_runs(id) on delete cascade,
  insight_type text not null,
  scope_type text not null default 'global',
  scope_key text,
  symbol_id uuid references public.symbols(id) on delete set null,
  title text not null,
  summary text,
  thesis text,
  direction text,
  confidence_score numeric(6,2),
  time_horizon text,
  evidence_json jsonb,
  source_urls_json jsonb,
  generated_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.recommendation_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  trigger_type text not null default 'manual',
  target_type text not null default 'portfolio',
  target_id uuid,
  status text not null default 'queued',
  summary text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.recommendations
  add column if not exists recommendation_run_id uuid references public.recommendation_runs(id) on delete set null;

create table if not exists public.recommendation_evidence (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null references public.recommendations(id) on delete cascade,
  research_insight_id uuid not null references public.research_insights(id) on delete cascade,
  weight numeric(6,2),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_research_runs_scope on public.research_runs(scope_type, scope_key, created_at desc);
create index if not exists idx_research_insights_scope on public.research_insights(scope_type, scope_key, created_at desc);
create index if not exists idx_research_insights_symbol on public.research_insights(symbol_id, created_at desc);
create index if not exists idx_recommendation_runs_owner on public.recommendation_runs(owner_id, created_at desc);
create index if not exists idx_recommendations_run on public.recommendations(recommendation_run_id);
create index if not exists idx_recommendation_evidence_recommendation on public.recommendation_evidence(recommendation_id);
create index if not exists idx_recommendation_evidence_insight on public.recommendation_evidence(research_insight_id);

alter table public.research_runs enable row level security;
alter table public.research_insights enable row level security;
alter table public.recommendation_runs enable row level security;
alter table public.recommendation_evidence enable row level security;

create policy "research runs are readable by authenticated users"
on public.research_runs
for select
using (auth.uid() is not null);

create policy "research insights are readable by authenticated users"
on public.research_insights
for select
using (auth.uid() is not null);

create policy "users can view own recommendation runs"
on public.recommendation_runs
for select
using (owner_id = auth.uid());

create policy "users can insert own recommendation runs"
on public.recommendation_runs
for insert
with check (owner_id = auth.uid());

create policy "users can update own recommendation runs"
on public.recommendation_runs
for update
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "users can delete own recommendation runs"
on public.recommendation_runs
for delete
using (owner_id = auth.uid());

create policy "users can view own recommendation evidence"
on public.recommendation_evidence
for select
using (
  exists (
    select 1
    from public.recommendations
    where public.recommendations.id = public.recommendation_evidence.recommendation_id
      and public.recommendations.owner_id = auth.uid()
  )
);

create policy "users can insert own recommendation evidence"
on public.recommendation_evidence
for insert
with check (
  exists (
    select 1
    from public.recommendations
    where public.recommendations.id = public.recommendation_evidence.recommendation_id
      and public.recommendations.owner_id = auth.uid()
  )
);

create policy "users can update own recommendation evidence"
on public.recommendation_evidence
for update
using (
  exists (
    select 1
    from public.recommendations
    where public.recommendations.id = public.recommendation_evidence.recommendation_id
      and public.recommendations.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.recommendations
    where public.recommendations.id = public.recommendation_evidence.recommendation_id
      and public.recommendations.owner_id = auth.uid()
  )
);

create policy "users can delete own recommendation evidence"
on public.recommendation_evidence
for delete
using (
  exists (
    select 1
    from public.recommendations
    where public.recommendations.id = public.recommendation_evidence.recommendation_id
      and public.recommendations.owner_id = auth.uid()
  )
);
