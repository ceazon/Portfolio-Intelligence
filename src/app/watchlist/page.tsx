import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { CreateWatchlistForm } from "@/components/create-watchlist-form";
import { EditWatchlistForm } from "@/components/edit-watchlist-form";
import { SymbolImportPanel } from "@/components/symbol-import-panel";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireUser } from "@/lib/auth";

type WatchlistRow = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
};

type WatchlistItemRow = {
  id: string;
  status: string;
  watchlists: { name: string } | { name: string }[] | null;
  symbols: { ticker: string; name: string | null; asset_type: string | null } | { ticker: string; name: string | null; asset_type: string | null }[] | null;
};

function firstRelation<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value;
}

export default async function WatchlistPage() {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data: watchlists } = supabase
    ? await supabase.from("watchlists").select("id, name, description, created_at").eq("owner_id", user.id).order("created_at", { ascending: false })
    : { data: [] as WatchlistRow[] };

  const { data: watchlistItems } = supabase
    ? await supabase
        .from("watchlist_items")
        .select("id, status, watchlists!inner(name, owner_id), symbols(ticker, name, asset_type)")
        .eq("watchlists.owner_id", user.id)
        .order("created_at", { ascending: false })
    : { data: [] as WatchlistItemRow[] };

  return (
    <AppShell viewer={user}>
      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="space-y-6">
          <SectionCard
            title="Watchlists"
            description="Track candidate stocks and ETFs before they become portfolio positions."
          >
            {watchlists && watchlists.length > 0 ? (
              <div className="space-y-3">
                {watchlists.map((list) => (
                  <div key={list.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-base font-semibold text-zinc-100">{list.name}</h3>
                        <p className="mt-1 text-sm text-zinc-400">{list.description || "No description yet."}</p>
                      </div>
                      <span className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-400">Watchlist</span>
                    </div>
                    <EditWatchlistForm id={list.id} name={list.name} description={list.description} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">
                No watchlists yet. Create one on the right and we’ll use it as the basis for the stock universe and ranking pipeline.
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Watchlist symbols"
            description="These are imported from an external data provider and attached to your watchlists."
          >
            {watchlistItems && watchlistItems.length > 0 ? (
              <div className="space-y-3">
                {watchlistItems.map((item) => {
                  const symbol = firstRelation(item.symbols);
                  const watchlist = firstRelation(item.watchlists);

                  return (
                    <div key={item.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-zinc-100">
                            {symbol?.ticker || "Unknown ticker"}
                            <span className="ml-2 text-zinc-400">{symbol?.name || "Unnamed symbol"}</span>
                          </p>
                          <p className="mt-1 text-xs uppercase tracking-wide text-zinc-500">
                            {watchlist?.name || "Unassigned"} · {symbol?.asset_type || "stock"} · {item.status}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">
                No symbols attached yet. Import your first ticker using the symbol panel on the right.
              </div>
            )}
          </SectionCard>
        </div>

        <div className="space-y-6">
          <CreateWatchlistForm />

          <SectionCard
            title="Symbol ingestion"
            description="We are using external APIs and public market data sources rather than manual homegrown symbol lists."
          >
            <SymbolImportPanel watchlists={(watchlists || []).map((watchlist) => ({ id: watchlist.id, name: watchlist.name }))} />
          </SectionCard>
        </div>
      </div>
    </AppShell>
  );
}
