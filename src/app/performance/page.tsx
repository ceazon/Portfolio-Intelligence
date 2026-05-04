import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PerformancePacePanel } from "@/components/performance-pace-panel";
import { SectionCard } from "@/components/section-card";
import { requireUser } from "@/lib/auth";
import { getConsensusTargetForSymbol } from "@/lib/consensus-targets";
import { buildPaceSummary, buildPerformanceSummaryRow, formatMoney, formatPercent, getPerformanceTone, type PerformanceSummaryRow } from "@/lib/performance-metrics";
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
  current_price: number | null;
  current_price_currency: string | null;
  captured_at: string;
};

type SortField = "alpha" | "hit-rate";

const SORT_OPTIONS = [
  { value: "alpha", label: "Average alpha" },
  { value: "hit-rate", label: "Hit rate" },
] as const;

const SORT_LABELS: Record<SortField, string> = {
  alpha: "Average alpha",
  "hit-rate": "Hit rate",
};

const SORT_FIELDS = new Set<SortField>(SORT_OPTIONS.map((option) => option.value));

function getSingleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getValueToneClass(value: number | null) {
  const tone = getPerformanceTone(value);
  if (tone === "positive") return "text-emerald-300";
  if (tone === "negative") return "text-rose-300";
  return "text-zinc-300";
}

function getCardToneClasses(tone: "positive" | "negative" | "neutral") {
  if (tone === "positive") {
    return {
      border: "border-emerald-800/70",
      bg: "bg-emerald-950/25",
      value: "text-emerald-300",
      accent: "text-emerald-400",
    };
  }

  if (tone === "negative") {
    return {
      border: "border-rose-800/70",
      bg: "bg-rose-950/25",
      value: "text-rose-300",
      accent: "text-rose-400",
    };
  }

  return {
    border: "border-zinc-800",
    bg: "bg-zinc-950/70",
    value: "text-zinc-50",
    accent: "text-zinc-500",
  };
}

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

type PerformancePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PerformancePage({ searchParams }: PerformancePageProps) {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const params = (await searchParams) || {};
  const sort = getSingleParam(params.sort);
  const sortField: SortField = sort && SORT_FIELDS.has(sort as SortField) ? (sort as SortField) : "alpha";

  const fallback = (
    <AppShell viewer={user}>
      <SectionCard
        title="Estimate tracking"
        description="Estimate tracking shows how tracked stocks are moving relative to captured analyst targets. Over time it separates names where consensus has been useful from names where estimates tend to be too bullish or too conservative."
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
      .select("symbol_id, mean_target, current_price, current_price_currency, captured_at")
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
  const earliestSnapshotBySymbol = new Map<string, SnapshotRow>();
  latestSnapshots.forEach((snapshot) => {
    if (!snapshot.symbol_id) {
      return;
    }

    if (!latestSnapshotBySymbol.has(snapshot.symbol_id)) {
      latestSnapshotBySymbol.set(snapshot.symbol_id, snapshot);
    }

    earliestSnapshotBySymbol.set(snapshot.symbol_id, snapshot);
  });

  const trackedSymbolsForPerformance = trackedSymbols.filter((symbol) => trackedSymbolIds.has(symbol.id));
  const liveConsensusEntries = await Promise.all(
    trackedSymbolsForPerformance.map(async (symbol) => {
      const latestSnapshot = latestSnapshotBySymbol.get(symbol.id);
      if (latestSnapshot?.mean_target !== null && latestSnapshot?.mean_target !== undefined) {
        return [symbol.id, null] as const;
      }

      try {
        const consensus = await getConsensusTargetForSymbol(symbol.ticker);
        const hasConsensusData = [consensus.meanTarget, consensus.medianTarget, consensus.highTarget, consensus.lowTarget].some((value) => typeof value === "number");
        return [symbol.id, hasConsensusData ? consensus : null] as const;
      } catch {
        return [symbol.id, null] as const;
      }
    }),
  );
  const liveConsensusBySymbol = new Map(liveConsensusEntries);

  const summaryRows: PerformanceSummaryRow[] = trackedSymbolsForPerformance
    .map((symbol) => {
      const latestQuote = firstRelation(symbol.symbol_price_snapshots);
      const latestSnapshot = latestSnapshotBySymbol.get(symbol.id);
      const liveConsensus = liveConsensusBySymbol.get(symbol.id);
      const aggregate = choosePreferredAggregate(aggregateMap.get(symbol.id) || []);
      const currentPrice = latestQuote?.price ?? null;
      const currentConsensusTarget = latestSnapshot?.mean_target ?? liveConsensus?.meanTarget ?? null;
      const impliedUpsidePct = currentPrice && currentConsensusTarget ? ((currentConsensusTarget - currentPrice) / currentPrice) * 100 : null;

      return buildPerformanceSummaryRow({
        symbolId: symbol.id,
        ticker: symbol.ticker,
        name: symbol.name,
        exchange: symbol.exchange,
        currency: symbol.currency,
        currentPrice,
        currentPriceFetchedAt: latestQuote?.fetched_at ?? null,
        currentConsensusTarget,
        currentConsensusTargetCurrency: latestSnapshot?.current_price_currency ?? symbol.currency,
        impliedUpsidePct,
        evaluationWindowDays: aggregate?.evaluation_window_days ?? 365,
        evaluatedSnapshotCount: aggregate?.evaluated_count ?? 0,
        hitCount: aggregate?.hit_count ?? 0,
        avgAlphaVsConsensusPct: aggregate?.avg_alpha ?? null,
      });
    })
    .sort((a, b) => {
      if (sortField === "hit-rate") {
        const hitRateA = a.hitRatePct ?? Number.NEGATIVE_INFINITY;
        const hitRateB = b.hitRatePct ?? Number.NEGATIVE_INFINITY;
        if (hitRateB !== hitRateA) {
          return hitRateB - hitRateA;
        }
      }

      const alphaA = a.avgAlphaVsConsensusPct ?? Number.NEGATIVE_INFINITY;
      const alphaB = b.avgAlphaVsConsensusPct ?? Number.NEGATIVE_INFINITY;
      if (alphaB !== alphaA) {
        return alphaB - alphaA;
      }

      const hitRateA = a.hitRatePct ?? Number.NEGATIVE_INFINITY;
      const hitRateB = b.hitRatePct ?? Number.NEGATIVE_INFINITY;
      return hitRateB - hitRateA;
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
  const aboveCardTone = getCardToneClasses(aboveCount > 0 ? "positive" : "neutral");
  const belowCardTone = getCardToneClasses(belowCount > 0 ? "negative" : "neutral");
  const highestHitRateTone = getCardToneClasses(getPerformanceTone(highestHitRate?.hitRatePct === null || highestHitRate?.hitRatePct === undefined ? null : highestHitRate.hitRatePct - 50));
  const weakestHitRateTone = getCardToneClasses(getPerformanceTone(weakestHitRate?.hitRatePct === null || weakestHitRate?.hitRatePct === undefined ? null : weakestHitRate.hitRatePct - 50));

  return (
    <AppShell viewer={user}>
      <div className="space-y-6">
        <SectionCard
          title="Estimate tracking"
          description="Estimate tracking shows how tracked stocks are moving relative to captured analyst targets. Over time it separates names where consensus has been useful from names where estimates tend to be too bullish or too conservative."
        >
          <div className="mb-4 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">
            Historical reliability is summarized from 365-day evaluations first, then 180-day history when 365-day coverage is still thin. Early symbols will show lighter history until more snapshots accumulate.
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className={`rounded-2xl border p-4 ${aboveCardTone.border} ${aboveCardTone.bg}`}>
              <p className={`text-xs uppercase tracking-wide ${aboveCardTone.accent}`}>Above analyst expectations</p>
              <p className={`mt-3 text-3xl font-bold ${aboveCardTone.value}`}>{aboveCount}</p>
              <p className="mt-2 text-sm text-zinc-400">Tracked names with positive average alpha vs consensus.</p>
            </div>
            <div className={`rounded-2xl border p-4 ${belowCardTone.border} ${belowCardTone.bg}`}>
              <p className={`text-xs uppercase tracking-wide ${belowCardTone.accent}`}>Below analyst expectations</p>
              <p className={`mt-3 text-3xl font-bold ${belowCardTone.value}`}>{belowCount}</p>
              <p className="mt-2 text-sm text-zinc-400">Tracked names where realized results lagged prior consensus.</p>
            </div>
            <div className={`rounded-2xl border p-4 ${highestHitRateTone.border} ${highestHitRateTone.bg}`}>
              <p className={`text-xs uppercase tracking-wide ${highestHitRateTone.accent}`}>Highest hit-rate stock</p>
              <p className={`mt-3 text-2xl font-bold ${highestHitRateTone.value}`}>{highestHitRate?.ticker || "—"}</p>
              <p className="mt-2 text-sm text-zinc-400">{highestHitRate ? `${formatPercent(highestHitRate.hitRatePct)} hit rate` : "No evaluated symbols yet."}</p>
            </div>
            <div className={`rounded-2xl border p-4 ${weakestHitRateTone.border} ${weakestHitRateTone.bg}`}>
              <p className={`text-xs uppercase tracking-wide ${weakestHitRateTone.accent}`}>Weakest hit-rate stock</p>
              <p className={`mt-3 text-2xl font-bold ${weakestHitRateTone.value}`}>{weakestHitRate?.ticker || "—"}</p>
              <p className="mt-2 text-sm text-zinc-400">{weakestHitRate ? `${formatPercent(weakestHitRate.hitRatePct)} hit rate` : "No evaluated symbols yet."}</p>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Tracked names vs estimates"
          description={`Ranked by ${sortField === "hit-rate" ? "hit rate" : "average alpha vs consensus"}. Timestamps shown in ${getAppTimeZoneLabel()}. Latest quote update ${lastQuoteUpdate ? formatAppDateTime(lastQuoteUpdate) : "not available yet"}.`}
        >
          {summaryRows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full table-auto divide-y divide-zinc-800 text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
                    <th className="w-[190px] px-3 py-3 font-medium">Ticker</th>
                    <th className="px-3 py-3 font-medium whitespace-nowrap">Current price</th>
                    <th className="px-3 py-3 font-medium whitespace-nowrap">Consensus target</th>
                    <th className="px-3 py-3 font-medium whitespace-nowrap">Implied upside</th>
                    <th className="px-3 py-3 font-medium whitespace-nowrap">
                      <Link
                        href={`/performance?sort=hit-rate`}
                        className={[
                          "inline-flex items-center gap-2 rounded-lg px-2 py-1 transition",
                          sortField === "hit-rate" ? "text-sky-300" : "hover:text-zinc-300",
                        ].join(" ")}
                      >
                        <span>{SORT_LABELS["hit-rate"]}</span>
                        <span className={sortField === "hit-rate" ? "text-sky-400" : "text-zinc-600"}>{sortField === "hit-rate" ? "↓" : "↕"}</span>
                      </Link>
                    </th>
                    <th className="px-3 py-3 font-medium whitespace-nowrap">
                      <Link
                        href={`/performance?sort=alpha`}
                        className={[
                          "inline-flex items-center gap-2 rounded-lg px-2 py-1 transition",
                          sortField === "alpha" ? "text-sky-300" : "hover:text-zinc-300",
                        ].join(" ")}
                      >
                        <span>{SORT_LABELS.alpha}</span>
                        <span className={sortField === "alpha" ? "text-sky-400" : "text-zinc-600"}>{sortField === "alpha" ? "↓" : "↕"}</span>
                      </Link>
                    </th>
                    <th className="px-3 py-3 font-medium whitespace-nowrap">Expected price</th>
                    <th className="w-[220px] px-3 py-3 font-medium">Pace</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900/80">
                  {summaryRows.map((row) => {
                    const latestSnapshot = latestSnapshotBySymbol.get(row.symbolId);
                    const originalSnapshot = earliestSnapshotBySymbol.get(row.symbolId);
                    const latestPace = buildPaceSummary({
                      startDate: latestSnapshot?.captured_at ?? row.currentPriceFetchedAt,
                      startPrice: latestSnapshot?.current_price ?? row.currentPrice,
                      targetPrice: row.currentConsensusTarget,
                      currentPrice: row.currentPrice,
                      tolerancePct: 5,
                    });
                    const originalPace = buildPaceSummary({
                      startDate: originalSnapshot?.captured_at ?? null,
                      startPrice: originalSnapshot?.current_price ?? null,
                      targetPrice: originalSnapshot?.mean_target ?? null,
                      currentPrice: row.currentPrice,
                      tolerancePct: 5,
                    });

                    return (
                      <tr key={row.symbolId} className="align-top text-zinc-300">
                        <td className="px-3 py-4 align-top">
                          <div className="font-semibold text-zinc-100">{row.ticker}</div>
                          <div className="text-xs text-zinc-500">{row.exchange || row.name || "Tracked symbol"}</div>
                        </td>
                        <td className="px-3 py-4 align-top whitespace-nowrap">{formatMoney(row.currentPrice, row.currency || "USD")}</td>
                        <td className="px-3 py-4 align-top whitespace-nowrap">{formatMoney(row.currentConsensusTarget, row.currentConsensusTargetCurrency || row.currency || "USD")}</td>
                        <td className={`px-3 py-4 align-top whitespace-nowrap ${getValueToneClass(row.impliedUpsidePct)}`}>{formatPercent(row.impliedUpsidePct)}</td>
                        <td className={`px-3 py-4 align-top whitespace-nowrap ${getValueToneClass(row.hitRatePct === null ? null : row.hitRatePct - 50)}`}>{formatPercent(row.hitRatePct)}</td>
                        <td className={`px-3 py-4 align-top whitespace-nowrap ${getValueToneClass(row.avgAlphaVsConsensusPct)}`}>{formatPercent(row.avgAlphaVsConsensusPct)}</td>
                        <td className="px-3 py-4 align-top whitespace-nowrap">{formatMoney(latestPace.expectedPriceToday, row.currentConsensusTargetCurrency || row.currency || "USD")}</td>
                        <td className="px-3 py-4 align-top">
                          <PerformancePacePanel
                            currency={row.currentConsensusTargetCurrency || row.currency || "USD"}
                            latest={latestPace}
                            original={originalPace}
                            reliabilityLabel={row.reliabilityLabel}
                            evaluatedSnapshotCount={row.evaluatedSnapshotCount}
                            evaluationWindowDays={row.evaluationWindowDays}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">
              No tracked symbols have reached estimate tracking yet. Import symbols, refresh quotes, and let snapshots accumulate.
            </div>
          )}
        </SectionCard>
      </div>
    </AppShell>
  );
}
