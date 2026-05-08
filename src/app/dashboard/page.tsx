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
  let rebalanceRecommendationCount = "0";
  let rebalanceRunCount = "0";
  let latestRebalanceRunSummary: string | null = null;
  let latestQuoteSync: string | null = null;
  let latestCentralQuoteRunSummary: string | null = null;
  let targetSnapshotCount = "0";
  let priceHistoryCount = "0";
  let performanceEvaluationCount = "0";
  let latestTargetSnapshot: string | null = null;
  let latestPriceHistory: string | null = null;

  if (supabase) {
    const [
      symbolsCountResult,
      positionsCountResult,
      rebalanceRecommendationsCountResult,
      rebalanceRunsCountResult,
      latestRebalanceRunResult,
      latestQuoteSyncResult,
      latestCentralQuoteRunResult,
      targetSnapshotCountResult,
      priceHistoryCountResult,
      performanceEvaluationCountResult,
      latestTargetSnapshotResult,
      latestPriceHistoryResult,
    ] = await Promise.all([
      supabase.from("symbols").select("id", { count: "exact", head: true }),
      supabase.from("portfolio_positions").select("id, portfolios!inner(owner_id)", { count: "exact", head: true }).eq("portfolios.owner_id", user.id),
      supabase.from("rebalance_recommendations").select("id", { count: "exact", head: true }).eq("owner_id", user.id),
      supabase.from("rebalancing_runs").select("id", { count: "exact", head: true }).eq("owner_id", user.id),
      supabase.from("rebalancing_runs").select("summary, completed_at").eq("owner_id", user.id).order("completed_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("symbols").select("last_quote_sync_at").order("last_quote_sync_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("quote_refresh_runs").select("summary, completed_at").order("completed_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("analyst_target_snapshots").select("id", { count: "exact", head: true }),
      supabase.from("symbol_price_history").select("id", { count: "exact", head: true }),
      supabase.from("analyst_target_performance").select("id", { count: "exact", head: true }),
      supabase.from("analyst_target_snapshots").select("captured_at").order("captured_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("symbol_price_history").select("captured_at").order("captured_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    symbolCount = String(symbolsCountResult.count ?? 0);
    positionCount = String(positionsCountResult.count ?? 0);
    rebalanceRecommendationCount = String(rebalanceRecommendationsCountResult.count ?? 0);
    rebalanceRunCount = String(rebalanceRunsCountResult.count ?? 0);
    latestRebalanceRunSummary = latestRebalanceRunResult.data?.summary || null;
    latestQuoteSync = latestQuoteSyncResult.data?.last_quote_sync_at || null;
    latestCentralQuoteRunSummary = latestCentralQuoteRunResult.data?.summary || null;
    targetSnapshotCount = String(targetSnapshotCountResult.count ?? 0);
    priceHistoryCount = String(priceHistoryCountResult.count ?? 0);
    performanceEvaluationCount = String(performanceEvaluationCountResult.count ?? 0);
    latestTargetSnapshot = latestTargetSnapshotResult.data?.captured_at || null;
    latestPriceHistory = latestPriceHistoryResult.data?.captured_at || null;
  }

  const marketHoursState = getMarketHoursState();

  const stats = [
    { label: "Symbols", value: symbolCount, detail: latestQuoteSync ? `Last quote sync ${formatAppDateTime(latestQuoteSync)}` : "Waiting for first quote refresh" },
    { label: "Positions", value: positionCount, detail: "Current portfolio holdings" },
    { label: "Rebalance Items", value: rebalanceRecommendationCount, detail: rebalanceRecommendationCount === "0" ? "No active rebalance items yet" : "Open portfolio actions" },
    { label: "Rebalance Runs", value: rebalanceRunCount, detail: rebalanceRunCount === "0" ? "No saved rebalance history yet" : "Saved plan history" },
  ];

  const performanceStats = [
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

  const statusCards = [
    {
      title: "Portfolio foundation",
      status: "Live",
      body: "Positions, cash, allocation, edit flows, and portfolio-scoped views are in place.",
    },
    {
      title: "Market data layer",
      status: "Live",
      body: "Central quote refresh, FMP/Yahoo fallback, FX refresh, fundamentals, and quote run history are wired.",
    },
    {
      title: "Estimate tracking",
      status: "Live + warming up",
      body: "Daily pace, implied upside, and expectation-vs-actual popout charts work now. Formal hit rate and average alpha will fill as 90/180/365-day windows mature.",
    },
    {
      title: "AI research and rebalancing",
      status: "MVP live",
      body: "Research, recommendation history, portfolio actions, and rebalance summaries exist; the next lift is making the assistant more proactive and explainable.",
    },
  ];

  const nextBuildTargets = [
    {
      title: "Make the dashboard decision-first",
      body: "Surface the 3-5 most important portfolio signals automatically: stale data, big upside changes, position drift, and names falling behind their expectation path.",
    },
    {
      title: "Deepen symbol detail pages",
      body: "Add a single-symbol workspace with price history, target history, fundamentals, research notes, and the expectation-vs-actual chart in one place.",
    },
    {
      title: "Turn rebalancing into an AI copilot loop",
      body: "Let the app explain why a rebalance matters, what changed since the last run, and what action is safest to take next.",
    },
  ];

  const operatingNotes = [
    "Core portfolio tracking is usable now.",
    "Performance tracking has immediate daily visibility, while historical reliability metrics are intentionally still warming up.",
    "The highest leverage next step is reducing noise: fewer pages that just display data, more surfaces that tell you what changed and why it matters.",
  ];

  return (
    <AppShell viewer={user}>
      <div className="space-y-6">
        <SectionCard
          title="Portfolio Intelligence command center"
          description="A snapshot of where the application is today, what is live, what is warming up, and what should come next."
        >
          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-4">
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-zinc-300">
                <span className="font-medium text-emerald-300">{hasSupabaseEnv() ? "System configured and running" : "System not configured yet"}</span>
                <span className="text-zinc-400"> · core portfolio, market data, research, rebalancing, and performance views are online.</span>
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
        </SectionCard>

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <SectionCard
            title="Application state"
            description="What is already working and what is still maturing."
          >
            <div className="grid gap-4 md:grid-cols-2">
              {statusCards.map((card) => (
                <div key={card.title} className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-base font-semibold text-zinc-100">{card.title}</h3>
                    <span className="shrink-0 rounded-full border border-sky-800/70 bg-sky-950/30 px-2.5 py-1 text-xs font-medium text-sky-300">{card.status}</span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-zinc-400">{card.body}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          <div className="space-y-6">
            <SectionCard
              title="What comes next"
              description="Highest-leverage follow-ups from here."
            >
              <ul className="space-y-3 text-sm text-zinc-300">
                {nextBuildTargets.map((item) => (
                  <li key={item.title} className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3">
                    <p className="font-semibold text-zinc-100">{item.title}</p>
                    <p className="mt-1 leading-6 text-zinc-400">{item.body}</p>
                  </li>
                ))}
              </ul>
            </SectionCard>

            <SectionCard
              title="Operating notes"
              description="How to think about the app right now."
            >
              <ul className="space-y-3 text-sm text-zinc-300">
                {operatingNotes.map((item) => (
                  <li key={item} className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3 leading-6 text-zinc-400">
                    {item}
                  </li>
                ))}
              </ul>
            </SectionCard>

            <SectionCard
              title="Latest signal"
              description="Most recent operating summary."
            >
              <div className="rounded-2xl border border-dashed border-zinc-700 p-4 text-sm leading-6 text-zinc-400">
                {latestRebalanceRunSummary || latestCentralQuoteRunSummary || "No rebalance runs yet."}
              </div>
            </SectionCard>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
