import { AppShell } from "@/components/app-shell";
import { ResearchSymbolCard } from "@/components/research-symbol-card";
import { SectionCard } from "@/components/section-card";
import { RunNewsResearchForm } from "@/components/run-news-research-form";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireUser } from "@/lib/auth";
import { formatConfidencePercent } from "@/lib/agent-output-format";
import { formatAppDateTime, getAppTimeZoneLabel } from "@/lib/time";

type EvidenceItem = {
  title?: string;
  source?: string | null;
  published_at?: string | null;
  snippet?: string | null;
  url?: string;
  source_type?: string;
};

type ResearchInsightRow = {
  id: string;
  title: string;
  summary: string | null;
  thesis: string | null;
  direction: string | null;
  confidence_score: number | null;
  time_horizon: string | null;
  evidence_json: EvidenceItem[] | null;
  source_urls_json: string[] | null;
  created_at: string;
  expires_at: string | null;
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
        .select("id, title, summary, thesis, direction, confidence_score, time_horizon, evidence_json, source_urls_json, created_at, expires_at, symbols(ticker, name), research_runs(agent_name, run_type, created_at)")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30)
    : { data: [] as ResearchInsightRow[] };

  const latestInsightsBySymbol = new Map<string, ResearchInsightRow>();
  (insights || []).forEach((insight) => {
    const symbol = firstRelation(insight.symbols);
    if (!symbol?.ticker || latestInsightsBySymbol.has(symbol.ticker)) {
      return;
    }

    latestInsightsBySymbol.set(symbol.ticker, insight);
  });

  const latestInsights = [...latestInsightsBySymbol.values()];
  const corroboratedCount = latestInsights.filter((insight) => {
    const evidence = insight.evidence_json || [];
    const sourceTypes = new Set(evidence.map((item) => item.source_type).filter(Boolean));
    return sourceTypes.size > 1;
  }).length;

  return (
    <AppShell viewer={user}>
      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-6">
          <SectionCard
            title="Research Archive"
            description={`This area is now a secondary support layer for the portfolio product. It keeps optional thesis, corroboration, and source evidence in one place. Times shown in ${getAppTimeZoneLabel()}.`}
          >
            {latestInsights.length > 0 ? (
              <div className="space-y-3">
                {latestInsights.map((insight) => {
                  const symbol = firstRelation(insight.symbols);
                  const evidence = insight.evidence_json || [];

                  return (
                    <ResearchSymbolCard
                      key={insight.id}
                      ticker={symbol?.ticker || "Shared"}
                      name={symbol?.name || insight.title}
                      summary={insight.summary || "No summary provided."}
                      thesis={insight.thesis}
                      direction={insight.direction}
                      confidenceScore={insight.confidence_score}
                      createdAt={insight.created_at}
                      expiresAt={insight.expires_at}
                      evidence={evidence}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">
                No archived research insights yet. Run a news pass only if you want extra supporting context for a portfolio decision.
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Recent research runs"
            description="Raw research artifacts remain visible here for auditability, but this is no longer the core product surface."
          >
            {insights && insights.length > 0 ? (
              <div className="space-y-3">
                {insights.slice(0, 10).map((insight) => {
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
                            {insight.direction || "mixed"}
                            {typeof insight.confidence_score === "number" ? ` · ${formatConfidencePercent(insight.confidence_score)} confidence` : ""}
                          </p>
                        </div>
                        <span className="rounded-full border border-zinc-700 px-2 py-1 text-xs text-zinc-300">{run?.run_type || "research"}</span>
                      </div>
                      <p className="mt-3 text-sm text-zinc-300">{insight.summary || "No summary provided."}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-400">
                        <span className="rounded-full border border-zinc-700 px-2 py-1">{run?.agent_name || "agent"}</span>
                        <span className="rounded-full border border-zinc-700 px-2 py-1">{formatAppDateTime(insight.created_at)}</span>
                        {insight.source_urls_json?.length ? <span className="rounded-full border border-zinc-700 px-2 py-1">{insight.source_urls_json.length} URLs</span> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </SectionCard>
        </div>

        <div className="space-y-6">
          <RunNewsResearchForm />

          <SectionCard title="Research status" description="Secondary support layer for portfolio decisions, not the main workflow.">
            <ul className="space-y-3 text-sm text-zinc-300">
              <li className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3">Latest symbol snapshots: {latestInsights.length}</li>
              <li className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3">Corroborated by multiple feeds: {corroboratedCount}</li>
              <li className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3">Primary sources: Finnhub company news + Google News RSS</li>
              <li className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3">Goal: optional supporting context for rebalance decisions, not the core product engine</li>
            </ul>
          </SectionCard>
        </div>
      </div>
    </AppShell>
  );
}
