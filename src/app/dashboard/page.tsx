import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { RefreshMarketDataForm } from "@/components/refresh-market-data-form";
import { nextBuildTargets, roadmapCards } from "@/lib/mock-data";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireUser } from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/env";

export default async function DashboardPage() {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  let symbolCount = "0";
  let positionCount = "0";
  let openRecommendationCount = "0";
  let acceptedRecommendationCount = "0";
  let dismissedRecommendationCount = "0";
  let agentRunCount = "0";
  let latestRunSummary: string | null = null;
  let latestQuoteSync: string | null = null;

  if (supabase) {
    const [
      symbolsCountResult,
      positionsCountResult,
      openRecommendationsCountResult,
      acceptedRecommendationsCountResult,
      dismissedRecommendationsCountResult,
      agentRunsCountResult,
      latestAgentRunResult,
      latestQuoteSyncResult,
    ] = await Promise.all([
      supabase.from("symbols").select("id", { count: "exact", head: true }),
      supabase.from("portfolio_positions").select("id, portfolios!inner(owner_id)", { count: "exact", head: true }).eq("portfolios.owner_id", user.id),
      supabase.from("recommendations").select("id", { count: "exact", head: true }).eq("owner_id", user.id).eq("status", "open"),
      supabase.from("recommendations").select("id", { count: "exact", head: true }).eq("owner_id", user.id).eq("status", "accepted"),
      supabase.from("recommendations").select("id", { count: "exact", head: true }).eq("owner_id", user.id).eq("status", "dismissed"),
      supabase.from("agent_runs").select("id", { count: "exact", head: true }).eq("owner_id", user.id),
      supabase.from("agent_runs").select("summary, completed_at").eq("owner_id", user.id).order("completed_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("symbols").select("last_quote_sync_at").order("last_quote_sync_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    symbolCount = String(symbolsCountResult.count ?? 0);
    positionCount = String(positionsCountResult.count ?? 0);
    openRecommendationCount = String(openRecommendationsCountResult.count ?? 0);
    acceptedRecommendationCount = String(acceptedRecommendationsCountResult.count ?? 0);
    dismissedRecommendationCount = String(dismissedRecommendationsCountResult.count ?? 0);
    agentRunCount = String(agentRunsCountResult.count ?? 0);
    latestRunSummary = latestAgentRunResult.data?.summary || null;
    latestQuoteSync = latestQuoteSyncResult.data?.last_quote_sync_at || null;
  }

  const stats = [
    { label: "Tracked Symbols", value: symbolCount, detail: latestQuoteSync ? `Last quote sync ${new Date(latestQuoteSync).toLocaleString()}` : "Quote sync ready" },
    { label: "Core Positions", value: positionCount, detail: "Live portfolio positions tracked" },
    { label: "Open Recommendations", value: openRecommendationCount, detail: `Accepted ${acceptedRecommendationCount} · Dismissed ${dismissedRecommendationCount}` },
    { label: "Agent Runs", value: agentRunCount, detail: latestRunSummary || "Manual market refreshes log here" },
  ];

  return (
    <AppShell viewer={user}>
      <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
        <div className="space-y-6">
          <SectionCard
            title="Mission control"
            description="The MVP spine is now live. This dashboard tracks portfolio state, recommendation coverage, and market data freshness."
          >
            <div className="mb-4 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">
              Supabase status: {hasSupabaseEnv() ? "configured" : "not configured yet, add env vars before deployment"}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
            title="Build roadmap"
            description="The shell phase is behind us. The roadmap now reflects the real MVP path already underway."
          >
            <div className="grid gap-4 lg:grid-cols-3">
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
            title="Next build targets"
            description="What we should wire next based on the product state that exists today."
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
            title="Agent status"
            description="Manual sync runs and future automation status surface here."
          >
            <div className="rounded-2xl border border-dashed border-zinc-700 p-4 text-sm text-zinc-400">
              {latestRunSummary || "No refresh runs yet. Use the refresh action above to pull live market data for all tracked symbols."}
            </div>
          </SectionCard>
        </div>
      </div>
    </AppShell>
  );
}
