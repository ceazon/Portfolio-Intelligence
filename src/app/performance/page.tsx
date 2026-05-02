import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { requireUser } from "@/lib/auth";
import { buildPerformanceSummaryRow, formatMoney, formatPercent, type PerformanceSummaryRow } from "@/lib/performance-metrics";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { formatAppDateTime, getAppTimeZoneLabel } from "@/lib/time";

type PerformanceAggregateRow = {
  symbol_id: string;
  evaluation_window_days: number;
  hit_count: number | null;
  evaluated_count: number | null;
  avg_alpha: number | null;
};

type SymbolRow = {
  id: string;
  ticker: string;
  name: string | null;
  exchange: string | null;
  currency: string | null;
  symbol_price_snapshots:
    | {
        price: number | null;
        fetched_at: string;
      }
    | {
        price: number | null;
        fetched_at: string;
      }[]
    | null;
};

type SnapshotRow = {
  symbol_id: string;
  mean_target: number | null;
  captured_at: string;
};

function firstRelation<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function choosePreferredAggregate(rows: PerformanceAggregateRow[]) {
  const preferred365 = rows.find((row) => row.evaluation_window_days === 365 && (row.evaluated_count ?? 0) > 0);
  if (preferred365) return preferred365;

  const preferred180 = rows.find((row) => row.evaluation_window_days === 180 && (row.evaluated_count ?? 0) > 0);
  if (preferred180) return preferred180;

  return rows.find((row) => (row.evaluated_count ?? 0) > 0) || rows[0] || null;
}

