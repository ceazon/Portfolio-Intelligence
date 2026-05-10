import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { DiscoveryRefreshForm } from "@/components/discovery-refresh-form";
import { DiscoveryWatchlistButton } from "@/components/discovery-watchlist-button";
import { SectionCard } from "@/components/section-card";
import { requireUser } from "@/lib/auth";
import { getSp500Universe } from "@/lib/discovery";
import { formatMoney, formatPercent, formatRatio } from "@/lib/performance-metrics";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { formatAppDateTime, getAppTimeZoneLabel } from "@/lib/time";

type DiscoveryRow = {
  ticker: string;
  provider_ticker: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
  price: number | null;
  currency: string | null;
  consensus_target: number | null;
  implied_upside_pct: number | null;
  market_cap: number | null;
  pe_ttm: number | null;
  revenue_growth_ttm: number | null;
  score: number | null;
  score_breakdown_json: Record<string, number> | null;
  flags_json: string[] | null;
  captured_at: string;
};

type SymbolOwnershipRow = {
  id: string;
  ticker: string;
  portfolio_positions: { id: string }[] | null;
  watchlist_items: { id: string; watchlists: { owner_id: string } | { owner_id: string }[] | null }[] | null;
};

type DiscoveryIdeaRow = {
  id: string;
  created_at: string;
  status: string;
  symbols: {
    ticker: string;
    name: string | null;
    sector: string | null;
    industry: string | null;
  } | {
    ticker: string;
    name: string | null;
    sector: string | null;
    industry: string | null;
  }[] | null;
};

type ExistingSymbolRow = {
  id: string;
  ticker: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
  currency: string | null;
  market_cap: number | null;
  symbol_price_snapshots: { price: number | null; fetched_at: string } | { price: number | null; fetched_at: string }[] | null;
};

type TargetSnapshotRow = {
  symbol_id: string;
  mean_target: number | null;
  captured_at: string;
};

type FundamentalsRow = {
  symbol_id: string;
  pe_ttm: number | null;
  revenue_growth_ttm: number | null;
  market_cap_m: number | null;
  fetched_at: string;
};

type DiscoveryPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const SORT_LABELS = {
  upside: "Implied upside",
  pe: "P/E ratio",
  marketcap: "Market cap",
} as const;

type SortField = keyof typeof SORT_LABELS;

function getSingleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function firstRelation<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function formatMarketCap(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  const absoluteValue = value > 0 && value < 10_000_000 ? value * 1_000_000 : value;
  if (absoluteValue >= 1_000_000_000_000) return `$${(absoluteValue / 1_000_000_000_000).toFixed(2)}T`;
  if (absoluteValue >= 1_000_000_000) return `$${(absoluteValue / 1_000_000_000).toFixed(1)}B`;
  if (absoluteValue >= 1_000_000) return `$${(absoluteValue / 1_000_000).toFixed(1)}M`;
  return `$${absoluteValue.toFixed(0)}`;
}

function getTone(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "text-zinc-400";
  if (value >= 20) return "text-emerald-300";
  if (value >= 5) return "text-sky-300";
  if (value < 0) return "text-rose-300";
  return "text-zinc-300";
}

function formatGrowthPercent(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const percentValue = Math.abs(value) <= 1 ? value * 100 : value;
  return formatPercent(percentValue);
}

function sortRows(rows: DiscoveryRow[], sort: SortField) {
  return [...rows].sort((a, b) => {
    if (sort === "upside") return (b.implied_upside_pct ?? Number.NEGATIVE_INFINITY) - (a.implied_upside_pct ?? Number.NEGATIVE_INFINITY);
    if (sort === "pe") return (a.pe_ttm ?? Number.POSITIVE_INFINITY) - (b.pe_ttm ?? Number.POSITIVE_INFINITY);
    if (sort === "marketcap") return (b.market_cap ?? Number.NEGATIVE_INFINITY) - (a.market_cap ?? Number.NEGATIVE_INFINITY);
    return (b.implied_upside_pct ?? Number.NEGATIVE_INFINITY) - (a.implied_upside_pct ?? Number.NEGATIVE_INFINITY);
  });
}

