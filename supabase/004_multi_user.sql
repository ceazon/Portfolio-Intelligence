alter table public.watchlists
  alter column owner_id set default auth.uid();

alter table public.portfolios
  alter column owner_id set default auth.uid();

update public.watchlists set owner_id = coalesce(owner_id, gen_random_uuid());
update public.portfolios set owner_id = coalesce(owner_id, gen_random_uuid());

alter table public.watchlists
  alter column owner_id set not null;

alter table public.portfolios
  alter column owner_id set not null;

alter table public.recommendations
  add column if not exists owner_id uuid;

alter table public.agent_runs
  add column if not exists owner_id uuid;

update public.recommendations
set owner_id = portfolios.owner_id
from public.portfolios
where public.recommendations.portfolio_id = portfolios.id
  and public.recommendations.owner_id is null;

update public.agent_runs
set owner_id = portfolios.owner_id
from public.portfolios
where public.agent_runs.owner_id is null
  and exists (
    select 1 from public.portfolios limit 1
  );

alter table public.recommendations
  alter column owner_id set default auth.uid();

alter table public.agent_runs
  alter column owner_id set default auth.uid();

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now()
);
