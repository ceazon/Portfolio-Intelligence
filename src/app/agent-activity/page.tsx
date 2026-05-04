import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireUser } from "@/lib/auth";
import { formatAppDateTime, getAppTimeZoneLabel } from "@/lib/time";

type AgentRunRow = {
  id: string;
  agent_name: string;
  run_type: string;
  status: string;
  summary: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

type RecommendationRunRow = {
  id: string;
  trigger_type: string;
  target_type: string;
  status: string;
  summary: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

type ResearchRunRow = {
  id: string;
  agent_name: string;
  run_type: string;
  scope_type: string;
  scope_key: string | null;
  status: string;
  summary: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

type QuoteRefreshRunRow = {
  id: string;
  trigger_type: string;
  cadence_label: string | null;
  status: string;
  symbols_considered: number;
  symbols_refreshed: number;
  summary: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

export default async function AgentActivityPage() {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const [agentRunsResult, recommendationRunsResult, researchRunsResult, quoteRefreshRunsResult] = supabase
    ? await Promise.all([
        supabase
          .from("agent_runs")
          .select("id, agent_name, run_type, status, summary, started_at, completed_at, created_at")
          .eq("owner_id", user.id)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("recommendation_runs")
          .select("id, trigger_type, target_type, status, summary, started_at, completed_at, created_at")
          .eq("owner_id", user.id)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("research_runs")
          .select("id, agent_name, run_type, scope_type, scope_key, status, summary, started_at, completed_at, created_at")
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("quote_refresh_runs")
          .select("id, trigger_type, cadence_label, status, symbols_considered, symbols_refreshed, summary, started_at, completed_at, created_at")
          .order("created_at", { ascending: false })
          .limit(20),
      ])
    : [
        { data: [] as AgentRunRow[] },
        { data: [] as RecommendationRunRow[] },
        { data: [] as ResearchRunRow[] },
        { data: [] as QuoteRefreshRunRow[] },
      ];

  const agentRuns = agentRunsResult.data || [];
  const recommendationRuns = recommendationRunsResult.data || [];
  const researchRuns = researchRunsResult.data || [];
  const quoteRefreshRuns = quoteRefreshRunsResult.data || [];

  return (
    <AppShell viewer={user}>
      <div className="space-y-6">
        <SectionCard
          title="Operations Log"
          description={`Operational runs are split into sync jobs, recommendation runs, and older research support runs. All timestamps shown in ${getAppTimeZoneLabel()}.`}
        >
          <div className="grid gap-4 lg:grid-cols-[1.4fr_0.6fr]">
            <div className="space-y-3">
              {agentRuns.length > 0 ? (
                agentRuns.map((run) => (
                  <div key={run.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-base font-semibold text-zinc-100">{run.run_type}</h3>
                        <p className="mt-1 text-sm text-zinc-400">{run.summary || "No summary provided."}</p>
                      </div>
                      <span className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300">{run.status}</span>
                    </div>
                    <p className="mt-3 text-xs uppercase tracking-wide text-zinc-500">
                      {run.agent_name} · {formatAppDateTime(run.created_at)}
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">
                  No sync runs recorded yet.
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
              <h3 className="text-base font-semibold text-zinc-100">Operational feeds</h3>
              <ul className="mt-2 space-y-2 text-sm text-zinc-400">
                <li>Quote refresh runs</li>
                <li>Recommendation generation runs</li>
                <li>Research runs by agent type</li>
                <li>Future evaluation/retrospective runs</li>
              </ul>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Central Quote Refresh Runs"
          description="This is the shared quote scheduler execution history for the entire tracked symbol universe."
        >
          <div className="space-y-3">
            {quoteRefreshRuns.length > 0 ? (
              quoteRefreshRuns.map((run) => (
                <div key={run.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-base font-semibold text-zinc-100">{run.cadence_label || run.trigger_type}</h3>
                      <p className="mt-1 text-sm text-zinc-400">{run.summary || "No summary provided."}</p>
                    </div>
                    <span className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300">{run.status}</span>
                  </div>
                  <p className="mt-3 text-xs uppercase tracking-wide text-zinc-500">
                    Considered {run.symbols_considered} · Refreshed {run.symbols_refreshed} · {formatAppDateTime(run.created_at)}
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">
                No central quote refresh runs yet.
              </div>
            )}
          </div>
        </SectionCard>

        <SectionCard
          title="Recommendation Runs"
          description="Every recommendation generation should now be treated as a historical run, not a stateless overwrite."
        >
          <div className="space-y-3">
            {recommendationRuns.length > 0 ? (
              recommendationRuns.map((run) => (
                <div key={run.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-base font-semibold text-zinc-100">{run.target_type} · {run.trigger_type}</h3>
                      <p className="mt-1 text-sm text-zinc-400">{run.summary || "No summary provided."}</p>
                    </div>
                    <span className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300">{run.status}</span>
                  </div>
                  <p className="mt-3 text-xs uppercase tracking-wide text-zinc-500">
                    Run {run.id.slice(0, 8)} · {formatAppDateTime(run.created_at)}
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">
                No recommendation runs yet. Generate recommendations to establish historical runs.
              </div>
            )}
          </div>
        </SectionCard>

        <SectionCard
          title="Research Runs"
          description="This is the shared research execution layer we will plug market, news, macro, sector, and fundamentals agents into. The first end-to-end shared news pipeline now lands here."
        >
          <div className="space-y-3">
            {researchRuns.length > 0 ? (
              researchRuns.map((run) => (
                <div key={run.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-base font-semibold text-zinc-100">{run.run_type}</h3>
                      <p className="mt-1 text-sm text-zinc-400">{run.summary || "No summary provided yet."}</p>
                    </div>
                    <span className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300">{run.status}</span>
                  </div>
                  <p className="mt-3 text-xs uppercase tracking-wide text-zinc-500">
                    {run.agent_name} · {run.scope_type}{run.scope_key ? `:${run.scope_key}` : ""} · {formatAppDateTime(run.created_at)}
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">
                No research runs yet. This section is ready for the upcoming shared agent research pipeline.
              </div>
            )}
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}
