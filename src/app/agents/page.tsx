import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireUser } from "@/lib/auth";
import { formatAppDateTime } from "@/lib/time";

type AgentOutputRow = {
  id: string;
  agent_name: string;
  scope_type: string | null;
  scope_key: string | null;
  stance: string | null;
  normalized_score: number | null;
  confidence_score: number | null;
  action_bias: string | null;
  target_weight_delta: number | null;
  summary: string | null;
  thesis: string | null;
  created_at: string;
  symbols: { id: string; ticker: string; name: string | null } | { id: string; ticker: string; name: string | null }[] | null;
};

function firstRelation<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

export default async function AgentsPage() {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const { data: agentOutputs } = supabase
    ? await supabase
        .from("agent_outputs")
        .select("id, agent_name, scope_type, scope_key, stance, normalized_score, confidence_score, action_bias, target_weight_delta, summary, thesis, created_at, symbols(id, ticker, name)")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50)
    : { data: [] as AgentOutputRow[] };

  const latestBySymbol = new Map<string, AgentOutputRow[]>();
  const globalOutputs: AgentOutputRow[] = [];

  (agentOutputs || []).forEach((row) => {
    if (row.scope_type === "global") {
      if (globalOutputs.length < 4) {
        globalOutputs.push(row);
      }
      return;
    }

    const symbol = firstRelation(row.symbols);
    if (!symbol?.ticker) {
      return;
    }

    const existing = latestBySymbol.get(symbol.ticker) || [];
    if (existing.length < 4) {
      existing.push(row);
      latestBySymbol.set(symbol.ticker, existing);
    }
  });

  return (
    <AppShell viewer={user}>
      <div className="space-y-6">
        <SectionCard
          title="Agent Detail"
          description="This page is the explainer for how news, bear case, macro, fundamentals, and synthesis combine into the final recommendation."
        >
          {globalOutputs.length ? (
            <div className="mb-4 rounded-2xl border border-indigo-800/60 bg-indigo-950/30 p-4">
              <div className="mb-3">
                <h3 className="text-base font-semibold text-zinc-100">Global Macro Agent</h3>
                <p className="mt-1 text-sm text-zinc-400">A shared global posture layer that the future synthesizer can use across all symbols.</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {globalOutputs.map((output) => (
                  <div key={output.id} className="rounded-xl border border-indigo-800/50 bg-zinc-900/60 p-3">
                    <p className="text-xs uppercase tracking-wide text-zinc-500">{output.agent_name}</p>
                    <p className="mt-2 text-sm font-medium text-zinc-100">{output.stance || "no stance"}</p>
                    <p className="mt-1 text-sm text-zinc-400">{output.summary || output.thesis || "No summary yet."}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-400">
                      {output.normalized_score !== null ? <span className="rounded-full border border-zinc-700 px-2 py-1">Score {output.normalized_score}</span> : null}
                      {output.confidence_score !== null ? <span className="rounded-full border border-zinc-700 px-2 py-1">Confidence {output.confidence_score}</span> : null}
                      {output.action_bias ? <span className="rounded-full border border-zinc-700 px-2 py-1">Bias {output.action_bias}</span> : null}
                    </div>
                    <p className="mt-3 text-xs text-zinc-500">{formatAppDateTime(output.created_at)}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {[...latestBySymbol.entries()].length ? (
            <div className="space-y-4">
              {[...latestBySymbol.entries()].map(([ticker, outputs]) => {
                const symbol = firstRelation(outputs[0]?.symbols);
                return (
                  <div key={ticker} className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-base font-semibold text-zinc-100">
                          {ticker}
                          <span className="ml-2 text-zinc-400">{symbol?.name || "Tracked symbol"}</span>
                        </h3>
                        <p className="mt-1 text-sm text-zinc-400">Latest structured agent outputs for this symbol, including the bullish case, the bear case, and the macro-aware synthesis inputs.</p>
                      </div>
                      {symbol?.id ? (
                        <Link href={`/symbols`} className="rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:border-zinc-500">
                          View symbols
                        </Link>
                      ) : null}
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {outputs.map((output) => (
                        <div key={output.id} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                          <p className="text-xs uppercase tracking-wide text-zinc-500">{output.agent_name}</p>
                          <p className="mt-2 text-sm font-medium text-zinc-100">{output.stance || "no stance"}</p>
                          <p className="mt-1 text-sm text-zinc-400">{output.summary || output.thesis || "No summary yet."}</p>
                          <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-400">
                            {output.normalized_score !== null ? <span className="rounded-full border border-zinc-700 px-2 py-1">Score {output.normalized_score}</span> : null}
                            {output.confidence_score !== null ? <span className="rounded-full border border-zinc-700 px-2 py-1">Confidence {output.confidence_score}</span> : null}
                            {output.action_bias ? <span className="rounded-full border border-zinc-700 px-2 py-1">Bias {output.action_bias}</span> : null}
                            {output.target_weight_delta !== null ? <span className="rounded-full border border-zinc-700 px-2 py-1">Δ {output.target_weight_delta}%</span> : null}
                          </div>
                          <p className="mt-3 text-xs text-zinc-500">{formatAppDateTime(output.created_at)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">
              No structured agent outputs yet. Run news research to populate the live News Agent, Bear Case Agent, and global Macro Agent outputs here.
            </div>
          )}
        </SectionCard>
      </div>
    </AppShell>
  );
}
