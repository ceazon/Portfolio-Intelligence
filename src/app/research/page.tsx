import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { RunNewsResearchForm } from "@/components/run-news-research-form";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireUser } from "@/lib/auth";
import { formatAppDateTime, getAppTimeZoneLabel } from "@/lib/time";

type ResearchInsightRow = {
  id: string;
  title: string;
  summary: string | null;
  thesis: string | null;
  direction: string | null;
  confidence_score: number | null;
  time_horizon: string | null;
  source_urls_json: string[] | null;
  created_at: string;
  symbols: { ticker: string; name: string | null } | { ticker: string; name: string | null }[] | null;
  research_runs:
    | { agent_name: string; run_type: string; created_at: string }
    | { agent_name: string; run_type: string; created_at: string }[]
    | null;
};

function firstRelation<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

export default async function ResearchPage() {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const { data: insights } = supabase
    ? await supabase
        .from("research_insights")
        .select("id, title, summary, thesis, direction, confidence_score, time_horizon, source_urls_json, created_at, symbols(ticker, name), research_runs(agent_name, run_type, created_at)")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30)
    : { data: [] as ResearchInsightRow[] };

  return (
    <AppShell viewer={user}>
      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-6">
          <SectionCard
            title="Shared Research Feed"
            description={`Reusable research artifacts live here so recommendations can eventually cite them instead of rethinking from scratch. Times shown in ${getAppTimeZoneLabel()}.`}
          >
            {insights && insights.length > 0 ? (
              <div className="space-y-3">
                {insights.map((insight) => {
                  const symbol = firstRelation(insight.symbols);
                  const run = firstRelation(insight.research_runs);

                  return (
                    <div key={insight.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-zinc-100">
                            {symbol?.ticker || "Shared"}
                            <span className="ml-2 text-zinc-400">{symbol?.name || insight.title}</span>
                          </p>
                          <p className="mt-1 text-xs uppercase tracking-wide text-zinc-500">
                            {insight.direction || "mixed"} · {insight.time_horizon || "days"} horizon
                            {typeof insight.confidence_score === "number" ? ` · ${insight.confidence_score}/100 confidence` : ""}
                          </p>
                        </div>
                        <span className="rounded-full border border-zinc-700 px-2 py-1 text-xs text-zinc-300">
                          {run?.run_type || "research"}
                        </span>
                      </div>

                      <p className="mt-3 text-sm text-zinc-300">{insight.summary || "No summary provided."}</p>
                      {insight.thesis ? <p className="mt-2 text-sm text-zinc-500">{insight.thesis}</p> : null}

                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-400">
                        <span className="rounded-full border border-zinc-700 px-2 py-1">{run?.agent_name || "agent"}</span>
                        <span className="rounded-full border border-zinc-700 px-2 py-1">{formatAppDateTime(insight.created_at)}</span>
                        {insight.source_urls_json?.length ? (
                          <span className="rounded-full border border-zinc-700 px-2 py-1">{insight.source_urls_json.length} sources</span>
                        ) : null}
                      </div>

                      {insight.source_urls_json?.length ? (
                        <div className="mt-3 space-y-1 text-sm text-sky-300">
                          {insight.source_urls_json.slice(0, 3).map((url: string) => (
                            <a key={url} href={url} target="_blank" rel="noreferrer" className="block truncate hover:text-sky-200">
                              {url}
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">
                No research insights yet. Run the first shared news pass to populate the feed.
              </div>
            )}
          </SectionCard>
        </div>

        <div className="space-y-6">
          <RunNewsResearchForm />

          <SectionCard
            title="First pipeline scope"
            description="This first slice is deliberately simple and reusable."
          >
            <ul className="space-y-3 text-sm text-zinc-300">
              <li className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3">Pull a shared tracked universe from portfolio and watchlist symbols.</li>
              <li className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3">Fetch recent grounded news results per symbol.</li>
              <li className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3">Store reusable insights in research_runs and research_insights.</li>
              <li className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3">Prepare the app for future recommendation evidence linking.</li>
            </ul>
          </SectionCard>
        </div>
      </div>
    </AppShell>
  );
}
