import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireUser } from "@/lib/auth";
import {
  formatConfidencePercent,
  formatNormalizedScore,
  getAgentHeadline,
  getContributionLabel,
  getMacroContributionLabel,
  getReadableBiasLabel,
  getReadableSizingEffect,
  getSignalStrengthLabel,
} from "@/lib/agent-output-format";
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

function getContributionText(output: AgentOutputRow) {
  if (output.agent_name === "macro-agent") {
    return getMacroContributionLabel(output.normalized_score);
  }

  if (output.agent_name === "bear-case-agent") {
    if ((output.normalized_score ?? 0) <= -0.2) return "Material downside drag";
    if ((output.normalized_score ?? 0) < 0.2) return "Moderate downside drag";
    return "Small downside drag";
  }

  if (output.agent_name === "news-agent") {
    if ((output.normalized_score ?? 0) >= 0.6) return "Strong near-term support";
    if ((output.normalized_score ?? 0) >= 0.2) return "Moderate near-term support";
    if ((output.normalized_score ?? 0) <= -0.2) return "Negative near-term signal";
    return "Mixed near-term signal";
  }

  return getContributionLabel(output.normalized_score);
}

function getPracticalEffect(output: AgentOutputRow) {
  if (output.agent_name === "bear-case-agent") {
    if ((output.normalized_score ?? 0) <= -0.2) return "Practical effect: argues for tighter risk discipline";
    if ((output.normalized_score ?? 0) < 0.2) return "Practical effect: adds caution to the stock case";
    return "Practical effect: downside case is not a major blocker right now";
  }

  if (output.agent_name === "news-agent") {
    if ((output.normalized_score ?? 0) >= 0.2) return "Practical effect: reinforces the current thesis";
    if ((output.normalized_score ?? 0) <= -0.2) return "Practical effect: weakens near-term conviction";
    return "Practical effect: does not materially change the thesis";
  }

  if (output.agent_name === "fundamentals-agent") {
    if ((output.normalized_score ?? 0) >= 0.2) return "Practical effect: supports a slightly larger position";
    if ((output.normalized_score ?? 0) <= -0.2) return "Practical effect: argues for more cautious sizing";
    return "Practical effect: supports current sizing more than a change";
  }

  if (output.agent_name === "macro-agent") {
    if ((output.normalized_score ?? 0) >= 0.2) return "Practical effect: gives the stock case a macro tailwind";
    if ((output.normalized_score ?? 0) <= -0.2) return "Practical effect: adds macro pressure to the setup";
    return "Practical effect: macro is not driving the call right now";
  }

  return null;
}

function getReadableSummary(output: AgentOutputRow) {
  if (!output.summary) {
    return output.thesis || "No summary yet.";
  }

  if (output.agent_name === "news-agent") {
    return output.summary
      .replace(/surfaced\s+\d+\s+recent news signals?/i, "recent coverage is being interpreted")
      .replace(/captured in this pass/gi, "in the current news read")
      .replace(/across Finnhub and Google News/gi, "across multiple sources");
  }

  return output.summary;
}

function AgentTile({ output }: { output: AgentOutputRow }) {
  const confidence = formatConfidencePercent(output.confidence_score);
  const signal = formatNormalizedScore(output.normalized_score);
  const readableBias = getReadableBiasLabel(output.action_bias);
  const readableSizing = getReadableSizingEffect(output.target_weight_delta);
  const signalStrength = getSignalStrengthLabel(output.normalized_score);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{output.agent_name}</p>
      <p className="mt-3 text-base font-semibold text-zinc-100">{getAgentHeadline(output.agent_name, output.normalized_score)}</p>
      <p className="mt-2 text-sm font-medium text-indigo-300">{getContributionText(output)}</p>
      <p className="mt-2 text-sm text-zinc-300">{getReadableSummary(output)}</p>
      {getPracticalEffect(output) ? <p className="mt-2 text-sm text-zinc-500">{getPracticalEffect(output)}</p> : null}

      <div className="mt-4 flex flex-wrap gap-2 text-xs text-zinc-400">
        {confidence ? <span className="rounded-full border border-zinc-700 px-2 py-1">Confidence {confidence}</span> : null}
        {signal && signalStrength ? <span className="rounded-full border border-zinc-700 px-2 py-1">{signalStrength} ({signal})</span> : null}
        {readableBias ? <span className="rounded-full border border-zinc-700 px-2 py-1">{readableBias}</span> : null}
        {readableSizing ? <span className="rounded-full border border-zinc-700 px-2 py-1">{readableSizing}</span> : null}
      </div>

      <p className="mt-4 text-xs text-zinc-500">{formatAppDateTime(output.created_at)}</p>
    </div>
  );
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
          description="This page explains how fundamentals, news, bear case, and macro each contribute to the final recommendation in plain English first, with model detail second."
        >
          {globalOutputs.length ? (
            <div className="mb-4 rounded-2xl border border-indigo-800/60 bg-indigo-950/30 p-4">
              <div className="mb-3">
                <h3 className="text-base font-semibold text-zinc-100">Global Macro Agent</h3>
                <p className="mt-1 text-sm text-zinc-400">A shared global posture layer that adds either a tailwind, a headwind, or a neutral backdrop across symbols.</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {globalOutputs.map((output) => (
                  <AgentTile key={output.id} output={output} />
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
                        <p className="mt-1 text-sm text-zinc-400">Each tile shows what that agent is saying, why it matters, and how much it is affecting the final stock case.</p>
                      </div>
                      {symbol?.id ? (
                        <Link href={`/symbols`} className="rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:border-zinc-500">
                          View symbols
                        </Link>
                      ) : null}
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {outputs.map((output) => (
                        <AgentTile key={output.id} output={output} />
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
