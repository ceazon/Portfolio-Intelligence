import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { SymbolImportPanel } from "@/components/symbol-import-panel";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireUser } from "@/lib/auth";
import { formatAppDateTime } from "@/lib/time";

type SymbolRow = {
  id: string;
  ticker: string;
  name: string | null;
  asset_type: string | null;
  exchange: string | null;
  country: string | null;
  sector: string | null;
  industry: string | null;
  currency: string | null;
  logo_url: string | null;
  web_url: string | null;
  market_cap: number | null;
  ipo_date: string | null;
  last_profile_sync_at: string | null;
  last_quote_sync_at: string | null;
  is_etf: boolean | null;
  created_at: string;
  symbol_price_snapshots:
    | {
        price: number | null;
        change: number | null;
        percent_change: number | null;
        previous_close: number | null;
        fetched_at: string;
      }
    | {
        price: number | null;
        change: number | null;
        percent_change: number | null;
        previous_close: number | null;
        fetched_at: string;
      }[]
    | null;
};

function firstRelation<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function formatMarketCap(value: number | null) {
  if (!value || Number.isNaN(value)) {
    return null;
  }

  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}B`;
  }

  return `$${value.toFixed(1)}M`;
}

type WatchlistRow = {
  id: string;
  name: string;
};

export default async function SymbolsPage() {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  let symbols: SymbolRow[] = [];
  let watchlists: WatchlistRow[] = [];
  let loadError = "";

  if (supabase) {
    const [symbolsResult, watchlistsResult] = await Promise.all([
      supabase
        .from("symbols")
        .select(
          "id, ticker, name, asset_type, exchange, country, sector, industry, currency, logo_url, web_url, market_cap, ipo_date, last_profile_sync_at, last_quote_sync_at, is_etf, created_at, symbol_price_snapshots(price, change, percent_change, previous_close, fetched_at)",
        )
        .order("created_at", { ascending: false }),
      supabase.from("watchlists").select("id, name").eq("owner_id", user.id).order("created_at", { ascending: false }),
    ]);

    if (symbolsResult.error) {
      loadError = symbolsResult.error.message;
    } else {
      symbols = (symbolsResult.data || []) as SymbolRow[];
    }

    if (watchlistsResult.error && !loadError) {
      loadError = watchlistsResult.error.message;
    } else {
      watchlists = (watchlistsResult.data || []) as WatchlistRow[];
    }
  }

  return (
    <AppShell viewer={user}>
      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="space-y-6">
          <SectionCard
            title="Symbol directory"
            description="This is the central universe for imported stocks and ETFs. We want this populated by external APIs, not manual data entry."
          >
            {loadError ? (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
                Could not load symbols yet: {loadError}
              </div>
            ) : symbols.length > 0 ? (
              <div className="space-y-3">
                {symbols.map((symbol) => {
                  const quote = firstRelation(symbol.symbol_price_snapshots);
                  const marketCap = formatMarketCap(symbol.market_cap);
                  const changePositive = typeof quote?.change === "number" ? quote.change >= 0 : null;

                  return (
                    <div key={symbol.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-3">
                            {symbol.logo_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={symbol.logo_url} alt="" className="h-8 w-8 rounded-full bg-white object-contain p-1" />
                            ) : null}
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

                          <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-400">
                            {symbol.currency ? <span className="rounded-full border border-zinc-700 px-2 py-1">Currency {symbol.currency}</span> : null}
                            {marketCap ? <span className="rounded-full border border-zinc-700 px-2 py-1">Market cap {marketCap}</span> : null}
                            {symbol.ipo_date ? <span className="rounded-full border border-zinc-700 px-2 py-1">IPO {symbol.ipo_date}</span> : null}
                            {symbol.web_url ? (
                              <a href={symbol.web_url} target="_blank" rel="noreferrer" className="rounded-full border border-zinc-700 px-2 py-1 hover:border-sky-500/60 hover:text-sky-300">
                                Website
                              </a>
                            ) : null}
                          </div>
                        </div>

                        <div className="min-w-[140px] text-right">
                          {typeof quote?.price === "number" ? (
                            <>
                              <p className="text-lg font-semibold text-zinc-100">${quote.price.toFixed(2)}</p>
                              <p className={`mt-1 text-sm ${changePositive === null ? "text-zinc-400" : changePositive ? "text-emerald-300" : "text-rose-300"}`}>
                                {typeof quote.change === "number" ? `${changePositive ? "+" : ""}${quote.change.toFixed(2)}` : "--"}
                                {typeof quote.percent_change === "number" ? ` (${changePositive ? "+" : ""}${quote.percent_change.toFixed(2)}%)` : ""}
                              </p>
                              <p className="mt-1 text-xs text-zinc-500">Updated {formatAppDateTime(quote.fetched_at)}</p>
                            </>
                          ) : (
                            <div className="text-sm text-zinc-500">No quote yet</div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
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
            <SymbolImportPanel watchlists={watchlists} />
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
