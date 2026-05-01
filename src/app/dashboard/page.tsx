import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { RefreshMarketDataForm } from "@/components/refresh-market-data-form";
import { RunNewsResearchForm } from "@/components/run-news-research-form";
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
  let researchInsightCount = "0";
  let latestResearchRunSummary: string | null = null;

  if (supabase) {
    const [
      symbolsCountResult,
      positionsCountResult,
      rebalanceRecommendationsCountResult,
      rebalanceRunsCountResult,
      latestRebalanceRunResult,
      latestQuoteSyncResult,
      latestCentralQuoteRunResult,
      researchInsightCountResult,
      latestResearchRunResult,
    ] = await Promise.all([
      supabase.from("symbols").select("id", { count: "exact", head: true }),
      supabase.from("portfolio_positions").select("id, portfolios!inner(owner_id)", { count: "exact", head: true }).eq("portfolios.owner_id", user.id),
      supabase.from("rebalance_recommendations").select("id", { count: "exact", head: true }).eq("owner_id", user.id),
      supabase.from("rebalancing_runs").select("id", { count: "exact", head: true }).eq("owner_id", user.id),
      supabase.from("rebalancing_runs").select("summary, completed_at").eq("owner_id", user.id).order("completed_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("symbols").select("last_quote_sync_at").order("last_quote_sync_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("quote_refresh_runs").select("summary, completed_at").order("completed_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("research_insights").select("id", { count: "exact", head: true }).eq("owner_id", user.id),
      supabase.from("research_runs").select("summary, completed_at").eq("owner_id", user.id).order("completed_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    symbolCount = String(symbolsCountResult.count ?? 0);
    positionCount = String(positionsCountResult.count ?? 0);
    rebalanceRecommendationCount = String(rebalanceRecommendationsCountResult.count ?? 0);
    rebalanceRunCount = String(rebalanceRunsCountResult.count ?? 0);
    latestRebalanceRunSummary = latestRebalanceRunResult.data?.summary || null;
    latestQuoteSync = latestQuoteSyncResult.data?.last_quote_sync_at || null;
    latestCentralQuoteRunSummary = latestCentralQuoteRunResult.data?.summary || null;
    researchInsightCount = String(researchInsightCountResult.count ?? 0);
    latestResearchRunSummary = latestResearchRunResult.data?.summary || null;
  }

  const marketHoursState = getMarketHoursState();

  const stats = [
    { label: "Tracked Symbols", value: symbolCount, detail: latestQuoteSync ? `Last quote sync ${formatAppDateTime(latestQuoteSync)}` : "Quote refresh path is live" },
    { label: "Core Positions", value: positionCount, detail: "Portfolio holdings and market value tracking" },
    { label: "Rebalance Items", value: rebalanceRecommendationCount, detail: latestRebalanceRunSummary || "Rebalance outputs are available once a plan is generated" },
    { label: "Rebalance Runs", value: rebalanceRunCount, detail: latestRebalanceRunSummary || "Generate a rebalance plan to build decision history" },
    { label: "Research Insights", value: researchInsightCount, detail: latestResearchRunSummary || "Research is now a support layer, not the core product story" },
  ];

  const progressCards = [
    {
      title: "What is working now",
      body:
        "The portfolio shell is live, symbols can be imported from FMP, positions and cash-aware portfolio views are working, and the rebalance-first framing is now the main product direction.",
    },
    {
      title: "Provider migration status",
      body:
        "Symbol discovery and profile enrichment have moved to FMP. Quote refresh now also runs through FMP, with a fallback that derives price and daily move from profile data when quote access is blocked on the current plan.",
    },
    {
      title: "Canadian listings progress",
      body:
        "Exact-ticker import is now more reliable for Canadian listings like TSX and NEO symbols. We confirmed that naming differs by exchange, for example NVDA.NE works while NVDA.TO does not.",
    },
    {
      title: "What still feels transitional",
      body:
        "Quote coverage is still partly constrained by the active FMP subscription tier, and some dashboard language still needs to evolve from a research-heavy prototype into a cleaner portfolio operating product.",
    },
  ];

  const nextBuildTargets = [
    "Add a clearer symbol-picker experience that shows exchange and currency before import, especially for dual-listed and Canadian names.",
    "Surface quote-source status in the UI so users can tell when a price came from direct quotes versus profile-derived fallback data.",
    "Add symbol detail pages or richer holding views that explain current price, target price, and rebalance rationale in one place.",
    "Tighten the dashboard and portfolio copy so the product reads as a practical rebalancing workspace, not a stock-picking lab.",
    "Decide whether Canadian quote coverage should rely on the current FMP workaround or whether a stronger market-data provider is worth adding later.",
  ];

  return (
    <AppShell viewer={user}>
      <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
        <div className="space-y-6">
          <SectionCard
            title="Mission control"
            description="This dashboard is the operating view for the project right now: what is live in production, how the provider migration is going, and what the next product moves should be."
          >
            <div className="mb-4 space-y-3">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">
                System status: {hasSupabaseEnv() ? "configured and running" : "not configured yet, add env vars before deployment"}. Core product state: the app has moved into a rebalance-first workflow, FMP-backed symbol import is live, and Canadian ticker support is now materially better than before even though quote coverage still depends on provider plan limits.
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
            description="This reflects what is actually implemented today, what still feels transitional, and the best product moves from here."
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
            description="The highest-leverage follow-ups now that FMP import is live, quote refresh is aligned to the same provider, and Canadian symbol handling has improved."
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

          <RunNewsResearchForm />

          <SectionCard
            title="Latest operating signal"
            description="Recent evidence from rebalance runs, quote refreshes, and the remaining support layers around the core portfolio workflow."
          >
            <div className="rounded-2xl border border-dashed border-zinc-700 p-4 text-sm text-zinc-400">
              {latestRebalanceRunSummary || latestResearchRunSummary || latestCentralQuoteRunSummary || "No rebalance runs yet. Generate a plan to start building operating history."}
            </div>
          </SectionCard>
        </div>
      </div>
    </AppShell>
  );
}
