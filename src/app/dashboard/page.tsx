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
    { label: "Symbols", value: symbolCount, detail: latestQuoteSync ? `Last quote sync ${formatAppDateTime(latestQuoteSync)}` : "Waiting for first quote refresh" },
    { label: "Positions", value: positionCount, detail: "Current portfolio holdings" },
    { label: "Rebalance Items", value: rebalanceRecommendationCount, detail: rebalanceRecommendationCount === "0" ? "No active rebalance items yet" : "Open portfolio actions" },
    { label: "Rebalance Runs", value: rebalanceRunCount, detail: rebalanceRunCount === "0" ? "No saved rebalance history yet" : "Saved plan history" },
  ];

  const statusCards = [
    {
      title: "Portfolio",
      body: "Positions, cash, and allocation are editable in one place.",
    },
    {
      title: "Quotes",
      body: "Daily change now uses the chart close-to-close basis and matches the symbols view.",
    },
    {
      title: "Estimate tracking",
      body: "Snapshot capture and scheduled evaluation are live. Longer windows will fill in over time.",
    },
    {
      title: "Rebalancing",
      body: "Rebalance plans and portfolio actions are wired into the current workflow.",
    },
  ];

  const nextBuildTargets = [
    "Tighten quote freshness and source clarity across portfolio, symbols, and estimate tracking.",
    "Add clearer symbol and holding detail views.",
    "Keep simplifying the product around portfolio tracking and estimate comparison.",
  ];

  return (
    <AppShell viewer={user}>
      <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
        <div className="space-y-6">
          <SectionCard
            title="Dashboard"
            description="A compact view of portfolio state, quote refresh, and estimate tracking."
          >
            <div className="mb-4 space-y-3">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">
                {hasSupabaseEnv() ? "System configured and running." : "System not configured yet."}
              </div>
              <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4 text-sm text-zinc-300">
                Quote refresh: <span className="font-medium text-zinc-100">{marketHoursState.cadenceLabel === "market-hours" ? "market hours" : "off hours"}</span>
                <span className="text-zinc-400"> · every {marketHoursState.recommendedEveryMinutes} min ({getAppTimeZoneLabel()})</span>
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
            title="Current state"
            description="What is working right now."
          >
            <div className="grid gap-4 lg:grid-cols-2">
              {statusCards.map((card) => (
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
            title="Next"
            description="Highest-leverage follow-ups."
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
            title="Latest signal"
            description="Most recent operating summary."
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
