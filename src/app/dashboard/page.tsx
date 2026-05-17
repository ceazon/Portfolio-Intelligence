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

type PortfolioSummary = {
  id: string;
  name: string;
  description: string | null;
  displayCurrency: string;
  holdingCount: number;
  marketValue: number;
};

function firstRelation<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function getMarketEstimatePctFromCookie(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 6;
}

function StatusPill({ tone, children }: { tone: "good" | "info" | "warn"; children: React.ReactNode }) {
  const classes = {
    good: "border-emerald-500/20 bg-emerald-500/5 text-emerald-300",
    info: "border-sky-500/20 bg-sky-500/5 text-sky-300",
    warn: "border-amber-500/20 bg-amber-500/5 text-amber-300",
  }[tone];

  return <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${classes}`}>{children}</span>;
}

export default async function DashboardPage() {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const cookieStore = await cookies();
  const marketEstimatePct = getMarketEstimatePctFromCookie(cookieStore.get("portfolio_market_estimate_pct")?.value);

  let portfolios: PortfolioSummary[] = [];
  let positionCount = 0;
  let trackedEstimateCount = 0;
  let fallbackEstimateCount = 0;
  let latestQuoteRunSummary: string | null = null;
  let latestQuoteRunAt: string | null = null;
  let latestQuoteAt: string | null = null;

  if (supabase) {
    const [portfolioRowsResult, positionsResult, latestTargetsResult, latestQuoteRunResult] = await Promise.all([
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
      supabase.from("quote_refresh_runs").select("summary, completed_at").order("completed_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    const portfolioRows = (portfolioRowsResult.data || []) as PortfolioRow[];
    const positions = (positionsResult.data || []) as PositionRow[];
    const latestTargets = (latestTargetsResult.data || []) as TargetSnapshotRow[];
    positionCount = positions.length;
    latestQuoteRunSummary = latestQuoteRunResult.data?.summary || null;
    latestQuoteRunAt = latestQuoteRunResult.data?.completed_at || null;

    const latestTargetBySymbol = new Map<string, TargetSnapshotRow>();
    latestTargets.forEach((target) => {
      if (!target.symbol_id || latestTargetBySymbol.has(target.symbol_id)) return;
      latestTargetBySymbol.set(target.symbol_id, target);
    });

    const positionsByPortfolio = new Map<string, PositionRow[]>();
    positions.forEach((position) => {
      if (!position.portfolio_id) return;
      const existing = positionsByPortfolio.get(position.portfolio_id) || [];
      existing.push(position);
      positionsByPortfolio.set(position.portfolio_id, existing);
    });

    const quoteTimes: string[] = [];
    portfolios = portfolioRows.map((portfolio) => {
      const portfolioPositions = positionsByPortfolio.get(portfolio.id) || [];
      const marketValue = portfolioPositions.reduce((sum, position) => {
        const symbol = firstRelation(position.symbols);
        const quote = firstRelation(symbol?.symbol_price_snapshots || null);
        if (quote?.fetched_at) quoteTimes.push(quote.fetched_at);
        return sum + (typeof quote?.price === "number" ? quote.price * (position.quantity ?? 0) : 0);
      }, 0);

      return {
        id: portfolio.id,
        name: portfolio.name,
        description: portfolio.description,
        displayCurrency: portfolio.display_currency || "USD",
        holdingCount: portfolioPositions.length,
        marketValue,
      } satisfies PortfolioSummary;
    });

    trackedEstimateCount = positions.filter((position) => {
      const symbol = firstRelation(position.symbols);
      const quote = firstRelation(symbol?.symbol_price_snapshots || null);
      return Boolean(symbol?.id && (latestTargetBySymbol.has(symbol.id) || typeof quote?.price === "number"));
    }).length;

    fallbackEstimateCount = positions.filter((position) => {
      const symbol = firstRelation(position.symbols);
      const quote = firstRelation(symbol?.symbol_price_snapshots || null);
      return Boolean(symbol?.id && !latestTargetBySymbol.has(symbol.id) && typeof quote?.price === "number");
    }).length;

    latestQuoteAt = quoteTimes.sort().at(-1) || null;
  }

  const marketHoursState = getMarketHoursState();
  const totalMarketValue = portfolios.reduce((sum, portfolio) => sum + portfolio.marketValue, 0);
  const primaryCurrency = portfolios[0]?.displayCurrency || "USD";
  const projectStateCards = [
    {
      label: "Project mode",
      value: "Live tracking",
      detail: "Portfolio data, quote refreshes, estimate coverage, and research workflows are connected.",
    },
    {
      label: "Portfolio coverage",
      value: `${portfolios.length} / ${positionCount}`,
      detail: `${portfolios.length} core portfolio${portfolios.length === 1 ? "" : "s"}, ${positionCount} active position${positionCount === 1 ? "" : "s"}`,
    },
    {
      label: "Current value tracked",
      value: formatMoney(totalMarketValue, primaryCurrency),
      detail: latestQuoteAt ? `Latest quote observed ${formatAppDateTime(latestQuoteAt)}.` : "Waiting for the first quote snapshot.",
    },
    {
      label: "Estimate coverage",
      value: String(trackedEstimateCount),
      detail: `${fallbackEstimateCount} using the editable ${marketEstimatePct.toFixed(1)}% market fallback assumption`,
    },
  ];

  const currentState = [
    {
      title: "Dashboard role changed",
      body: "This page is now the project home base: high-level health, coverage, freshness, and quick routes into the deeper tools.",
      href: "/dashboard",
      cta: "You are here",
    },
    {
      title: "Portfolio source of truth",
      body: portfolios.length ? `${portfolios.map((portfolio) => portfolio.name).join(", ")} currently feeds the tracking system.` : "No active portfolio has been connected yet.",
      href: "/portfolio",
      cta: "Manage portfolios",
    },
    {
      title: "Estimate engine",
      body: "Analyst targets are preferred. Missing targets use the market fallback percentage until better target data exists.",
      href: "/performance",
      cta: "Open tracking",
    },
    {
      title: "Research workflow",
      body: "Discovery, research, recommendations, fundamentals, and symbol detail pages remain available as dedicated work areas.",
      href: "/research",
      cta: "Open research",
    },
  ];

  return (
    <AppShell viewer={user}>
      <div className="space-y-6">
        <SectionCard
          title="Portfolio Intelligence project state"
          description="A clean home base for the current state of the app instead of another estimate analytics view."
        >
          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <StatusPill tone={hasSupabaseEnv() ? "good" : "warn"}>{hasSupabaseEnv() ? "Supabase configured" : "Supabase missing"}</StatusPill>
                <StatusPill tone={latestQuoteAt ? "good" : "info"}>{latestQuoteAt ? "Quotes flowing" : "Awaiting quote data"}</StatusPill>
                <StatusPill tone="info">{getAppTimeZoneLabel()}</StatusPill>
              </div>
              <p className="max-w-3xl text-sm leading-6 text-zinc-400">
                The app is set up around one core loop: maintain portfolios, refresh live market data, compare against estimate assumptions, and turn research into actionable recommendations.
              </p>
            </div>
            <RefreshMarketDataForm />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {projectStateCards.map((stat) => (
              <div key={stat.label} className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                <p className="text-xs uppercase tracking-wide text-zinc-500">{stat.label}</p>
                <p className="mt-3 text-2xl font-bold text-zinc-50">{stat.value}</p>
                <p className="mt-2 text-sm text-zinc-400">{stat.detail}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <SectionCard title="Current state" description="What is working, what is connected, and where the project stands right now.">
            <div className="grid gap-4 md:grid-cols-2">
              {currentState.map((item) => (
                <Link key={item.title} href={item.href} className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 transition hover:border-sky-700/70 hover:bg-zinc-900/70">
                  <p className="font-semibold text-zinc-50">{item.title}</p>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">{item.body}</p>
                  <p className="mt-4 text-sm font-medium text-sky-300">{item.cta} →</p>
                </Link>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Operating state" description="Refresh health and assumptions that still affect the deeper tracking pages.">
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
            </div>
          </SectionCard>
        </div>

        <SectionCard title="Detailed work areas" description="The dashboard stays clean; the analytics and workflows live in their own pages.">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ["Portfolios", "/portfolio"],
              ["Performance", "/performance"],
              ["Recommendations", "/recommendations"],
              ["Discovery", "/discovery"],
              ["Research", "/research"],
            ].map(([label, href]) => (
              <Link key={href} href={href} className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm font-medium text-zinc-200 transition hover:border-sky-700/70 hover:text-sky-300">
                {label} →
              </Link>
            ))}
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}
