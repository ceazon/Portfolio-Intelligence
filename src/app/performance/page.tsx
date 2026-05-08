import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PerformancePacePanel } from "@/components/performance-pace-panel";
import { PerformanceSymbolChartPopover } from "@/components/performance-symbol-chart-popover";
import { SectionCard } from "@/components/section-card";
import { requireUser } from "@/lib/auth";
import { getConsensusTargetForSymbol } from "@/lib/consensus-targets";
import { buildPaceSummary, buildPerformanceSummaryRow, formatMoney, formatPercent, formatRatio, getPerformanceTone, type PerformanceSummaryRow } from "@/lib/performance-metrics";
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

type PortfolioOptionRow = {
  id: string;
  name: string;
};

type PortfolioPositionFilterRow = {
  portfolio_id: string | null;
  symbol_id: string | null;
  portfolios: { id: string; name: string; owner_id?: string } | { id: string; name: string; owner_id?: string }[] | null;
};

type SnapshotRow = {
  symbol_id: string;
  mean_target: number | null;
  current_price: number | null;
  current_price_currency: string | null;
  captured_at: string;
};

type FundamentalsRow = {
  symbol_id: string;
  pe_ttm: number | null;
};

type PriceHistoryRow = {
  symbol_id: string;
  price: number | null;
  captured_at: string;
};

type SortField = "alpha" | "hit-rate" | "upside" | "pe";

const SORT_OPTIONS = [
  { value: "alpha", label: "Average alpha" },
  { value: "hit-rate", label: "Hit rate" },
  { value: "upside", label: "Implied upside" },
  { value: "pe", label: "P/E ratio" },
] as const;

