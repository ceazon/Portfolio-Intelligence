import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { CreateWatchlistForm } from "@/components/create-watchlist-form";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export default async function WatchlistPage() {
  const supabase = await createSupabaseServerClient();
  const { data: watchlists } = supabase
    ? await supabase.from("watchlists").select("id, name, description, created_at").order("created_at", { ascending: false })
    : { data: [] as { id: string; name: string; description: string | null; created_at: string }[] };

  return (
    <AppShell>
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
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
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">
              No watchlists yet. Create one on the right and we’ll use it as the basis for the stock universe and ranking pipeline.
            </div>
          )}
        </SectionCard>

        <CreateWatchlistForm />
      </div>
    </AppShell>
  );
}