export default async function PerformancePage() {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const fallback = (
    <AppShell viewer={user}>
      <SectionCard
        title="Performance"
        description="Performance shows how tracked stocks actually performed after analyst consensus targets were captured. It helps separate names where consensus tends to be useful from names where it tends to be too bullish or too conservative."
      >
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">
          Supabase is not configured yet, so performance history is unavailable in this environment.
        </div>
      </SectionCard>
    </AppShell>
  );

  if (!supabase) {
    return fallback;
  }

  const [trackedSymbolsResult, performanceResult, latestSnapshotsResult] = await Promise.all([
    supabase
      .from("symbols")
      .select("id, ticker, name, exchange, currency, symbol_price_snapshots(price, fetched_at)")
      .order("ticker", { ascending: true }),
    supabase
      .from("analyst_target_performance")
      .select("symbol_id, evaluation_window_days, hit_target, alpha_vs_consensus_pct"),
    supabase
      .from("analyst_target_snapshots")
      .select("symbol_id, mean_target, captured_at")
      .order("captured_at", { ascending: false }),
  ]);

  const trackedSymbols = (trackedSymbolsResult.data || []) as SymbolRow[];
  const performanceRows = performanceResult.data || [];
  const latestSnapshots = (latestSnapshotsResult.data || []) as SnapshotRow[];

  const trackedSymbolIds = new Set<string>();
  const [watchlistItemsResult, portfolioPositionsResult] = await Promise.all([
    supabase.from("watchlist_items").select("symbol_id, watchlists!inner(owner_id)").eq("watchlists.owner_id", user.id),
    supabase.from("portfolio_positions").select("symbol_id, portfolios!inner(owner_id)").eq("portfolios.owner_id", user.id),
  ]);

  (watchlistItemsResult.data || []).forEach((row) => {
    if (row.symbol_id) trackedSymbolIds.add(row.symbol_id);
  });
  (portfolioPositionsResult.data || []).forEach((row) => {
    if (row.symbol_id) trackedSymbolIds.add(row.symbol_id);
  });

  const aggregateMap = new Map<string, PerformanceAggregateRow[]>();
  performanceRows.forEach((row) => {
    if (!row.symbol_id) return;
    const existing = aggregateMap.get(row.symbol_id) || [];
    const aggregate = existing.find((item) => item.evaluation_window_days === row.evaluation_window_days);

    if (aggregate) {
      aggregate.evaluated_count = (aggregate.evaluated_count ?? 0) + 1;
      aggregate.hit_count = (aggregate.hit_count ?? 0) + (row.hit_target ? 1 : 0);
      const priorCount = (aggregate.evaluated_count ?? 1) - 1;
      const nextAlpha = typeof row.alpha_vs_consensus_pct === "number" ? row.alpha_vs_consensus_pct : null;
      if (nextAlpha !== null) {
        aggregate.avg_alpha =
          aggregate.avg_alpha === null || priorCount <= 0
            ? nextAlpha
            : ((aggregate.avg_alpha * priorCount) + nextAlpha) / (priorCount + 1);
      }
    } else {
      existing.push({
        symbol_id: row.symbol_id,
        evaluation_window_days: row.evaluation_window_days,
        evaluated_count: 1,
        hit_count: row.hit_target ? 1 : 0,
        avg_alpha: typeof row.alpha_vs_consensus_pct === "number" ? row.alpha_vs_consensus_pct : null,
      });
    }

    aggregateMap.set(row.symbol_id, existing);
  });

  const latestSnapshotBySymbol = new Map<string, SnapshotRow>();
  latestSnapshots.forEach((snapshot) => {
    if (!snapshot.symbol_id || latestSnapshotBySymbol.has(snapshot.symbol_id)) {
      return;
    }

    latestSnapshotBySymbol.set(snapshot.symbol_id, snapshot);
  });

  const summaryRows: PerformanceSummaryRow[] = trackedSymbols
    .filter((symbol) => trackedSymbolIds.has(symbol.id))
    .map((symbol) => {
      const latestQuote = firstRelation(symbol.symbol_price_snapshots);
      const latestSnapshot = latestSnapshotBySymbol.get(symbol.id);
      const aggregate = choosePreferredAggregate(aggregateMap.get(symbol.id) || []);
      const currentPrice = latestQuote?.price ?? null;
      const currentConsensusTarget = latestSnapshot?.mean_target ?? null;
      const impliedUpsidePct = currentPrice && currentConsensusTarget ? ((currentConsensusTarget - currentPrice) / currentPrice) * 100 : null;

      return buildPerformanceSummaryRow({
        symbolId: symbol.id,
        ticker: symbol.ticker,
        name: symbol.name,
        exchange: symbol.exchange,
        currentPrice,
        currentPriceFetchedAt: latestQuote?.fetched_at ?? null,
        currentConsensusTarget,
        impliedUpsidePct,
        evaluationWindowDays: aggregate?.evaluation_window_days ?? 365,
        evaluatedSnapshotCount: aggregate?.evaluated_count ?? 0,
        hitCount: aggregate?.hit_count ?? 0,
        avgAlphaVsConsensusPct: aggregate?.avg_alpha ?? null,
      });
    })
    .sort((a, b) => {
      const alphaA = a.avgAlphaVsConsensusPct ?? Number.NEGATIVE_INFINITY;
      const alphaB = b.avgAlphaVsConsensusPct ?? Number.NEGATIVE_INFINITY;
      return alphaB - alphaA;
    });

  const aboveCount = summaryRows.filter((row) => row.avgAlphaVsConsensusPct !== null && row.avgAlphaVsConsensusPct > 0).length;
  const belowCount = summaryRows.filter((row) => row.avgAlphaVsConsensusPct !== null && row.avgAlphaVsConsensusPct < 0).length;
  const highestHitRate = [...summaryRows]
    .filter((row) => row.hitRatePct !== null)
    .sort((a, b) => (b.hitRatePct ?? -1) - (a.hitRatePct ?? -1))[0] || null;
  const weakestHitRate = [...summaryRows]
    .filter((row) => row.hitRatePct !== null)
    .sort((a, b) => (a.hitRatePct ?? 101) - (b.hitRatePct ?? 101))[0] || null;
  const lastQuoteUpdate = summaryRows.find((row) => row.currentPriceFetchedAt)?.currentPriceFetchedAt || null;

  return (
    <AppShell viewer={user}>
      <div className="space-y-6">
        <SectionCard
          title="Performance"
          description="Performance shows how tracked stocks actually performed after analyst consensus targets were captured. It helps separate names where consensus tends to be useful from names where it tends to be too bullish or too conservative."
        >
          <div className="mb-4 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">
            Historical reliability is currently summarized from 365-day evaluations first, then 180-day history when 365-day coverage is still thin. Early symbols will still show limited history until more snapshots accumulate.
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Above analyst expectations</p>
              <p className="mt-3 text-3xl font-bold text-zinc-50">{aboveCount}</p>
              <p className="mt-2 text-sm text-zinc-400">Tracked names with positive average alpha vs consensus.</p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Below analyst expectations</p>
              <p className="mt-3 text-3xl font-bold text-zinc-50">{belowCount}</p>
              <p className="mt-2 text-sm text-zinc-400">Tracked names where realized results lagged prior consensus.</p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Highest hit-rate stock</p>
              <p className="mt-3 text-2xl font-bold text-zinc-50">{highestHitRate?.ticker || "—"}</p>
              <p className="mt-2 text-sm text-zinc-400">{highestHitRate ? `${formatPercent(highestHitRate.hitRatePct)} hit rate` : "No evaluated symbols yet."}</p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Weakest hit-rate stock</p>
              <p className="mt-3 text-2xl font-bold text-zinc-50">{weakestHitRate?.ticker || "—"}</p>
              <p className="mt-2 text-sm text-zinc-400">{weakestHitRate ? `${formatPercent(weakestHitRate.hitRatePct)} hit rate` : "No evaluated symbols yet."}</p>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Tracked stock performance"
          description={`Ranked by average alpha vs consensus. Timestamps shown in ${getAppTimeZoneLabel()}. Latest quote update ${lastQuoteUpdate ? formatAppDateTime(lastQuoteUpdate) : "not available yet"}.`}
        >
          {summaryRows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-800 text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
                    <th className="px-3 py-3 font-medium">Ticker</th>
                    <th className="px-3 py-3 font-medium">Current price</th>
                    <th className="px-3 py-3 font-medium">Consensus target</th>
                    <th className="px-3 py-3 font-medium">Implied upside</th>
                    <th className="px-3 py-3 font-medium">Hit rate</th>
                    <th className="px-3 py-3 font-medium">Avg alpha</th>
                    <th className="px-3 py-3 font-medium">Reliability</th>
                    <th className="px-3 py-3 font-medium">Evaluated snapshots</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900/80">
                  {summaryRows.map((row) => (
                    <tr key={row.symbolId} className="align-top text-zinc-300">
                      <td className="px-3 py-4">
                        <div className="font-semibold text-zinc-100">{row.ticker}</div>
                        <div className="text-xs text-zinc-500">{row.exchange || row.name || "Tracked symbol"}</div>
                      </td>
                      <td className="px-3 py-4">{formatMoney(row.currentPrice, row.ticker.endsWith(".TO") || row.ticker.endsWith(".NE") ? "CAD" : "USD")}</td>
                      <td className="px-3 py-4">{formatMoney(row.currentConsensusTarget, row.ticker.endsWith(".TO") || row.ticker.endsWith(".NE") ? "CAD" : "USD")}</td>
                      <td className="px-3 py-4">{formatPercent(row.impliedUpsidePct)}</td>
                      <td className="px-3 py-4">{formatPercent(row.hitRatePct)}</td>
                      <td className="px-3 py-4">{formatPercent(row.avgAlphaVsConsensusPct)}</td>
                      <td className="px-3 py-4">
                        <span className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300">{row.reliabilityLabel}</span>
                      </td>
                      <td className="px-3 py-4">{row.evaluatedSnapshotCount} ({row.evaluationWindowDays}d basis)</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">
              No tracked symbols have reached the performance page yet. Import symbols, refresh quotes, and let snapshots accumulate.
            </div>
          )}
        </SectionCard>
      </div>
    </AppShell>
  );
}
