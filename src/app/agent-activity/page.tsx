import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { createSupabaseServerClient } from "@/lib/supabase-server";

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

export default async function AgentActivityPage() {
  const supabase = await createSupabaseServerClient();
  const { data: agentRuns } = supabase
    ? await supabase.from("agent_runs").select("id, agent_name, run_type, status, summary, started_at, completed_at, created_at").order("created_at", { ascending: false }).limit(20)
    : { data: [] as AgentRunRow[] };

  return (
    <AppShell>
      <SectionCard
        title="Agent Activity"
        description="Manual market refreshes and future automated jobs show up here as an audit trail."
      >
        <div className="grid gap-4 lg:grid-cols-[1.4fr_0.6fr]">
          <div className="space-y-3">
            {agentRuns && agentRuns.length > 0 ? (
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
                    {run.agent_name} · {new Date(run.created_at).toLocaleString()}
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">
                No runs recorded yet. Use the manual refresh action on the dashboard to create the first tracked run.
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
            <h3 className="text-base font-semibold text-zinc-100">Planned next feeds</h3>
            <ul className="mt-2 space-y-2 text-sm text-zinc-400">
              <li>Scheduled quote refreshes</li>
              <li>Recommendation regeneration runs</li>
              <li>Portfolio rebalance review runs</li>
              <li>Eventually, AI explanation jobs</li>
            </ul>
          </div>
        </div>
      </SectionCard>
    </AppShell>
  );
}