function isQualifiedDiscoveryCandidate(row: DiscoveryRow) {
  return typeof row.implied_upside_pct === "number"
    && row.implied_upside_pct > 0
    && typeof row.pe_ttm === "number"
    && row.pe_ttm >= 10
    && row.pe_ttm <= 50;
}

function scoreFallbackRow(impliedUpsidePct: number | null) {
  if (impliedUpsidePct === null || !Number.isFinite(impliedUpsidePct)) return null;
  return Math.max(0, Math.min(100, 40 + impliedUpsidePct));
}

async function getExistingSymbolDiscoveryRows(supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>) {
  const universe = await getSp500Universe();
  const universeByTicker = new Map(universe.map((member) => [member.ticker, member]));
  const tickers = universe.map((member) => member.ticker);
  const symbolsResult = await supabase
    .from("symbols")
    .select("id, ticker, name, sector, industry, currency, market_cap, symbol_price_snapshots(price, fetched_at)")
    .in("ticker", tickers);

  if (symbolsResult.error) return [];

  const symbols = (symbolsResult.data || []) as ExistingSymbolRow[];
  const symbolIds = symbols.map((symbol) => symbol.id);
  const targetsResult = symbolIds.length
    ? await supabase.from("analyst_target_snapshots").select("symbol_id, mean_target, captured_at").in("symbol_id", symbolIds).order("captured_at", { ascending: false })
    : { data: [], error: null };
  const fundamentalsResult = symbolIds.length
    ? await supabase.from("symbol_fundamentals").select("symbol_id, pe_ttm, revenue_growth_ttm, market_cap_m, fetched_at").in("symbol_id", symbolIds).order("fetched_at", { ascending: false })
    : { data: [], error: null };
  const latestTargetBySymbol = new Map<string, TargetSnapshotRow>();
  ((targetsResult.data || []) as TargetSnapshotRow[]).forEach((target) => {
    if (!latestTargetBySymbol.has(target.symbol_id)) latestTargetBySymbol.set(target.symbol_id, target);
  });
  const latestFundamentalsBySymbol = new Map<string, FundamentalsRow>();
  ((fundamentalsResult.data || []) as FundamentalsRow[]).forEach((fundamentals) => {
    if (!latestFundamentalsBySymbol.has(fundamentals.symbol_id)) latestFundamentalsBySymbol.set(fundamentals.symbol_id, fundamentals);
  });

  return symbols.map((symbol) => {
    const quote = firstRelation(symbol.symbol_price_snapshots);
    const target = latestTargetBySymbol.get(symbol.id);
    const fundamentals = latestFundamentalsBySymbol.get(symbol.id);
    const price = quote?.price ?? null;
    const consensusTarget = target?.mean_target ?? null;
    const impliedUpsidePct = typeof price === "number" && price > 0 && typeof consensusTarget === "number" ? ((consensusTarget - price) / price) * 100 : null;
    const universeMember = universeByTicker.get(symbol.ticker);

    return {
      ticker: symbol.ticker,
      provider_ticker: universeMember?.providerTicker || symbol.ticker,
      name: symbol.name || universeMember?.name || symbol.ticker,
      sector: symbol.sector || universeMember?.sector || null,
      industry: symbol.industry || universeMember?.industry || null,
      price,
      currency: symbol.currency || "USD",
      consensus_target: consensusTarget,
      implied_upside_pct: impliedUpsidePct,
      market_cap: fundamentals?.market_cap_m ?? symbol.market_cap,
      pe_ttm: fundamentals?.pe_ttm ?? null,
      revenue_growth_ttm: fundamentals?.revenue_growth_ttm ?? null,
      score: scoreFallbackRow(impliedUpsidePct),
      score_breakdown_json: null,
      flags_json: target ? [] : ["Refresh Discovery for full screener scoring"],
      captured_at: target?.captured_at || quote?.fetched_at || new Date(0).toISOString(),
    } satisfies DiscoveryRow;
  });
}

