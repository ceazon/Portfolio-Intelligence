alter table public.research_runs
  add column if not exists owner_id uuid references auth.users(id) on delete set null;

alter table public.research_insights
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;

create index if not exists idx_research_runs_owner_created on public.research_runs(owner_id, created_at desc);
create index if not exists idx_research_insights_owner_created on public.research_insights(owner_id, created_at desc);

drop policy if exists "research runs are readable by authenticated users" on public.research_runs;
drop policy if exists "research insights are readable by authenticated users" on public.research_insights;

create policy "users can view shared or own research runs"
on public.research_runs
for select
using (auth.uid() is not null and (owner_id is null or owner_id = auth.uid()));

create policy "users can insert own or shared research runs"
on public.research_runs
for insert
with check (auth.uid() is not null and (owner_id is null or owner_id = auth.uid()));

create policy "users can update own or shared research runs"
on public.research_runs
for update
using (auth.uid() is not null and (owner_id is null or owner_id = auth.uid()))
with check (auth.uid() is not null and (owner_id is null or owner_id = auth.uid()));

create policy "users can delete own research runs"
on public.research_runs
for delete
using (owner_id = auth.uid());

create policy "users can view shared or own research insights"
on public.research_insights
for select
using (auth.uid() is not null and (owner_id is null or owner_id = auth.uid()));

create policy "users can insert own or shared research insights"
on public.research_insights
for insert
with check (auth.uid() is not null and (owner_id is null or owner_id = auth.uid()));

create policy "users can update own or shared research insights"
on public.research_insights
for update
using (auth.uid() is not null and (owner_id is null or owner_id = auth.uid()))
with check (auth.uid() is not null and (owner_id is null or owner_id = auth.uid()));

create policy "users can delete own research insights"
on public.research_insights
for delete
using (owner_id = auth.uid());
