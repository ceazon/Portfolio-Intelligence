import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type AgentOutputRow = {
  id: string;
  symbol_id: string | null;
  scope_type: string | null;
  scope_key: string | null;
  agent_name: string;
  stance: string | null;
  normalized_score: number | null;
  confidence_score: number | null;
  action_bias: string | null;
  target_weight_delta: number | null;
  summary: string | null;
  thesis: string | null;
  created_at: string;
};

type PositionRow = {
  portfolio_id: string;
  quantity: number | null;
  average_cost: number | null;
  portfolios: { id: string; name: string } | { id: string; name: string }[] | null;
  symbols:
    | {
        id: string;
        ticker: string;
        name: string | null;
        symbol_price_snapshots:
          | { price: number | null; percent_change: number | null; fetched_at: string }
          | { price: number | null; percent_change: number | null; fetched_at: string }[]
          | null;
      }
    | {
        id: string;
        ticker: string;
        name: string | null;
        symbol_price_snapshots:
          | { price: number | null; percent_change: number | null; fetched_at: string }
          | { price: number | null; percent_change: number | null; fetched_at: string }[]
          | null;
      }[]
    | null;
};

type WatchlistRow = {
  symbols:
    | {
        id: string;
        ticker: string;
        name: string | null;
        symbol_price_snapshots:
          | { price: number | null; percent_change: number | null; fetched_at: string }
          | { price: number | null; percent_change: number | null; fetched_at: string }[]
          | null;
      }
    | {
        id: string;
        ticker: string;
        name: string | null;
        symbol_price_snapshots:
          | { price: number | null; percent_change: number | null; fetched_at: string }
          | { price: number | null; percent_change: number | null; fetched_at: string }[]
          | null;
      }[]
    | null;
};

function firstRelation<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function confidenceLabel(score: number) {
  if (score >= 75) return "high";
  if (score >= 55) return "medium";
  return "low";
}

