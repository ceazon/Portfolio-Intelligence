import Link from "next/link";
import { cookies } from "next/headers";
import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { MarketEstimateForm } from "@/components/market-estimate-form";
import { RefreshMarketDataForm } from "@/components/refresh-market-data-form";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireUser } from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/env";
import { getMarketHoursState } from "@/lib/market-hours";
import { formatAppDateTime, getAppTimeZoneLabel } from "@/lib/time";
import { formatMoney } from "@/lib/performance-metrics";

type PortfolioRow = {
  id: string;
  name: string;
  description: string | null;
  display_currency: string | null;
};

type PositionRow = {
  id: string;
  portfolio_id: string | null;
  quantity: number | null;
  symbols:
    | {
        id: string;
        ticker: string;
        name: string | null;
        currency: string | null;
        symbol_price_snapshots:
          | { price: number | null; percent_change: number | null; fetched_at: string }
          | { price: number | null; percent_change: number | null; fetched_at: string }[]
          | null;
      }
    | {
        id: string;
        ticker: string;
        name: string | null;
        currency: string | null;
        symbol_price_snapshots:
          | { price: number | null; percent_change: number | null; fetched_at: string }
          | { price: number | null; percent_change: number | null; fetched_at: string }[]
          | null;
      }[]
    | null;
};

type TargetSnapshotRow = {
  symbol_id: string;
  mean_target: number | null;
  captured_at: string;
};

type PriceHistoryRow = {
  symbol_id: string;
  price: number | null;
  market_day: string;
  captured_at: string;
};

type HoldingView = {
  symbolId: string;
  ticker: string;
  name: string | null;
  quantity: number;
  price: number | null;
  target: number | null;
  targetSource: "analyst" | "market-estimate" | "unavailable";
  upsidePct: number | null;
  dailyMovePct: number | null;
  marketValue: number | null;
  currency: string;
  quoteAt: string | null;
  targetAt: string | null;
};

type PortfolioView = {
  id: string;
  name: string;
  description: string | null;
  displayCurrency: string;
  holdings: HoldingView[];
  marketValue: number;
  averageUpsidePct: number | null;
  estimatedValueAtTarget: number | null;
  estimateGapValue: number | null;
  atOrAboveTargetCount: number;
  withEstimateCount: number;
  fallbackEstimateCount: number;
};

