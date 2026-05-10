import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { RefreshMarketDataForm } from "@/components/refresh-market-data-form";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireUser } from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/env";
import { getMarketHoursState } from "@/lib/market-hours";
import { formatAppDateTime, getAppTimeZoneLabel } from "@/lib/time";

type DiscoveryCandidate = {
  ticker: string;
  name: string | null;
  implied_upside_pct: number | null;
  pe_ttm: number | null;
};

function formatPercent(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatRatio(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toFixed(1);
}

export default async function DashboardPage() {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  let symbolCount = 0;
  let positionCount = 0;
  let qualifiedDiscoveryCount = 0;
  let discoverySnapshotCount = 0;
  let discoveryTargetCount = 0;
  let discoveryPeCount = 0;
  let savedDiscoveryIdeaCount = 0;
  let latestDiscoveryRefresh: string | null = null;
  let latestQuoteRunSummary: string | null = null;
  let latestQuoteRunAt: string | null = null;
  let topDiscoveryCandidates: DiscoveryCandidate[] = [];

  if (supabase) {
    const [
      symbolsCountResult,
      positionsCountResult,
      discoverySnapshotCountResult,
      discoveryTargetCountResult,
      discoveryPeCountResult,
      qualifiedDiscoveryCountResult,
      savedDiscoveryIdeaCountResult,
      latestDiscoveryRefreshResult,
      latestQuoteRunResult,
      topDiscoveryCandidatesResult,
    ] = await Promise.all([
      supabase.from("symbols").select("id", { count: "exact", head: true }),
      supabase.from("portfolio_positions").select("id, portfolios!inner(owner_id)", { count: "exact", head: true }).eq("portfolios.owner_id", user.id),
      supabase.from("discovery_snapshots").select("id", { count: "exact", head: true }).eq("universe", "sp500"),
      supabase.from("discovery_snapshots").select("id", { count: "exact", head: true }).eq("universe", "sp500").not("consensus_target", "is", null),
      supabase.from("discovery_snapshots").select("id", { count: "exact", head: true }).eq("universe", "sp500").not("pe_ttm", "is", null),
      supabase.from("discovery_snapshots").select("id", { count: "exact", head: true }).eq("universe", "sp500").gt("implied_upside_pct", 0).gte("pe_ttm", 10).lte("pe_ttm", 50),
      supabase.from("watchlist_items").select("id, watchlists!inner(name, owner_id)", { count: "exact", head: true }).eq("watchlists.owner_id", user.id).eq("watchlists.name", "Discovery Ideas"),
      supabase.from("discovery_snapshots").select("captured_at").eq("universe", "sp500").order("captured_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("quote_refresh_runs").select("summary, completed_at").order("completed_at", { ascending: false }).limit(1).maybeSingle(),
      supabase
        .from("discovery_snapshots")
        .select("ticker, name, implied_upside_pct, pe_ttm")
        .eq("universe", "sp500")
        .gt("implied_upside_pct", 0)
        .gte("pe_ttm", 10)
        .lte("pe_ttm", 50)
        .order("implied_upside_pct", { ascending: false })
        .limit(5),
    ]);

    symbolCount = symbolsCountResult.count ?? 0;
    positionCount = positionsCountResult.count ?? 0;
    discoverySnapshotCount = discoverySnapshotCountResult.count ?? 0;
    discoveryTargetCount = discoveryTargetCountResult.count ?? 0;
    discoveryPeCount = discoveryPeCountResult.count ?? 0;
    qualifiedDiscoveryCount = qualifiedDiscoveryCountResult.count ?? 0;
    savedDiscoveryIdeaCount = savedDiscoveryIdeaCountResult.count ?? 0;
    latestDiscoveryRefresh = latestDiscoveryRefreshResult.data?.captured_at || null;
    latestQuoteRunSummary = latestQuoteRunResult.data?.summary || null;
    latestQuoteRunAt = latestQuoteRunResult.data?.completed_at || null;
    topDiscoveryCandidates = (topDiscoveryCandidatesResult.data || []) as DiscoveryCandidate[];
  }

  const marketHoursState = getMarketHoursState();
  const discoveryCoverageDetail = `${discoveryTargetCount}/${discoverySnapshotCount} targets · ${discoveryPeCount}/${discoverySnapshotCount} P/E`;

  const keyStats = [
    {
      label: "Qualified Discovery",
      value: String(qualifiedDiscoveryCount),
      detail: "Positive upside + P/E 10–50",
      href: "/discovery",
    },
    {
      label: "Coverage",
      value: discoverySnapshotCount ? `${Math.round((Math.min(discoveryTargetCount, discoveryPeCount) / discoverySnapshotCount) * 100)}%` : "0%",
      detail: discoveryCoverageDetail,
      href: "/discovery",
    },
    {
      label: "Saved Ideas",
      value: String(savedDiscoveryIdeaCount),
      detail: "Research candidates saved from Discovery",
      href: "/discovery",
    },
    {
      label: "Portfolio Positions",
      value: String(positionCount),
      detail: `${symbolCount} symbols in the database`,
      href: "/portfolio",
    },
  ];

  return (
    <AppShell viewer={user}>
      <div className="space-y-6">
        <SectionCard
          title="Portfolio Intelligence"
          description="Current state: Discovery is live, coverage is filling gradually, and the portfolio core is operational."
        >
          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-zinc-300">
                <p className="font-medium text-emerald-300">{hasSupabaseEnv() ? "System running" : "System not configured"}</p>
                <p className="mt-1 text-zinc-400">Discovery is now the primary symbol sourcing workflow.</p>
              </div>
              <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4 text-sm text-zinc-300">
                <p className="font-medium text-sky-300">Automated enrichment active</p>
                <p className="mt-1 text-zinc-400">Small background batches avoid provider rate limits.</p>
              </div>
            </div>
            <RefreshMarketDataForm />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {keyStats.map((stat) => (
              <Link key={stat.label} href={stat.href} className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 transition hover:border-sky-700/70 hover:bg-zinc-900/70">
                <p className="text-xs uppercase tracking-wide text-zinc-500">{stat.label}</p>
                <p className="mt-3 text-3xl font-bold text-zinc-50">{stat.value}</p>
                <p className="mt-2 text-sm text-zinc-400">{stat.detail}</p>
              </Link>
            ))}
          </div>
        </SectionCard>

        <div className="grid gap-6 xl:grid-cols-[1fr_0.85fr]">
          <SectionCard title="Top Discovery candidates" description="Highest implied-upside names currently passing the focused screen.">
            {topDiscoveryCandidates.length ? (
              <div className="divide-y divide-zinc-800 rounded-2xl border border-zinc-800 bg-zinc-950/70">
                {topDiscoveryCandidates.map((candidate) => (
                  <Link key={candidate.ticker} href={`/symbols/${encodeURIComponent(candidate.ticker)}`} className="flex items-center justify-between gap-4 p-4 hover:bg-zinc-900/70">
                    <div>
                      <p className="font-semibold text-zinc-50">{candidate.ticker}</p>
                      <p className="mt-1 text-sm text-zinc-400">{candidate.name || "Unnamed company"}</p>
                    </div>
                    <div className="text-right text-sm">
                      <p className="font-semibold text-emerald-300">{formatPercent(candidate.implied_upside_pct)}</p>
                      <p className="mt-1 text-zinc-500">P/E {formatRatio(candidate.pe_ttm)}</p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">No qualified Discovery candidates yet.</div>
            )}
          </SectionCard>

          <SectionCard title="Operating state" description="Only the signals that matter right now.">
            <div className="space-y-3 text-sm">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Discovery refresh</p>
                <p className="mt-2 text-zinc-300">{latestDiscoveryRefresh ? formatAppDateTime(latestDiscoveryRefresh) : "Not refreshed yet"}</p>
              </div>
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
      </div>
    </AppShell>
  );
}
