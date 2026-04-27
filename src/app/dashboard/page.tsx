import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { RefreshMarketDataForm } from "@/components/refresh-market-data-form";
import { RunNewsResearchForm } from "@/components/run-news-research-form";
import { nextBuildTargets, roadmapCards } from "@/lib/mock-data";
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
    { label: "Tracked Symbols", value: symbolCount, detail: latestQuoteSync ? `Last quote sync ${formatAppDateTime(latestQuoteSync)}` : "Quote sync ready" },
    { label: "Core Positions", value: positionCount, detail: "Live portfolio positions tracked" },
    { label: "Rebalance Items", value: rebalanceRecommendationCount, detail: latestRebalanceRunSummary || "Latest rebalance recommendations are ready" },
    { label: "Rebalance Runs", value: rebalanceRunCount, detail: latestRebalanceRunSummary || "Generate a rebalance plan to start run history" },
    { label: "Research Insights", value: researchInsightCount, detail: latestResearchRunSummary || "Legacy research layer is still available" },
  ];

  return (
    <AppShell viewer={user}>
      <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
        <div className="space-y-6">
          <SectionCard
            title="Mission control"
            description="This dashboard should read like a rebalance operating view: what holdings exist, what plans have been generated, and what data is current."
          >
            <div className="mb-4 space-y-3">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">
                System status: {hasSupabaseEnv() ? "configured and running" : "not configured yet, add env vars before deployment"}
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
            description="This reflects the real product state right now, what has already landed, what still feels transitional, and the best next moves from here."
          >
            <div className="grid gap-4 lg:grid-cols-2">
              {roadmapCards.map((card) => (
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
            description="The highest-leverage follow-ups now that cash-aware rebalancing support and live schema updates are in place."
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
            description="Recent evidence from rebalance runs, quote refresh, and the remaining research support stack."
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
