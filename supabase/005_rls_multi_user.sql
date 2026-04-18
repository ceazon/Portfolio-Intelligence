alter table public.watchlists enable row level security;
alter table public.watchlist_items enable row level security;
alter table public.portfolios enable row level security;
alter table public.portfolio_positions enable row level security;
alter table public.recommendations enable row level security;
alter table public.agent_runs enable row level security;
alter table public.profiles enable row level security;

-- Symbols and price snapshots remain globally readable reference data.
alter table public.symbols enable row level security;
alter table public.symbol_price_snapshots enable row level security;

create policy "symbols are readable by authenticated users"
on public.symbols
for select
using (auth.uid() is not null);

create policy "price snapshots are readable by authenticated users"
on public.symbol_price_snapshots
for select
using (auth.uid() is not null);

create policy "users can view own profile"
on public.profiles
for select
using (id = auth.uid());

create policy "users can insert own profile"
on public.profiles
for insert
with check (id = auth.uid());

create policy "users can update own profile"
on public.profiles
for update
using (id = auth.uid())
with check (id = auth.uid());

create policy "users can view own watchlists"
on public.watchlists
for select
using (owner_id = auth.uid());

create policy "users can insert own watchlists"
on public.watchlists
for insert
with check (owner_id = auth.uid());

create policy "users can update own watchlists"
on public.watchlists
for update
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "users can delete own watchlists"
on public.watchlists
for delete
using (owner_id = auth.uid());

create policy "users can view own watchlist items"
on public.watchlist_items
for select
using (
  exists (
    select 1
    from public.watchlists
    where public.watchlists.id = public.watchlist_items.watchlist_id
      and public.watchlists.owner_id = auth.uid()
  )
);

create policy "users can insert own watchlist items"
on public.watchlist_items
for insert
with check (
  exists (
    select 1
    from public.watchlists
    where public.watchlists.id = public.watchlist_items.watchlist_id
      and public.watchlists.owner_id = auth.uid()
  )
);

create policy "users can update own watchlist items"
on public.watchlist_items
for update
using (
  exists (
    select 1
    from public.watchlists
    where public.watchlists.id = public.watchlist_items.watchlist_id
      and public.watchlists.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.watchlists
    where public.watchlists.id = public.watchlist_items.watchlist_id
      and public.watchlists.owner_id = auth.uid()
  )
);

create policy "users can delete own watchlist items"
on public.watchlist_items
for delete
using (
  exists (
    select 1
    from public.watchlists
    where public.watchlists.id = public.watchlist_items.watchlist_id
      and public.watchlists.owner_id = auth.uid()
  )
);

create policy "users can view own portfolios"
on public.portfolios
for select
using (owner_id = auth.uid());

create policy "users can insert own portfolios"
on public.portfolios
for insert
with check (owner_id = auth.uid());

create policy "users can update own portfolios"
on public.portfolios
for update
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "users can delete own portfolios"
on public.portfolios
for delete
using (owner_id = auth.uid());

create policy "users can view own portfolio positions"
on public.portfolio_positions
for select
using (
  exists (
    select 1
    from public.portfolios
    where public.portfolios.id = public.portfolio_positions.portfolio_id
      and public.portfolios.owner_id = auth.uid()
  )
);

create policy "users can insert own portfolio positions"
on public.portfolio_positions
for insert
with check (
  exists (
    select 1
    from public.portfolios
    where public.portfolios.id = public.portfolio_positions.portfolio_id
      and public.portfolios.owner_id = auth.uid()
  )
);

create policy "users can update own portfolio positions"
on public.portfolio_positions
for update
using (
  exists (
    select 1
    from public.portfolios
    where public.portfolios.id = public.portfolio_positions.portfolio_id
      and public.portfolios.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.portfolios
    where public.portfolios.id = public.portfolio_positions.portfolio_id
      and public.portfolios.owner_id = auth.uid()
  )
);

create policy "users can delete own portfolio positions"
on public.portfolio_positions
for delete
using (
  exists (
    select 1
    from public.portfolios
    where public.portfolios.id = public.portfolio_positions.portfolio_id
      and public.portfolios.owner_id = auth.uid()
  )
);

create policy "users can view own recommendations"
on public.recommendations
for select
using (owner_id = auth.uid());

create policy "users can insert own recommendations"
on public.recommendations
for insert
with check (owner_id = auth.uid());

create policy "users can update own recommendations"
on public.recommendations
for update
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "users can delete own recommendations"
on public.recommendations
for delete
using (owner_id = auth.uid());

create policy "users can view own agent runs"
on public.agent_runs
for select
using (owner_id = auth.uid());

create policy "users can insert own agent runs"
on public.agent_runs
for insert
with check (owner_id = auth.uid());

create policy "users can update own agent runs"
on public.agent_runs
for update
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "users can delete own agent runs"
on public.agent_runs
for delete
using (owner_id = auth.uid());
