import OpenAI from "openai";
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

type SynthesisCandidate = {
  symbolId: string;
  portfolioId: string | null;
  ticker: string;
  name: string | null;
  currentWeight: number | null;
  gainLossPct: number | null;
  priceChangePct: number | null;
  currentPrice: number | null;
  news: {
    stance: string | null;
    normalizedScore: number | null;
    confidenceScore: number | null;
    actionBias: string | null;
    targetWeightDelta: number | null;
    summary: string | null;
    thesis: string | null;
  } | null;
};

type SynthesizedRecommendation = {
  symbolId: string;
  action: "buy" | "hold" | "trim" | "watch";
  targetWeight: number | null;
  targetPrice: number | null;
  convictionScore: number;
  summary: string;
  risks: string;
  confidence: "low" | "medium" | "high";
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

function confidenceLabel(score: number): "low" | "medium" | "high" {
  if (score >= 75) return "high";
  if (score >= 55) return "medium";
  return "low";
}

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  return new OpenAI({ apiKey });
}

function buildDeterministicFallback(candidates: SynthesisCandidate[], macro: AgentOutputRow | null): SynthesizedRecommendation[] {
  return candidates.map((candidate) => {
    let score = 50;
    score += ((candidate.news?.normalizedScore ?? 50) - 50) * 0.7;
    score += ((macro?.normalized_score ?? 50) - 50) * 0.3;
    score += (candidate.priceChangePct ?? 0) * 1.5;
    score -= Math.max(0, (candidate.currentWeight ?? 0) - 10) * 1.8;
    if ((candidate.gainLossPct ?? 0) < -10) score -= 6;
    if ((candidate.gainLossPct ?? 0) > 20) score += 4;

    const conviction = clamp(Math.round((candidate.news?.confidenceScore ?? 50) * 0.65 + (macro?.confidence_score ?? 40) * 0.35), 10, 95);
    const finalScore = clamp(Math.round(score), 0, 100);
    const hasPosition = (candidate.currentWeight ?? 0) > 0;
    const action = finalScore >= 63 ? "buy" : finalScore <= 40 ? (hasPosition ? "trim" : "watch") : "hold";
    const targetWeight = hasPosition
      ? clamp(Number((((candidate.currentWeight ?? 0) + (candidate.news?.targetWeightDelta ?? 0) + (macro?.stance === "risk-on" ? 0.8 : macro?.stance === "risk-off" ? -0.8 : 0))).toFixed(2)), 1, 15)
      : action === "buy"
        ? clamp(Number((3 + (candidate.news?.targetWeightDelta ?? 0) / 2).toFixed(2)), 1, 8)
        : null;

    const priceAnchor = candidate.currentPrice ?? null;
    const targetPrice =
      priceAnchor === null
        ? null
        : action === "buy"
          ? Number((priceAnchor * (1 + conviction / 220)).toFixed(2))
          : action === "trim"
            ? Number((priceAnchor * (1 - Math.max(0.03, conviction / 500))).toFixed(2))
            : Number(priceAnchor.toFixed(2));

    return {
      symbolId: candidate.symbolId,
      action,
      targetWeight,
      targetPrice,
      convictionScore: conviction,
      summary: `${candidate.ticker} synthesized view: ${candidate.news?.summary || "News agent is neutral."} ${macro?.summary || "Macro agent is neutral."}`,
      risks: `${candidate.ticker} synthesized risk: ${candidate.news?.thesis || "Limited company-specific signal."} ${macro?.thesis || "Limited macro context."}`,
      confidence: confidenceLabel(conviction),
    };
  });
}