const SORT_LABELS: Record<SortField, string> = {
  alpha: "Average alpha",
  "hit-rate": "Hit rate",
  upside: "Implied upside",
  pe: "P/E ratio",
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
  const selectedPortfolioId = getSingleParam(params.portfolio);
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

  const [trackedSymbolsResult, performanceResult, latestSnapshotsResult, portfolioPositionsResult, fundamentalsResult, priceHistoryResult] = await Promise.all([
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
    supabase
      .from("portfolio_positions")
      .select("portfolio_id, symbol_id, portfolios!inner(id, name, owner_id)")
      .eq("portfolios.owner_id", user.id),
    supabase
      .from("symbol_fundamentals")
      .select("symbol_id, pe_ttm"),
    supabase
      .from("symbol_price_history")
      .select("symbol_id, price, captured_at")
      .order("captured_at", { ascending: true }),
  ]);

  const trackedSymbols = (trackedSymbolsResult.data || []) as SymbolRow[];
  const performanceRows = performanceResult.data || [];
  const latestSnapshots = (latestSnapshotsResult.data || []) as SnapshotRow[];
  const portfolioPositionRows = (portfolioPositionsResult.data || []) as PortfolioPositionFilterRow[];
  const fundamentalsRows = (fundamentalsResult.data || []) as FundamentalsRow[];
  const priceHistoryRows = (priceHistoryResult.data || []) as PriceHistoryRow[];

  const portfolioMap = new Map<string, PortfolioOptionRow>();
  const portfolioSymbolIds = new Set<string>();
  portfolioPositionRows.forEach((row) => {
    const portfolio = firstRelation(row.portfolios);
    if (portfolio?.id && portfolio?.name) {
      portfolioMap.set(portfolio.id, { id: portfolio.id, name: portfolio.name });
    }

    if (row.symbol_id && (!selectedPortfolioId || row.portfolio_id === selectedPortfolioId)) {
      portfolioSymbolIds.add(row.symbol_id);
    }
  });
  const portfolios = [...portfolioMap.values()];

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
  const fundamentalsBySymbol = new Map<string, FundamentalsRow>();
  const priceHistoryBySymbol = new Map<string, { capturedAt: string; price: number }[]>();
  latestSnapshots.forEach((snapshot) => {
    if (!snapshot.symbol_id) {
      return;
    }

    if (!latestSnapshotBySymbol.has(snapshot.symbol_id)) {
      latestSnapshotBySymbol.set(snapshot.symbol_id, snapshot);
    }

    earliestSnapshotBySymbol.set(snapshot.symbol_id, snapshot);
  });

  fundamentalsRows.forEach((row) => {
    if (!row.symbol_id || fundamentalsBySymbol.has(row.symbol_id)) {
      return;
    }

    fundamentalsBySymbol.set(row.symbol_id, row);
  });

  priceHistoryRows.forEach((row) => {
    if (!row.symbol_id || typeof row.price !== "number") {
      return;
    }

    const history = priceHistoryBySymbol.get(row.symbol_id) || [];
    history.push({ capturedAt: row.captured_at, price: row.price });
    priceHistoryBySymbol.set(row.symbol_id, history);
  });

  const trackedSymbolsForPerformance = trackedSymbols.filter((symbol) => {
    if (!selectedPortfolioId) {
      return true;
    }

    return portfolioSymbolIds.has(symbol.id);
  });
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
      const peRatioTtm = fundamentalsBySymbol.get(symbol.id)?.pe_ttm ?? null;

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
        peRatioTtm,
        evaluationWindowDays: aggregate?.evaluation_window_days ?? 365,
        evaluatedSnapshotCount: aggregate?.evaluated_count ?? 0,
        hitCount: aggregate?.hit_count ?? 0,
        avgAlphaVsConsensusPct: aggregate?.avg_alpha ?? null,
      });
    })
    .sort((a, b) => {
      if (sortField === "pe") {
        const peA = a.peRatioTtm ?? Number.POSITIVE_INFINITY;
        const peB = b.peRatioTtm ?? Number.POSITIVE_INFINITY;
        if (peA !== peB) {
          return peA - peB;
        }
      }

      if (sortField === "upside") {
        const upsideA = a.impliedUpsidePct ?? Number.NEGATIVE_INFINITY;
        const upsideB = b.impliedUpsidePct ?? Number.NEGATIVE_INFINITY;
        if (upsideB !== upsideA) {
          return upsideB - upsideA;
        }
      }

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

      const upsideA = a.impliedUpsidePct ?? Number.NEGATIVE_INFINITY;
      const upsideB = b.impliedUpsidePct ?? Number.NEGATIVE_INFINITY;
      if (upsideB !== upsideA) {
        return upsideB - upsideA;
      }

      const hitRateA = a.hitRatePct ?? Number.NEGATIVE_INFINITY;
      const hitRateB = b.hitRatePct ?? Number.NEGATIVE_INFINITY;
      if (hitRateB !== hitRateA) {
        return hitRateB - hitRateA;
      }

      const peA = a.peRatioTtm ?? Number.POSITIVE_INFINITY;
      const peB = b.peRatioTtm ?? Number.POSITIVE_INFINITY;
      return peA - peB;
    });

  const displayRows = summaryRows.map((row) => {
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
    const targetHitNow = row.currentPrice !== null && row.currentConsensusTarget !== null
      ? row.currentPrice >= row.currentConsensusTarget
      : null;

    return {
      ...row,
      latestSnapshot,
      originalSnapshot,
      latestPace,
      originalPace,
      targetHitNow,
    };
  });

  const liveAheadOfPaceCount = displayRows.filter((row) => row.originalPace.status === "ahead").length;
  const liveBehindPaceCount = displayRows.filter((row) => row.originalPace.status === "behind").length;
  const atTargetNowCount = displayRows.filter((row) => row.targetHitNow).length;
  const liveTrackedCount = displayRows.filter((row) => row.originalPace.status !== "unavailable").length;
  const impliedUpsideValues = displayRows
    .map((row) => row.impliedUpsidePct)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const averageImpliedUpsidePct = impliedUpsideValues.length > 0
    ? impliedUpsideValues.reduce((sum, value) => sum + value, 0) / impliedUpsideValues.length
    : null;
  const highestHitRate = [...displayRows]
    .filter((row) => row.hitRatePct !== null)
    .sort((a, b) => (b.hitRatePct ?? -1) - (a.hitRatePct ?? -1))[0] || null;
  const weakestHitRate = [...displayRows]
    .filter((row) => row.hitRatePct !== null)
    .sort((a, b) => (a.hitRatePct ?? 101) - (b.hitRatePct ?? 101))[0] || null;
  const lastQuoteUpdate = summaryRows.find((row) => row.currentPriceFetchedAt)?.currentPriceFetchedAt || null;
  const liveAheadTone = getCardToneClasses(liveAheadOfPaceCount > 0 ? "positive" : "neutral");
  const liveBehindTone = getCardToneClasses(liveBehindPaceCount > 0 ? "negative" : "neutral");
  const atTargetNowTone = getCardToneClasses(atTargetNowCount > 0 ? "positive" : "neutral");
  const avgUpsideTone = getCardToneClasses(getPerformanceTone(averageImpliedUpsidePct));
  const highestHitRateTone = getCardToneClasses(getPerformanceTone(highestHitRate?.hitRatePct === null || highestHitRate?.hitRatePct === undefined ? null : highestHitRate.hitRatePct - 50));
  const weakestHitRateTone = getCardToneClasses(getPerformanceTone(weakestHitRate?.hitRatePct === null || weakestHitRate?.hitRatePct === undefined ? null : weakestHitRate.hitRatePct - 50));

  return (
    <AppShell viewer={user}>
      <div className="space-y-6">
        <SectionCard
          title="Estimate tracking"
          description="Estimate tracking for all imported symbols, with optional portfolio filtering."
        >
          <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">
              Live daily tracking updates from current quotes right away. Historical hit rate and average alpha still use 365-day evaluations first, then 180-day history when 365-day coverage is still thin.
            </div>
            <form action="/performance" method="get" className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="sort" value={sortField} />
              <label className="text-sm text-zinc-400" htmlFor="portfolio-filter">Portfolio view</label>
              <select
                id="portfolio-filter"
                name="portfolio"
                defaultValue={selectedPortfolioId || ""}
                className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-sky-500"
              >
                <option value="">All Symbols</option>
                {portfolios.map((portfolio) => (
                  <option key={portfolio.id} value={portfolio.id}>{portfolio.name}</option>
                ))}
              </select>
              <button
                type="submit"
                className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 transition hover:border-zinc-500 hover:bg-zinc-800"
              >
                Apply
              </button>
            </form>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className={`rounded-2xl border p-4 ${liveAheadTone.border} ${liveAheadTone.bg}`}>
              <p className={`text-xs uppercase tracking-wide ${liveAheadTone.accent}`}>Ahead of pace now</p>
              <p className={`mt-3 text-3xl font-bold ${liveAheadTone.value}`}>{liveAheadOfPaceCount}</p>
              <p className="mt-2 text-sm text-zinc-400">Symbols currently ahead of their original 365-day target path.</p>
            </div>
            <div className={`rounded-2xl border p-4 ${liveBehindTone.border} ${liveBehindTone.bg}`}>
              <p className={`text-xs uppercase tracking-wide ${liveBehindTone.accent}`}>Behind pace now</p>
              <p className={`mt-3 text-3xl font-bold ${liveBehindTone.value}`}>{liveBehindPaceCount}</p>
              <p className="mt-2 text-sm text-zinc-400">Symbols currently trailing their original target path.</p>
            </div>
            <div className={`rounded-2xl border p-4 ${atTargetNowTone.border} ${atTargetNowTone.bg}`}>
              <p className={`text-xs uppercase tracking-wide ${atTargetNowTone.accent}`}>At target now</p>
              <p className={`mt-3 text-3xl font-bold ${atTargetNowTone.value}`}>{atTargetNowCount}</p>
              <p className="mt-2 text-sm text-zinc-400">Names already trading at or above the current consensus target.</p>
            </div>
            <div className={`rounded-2xl border p-4 ${avgUpsideTone.border} ${avgUpsideTone.bg}`}>
              <p className={`text-xs uppercase tracking-wide ${avgUpsideTone.accent}`}>Average implied upside</p>
              <p className={`mt-3 text-2xl font-bold ${avgUpsideTone.value}`}>{formatPercent(averageImpliedUpsidePct)}</p>
              <p className="mt-2 text-sm text-zinc-400">Live daily snapshot across {impliedUpsideValues.length} tracked symbols with quote + target data.</p>
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Live tracking coverage</p>
              <p className="mt-3 text-3xl font-bold text-zinc-50">{liveTrackedCount}</p>
              <p className="mt-2 text-sm text-zinc-400">Symbols with enough snapshot history to compute daily pace right now.</p>
            </div>
            <div className={`rounded-2xl border p-4 ${highestHitRateTone.border} ${highestHitRateTone.bg}`}>
              <p className={`text-xs uppercase tracking-wide ${highestHitRateTone.accent}`}>Highest hit-rate stock</p>
              <p className={`mt-3 text-2xl font-bold ${highestHitRateTone.value}`}>{highestHitRate?.ticker || "—"}</p>
              <p className="mt-2 text-sm text-zinc-400">{highestHitRate ? `${formatPercent(highestHitRate.hitRatePct)} hit rate` : "Historical hit-rate starts once 90-day windows mature."}</p>
            </div>
            <div className={`rounded-2xl border p-4 ${weakestHitRateTone.border} ${weakestHitRateTone.bg}`}>
              <p className={`text-xs uppercase tracking-wide ${weakestHitRateTone.accent}`}>Weakest hit-rate stock</p>
              <p className={`mt-3 text-2xl font-bold ${weakestHitRateTone.value}`}>{weakestHitRate?.ticker || "—"}</p>
              <p className="mt-2 text-sm text-zinc-400">{weakestHitRate ? `${formatPercent(weakestHitRate.hitRatePct)} hit rate` : "Historical hit-rate starts once 90-day windows mature."}</p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Historical alpha status</p>
              <p className="mt-3 text-2xl font-bold text-zinc-50">Warming up</p>
              <p className="mt-2 text-sm text-zinc-400">Average alpha remains horizon-based so it stays honest instead of pretending final outcomes are known early.</p>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title={selectedPortfolioId ? "Portfolio symbols vs estimates" : "All imported symbols vs estimates"}
          description={`Ranked by ${SORT_LABELS[sortField].toLowerCase()}. Timestamps shown in ${getAppTimeZoneLabel()}. Latest quote update ${lastQuoteUpdate ? formatAppDateTime(lastQuoteUpdate) : "not available yet"}.`}
        >
          {summaryRows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full table-auto divide-y divide-zinc-800 text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
                    <th className="w-[190px] px-3 py-3 font-medium">Ticker</th>
                    <th className="px-3 py-3 font-medium whitespace-nowrap">Current price</th>
                    <th className="px-3 py-3 font-medium whitespace-nowrap">Consensus target</th>
                    <th className="px-3 py-3 font-medium whitespace-nowrap">
                      <Link
                        href={`/performance?sort=pe${selectedPortfolioId ? `&portfolio=${selectedPortfolioId}` : ""}`}
                        className={[
                          "inline-flex items-center gap-2 rounded-lg px-2 py-1 transition",
                          sortField === "pe" ? "text-sky-300" : "hover:text-zinc-300",
                        ].join(" ")}
                      >
                        <span>{SORT_LABELS.pe}</span>
                        <span className={sortField === "pe" ? "text-sky-400" : "text-zinc-600"}>{sortField === "pe" ? "↑" : "↕"}</span>
                      </Link>
                    </th>
                    <th className="px-3 py-3 font-medium whitespace-nowrap">
                      <Link
                        href={`/performance?sort=upside${selectedPortfolioId ? `&portfolio=${selectedPortfolioId}` : ""}`}
                        className={[
                          "inline-flex items-center gap-2 rounded-lg px-2 py-1 transition",
                          sortField === "upside" ? "text-sky-300" : "hover:text-zinc-300",
                        ].join(" ")}
                      >
                        <span>{SORT_LABELS.upside}</span>
                        <span className={sortField === "upside" ? "text-sky-400" : "text-zinc-600"}>{sortField === "upside" ? "↓" : "↕"}</span>
                      </Link>
                    </th>
                    <th className="px-3 py-3 font-medium whitespace-nowrap">
                      <Link
                        href={`/performance?sort=hit-rate${selectedPortfolioId ? `&portfolio=${selectedPortfolioId}` : ""}`}
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
                        href={`/performance?sort=alpha${selectedPortfolioId ? `&portfolio=${selectedPortfolioId}` : ""}`}
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
                  {displayRows.map((row) => {
                    return (
                      <tr key={row.symbolId} className="align-top text-zinc-300">
                        <td className="px-3 py-4 align-top">
                          <PerformanceSymbolChartPopover
                            ticker={row.ticker}
                            name={row.name}
                            currency={row.currentConsensusTargetCurrency || row.currency || "USD"}
                            startDate={row.originalSnapshot?.captured_at ?? null}
                            startPrice={row.originalSnapshot?.current_price ?? null}
                            targetPrice={row.originalSnapshot?.mean_target ?? row.currentConsensusTarget}
                            currentPrice={row.currentPrice}
                            priceHistory={priceHistoryBySymbol.get(row.symbolId) || []}
                          />
                          <div className="text-xs text-zinc-500">{row.exchange || row.name || "Tracked symbol"}</div>
                        </td>
                        <td className="px-3 py-4 align-top whitespace-nowrap">{formatMoney(row.currentPrice, row.currency || "USD")}</td>
                        <td className="px-3 py-4 align-top whitespace-nowrap">{formatMoney(row.currentConsensusTarget, row.currentConsensusTargetCurrency || row.currency || "USD")}</td>
                        <td className="px-3 py-4 align-top whitespace-nowrap text-zinc-300">{formatRatio(row.peRatioTtm)}</td>
                        <td className={`px-3 py-4 align-top whitespace-nowrap ${getValueToneClass(row.impliedUpsidePct)}`}>{formatPercent(row.impliedUpsidePct)}</td>
                        <td className={`px-3 py-4 align-top whitespace-nowrap ${getValueToneClass(row.hitRatePct === null ? null : row.hitRatePct - 50)}`}>{row.hitRatePct === null ? <span className="text-zinc-500">Warming up</span> : formatPercent(row.hitRatePct)}</td>
                        <td className={`px-3 py-4 align-top whitespace-nowrap ${getValueToneClass(row.avgAlphaVsConsensusPct)}`}>{row.avgAlphaVsConsensusPct === null ? <span className="text-zinc-500">Warming up</span> : formatPercent(row.avgAlphaVsConsensusPct)}</td>
                        <td className="px-3 py-4 align-top whitespace-nowrap">{formatMoney(row.latestPace.expectedPriceToday, row.currentConsensusTargetCurrency || row.currency || "USD")}</td>
                        <td className="px-3 py-4 align-top">
                          <PerformancePacePanel
                            currency={row.currentConsensusTargetCurrency || row.currency || "USD"}
                            latest={row.latestPace}
                            original={row.originalPace}
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
              No symbols match this view yet. Import symbols, assign them to a portfolio if needed, refresh quotes, and let snapshots accumulate.
            </div>
          )}
        </SectionCard>
      </div>
    </AppShell>
  );
}
