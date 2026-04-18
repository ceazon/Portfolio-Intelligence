import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { SymbolImportPanel } from "@/components/symbol-import-panel";
import { createSupabaseServerClient } from "@/lib/supabase-server";

type SymbolRow = {
  id: string;
  ticker: string;
  name: string | null;
  asset_type: string | null;
  exchange: string | null;
  country: string | null;
  sector: string | null;
  is_etf: boolean | null;
  created_at: string;
};

type WatchlistRow = {
  id: string;
  name: string;
};

export default async function SymbolsPage() {
  const supabase = await createSupabaseServerClient();

  const { data: symbols } = supabase
    ? await supabase
        .from("symbols")
        .select("id, ticker, name, asset_type, exchange, country, sector, is_etf, created_at")
        .order("created_at", { ascending: false })
    : { data: [] as SymbolRow[] };

  const { data: watchlists } = supabase
    ? await supabase.from("watchlists").select("id, name").order("created_at", { ascending: false })
    : { data: [] as WatchlistRow[] };

  return (
    <AppShell>
      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="space-y-6">
          <SectionCard
            title="Symbol directory"
            description="This is the central universe for imported stocks and ETFs. We want this populated by external APIs, not manual data entry."
          >
            {symbols && symbols.length > 0 ? (
              <div className="space-y-3">
                {symbols.map((symbol) => (
                  <div key={symbol.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-zinc-100">
                          {symbol.ticker}
                          <span className="ml-2 text-zinc-400">{symbol.name || "Unnamed symbol"}</span>
                        </p>
                        <p className="mt-1 text-xs uppercase tracking-wide text-zinc-500">
                          {symbol.asset_type || "stock"}
                          {symbol.is_etf ? " · ETF" : ""}
                          {symbol.exchange ? ` · ${symbol.exchange}` : ""}
                          {symbol.country ? ` · ${symbol.country}` : ""}
                          {symbol.sector ? ` · ${symbol.sector}` : ""}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">
                No symbols imported yet. Use the import panel on the right to start building the investable universe.
              </div>
            )}
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard
            title="Import from market data"
            description="Search by ticker or company name and pull the best match from Finnhub into your symbol universe."
          >
            <SymbolImportPanel watchlists={watchlists || []} />
          </SectionCard>

          <SectionCard
            title="What comes next"
            description="Once symbols are flowing in, we can deepen the system quickly."
          >
            <ul className="space-y-3 text-sm text-zinc-300">
              <li className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3">Better search result selection instead of simple first-match fallback</li>
              <li className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3">Company metadata enrichment and profile refresh jobs</li>
              <li className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3">Daily price ingestion for imported symbols</li>
              <li className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3">Attach symbols to portfolios and recommendation pipelines</li>
            </ul>
          </SectionCard>
        </div>
      </div>
    </AppShell>
  );
}