function formatPercent(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function getTone(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "text-zinc-400";
  if (value >= 10) return "text-emerald-300";
  if (value >= 0) return "text-sky-300";
  return "text-rose-300";
}

function firstRelation<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getMarketEstimatePctFromCookie(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 6;
}

export default async function DashboardPage() {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const cookieStore = await cookies();
  const marketEstimatePct = getMarketEstimatePctFromCookie(cookieStore.get("portfolio_market_estimate_pct")?.value);

  let portfolios: PortfolioView[] = [];
  let positionCount = 0;
  let latestQuoteRunSummary: string | null = null;
  let latestQuoteRunAt: string | null = null;
  let portfolioTimeline: Array<{ date: string; actualValue: number; estimateValue: number; gapValue: number }> = [];

  if (supabase) {
    const [
      portfolioRowsResult,
      positionsResult,
      latestTargetsResult,
      priceHistoryResult,
      latestQuoteRunResult,
    ] = await Promise.all([
      supabase.from("portfolios").select("id, name, description, display_currency").eq("owner_id", user.id).order("created_at", { ascending: false }),
      supabase
        .from("portfolio_positions")
        .select("id, portfolio_id, quantity, portfolios!inner(owner_id), symbols(id, ticker, name, currency, symbol_price_snapshots(price, percent_change, fetched_at))")
        .eq("portfolios.owner_id", user.id)
        .gt("quantity", 0),
      supabase
        .from("analyst_target_snapshots")
        .select("symbol_id, mean_target, captured_at")
        .not("mean_target", "is", null)
        .order("captured_at", { ascending: false }),
      supabase
        .from("symbol_price_history")
        .select("symbol_id, price, market_day, captured_at")
        .order("market_day", { ascending: true }),
      supabase.from("quote_refresh_runs").select("summary, completed_at").order("completed_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    const portfolioRows = (portfolioRowsResult.data || []) as PortfolioRow[];
    const positions = (positionsResult.data || []) as PositionRow[];
    positionCount = positions.length;
    latestQuoteRunSummary = latestQuoteRunResult.data?.summary || null;
    latestQuoteRunAt = latestQuoteRunResult.data?.completed_at || null;

    const latestTargetBySymbol = new Map<string, TargetSnapshotRow>();
    ((latestTargetsResult.data || []) as TargetSnapshotRow[]).forEach((target) => {
      if (!target.symbol_id || latestTargetBySymbol.has(target.symbol_id)) return;
      latestTargetBySymbol.set(target.symbol_id, target);
    });

    const priceHistoryBySymbol = new Map<string, PriceHistoryRow[]>();
    ((priceHistoryResult.data || []) as PriceHistoryRow[]).forEach((row) => {
      if (!row.symbol_id || typeof row.price !== "number") return;
      const existing = priceHistoryBySymbol.get(row.symbol_id) || [];
      existing.push(row);
      priceHistoryBySymbol.set(row.symbol_id, existing);
    });

    const positionsByPortfolio = new Map<string, PositionRow[]>();
    positions.forEach((position) => {
      if (!position.portfolio_id) return;
      const existing = positionsByPortfolio.get(position.portfolio_id) || [];
      existing.push(position);
      positionsByPortfolio.set(position.portfolio_id, existing);
    });

    portfolios = portfolioRows.map((portfolio) => {
      const holdings = (positionsByPortfolio.get(portfolio.id) || []).map((position) => {
        const symbol = firstRelation(position.symbols);
        const quote = firstRelation(symbol?.symbol_price_snapshots || null);
        const target = symbol?.id ? latestTargetBySymbol.get(symbol.id) : null;
        const quantity = position.quantity ?? 0;
        const price = quote?.price ?? null;
        const analystTarget = target?.mean_target ?? null;
        const meanTarget = analystTarget ?? (typeof price === "number" ? price * (1 + marketEstimatePct / 100) : null);
        const marketValue = typeof price === "number" ? price * quantity : null;
        const upsidePct = typeof price === "number" && price > 0 && typeof meanTarget === "number"
          ? ((meanTarget - price) / price) * 100
          : null;

        return {
          symbolId: symbol?.id || position.id,
          ticker: symbol?.ticker || "Unknown",
          name: symbol?.name || null,
          quantity,
          price,
          target: meanTarget,
          targetSource: typeof analystTarget === "number" ? "analyst" : typeof meanTarget === "number" ? "market-estimate" : "unavailable",
          upsidePct,
          dailyMovePct: quote?.percent_change ?? null,
          marketValue,
          currency: symbol?.currency || portfolio.display_currency || "USD",
          quoteAt: quote?.fetched_at ?? null,
          targetAt: target?.captured_at ?? null,
        } satisfies HoldingView;
      }).sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0));

      const marketValue = holdings.reduce((sum, holding) => sum + (holding.marketValue ?? 0), 0);
      const targetValues = holdings
        .map((holding) => typeof holding.target === "number" ? holding.target * holding.quantity : null)
        .filter((value): value is number => typeof value === "number");
      const estimatedValueAtTarget = targetValues.length ? targetValues.reduce((sum, value) => sum + value, 0) : null;
      const estimateGapValue = estimatedValueAtTarget !== null ? estimatedValueAtTarget - marketValue : null;
      const upsideValues = holdings.map((holding) => holding.upsidePct).filter((value): value is number => typeof value === "number" && Number.isFinite(value));

      return {
        id: portfolio.id,
        name: portfolio.name,
        description: portfolio.description,
        displayCurrency: portfolio.display_currency || holdings[0]?.currency || "USD",
        holdings,
        marketValue,
        averageUpsidePct: average(upsideValues),
        estimatedValueAtTarget,
        estimateGapValue,
        atOrAboveTargetCount: holdings.filter((holding) => typeof holding.upsidePct === "number" && holding.upsidePct <= 0).length,
        withEstimateCount: upsideValues.length,
        fallbackEstimateCount: holdings.filter((holding) => holding.targetSource === "market-estimate").length,
      } satisfies PortfolioView;
    });

    const heldPositions = positions
      .map((position) => {
        const symbol = firstRelation(position.symbols);
        if (!symbol?.id) return null;
        const latestTarget = latestTargetBySymbol.get(symbol.id)?.mean_target ?? null;
        return {
          symbolId: symbol.id,
          quantity: position.quantity ?? 0,
          target: latestTarget,
        };
      })
      .filter((position): position is { symbolId: string; quantity: number; target: number | null } => Boolean(position));

    const allMarketDays = [...new Set(((priceHistoryResult.data || []) as PriceHistoryRow[]).map((row) => row.market_day).filter(Boolean))].sort().slice(-30);
    portfolioTimeline = allMarketDays.map((day) => {
      const actualValue = heldPositions.reduce((sum, position) => {
        const history = priceHistoryBySymbol.get(position.symbolId) || [];
        const dayPrice = [...history].reverse().find((row) => row.market_day <= day)?.price ?? null;
        return sum + (typeof dayPrice === "number" ? dayPrice * position.quantity : 0);
      }, 0);
      const estimateValue = heldPositions.reduce((sum, position) => {
        const history = priceHistoryBySymbol.get(position.symbolId) || [];
        const dayPrice = [...history].reverse().find((row) => row.market_day <= day)?.price ?? null;
        const estimatedPrice = position.target ?? (typeof dayPrice === "number" ? dayPrice * (1 + marketEstimatePct / 100) : null);
        return sum + (typeof estimatedPrice === "number" ? estimatedPrice * position.quantity : 0);
      }, 0);

      return {
        date: day,
        actualValue,
        estimateValue,
        gapValue: estimateValue - actualValue,
      };
    }).filter((point) => point.actualValue > 0 || point.estimateValue > 0);
  }

  const marketHoursState = getMarketHoursState();
  const allUpsideValues = portfolios.flatMap((portfolio) => portfolio.holdings.map((holding) => holding.upsidePct).filter((value): value is number => typeof value === "number" && Number.isFinite(value)));
  const averageUpsidePct = average(allUpsideValues);
  const totalEstimateGap = portfolios.reduce((sum, portfolio) => sum + (portfolio.estimateGapValue ?? 0), 0);
  const trackedEstimateCount = allUpsideValues.length;
  const fallbackEstimateCount = portfolios.reduce((sum, portfolio) => sum + portfolio.fallbackEstimateCount, 0);
  const latestQuoteAt = portfolios
    .flatMap((portfolio) => portfolio.holdings.map((holding) => holding.quoteAt).filter((value): value is string => Boolean(value)))
    .sort()
    .at(-1) || null;
  const latestPortfolioTimelinePoint = portfolioTimeline.at(-1) || null;
  const timelineMaxValue = Math.max(1, ...portfolioTimeline.flatMap((point) => [point.actualValue, point.estimateValue]));

  const keyStats = [
    {
      label: "Core portfolios",
      value: String(portfolios.length),
      detail: `${positionCount} active positions under estimate tracking`,
      href: "/portfolio",
    },
    {
      label: "Tracked estimates",
      value: String(trackedEstimateCount),
      detail: `${fallbackEstimateCount} using ${marketEstimatePct.toFixed(1)}% market fallback`,
      href: "/performance",
    },
    {
      label: "Average upside",
      value: formatPercent(averageUpsidePct),
      detail: "Analyst targets + fallback vs latest actual price",
      href: "/performance",
    },
    {
      label: "Estimate gap",
      value: formatMoney(totalEstimateGap, portfolios[0]?.displayCurrency || "USD"),
      detail: "Current value vs blended estimate value",
      href: "/performance",
    },
  ];

  return (
    <AppShell viewer={user}>
      <div className="space-y-6">
        <SectionCard
          title="Portfolio Intelligence"
          description="Dashboard focused on the core portfolios we are tracking: actual prices versus analyst estimate targets."
        >
          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-zinc-300">
                <p className="font-medium text-emerald-300">{hasSupabaseEnv() ? "System running" : "System not configured"}</p>
                <p className="mt-1 text-zinc-400">Dashboard is centered on portfolio holdings, live prices, and consensus targets.</p>
              </div>
              <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4 text-sm text-zinc-300">
                <p className="font-medium text-sky-300">Latest actuals updating</p>
                <p className="mt-1 text-zinc-400">{latestQuoteAt ? `Latest quote observed ${formatAppDateTime(latestQuoteAt)}.` : "Quote history will appear after the next refresh."}</p>
              </div>
            </div>
            <RefreshMarketDataForm />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {keyStats.map((stat) => (
              <Link key={stat.label} href={stat.href} className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 transition hover:border-sky-700/70 hover:bg-zinc-900/70">
                <p className="text-xs uppercase tracking-wide text-zinc-500">{stat.label}</p>
                <p className={`mt-3 text-3xl font-bold ${stat.label.includes("upside") || stat.label.includes("gap") ? getTone(stat.label.includes("upside") ? averageUpsidePct : totalEstimateGap) : "text-zinc-50"}`}>{stat.value}</p>
                <p className="mt-2 text-sm text-zinc-400">{stat.detail}</p>
              </Link>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Overall portfolio vs estimate over time" description={`Blended tracking uses analyst targets where available and ${marketEstimatePct.toFixed(1)}% market estimate fallback where targets are missing.`}>
          {portfolioTimeline.length ? (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                  <p className="text-xs uppercase tracking-wide text-zinc-500">Latest actual value</p>
                  <p className="mt-2 text-2xl font-bold text-zinc-50">{formatMoney(latestPortfolioTimelinePoint?.actualValue ?? null, portfolios[0]?.displayCurrency || "USD")}</p>
                </div>
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                  <p className="text-xs uppercase tracking-wide text-zinc-500">Latest estimate value</p>
                  <p className="mt-2 text-2xl font-bold text-zinc-50">{formatMoney(latestPortfolioTimelinePoint?.estimateValue ?? null, portfolios[0]?.displayCurrency || "USD")}</p>
                </div>
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                  <p className="text-xs uppercase tracking-wide text-zinc-500">Current estimate gap</p>
                  <p className={`mt-2 text-2xl font-bold ${getTone(latestPortfolioTimelinePoint?.gapValue ?? null)}`}>{formatMoney(latestPortfolioTimelinePoint?.gapValue ?? null, portfolios[0]?.displayCurrency || "USD")}</p>
                </div>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                <div className="flex h-44 items-end gap-1">
                  {portfolioTimeline.map((point) => (
                    <div key={point.date} className="group flex h-full min-w-0 flex-1 items-end gap-0.5" title={`${point.date}: actual ${formatMoney(point.actualValue, portfolios[0]?.displayCurrency || "USD")} / estimate ${formatMoney(point.estimateValue, portfolios[0]?.displayCurrency || "USD")}`}>
                      <div className="w-1/2 rounded-t bg-sky-500/70" style={{ height: `${Math.max(4, (point.actualValue / timelineMaxValue) * 100)}%` }} />
                      <div className="w-1/2 rounded-t bg-emerald-400/70" style={{ height: `${Math.max(4, (point.estimateValue / timelineMaxValue) * 100)}%` }} />
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-4 text-xs text-zinc-500">
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-sky-500/70" /> Actual</span>
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-emerald-400/70" /> Estimate</span>
                  <span className="ml-auto">Last {portfolioTimeline.length} market days</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">Portfolio timeline will appear once price history has been captured for these holdings.</div>
          )}
        </SectionCard>

        <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <SectionCard title="Core portfolios: estimates vs actual" description="Each portfolio summarized by current actual value, consensus target value, and position-level upside/downside.">
            {portfolios.length ? (
              <div className="space-y-4">
                {portfolios.map((portfolio) => (
                  <div key={portfolio.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <Link href="/portfolio" className="text-lg font-semibold text-zinc-50 hover:text-sky-300">{portfolio.name}</Link>
                        <p className="mt-1 text-sm text-zinc-400">{portfolio.description || `${portfolio.holdings.length} active holding${portfolio.holdings.length === 1 ? "" : "s"}`}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-right text-sm md:grid-cols-4">
                        <div>
                          <p className="text-zinc-500">Actual value</p>
                          <p className="font-semibold text-zinc-100">{formatMoney(portfolio.marketValue, portfolio.displayCurrency)}</p>
                        </div>
                        <div>
                          <p className="text-zinc-500">Target value</p>
                          <p className="font-semibold text-zinc-100">{formatMoney(portfolio.estimatedValueAtTarget, portfolio.displayCurrency)}</p>
                        </div>
                        <div>
                          <p className="text-zinc-500">Gap</p>
                          <p className={`font-semibold ${getTone(portfolio.estimateGapValue)}`}>{formatMoney(portfolio.estimateGapValue, portfolio.displayCurrency)}</p>
                        </div>
                        <div>
                          <p className="text-zinc-500">Avg upside</p>
                          <p className={`font-semibold ${getTone(portfolio.averageUpsidePct)}`}>{formatPercent(portfolio.averageUpsidePct)}</p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full table-auto divide-y divide-zinc-900 text-sm">
                        <thead>
                          <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
                            <th className="px-2 py-2 font-medium">Holding</th>
                            <th className="px-2 py-2 text-right font-medium">Actual</th>
                            <th className="px-2 py-2 text-right font-medium">Estimate</th>
                            <th className="px-2 py-2 text-right font-medium">Upside</th>
                            <th className="px-2 py-2 text-right font-medium">Daily</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-900">
                          {portfolio.holdings.slice(0, 8).map((holding) => (
                            <tr key={holding.symbolId} className="text-zinc-300">
                              <td className="px-2 py-2">
                                <Link href={`/symbols/${encodeURIComponent(holding.ticker)}`} className="font-semibold text-zinc-50 hover:text-sky-300">{holding.ticker}</Link>
                                <p className="max-w-[220px] truncate text-xs text-zinc-500">{holding.name || "Unnamed company"}</p>
                              </td>
                              <td className="px-2 py-2 text-right">{formatMoney(holding.price, holding.currency)}</td>
                              <td className="px-2 py-2 text-right">
                                {formatMoney(holding.target, holding.currency)}
                                {holding.targetSource === "market-estimate" ? <p className="text-[11px] text-zinc-500">market {marketEstimatePct.toFixed(1)}%</p> : null}
                              </td>
                              <td className={`px-2 py-2 text-right font-medium ${getTone(holding.upsidePct)}`}>{formatPercent(holding.upsidePct)}</td>
                              <td className={`px-2 py-2 text-right ${getTone(holding.dailyMovePct)}`}>{formatPercent(holding.dailyMovePct)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">No core portfolio positions are available yet.</div>
            )}
          </SectionCard>

          <SectionCard title="Operating state" description="Refresh status and editable assumptions feeding estimate tracking.">
            <div className="space-y-3 text-sm">
              <MarketEstimateForm marketEstimatePct={marketEstimatePct} />
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Quote cadence</p>
                <p className="mt-2 text-zinc-300">
                  {marketHoursState.cadenceLabel === "market-hours" ? "Market hours" : "Off hours"} · every {marketHoursState.recommendedEveryMinutes} min recommended ({getAppTimeZoneLabel()})
                </p>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Latest quote run</p>
                <p className="mt-2 leading-6 text-zinc-300">{latestQuoteRunSummary || "No quote run summary yet."}</p>
                {latestQuoteRunAt ? <p className="mt-2 text-xs text-zinc-500">{formatAppDateTime(latestQuoteRunAt)}</p> : null}
              </div>
              <Link href="/performance" className="block rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4 text-sm text-sky-200 transition hover:border-sky-400/50 hover:bg-sky-500/10">
                Open full estimate tracking →
              </Link>
            </div>
          </SectionCard>
        </div>
      </div>
    </AppShell>
  );
}
