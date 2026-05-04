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

  if (supabase) {
    const [
      symbolsCountResult,
      positionsCountResult,
      rebalanceRecommendationsCountResult,
      rebalanceRunsCountResult,
      latestRebalanceRunResult,
      latestQuoteSyncResult,
      latestCentralQuoteRunResult,
    ] = await Promise.all([
      supabase.from("symbols").select("id", { count: "exact", head: true }),
      supabase.from("portfolio_positions").select("id, portfolios!inner(owner_id)", { count: "exact", head: true }).eq("portfolios.owner_id", user.id),
      supabase.from("rebalance_recommendations").select("id", { count: "exact", head: true }).eq("owner_id", user.id),
      supabase.from("rebalancing_runs").select("id", { count: "exact", head: true }).eq("owner_id", user.id),
      supabase.from("rebalancing_runs").select("summary, completed_at").eq("owner_id", user.id).order("completed_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("symbols").select("last_quote_sync_at").order("last_quote_sync_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("quote_refresh_runs").select("summary, completed_at").order("completed_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    symbolCount = String(symbolsCountResult.count ?? 0);
    positionCount = String(positionsCountResult.count ?? 0);
    rebalanceRecommendationCount = String(rebalanceRecommendationsCountResult.count ?? 0);
    rebalanceRunCount = String(rebalanceRunsCountResult.count ?? 0);
    latestRebalanceRunSummary = latestRebalanceRunResult.data?.summary || null;
    latestQuoteSync = latestQuoteSyncResult.data?.last_quote_sync_at || null;
    latestCentralQuoteRunSummary = latestCentralQuoteRunResult.data?.summary || null;
  }

  const marketHoursState = getMarketHoursState();

  const stats = [
    { label: "Tracked Symbols", value: symbolCount, detail: latestQuoteSync ? `Last quote sync ${formatAppDateTime(latestQuoteSync)}` : "Quote refresh path is live" },
    { label: "Core Positions", value: positionCount, detail: "Portfolio holdings and market value tracking" },
    { label: "Rebalance Items", value: rebalanceRecommendationCount, detail: latestRebalanceRunSummary || "Rebalance outputs are available once a plan is generated" },
    { label: "Rebalance Runs", value: rebalanceRunCount, detail: latestRebalanceRunSummary || "Generate a rebalance plan to build decision history" },
  ];

  const progressCards = [
    {
      title: "What is working now",
      body:
        "The app now has a stable shared market-data pipeline: tracked symbols refresh through one central quote flow, portfolio and performance pages read stored snapshots, and external scheduling is live in production.",
    },
    {
      title: "Performance tracking status",
      body:
        "The performance module is wired correctly now. Quote refresh captures downstream target and price history state, and scheduled performance evaluation is running, though meaningful scored results will only accumulate once snapshots age into the 90, 180, and 365 day windows.",
    },
    {
      title: "Provider and symbol coverage",
      body:
        "Symbol discovery and profile enrichment are FMP-backed, quote refresh uses the same pipeline, and Yahoo fallback still helps for some coverage gaps. Canadian exact-ticker handling is materially better than before, especially for exchange-specific naming.",
    },
    {
      title: "What still feels transitional",
      body:
        "The product is in a stronger operational place now, but the UI still needs to do a better job explaining quote freshness, price source confidence, and how actual-vs-projected performance matures over time.",
    },
  ];

  const nextBuildTargets = [
    "Surface quote freshness and quote-source status more clearly across portfolio, symbols, and performance views.",
    "Add clearer performance-module onboarding so users understand why 90/180/365 day evaluation history starts sparse and improves over time.",
    "Build richer symbol or holding detail views that connect current price, target path, and rebalance rationale in one place.",
    "Tighten the portfolio and performance pages so the product feels like a disciplined portfolio operating workspace.",
    "Decide whether watchlists should stay as a lightweight intake surface or be folded more tightly into the core portfolio workflow.",
  ];

  return (
    <AppShell viewer={user}>
      <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
        <div className="space-y-6">
          <SectionCard
            title="Mission control"
            description="This dashboard is the operating view for the project right now: what is live in production, how the shared quote and performance pipeline is behaving, and what the next product moves should be."
          >
            <div className="mb-4 space-y-3">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">
                System status: {hasSupabaseEnv() ? "configured and running" : "not configured yet, add env vars before deployment"}. Core product state: the app now has a stable central quote refresh pipeline, external scheduling is active, performance history tables are live, and the rebalance-first workflow is in a much more production-ready place than before.
              </div>
              <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4 text-sm text-zinc-300">
                Central quote scheduler: <span className="font-medium text-zinc-100">{marketHoursState.cadenceLabel === "market-hours" ? "market hours mode" : "off hours mode"}</span>
                <span className="text-zinc-400"> · recommended cadence every {marketHoursState.recommendedEveryMinutes} minutes ({getAppTimeZoneLabel()})</span>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              {stats.map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                  <p className="text-xs uppercase tracking-wide text-zinc-500">{stat.label}</p>
                  <p className="mt-3 text-3xl font-bold text-zinc-50">{stat.value}</p>
                  <p className="mt-2 text-sm text-zinc-400">{stat.detail}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            title="Current state and next steps"
            description="This reflects what is actually implemented today, what has become stable recently, and the best product moves from here."
          >
            <div className="grid gap-4 lg:grid-cols-2">
              {progressCards.map((card) => (
                <div key={card.title} className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                  <h3 className="text-base font-semibold text-zinc-100">{card.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">{card.body}</p>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard
            title="Next build sequence"
            description="The highest-leverage follow-ups now that the shared quote pipeline, external scheduler, and performance-history foundation are all working in production."
          >
            <ul className="space-y-3 text-sm text-zinc-300">
              {nextBuildTargets.map((item) => (
                <li key={item} className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3">
                  {item}
                </li>
              ))}
            </ul>
          </SectionCard>

          <RefreshMarketDataForm />

          <SectionCard
            title="Latest operating signal"
            description="Recent evidence from rebalance runs, quote refreshes, and the now-working performance data pipeline around the core portfolio workflow."
          >
            <div className="rounded-2xl border border-dashed border-zinc-700 p-4 text-sm text-zinc-400">
              {latestRebalanceRunSummary || latestCentralQuoteRunSummary || "No rebalance runs yet. Generate a plan to start building operating history."}
            </div>
          </SectionCard>
        </div>
      </div>
    </AppShell>
  );
}
