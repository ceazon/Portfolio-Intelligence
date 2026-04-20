import { buildAgentOutputContract, confidenceFromPercent, scoreFromPercent } from "@/lib/agent-output-contract";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type NewsDirectionRow = {
  direction: string | null;
  confidence_score: number | null;
  symbols: { ticker: string; name: string | null } | { ticker: string; name: string | null }[] | null;
};

function firstRelation<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

const MACRO_AGENT_NAME = "macro-agent";
const MACRO_SCOPE_KEY = "global-market-regime";

export async function runGlobalMacroAgent(ownerId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new Error("Supabase env vars are not configured yet.");
  }

  const { data, error } = await supabase
    .from("research_insights")
    .select("direction, confidence_score, symbols(ticker, name)")
    .eq("owner_id", ownerId)
    .eq("insight_type", "news")
    .order("created_at", { ascending: false })
    .limit(12);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data || []) as NewsDirectionRow[];
  const bullish = rows.filter((row) => row.direction === "bullish");
  const bearish = rows.filter((row) => row.direction === "bearish");
  const mixed = rows.length - bullish.length - bearish.length;

  const bullishConfidence = bullish.reduce((sum, row) => sum + (row.confidence_score ?? 50), 0);
  const bearishConfidence = bearish.reduce((sum, row) => sum + (row.confidence_score ?? 50), 0);
  const netSignal = bullishConfidence - bearishConfidence;

  const rawScore = rows.length === 0 ? 50 : Math.max(0, Math.min(100, Number((50 + netSignal / 4).toFixed(2))));
  const rawConfidence = rows.length === 0 ? 25 : Math.min(88, 35 + rows.length * 4 + Math.min(20, Math.round(Math.abs(netSignal) / 10)));
  const normalizedScore = scoreFromPercent(rawScore);
  const confidenceScore = confidenceFromPercent(rawConfidence);
  const stance = normalizedScore > 0.2 ? "bullish" : normalizedScore < -0.2 ? "bearish" : "neutral";
  const actionBias = stance === "bullish" ? "increase" : stance === "bearish" ? "reduce" : "hold";

  const strongestTickers = rows
    .slice(0, 5)
    .map((row) => firstRelation(row.symbols)?.ticker)
    .filter(Boolean);

  const summary =
    rows.length === 0
      ? "Macro agent has no recent shared news context yet, so it is holding a neutral global posture."
      : stance === "bullish"
        ? `Macro agent sees a constructive global backdrop based on recent tracked-symbol news breadth, with ${bullish.length} bullish vs ${bearish.length} bearish signals.`
        : stance === "bearish"
          ? `Macro agent sees a cautious global backdrop based on recent tracked-symbol news breadth, with ${bearish.length} bearish vs ${bullish.length} bullish signals.`
          : `Macro agent sees a mixed global backdrop, with ${bullish.length} bullish, ${bearish.length} bearish, and ${mixed} mixed tracked-symbol signals.`;

  const thesis =
    rows.length === 0
      ? "No recent shared news insights were available to estimate macro regime."
      : `This first macro slice uses aggregate breadth from recent tracked-symbol news as a proxy for global risk appetite. Strongest recent coverage came from ${strongestTickers.join(", ") || "the tracked universe"}.`;

  await supabase.from("agent_outputs").delete().eq("owner_id", ownerId).eq("agent_name", MACRO_AGENT_NAME).eq("scope_type", "global").eq("scope_key", MACRO_SCOPE_KEY);

  const { error: insertError } = await supabase.from("agent_outputs").insert(
    buildAgentOutputContract({
      owner_id: ownerId,
      agent_name: MACRO_AGENT_NAME,
      scope_type: "global",
      scope_key: MACRO_SCOPE_KEY,
      stance,
      normalized_score: normalizedScore,
      confidence_score: confidenceScore,
      action_bias: actionBias,
      target_weight_delta: 0,
      time_horizon: "days",
      summary,
      thesis,
      evidence_json: {
        based_on: "recent-research-insights",
        bullish_count: bullish.length,
        bearish_count: bearish.length,
        mixed_count: mixed,
        strongest_tickers: strongestTickers,
      },
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 12).toISOString(),
    }),
  );

  if (insertError) {
    throw new Error(insertError.message);
  }

  return {
    stance,
    normalizedScore,
    confidenceScore,
    summary,
  };
}