async function synthesizeWithOpenAI(candidates: SynthesisCandidate[], macro: AgentOutputRow | null): Promise<SynthesizedRecommendation[]> {
  const client = getOpenAIClient();
  if (!client) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const promptPayload = {
    macro: macro
      ? {
          stance: macro.stance,
          normalizedScore: macro.normalized_score,
          confidenceScore: macro.confidence_score,
          actionBias: macro.action_bias,
          summary: macro.summary,
          thesis: macro.thesis,
        }
      : null,
    candidates,
  };

  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text:
              "You are a portfolio recommendation synthesizer. Combine a global macro agent and per-symbol news agent outputs into advisory recommendations. Return strict JSON only. Actions must be one of: buy, hold, trim, watch. Conviction score must be 0-100. Confidence must be one of: low, medium, high. Keep summaries and risks concise, concrete, and investment-advisory in tone. Respect current weight and avoid absurd target weights.",
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: JSON.stringify(promptPayload),
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "portfolio_synthesis",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            recommendations: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  symbolId: { type: "string" },
                  action: { type: "string", enum: ["buy", "hold", "trim", "watch"] },
                  targetWeight: { type: ["number", "null"] },
                  convictionScore: { type: "number" },
                  targetPrice: { type: ["number", "null"] },
                  summary: { type: "string" },
                  risks: { type: "string" },
                  confidence: { type: "string", enum: ["low", "medium", "high"] },
                },
                required: ["symbolId", "action", "targetWeight", "targetPrice", "convictionScore", "summary", "risks", "confidence"],
              },
            },
          },
          required: ["recommendations"],
        },
      },
    },
  });

  const raw = response.output_text;
  const parsed = JSON.parse(raw || "{}");
  const recommendations = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];

  return recommendations.map((item: SynthesizedRecommendation) => ({
    symbolId: item.symbolId,
    action: item.action,
    targetWeight: item.targetWeight === null ? null : clamp(Number(item.targetWeight), 0, 20),
    targetPrice: item.targetPrice === null ? null : Math.max(0, Number(item.targetPrice)),
    convictionScore: clamp(Math.round(Number(item.convictionScore)), 0, 100),
    summary: String(item.summary || "No summary provided."),
    risks: String(item.risks || "No risk summary provided."),
    confidence: ["low", "medium", "high"].includes(item.confidence) ? item.confidence : confidenceLabel(Number(item.convictionScore) || 50),
  }));
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
      model: "gpt-4.1-mini",
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

    const candidates: SynthesisCandidate[] = [];
    const seenSymbolIds = new Set<string>();

    positionRows.forEach((position) => {
      const portfolio = firstRelation(position.portfolios);
      const symbol = firstRelation(position.symbols);
      const quote = firstRelation(symbol?.symbol_price_snapshots || null);
      if (!symbol?.id) return;

      seenSymbolIds.add(symbol.id);
      const marketValue = (position.quantity ?? 0) * (quote?.price ?? 0);
      const portfolioTotal = portfolioTotals.get(position.portfolio_id) || 0;
      const currentWeight = portfolioTotal > 0 ? (marketValue / portfolioTotal) * 100 : 0;
      const averageCost = position.average_cost ?? 0;
      const gainLossPct = quote?.price !== null && quote?.price !== undefined && averageCost > 0 ? ((quote.price - averageCost) / averageCost) * 100 : null;
      const news = newsBySymbol.get(symbol.id);

      candidates.push({
        symbolId: symbol.id,
        portfolioId: portfolio?.id || null,
        ticker: symbol.ticker,
        name: symbol.name,
        currentWeight,
        gainLossPct,
        priceChangePct: quote?.percent_change ?? null,
        currentPrice: quote?.price ?? null,
        news: news
          ? {
              stance: news.stance,
              normalizedScore: news.normalized_score,
              confidenceScore: news.confidence_score,
              actionBias: news.action_bias,
              targetWeightDelta: news.target_weight_delta,
              summary: news.summary,
              thesis: news.thesis,
            }
          : null,
      });
    });

    watchlistRows.forEach((item) => {
      const symbol = firstRelation(item.symbols);
      const quote = firstRelation(symbol?.symbol_price_snapshots || null);
      if (!symbol?.id || seenSymbolIds.has(symbol.id)) return;
      const news = newsBySymbol.get(symbol.id);

      candidates.push({
        symbolId: symbol.id,
        portfolioId: null,
        ticker: symbol.ticker,
        name: symbol.name,
        currentWeight: null,
        gainLossPct: null,
        priceChangePct: quote?.percent_change ?? null,
        currentPrice: quote?.price ?? null,
        news: news
          ? {
              stance: news.stance,
              normalizedScore: news.normalized_score,
              confidenceScore: news.confidence_score,
              actionBias: news.action_bias,
              targetWeightDelta: news.target_weight_delta,
              summary: news.summary,
              thesis: news.thesis,
            }
          : null,
      });
    });

    if (!candidates.length) {
      throw new Error("No symbols available for synthesis.");
    }

    let synthesized: SynthesizedRecommendation[];
    let usedModel = "gpt-4.1-mini";

    try {
      synthesized = await synthesizeWithOpenAI(candidates, macro);
    } catch {
      synthesized = buildDeterministicFallback(candidates, macro);
      usedModel = "synthesis-v1-fallback";
    }

    const rowsToInsert = synthesized.map((item) => {
      const candidate = candidates.find((entry) => entry.symbolId === item.symbolId);
      return {
        owner_id: ownerId,
        recommendation_run_id: null,
        synthesis_run_id: synthesisRun.id,
        recommendation_engine: "synthesis-v1",
        portfolio_id: candidate?.portfolioId || null,
        symbol_id: item.symbolId,
        action: item.action,
        status: "open",
        target_weight: item.targetWeight,
        target_price: item.targetPrice,
        conviction_score: item.convictionScore,
        summary: item.summary,
        risks: item.risks,
        confidence: item.confidence,
      };
    });

    const symbolIds = [...new Set(rowsToInsert.map((row) => row.symbol_id).filter(Boolean))] as string[];
    if (symbolIds.length) {
      await supabase.from("recommendations").delete().eq("owner_id", ownerId).eq("recommendation_engine", "synthesis-v1").in("symbol_id", symbolIds);
    }

    const { error: insertError } = await supabase.from("recommendations").insert(rowsToInsert);
    if (insertError) {
      throw new Error(insertError.message);
    }

    await supabase
      .from("synthesis_runs")
      .update({
        model: usedModel,
        status: "completed",
        summary: `Synthesized ${rowsToInsert.length} advisory recommendation${rowsToInsert.length === 1 ? "" : "s"} from news and macro agent outputs.`,
        completed_at: new Date().toISOString(),
      })
      .eq("id", synthesisRun.id);

    return { runId: synthesisRun.id, synthesizedCount: rowsToInsert.length, model: usedModel };
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