export async function runRecommendationSynthesis(ownerId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new Error("Supabase env vars are not configured yet.");
  }

  const { data: synthesisRun, error: synthesisRunError } = await supabase
    .from("synthesis_runs")
    .insert({
      owner_id: ownerId,
      model: "synthesis-v1",
      status: "running",
      trigger_type: "manual",
      summary: "Synthesizing advisory recommendations from current news and macro agent outputs.",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (synthesisRunError || !synthesisRun) {
    throw new Error(synthesisRunError?.message || "Failed to create synthesis run.");
  }

  try {
    const [{ data: agentOutputs, error: agentOutputsError }, { data: positions, error: positionsError }, { data: watchlistItems, error: watchlistError }] = await Promise.all([
      supabase
        .from("agent_outputs")
        .select("id, symbol_id, scope_type, scope_key, agent_name, stance, normalized_score, confidence_score, action_bias, target_weight_delta, summary, thesis, created_at")
        .eq("owner_id", ownerId)
        .in("agent_name", ["news-agent", "macro-agent"])
        .order("created_at", { ascending: false }),
      supabase
        .from("portfolio_positions")
        .select("portfolio_id, quantity, average_cost, portfolios(id, name), symbols(id, ticker, name, symbol_price_snapshots(price, percent_change, fetched_at))"),
      supabase
        .from("watchlist_items")
        .select("symbols(id, ticker, name, symbol_price_snapshots(price, percent_change, fetched_at))"),
    ]);

    if (agentOutputsError) throw new Error(agentOutputsError.message);
    if (positionsError) throw new Error(positionsError.message);
    if (watchlistError) throw new Error(watchlistError.message);

    const outputs = (agentOutputs || []) as AgentOutputRow[];
    const macro = outputs.find((row) => row.agent_name === "macro-agent" && row.scope_type === "global") || null;
    const newsBySymbol = new Map<string, AgentOutputRow>();

    outputs.forEach((row) => {
      if (row.agent_name !== "news-agent" || !row.symbol_id || newsBySymbol.has(row.symbol_id)) {
        return;
      }
      newsBySymbol.set(row.symbol_id, row);
    });

    const positionRows = (positions || []) as PositionRow[];
    const watchlistRows = (watchlistItems || []) as WatchlistRow[];

    const portfolioTotals = new Map<string, number>();
    positionRows.forEach((position) => {
      const symbol = firstRelation(position.symbols);
      const quote = firstRelation(symbol?.symbol_price_snapshots || null);
      const marketValue = (position.quantity ?? 0) * (quote?.price ?? 0);
      portfolioTotals.set(position.portfolio_id, (portfolioTotals.get(position.portfolio_id) || 0) + marketValue);
    });

    const synthesized: Array<Record<string, unknown>> = [];
    const seenSymbolIds = new Set<string>();

    positionRows.forEach((position) => {
      const portfolio = firstRelation(position.portfolios);
      const symbol = firstRelation(position.symbols);
      const quote = firstRelation(symbol?.symbol_price_snapshots || null);
      if (!symbol?.id) return;

      seenSymbolIds.add(symbol.id);
      const news = newsBySymbol.get(symbol.id);
      const marketValue = (position.quantity ?? 0) * (quote?.price ?? 0);
      const portfolioTotal = portfolioTotals.get(position.portfolio_id) || 0;
      const currentWeight = portfolioTotal > 0 ? (marketValue / portfolioTotal) * 100 : 0;
      const averageCost = position.average_cost ?? 0;
      const gainLossPct = quote?.price !== null && quote?.price !== undefined && averageCost > 0 ? ((quote.price - averageCost) / averageCost) * 100 : 0;

      let score = 50;
      score += ((news?.normalized_score ?? 50) - 50) * 0.7;
      score += ((macro?.normalized_score ?? 50) - 50) * 0.3;
      score += (quote?.percent_change ?? 0) * 1.5;
      score -= Math.max(0, currentWeight - 10) * 1.8;
      if (gainLossPct < -10) score -= 6;
      if (gainLossPct > 20) score += 4;

      const conviction = clamp(Math.round((news?.confidence_score ?? 50) * 0.65 + (macro?.confidence_score ?? 40) * 0.35), 10, 95);
      const finalScore = clamp(Math.round(score), 0, 100);
      const action = finalScore >= 63 ? "buy" : finalScore <= 40 ? (currentWeight > 0 ? "trim" : "watch") : "hold";
      const targetWeight = currentWeight > 0
        ? clamp(Number((currentWeight + (news?.target_weight_delta ?? 0) + ((macro?.stance === "risk-on" ? 0.8 : macro?.stance === "risk-off" ? -0.8 : 0))).toFixed(2)), 1, 15)
        : clamp(Number((3 + (news?.target_weight_delta ?? 0) / 2).toFixed(2)), 1, 8);

      synthesized.push({
        owner_id: ownerId,
        recommendation_run_id: null,
        synthesis_run_id: synthesisRun.id,
        recommendation_engine: "synthesis-v1",
        portfolio_id: portfolio?.id || null,
        symbol_id: symbol.id,
        action,
        status: "open",
        target_weight: targetWeight,
        conviction_score: conviction,
        summary: `${symbol.ticker} synthesized view: ${news?.summary || "News agent is neutral."} ${macro?.summary || "Macro agent is neutral."}`,
        risks: `${symbol.ticker} synthesized risk: ${news?.thesis || "Limited company-specific signal."} ${macro?.thesis || "Limited macro context."}`,
        confidence: confidenceLabel(conviction),
      });
    });

    watchlistRows.forEach((item) => {
      const symbol = firstRelation(item.symbols);
      const quote = firstRelation(symbol?.symbol_price_snapshots || null);
      if (!symbol?.id || seenSymbolIds.has(symbol.id)) return;

      const news = newsBySymbol.get(symbol.id);
      const score = clamp(Math.round(50 + ((news?.normalized_score ?? 50) - 50) * 0.75 + ((macro?.normalized_score ?? 50) - 50) * 0.25 + (quote?.percent_change ?? 0)), 0, 100);
      const conviction = clamp(Math.round((news?.confidence_score ?? 45) * 0.7 + (macro?.confidence_score ?? 40) * 0.3), 10, 95);
      const action = score >= 60 ? "buy" : score <= 42 ? "watch" : "hold";

      synthesized.push({
        owner_id: ownerId,
        recommendation_run_id: null,
        synthesis_run_id: synthesisRun.id,
        recommendation_engine: "synthesis-v1",
        portfolio_id: null,
        symbol_id: symbol.id,
        action,
        status: "open",
        target_weight: action === "buy" ? clamp(Number((3 + (news?.target_weight_delta ?? 0) / 2).toFixed(2)), 1, 8) : null,
        conviction_score: conviction,
        summary: `${symbol.ticker} synthesized watchlist view: ${news?.summary || "No strong news edge yet."} ${macro?.summary || "Macro backdrop is neutral."}`,
        risks: `${symbol.ticker} synthesized risk: watchlist ideas still need sizing discipline and thesis validation.`,
        confidence: confidenceLabel(conviction),
      });
    });

    if (!synthesized.length) {
      throw new Error("No symbols available for synthesis.");
    }

    const symbolIds = [...new Set(synthesized.map((row) => row.symbol_id).filter(Boolean))] as string[];
    if (symbolIds.length) {
      await supabase.from("recommendations").delete().eq("owner_id", ownerId).eq("recommendation_engine", "synthesis-v1").in("symbol_id", symbolIds);
    }

    const { error: insertError } = await supabase.from("recommendations").insert(synthesized);
    if (insertError) {
      throw new Error(insertError.message);
    }

    await supabase
      .from("synthesis_runs")
      .update({
        status: "completed",
        summary: `Synthesized ${synthesized.length} advisory recommendation${synthesized.length === 1 ? "" : "s"} from news and macro agent outputs.`,
        completed_at: new Date().toISOString(),
      })
      .eq("id", synthesisRun.id);

    return { runId: synthesisRun.id, synthesizedCount: synthesized.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Synthesis failed.";
    await supabase
      .from("synthesis_runs")
      .update({
        status: "failed",
        summary: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", synthesisRun.id);

    throw error;
  }
}
