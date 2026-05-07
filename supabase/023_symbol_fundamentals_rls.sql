alter table public.symbol_fundamentals enable row level security;

create policy "symbol fundamentals are readable by authenticated users"
on public.symbol_fundamentals
for select
using (auth.uid() is not null);