export default async function DiscoveryPage({ searchParams }: DiscoveryPageProps) {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const params = (await searchParams) || {};
  const sortParam = getSingleParam(params.sort);
  const sortField: SortField = sortParam && sortParam in SORT_LABELS ? (sortParam as SortField) : "upside";

  if (!supabase) {
    return (
      <AppShell viewer={user}>
        <SectionCard title="Discovery" description="Supabase is not configured in this environment.">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">Discovery needs Supabase to store screener snapshots.</div>
        </SectionCard>
      </AppShell>
    );
  }

  const { data, error } = await supabase
    .from("discovery_snapshots")
    .select("ticker, provider_ticker, name, sector, industry, price, currency, consensus_target, implied_upside_pct, market_cap, pe_ttm, revenue_growth_ttm, score, score_breakdown_json, flags_json, captured_at")
    .eq("universe", "sp500")
    .order(sortField === "marketcap" ? "market_cap" : sortField === "pe" ? "pe_ttm" : "implied_upside_pct", { ascending: sortField === "pe" });

  const allRows = error ? await getExistingSymbolDiscoveryRows(supabase) : ((data || []) as DiscoveryRow[]);
  const rows = sortRows(allRows.filter(isQualifiedDiscoveryCandidate), sortField);
  const tickers = rows.map((row) => row.ticker);
  const ownershipResult = tickers.length
    ? await supabase
        .from("symbols")
        .select("id, ticker, portfolio_positions(id), watchlist_items(id, watchlists(owner_id))")
        .in("ticker", tickers)
    : { data: [], error: null };

  const ownedTickers = new Set<string>();
  const watchlistedTickers = new Set<string>();
  ((ownershipResult.data || []) as SymbolOwnershipRow[]).forEach((symbol) => {
    if ((symbol.portfolio_positions || []).length > 0) ownedTickers.add(symbol.ticker);
    const hasUserWatchlist = (symbol.watchlist_items || []).some((item) => firstRelation(item.watchlists)?.owner_id === user.id);
    if (hasUserWatchlist) watchlistedTickers.add(symbol.ticker);
  });

  const discoveryIdeasResult = await supabase
    .from("watchlist_items")
    .select("id, created_at, status, watchlists!inner(name, owner_id), symbols(ticker, name, sector, industry)")
    .eq("watchlists.owner_id", user.id)
    .eq("watchlists.name", "Discovery Ideas")
    .order("created_at", { ascending: false })
    .limit(12);
  const discoveryIdeas = (discoveryIdeasResult.data || []) as DiscoveryIdeaRow[];

  const withConsensus = rows.filter((row) => typeof row.consensus_target === "number").length;
  const averageUpside = rows.length
    ? rows.map((row) => row.implied_upside_pct).filter((value): value is number => typeof value === "number").reduce((sum, value, _index, values) => sum + value / values.length, 0)
    : null;
  const lastRefresh = rows.map((row) => row.captured_at).sort().at(-1) || null;
  const topTen = sortRows(rows, "upside").filter((row) => typeof row.consensus_target === "number" && typeof row.price === "number" && typeof row.implied_upside_pct === "number").slice(0, 10);
  const bestSector = rows.reduce<Map<string, number>>((map, row) => {
    if (row.sector && typeof row.implied_upside_pct === "number") map.set(row.sector, (map.get(row.sector) || 0) + 1);
    return map;
  }, new Map());
  const topSector = [...bestSector.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "—";

  return (
    <AppShell viewer={user}>
      <div className="space-y-6">
        <SectionCard
          title="Discovery"
          description={`S&P 500 idea generation for research and watchlist candidates. Timestamps shown in ${getAppTimeZoneLabel()}.`}
        >
          <div className="space-y-4">
            <DiscoveryRefreshForm />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Candidates refreshed</p>
                <p className="mt-3 text-3xl font-bold text-zinc-50">{rows.length}</p>
                <p className="mt-2 text-sm text-zinc-400">Qualified names with positive upside and P/E between 10–50.</p>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Consensus coverage</p>
                <p className="mt-3 text-3xl font-bold text-sky-300">{withConsensus}</p>
                <p className="mt-2 text-sm text-zinc-400">Qualified names with analyst target data available.</p>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Average implied upside</p>
                <p className={`mt-3 text-2xl font-bold ${getTone(averageUpside)}`}>{formatPercent(averageUpside)}</p>
                <p className="mt-2 text-sm text-zinc-400">Across qualified names with quote + target data.</p>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Most represented sector</p>
                <p className="mt-3 text-2xl font-bold text-zinc-50">{topSector}</p>
                <p className="mt-2 text-sm text-zinc-400">Last refresh {lastRefresh ? formatAppDateTime(lastRefresh) : "not run yet"}.</p>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Top 10 research candidates" description="Ranked by implied upside. Only stocks with positive upside and P/E between 10–50 are included.">
          {topTen.length ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {topTen.map((row, index) => (
                <div key={row.ticker} className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-zinc-500">#{index + 1} research candidate</p>
                      <Link href={`/symbols/${encodeURIComponent(row.ticker)}`} className="mt-1 inline-flex text-lg font-semibold text-zinc-50 hover:text-sky-300">{row.ticker} · {row.name}</Link>
                      <p className="mt-1 text-sm text-zinc-400">{row.sector || "Sector unavailable"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-zinc-500">Upside</p>
                      <p className={`text-xl font-bold ${getTone(row.implied_upside_pct)}`}>{formatPercent(row.implied_upside_pct)}</p>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-4 gap-2 text-sm">
                    <div><p className="text-zinc-500">Price</p><p className="font-medium text-zinc-100">{formatMoney(row.price, row.currency || "USD")}</p></div>
                    <div><p className="text-zinc-500">Target</p><p className="font-medium text-zinc-100">{formatMoney(row.consensus_target, row.currency || "USD")}</p></div>
                    <div><p className="text-zinc-500">Upside</p><p className={`font-medium ${getTone(row.implied_upside_pct)}`}>{formatPercent(row.implied_upside_pct)}</p></div>
                    <div><p className="text-zinc-500">P/E</p><p className="font-medium text-zinc-100">{formatRatio(row.pe_ttm)}</p></div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs">
                    {ownedTickers.has(row.ticker) ? <span className="rounded-full border border-emerald-800/70 bg-emerald-950/25 px-2 py-1 text-emerald-300">Owned</span> : null}
                    {watchlistedTickers.has(row.ticker) ? <span className="rounded-full border border-sky-800/70 bg-sky-950/25 px-2 py-1 text-sky-300">Saved idea</span> : null}
                    {(row.flags_json || []).filter((flag) => !(typeof row.consensus_target === "number" && flag.toLowerCase().includes("no consensus"))).slice(0, 2).map((flag) => <span key={flag} className="rounded-full border border-amber-800/60 bg-amber-950/20 px-2 py-1 text-amber-200">{flag}</span>)}
                  </div>
                  <div className="mt-4"><DiscoveryWatchlistButton ticker={row.ticker} alreadyWatchlisted={watchlistedTickers.has(row.ticker)} /></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">Refresh Discovery to generate the first top 10 list.</div>
          )}
        </SectionCard>

        <SectionCard title="S&P 500 screener" description={`Only showing stocks with positive implied upside and P/E between 10–50. Sorted by ${SORT_LABELS[sortField].toLowerCase()}.`}>
          <div className="mb-4 flex flex-wrap gap-2 text-sm">
            {(Object.keys(SORT_LABELS) as SortField[]).map((field) => (
              <Link key={field} href={`/discovery?sort=${field}`} className={`rounded-full border px-3 py-1 ${sortField === field ? "border-sky-500/70 bg-sky-950/30 text-sky-200" : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"}`}>{SORT_LABELS[field]}</Link>
            ))}
          </div>
          {rows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full table-auto divide-y divide-zinc-800 text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
                    <th className="px-3 py-3 font-medium">Ticker</th>
                    <th className="px-3 py-3 font-medium">Sector</th>
                    <th className="px-3 py-3 font-medium whitespace-nowrap">Current price</th>
                    <th className="px-3 py-3 font-medium whitespace-nowrap">Consensus target</th>
                    <th className="px-3 py-3 font-medium whitespace-nowrap">Implied upside</th>
                    <th className="px-3 py-3 font-medium whitespace-nowrap">P/E</th>
                    <th className="px-3 py-3 font-medium whitespace-nowrap">Revenue growth</th>
                    <th className="px-3 py-3 font-medium whitespace-nowrap">Market cap</th>
                    <th className="px-3 py-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900">
                  {rows.map((row) => (
                    <tr key={row.ticker} className="align-top text-zinc-300">
                      <td className="px-3 py-3">
                        <Link href={`/symbols/${encodeURIComponent(row.ticker)}`} className="font-semibold text-zinc-50 hover:text-sky-300">{row.ticker}</Link>
                        <p className="max-w-[220px] truncate text-xs text-zinc-500">{row.name || "—"}</p>
                        <div className="mt-1 flex gap-1">
                          {ownedTickers.has(row.ticker) ? <span className="rounded bg-emerald-950/40 px-1.5 py-0.5 text-[11px] text-emerald-300">Owned</span> : null}
                          {watchlistedTickers.has(row.ticker) ? <span className="rounded bg-sky-950/40 px-1.5 py-0.5 text-[11px] text-sky-300">Saved idea</span> : null}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-zinc-400">{row.sector || "—"}</td>
                      <td className="px-3 py-3 whitespace-nowrap">{formatMoney(row.price, row.currency || "USD")}</td>
                      <td className="px-3 py-3 whitespace-nowrap">{formatMoney(row.consensus_target, row.currency || "USD")}</td>
                      <td className={`px-3 py-3 whitespace-nowrap font-medium ${getTone(row.implied_upside_pct)}`}>{formatPercent(row.implied_upside_pct)}</td>
                      <td className="px-3 py-3 whitespace-nowrap">{formatRatio(row.pe_ttm)}</td>
                      <td className="px-3 py-3 whitespace-nowrap">{formatGrowthPercent(row.revenue_growth_ttm)}</td>
                      <td className="px-3 py-3 whitespace-nowrap">{formatMarketCap(row.market_cap)}</td>
                      <td className="px-3 py-3"><DiscoveryWatchlistButton ticker={row.ticker} alreadyWatchlisted={watchlistedTickers.has(row.ticker)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">No qualified Discovery candidates yet. Run the refresh to find S&P 500 stocks with positive upside and P/E between 10–50.</div>
          )}
        </SectionCard>

        <SectionCard title="Saved Discovery Ideas" description="Stocks saved from Discovery for research follow-up before they become portfolio candidates.">
          {discoveryIdeas.length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {discoveryIdeas.map((item) => {
                const symbol = firstRelation(item.symbols);
                return (
                  <div key={item.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                    <Link href={symbol?.ticker ? `/symbols/${encodeURIComponent(symbol.ticker)}` : "/symbols"} className="font-semibold text-zinc-50 hover:text-sky-300">
                      {symbol?.ticker || "Unknown ticker"}
                    </Link>
                    <p className="mt-1 truncate text-sm text-zinc-400">{symbol?.name || "Unnamed symbol"}</p>
                    <p className="mt-2 text-xs uppercase tracking-wide text-zinc-500">{symbol?.sector || "Sector unavailable"} · {item.status}</p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">
              No saved ideas yet. Use “Save idea” on a Discovery candidate to keep it here for follow-up research.
            </div>
          )}
        </SectionCard>
      </div>
    </AppShell>
  );
}
