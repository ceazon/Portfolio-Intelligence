import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { RefreshMarketDataForm } from "@/components/refresh-market-data-form";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireUser } from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/env";
import { getMarketHoursState } from "@/lib/market-hours";
import { formatAppDateTime, getAppTimeZoneLabel } from "@/lib/time";

export default async function DashboardPage() {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  let symbolCount = "0";
  let positionCount = "0";
  let rebalanceRunCount = "0";
  let latestRebalanceRunSummary: string | null = null;
  let latestQuoteSync: string | null = null;
  let latestCentralQuoteRunSummary: string | null = null;
  let targetSnapshotCount = "0";
  let priceHistoryCount = "0";
  let performanceEvaluationCount = "0";
  let discoveryCandidateCount = "0";
  let savedDiscoveryIdeaCount = "0";
  let latestTargetSnapshot: string | null = null;
  let latestPriceHistory: string | null = null;

  if (supabase) {
    const [
      symbolsCountResult,
      positionsCountResult,
      rebalanceRunsCountResult,
      latestRebalanceRunResult,
      latestQuoteSyncResult,
      latestCentralQuoteRunResult,
      targetSnapshotCountResult,
      priceHistoryCountResult,
      performanceEvaluationCountResult,
      discoveryCandidateCountResult,
      savedDiscoveryIdeaCountResult,
      latestTargetSnapshotResult,
      latestPriceHistoryResult,
    ] = await Promise.all([
      supabase.from("symbols").select("id", { count: "exact", head: true }),
      supabase.from("portfolio_positions").select("id, portfolios!inner(owner_id)", { count: "exact", head: true }).eq("portfolios.owner_id", user.id),
      supabase.from("rebalancing_runs").select("id", { count: "exact", head: true }).eq("owner_id", user.id),
      supabase.from("rebalancing_runs").select("summary, completed_at").eq("owner_id", user.id).order("completed_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("symbols").select("last_quote_sync_at").order("last_quote_sync_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("quote_refresh_runs").select("summary, completed_at").order("completed_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("analyst_target_snapshots").select("id", { count: "exact", head: true }),
      supabase.from("symbol_price_history").select("id", { count: "exact", head: true }),
      supabase.from("analyst_target_performance").select("id", { count: "exact", head: true }),
      supabase.from("discovery_snapshots").select("id", { count: "exact", head: true }).gt("implied_upside_pct", 0).gte("pe_ttm", 10).lte("pe_ttm", 50),
      supabase.from("watchlist_items").select("id, watchlists!inner(name, owner_id)", { count: "exact", head: true }).eq("watchlists.owner_id", user.id).eq("watchlists.name", "Discovery Ideas"),
      supabase.from("analyst_target_snapshots").select("captured_at").order("captured_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("symbol_price_history").select("captured_at").order("captured_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    symbolCount = String(symbolsCountResult.count ?? 0);
    positionCount = String(positionsCountResult.count ?? 0);
    rebalanceRunCount = String(rebalanceRunsCountResult.count ?? 0);
    latestRebalanceRunSummary = latestRebalanceRunResult.data?.summary || null;
    latestQuoteSync = latestQuoteSyncResult.data?.last_quote_sync_at || null;
    latestCentralQuoteRunSummary = latestCentralQuoteRunResult.data?.summary || null;
    targetSnapshotCount = String(targetSnapshotCountResult.count ?? 0);
    priceHistoryCount = String(priceHistoryCountResult.count ?? 0);
    performanceEvaluationCount = String(performanceEvaluationCountResult.count ?? 0);
    discoveryCandidateCount = String(discoveryCandidateCountResult.count ?? 0);
    savedDiscoveryIdeaCount = String(savedDiscoveryIdeaCountResult.count ?? 0);
    latestTargetSnapshot = latestTargetSnapshotResult.data?.captured_at || null;
    latestPriceHistory = latestPriceHistoryResult.data?.captured_at || null;
  }

  const marketHoursState = getMarketHoursState();

  const stats = [
    { label: "Symbols", value: symbolCount, detail: latestQuoteSync ? `Last quote sync ${formatAppDateTime(latestQuoteSync)}` : "Waiting for first quote refresh" },
    { label: "Positions", value: positionCount, detail: "Current portfolio holdings" },
    { label: "Discovery Ideas", value: savedDiscoveryIdeaCount, detail: "Saved research candidates" },
    { label: "Rebalance Runs", value: rebalanceRunCount, detail: rebalanceRunCount === "0" ? "No saved rebalance history yet" : "Saved plan history" },
  ];

  const performanceStats = [
    {
      label: "Qualified Discovery",
      value: discoveryCandidateCount,
      detail: "Positive upside + P/E 10–50",
    },
    {
      label: "Target Snapshots",
      value: targetSnapshotCount,
      detail: latestTargetSnapshot ? `Latest target snapshot ${formatAppDateTime(latestTargetSnapshot)}` : "Waiting for target capture",
    },
    {
      label: "Price History",
      value: priceHistoryCount,
      detail: latestPriceHistory ? `Latest price history ${formatAppDateTime(latestPriceHistory)}` : "Waiting for price history",
    },
    {
      label: "Evaluations",
      value: performanceEvaluationCount,
      detail: performanceEvaluationCount === "0" ? "Historical scoring warms up after 90-day windows mature" : "Completed target-vs-actual outcomes",
    },
  ];

  const currentStatus = [
    {
      label: "Portfolio core",
      value: "Usable",
      body: "Portfolios, positions, cash, allocation views, refresh flows, and symbol workspaces are live.",
    },
    {
      label: "Discovery",
      value: "New",
      body: "S&P 500 idea screening is live with positive-upside/P/E filters, staged enrichment, Alpha Vantage fallback, and saved ideas on-page.",
    },
    {
      label: "Performance",
      value: "Warming up",
      body: "Estimate tracking shows live target gaps now; hit rate and alpha improve as 90/180/365-day history matures.",
    },
  ];

  const latestProgress = [
    {
      title: "Discovery shipped",
      body: "S&P 500 screener now ranks qualified research candidates by implied upside and lets you save ideas for follow-up.",
    },
    {
      title: "Data fallbacks improved",
      body: "Yahoo quotes and Alpha Vantage fundamentals/targets now backstop FMP/Finnhub limits.",
    },
    {
      title: "Saved ideas clarified",
      body: "Discovery ideas now stay visible directly on the Discovery page instead of hiding in the old watchlist area.",
    },
  ];

  const focusedRecommendations = [
    {
      priority: "1",
      title: "Make Discovery higher coverage",
      body: "Keep rotating enrichment across the S&P 500 and consider a stronger paid estimates provider if Discovery becomes central.",
    },
    {
      priority: "2",
      title: "Turn saved ideas into research workflow",
      body: "Add run-research, dismiss, and promote-to-portfolio actions for each saved idea.",
    },
    {
      priority: "3",
      title: "Add material-change tracking",
      body: "Highlight target revisions, valuation changes, and candidates newly entering/leaving the qualified screen.",
    },
  ];

  return (
    <AppShell viewer={user}>
      <div className="space-y-6">
        <SectionCard
          title="Portfolio Intelligence command center"
          description="Current product state and the focused next bets from here."
        >
          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-4">
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-zinc-300">
                <span className="font-medium text-emerald-300">{hasSupabaseEnv() ? "System configured and running" : "System not configured yet"}</span>
                <span className="text-zinc-400"> · the app is now past foundation and into trust/decision-usefulness work.</span>
              </div>
              <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4 text-sm text-zinc-300">
                Quote refresh <span className="font-medium text-zinc-100">{marketHoursState.cadenceLabel === "market-hours" ? "market hours" : "off hours"}</span>
                <span className="text-zinc-400"> · recommended every {marketHoursState.recommendedEveryMinutes} min ({getAppTimeZoneLabel()})</span>
              </div>
            </div>
            <RefreshMarketDataForm />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                <p className="text-xs uppercase tracking-wide text-zinc-500">{stat.label}</p>
                <p className="mt-3 text-3xl font-bold text-zinc-50">{stat.value}</p>
                <p className="mt-2 text-sm text-zinc-400">{stat.detail}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {performanceStats.map((stat) => (
              <div key={stat.label} className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                <p className="text-xs uppercase tracking-wide text-zinc-500">{stat.label}</p>
                <p className="mt-3 text-3xl font-bold text-zinc-50">{stat.value}</p>
                <p className="mt-2 text-sm text-zinc-400">{stat.detail}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {latestProgress.map((item) => (
              <div key={item.title} className="rounded-2xl border border-emerald-800/50 bg-emerald-950/10 p-4">
                <p className="text-xs uppercase tracking-wide text-emerald-300">Latest progress</p>
                <p className="mt-2 font-semibold text-zinc-100">{item.title}</p>
                <p className="mt-2 text-sm leading-6 text-zinc-400">{item.body}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
          <SectionCard
            title="Current status"
            description="Slim read on where the app stands right now."
          >
            <div className="space-y-3">
              {currentStatus.map((item) => (
                <div key={item.label} className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-zinc-100">{item.label}</p>
                    <span className="shrink-0 rounded-full border border-sky-800/70 bg-sky-950/30 px-2.5 py-1 text-xs font-medium text-sky-300">{item.value}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">{item.body}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            title="Focused next recommendations"
            description="Best next steps after reviewing the app as a whole."
          >
            <ol className="space-y-3 text-sm text-zinc-300">
              {focusedRecommendations.map((item) => (
                <li key={item.priority} className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                  <div className="flex gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-emerald-800/70 bg-emerald-950/25 text-xs font-bold text-emerald-300">{item.priority}</span>
                    <div>
                      <p className="font-semibold text-zinc-100">{item.title}</p>
                      <p className="mt-1 leading-6 text-zinc-400">{item.body}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </SectionCard>
        </div>

        <SectionCard
          title="Latest signal"
          description="Most recent operating summary."
        >
          <div className="rounded-2xl border border-dashed border-zinc-700 p-4 text-sm leading-6 text-zinc-400">
            {latestRebalanceRunSummary || latestCentralQuoteRunSummary || "No rebalance runs yet."}
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}
