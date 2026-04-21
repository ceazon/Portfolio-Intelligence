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

type SymbolFundamentalsRow = {
  symbol_id: string;
  pe_ttm: number | null;
  pb_ttm: number | null;
  ps_ttm: number | null;
  revenue_growth_ttm: number | null;
  eps_growth_5y: number | null;
  net_margin_ttm: number | null;
  operating_margin_ttm: number | null;
  roe_ttm: number | null;
  market_cap_m: number | null;
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

type AgentSignal = {
  stance: string | null;
  normalizedScore: number | null;
  confidenceScore: number | null;
  actionBias: string | null;
  targetWeightDelta: number | null;
  summary: string | null;
  thesis: string | null;
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
  fundamentalsSnapshot?: {
    peTtm: number | null;
    pbTtm: number | null;
    psTtm: number | null;
    revenueGrowthTtm: number | null;
    epsGrowth5Y: number | null;
    netMarginTtm: number | null;
    operatingMarginTtm: number | null;
    roeTtm: number | null;
    marketCapM: number | null;
  } | null;
  news: AgentSignal | null;
  bearCase: AgentSignal | null;
  fundamentals: AgentSignal | null;
};

type ValuationArchetype = "high-growth" | "platform" | "financial" | "quality" | "cyclical" | "defensive";

type ScenarioSet = {
  archetype: ValuationArchetype;
  bullTarget: number | null;
  baseTarget: number | null;
  bearTarget: number | null;
  bullProbability: number;
  baseProbability: number;
  bearProbability: number;
  weightedTarget: number | null;
  valuationConfidence: number;
  rationale: string;
};

type TargetValidationStatus = "plausible" | "stretched" | "aggressive" | "unavailable";

type TargetValidationResult = {
  status: TargetValidationStatus;
  summary: string;
  impliedUpsidePct: number | null;
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
  targetValidationStatus: TargetValidationStatus;
  targetValidationSummary: string;
  impliedUpsidePct: number | null;
};

function firstRelation<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
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

function inferArchetype(candidate: SynthesisCandidate): ValuationArchetype {
  const f = candidate.fundamentalsSnapshot;
  const ps = f?.psTtm ?? null;
  const pb = f?.pbTtm ?? null;
  const pe = f?.peTtm ?? null;
  const growth = f?.revenueGrowthTtm ?? null;
  const margin = f?.netMarginTtm ?? null;
  const marketCapM = f?.marketCapM ?? null;

  if ((pb !== null && pb >= 1.2 && pb <= 3.5 && pe !== null && pe <= 16) || /bank|bancorp|financial/i.test(candidate.name || candidate.ticker)) {
    return "financial";
  }

  if ((growth !== null && growth >= 18) || (ps !== null && ps >= 8)) {
    return "high-growth";
  }

  if (marketCapM !== null && marketCapM >= 300000 && margin !== null && margin >= 18) {
    return "platform";
  }

  if (margin !== null && margin >= 14 && pe !== null && pe <= 28) {
    return "quality";
  }

  if (margin !== null && margin < 8 && growth !== null && growth < 5) {
    return "defensive";
  }

  return "cyclical";
}

function buildScenarioSet(candidate: SynthesisCandidate, macro: AgentOutputRow | null): ScenarioSet {
  const price = candidate.currentPrice;
  const f = candidate.fundamentalsSnapshot;
  const newsScore = candidate.news?.normalizedScore ?? 0;
  const fundamentalsScore = candidate.fundamentals?.normalizedScore ?? 0;
  const bearScore = candidate.bearCase?.normalizedScore ?? 0;
  const macroScore = macro?.normalized_score ?? 0;
  const archetype = inferArchetype(candidate);

  if (price === null || price === undefined) {
    return {
      archetype,
      bullTarget: null,
      baseTarget: null,
      bearTarget: null,
      bullProbability: 0.25,
      baseProbability: 0.5,
      bearProbability: 0.25,
      weightedTarget: null,
      valuationConfidence: 45,
      rationale: `${candidate.ticker}: no live price anchor was available for scenario valuation.`,
    };
  }

  let baseUpside = 0.08;
  let bullUpside = 0.18;
  let bearDownside = 0.14;

  if (archetype === "high-growth") {
    baseUpside = 0.16;
    bullUpside = 0.34;
    bearDownside = 0.2;
  } else if (archetype === "platform") {
    baseUpside = 0.12;
    bullUpside = 0.24;
    bearDownside = 0.14;
  } else if (archetype === "financial") {
    baseUpside = 0.09;
    bullUpside = 0.18;
    bearDownside = 0.12;
  } else if (archetype === "quality") {
    baseUpside = 0.11;
    bullUpside = 0.21;
    bearDownside = 0.13;
  } else if (archetype === "defensive") {
    baseUpside = 0.07;
    bullUpside = 0.14;
    bearDownside = 0.1;
  }

  const growthLift = clamp(((f?.revenueGrowthTtm ?? 0) / 100) * 0.35, -0.06, 0.16);
  const marginLift = clamp(((f?.netMarginTtm ?? 0) / 100) * 0.18, -0.04, 0.08);
  const roeLift = clamp(((f?.roeTtm ?? 0) / 100) * 0.12, -0.03, 0.07);
  const valuationDrag = clamp(((f?.peTtm ?? 20) - 22) / 180, -0.06, 0.12) + clamp(((f?.psTtm ?? 4) - 5) / 60, -0.04, 0.1);
  const structuralAdjustment = growthLift + marginLift + roeLift - valuationDrag;
  const agentAdjustment = newsScore * 0.08 + fundamentalsScore * 0.1 + macroScore * 0.04 + bearScore * 0.12;

  const bullTarget = Number((price * (1 + bullUpside + structuralAdjustment + Math.max(0, agentAdjustment) * 0.9)).toFixed(2));
  const baseTarget = Number((price * (1 + baseUpside + structuralAdjustment + agentAdjustment * 0.45)).toFixed(2));
  const bearTarget = Number((price * (1 - bearDownside + Math.min(0, agentAdjustment) * 0.45 + Math.min(0, bearScore) * 0.18)).toFixed(2));

  let bullProbability = 0.25 + Math.max(0, newsScore) * 0.08 + Math.max(0, fundamentalsScore) * 0.1 + Math.max(0, macroScore) * 0.03;
  let baseProbability = 0.5 - Math.abs(newsScore - fundamentalsScore) * 0.08;
  let bearProbability = 0.25 + Math.max(0, -bearScore) * 0.12 + Math.max(0, -macroScore) * 0.04;

  const probabilityTotal = bullProbability + baseProbability + bearProbability;
  bullProbability = bullProbability / probabilityTotal;
  baseProbability = baseProbability / probabilityTotal;
  bearProbability = bearProbability / probabilityTotal;

  const weightedTarget = Number((bullTarget * bullProbability + baseTarget * baseProbability + bearTarget * bearProbability).toFixed(2));
  const valuationConfidence = clamp(
    Math.round(52 + (candidate.fundamentals?.confidenceScore ?? 0.45) * 24 + (candidate.news?.confidenceScore ?? 0.45) * 10 - Math.abs(newsScore - fundamentalsScore) * 10),
    35,
    88,
  );

  return {
    archetype,
    bullTarget,
    baseTarget,
    bearTarget,
    bullProbability: Number(bullProbability.toFixed(2)),
    baseProbability: Number(baseProbability.toFixed(2)),
    bearProbability: Number(bearProbability.toFixed(2)),
    weightedTarget,
    valuationConfidence,
    rationale: `${candidate.ticker}: ${archetype} valuation anchor built from current price, growth, margin, valuation, and agent pressure across bull/base/bear scenarios.`,
  };
}

function validateTarget(candidate: SynthesisCandidate, scenarios: ScenarioSet): TargetValidationResult {
  const currentPrice = candidate.currentPrice;
  const targetPrice = scenarios.weightedTarget;
  if (typeof currentPrice !== "number" || typeof targetPrice !== "number" || currentPrice <= 0) {
    return {
      status: "unavailable",
      summary: "Target validation unavailable because a live price anchor is missing.",
      impliedUpsidePct: null,
    };
  }

  const impliedUpsidePct = Number((((targetPrice - currentPrice) / currentPrice) * 100).toFixed(1));
  const f = candidate.fundamentalsSnapshot;
  const archetype = scenarios.archetype;

  if (archetype === "financial") {
    if (impliedUpsidePct > 35) {
      return {
        status: "aggressive",
        summary: `${candidate.ticker}: the target implies unusually large 12-month upside for a financial, which looks aggressive without stronger valuation dislocation evidence.`,
        impliedUpsidePct,
      };
    }

    if (impliedUpsidePct > 25 || ((f?.pbTtm ?? 0) > 1.8 && (f?.roeTtm ?? 0) < 14)) {
      return {
        status: "stretched",
        summary: `${candidate.ticker}: the target asks for a fairly strong rerating for a financial, so it looks stretched relative to typical bank-style upside.`,
        impliedUpsidePct,
      };
    }

    return {
      status: "plausible",
      summary: `${candidate.ticker}: the target sits in a more normal range for a financial if earnings and valuation hold up.`,
      impliedUpsidePct,
    };
  }

  if (archetype === "high-growth" || archetype === "platform") {
    if (impliedUpsidePct > 45 && ((f?.revenueGrowthTtm ?? 0) < 15 || (f?.netMarginTtm ?? 0) < 10)) {
      return {
        status: "aggressive",
        summary: `${candidate.ticker}: the target assumes very strong upside without enough growth or margin support, so it looks aggressive.`,
        impliedUpsidePct,
      };
    }

    if (impliedUpsidePct > 30 && ((f?.psTtm ?? 0) > 10 || (f?.revenueGrowthTtm ?? 0) < 12)) {
      return {
        status: "stretched",
        summary: `${candidate.ticker}: the target still looks stretched because the upside relies on a rich valuation or slower growth re-accelerating.`,
        impliedUpsidePct,
      };
    }

    return {
      status: "plausible",
      summary: `${candidate.ticker}: the target looks plausible for this growth archetype if execution and growth durability stay intact.`,
      impliedUpsidePct,
    };
  }

  if (impliedUpsidePct > 30) {
    return {
      status: "stretched",
      summary: `${candidate.ticker}: the target asks for a fairly large 12-month move, so it should be treated as stretched rather than base-case certain.`,
      impliedUpsidePct,
    };
  }

  return {
    status: "plausible",
    summary: `${candidate.ticker}: the target looks broadly plausible relative to the current price and valuation setup.`,
    impliedUpsidePct,
  };
}

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

function buildDeterministicFallback(candidates: SynthesisCandidate[], macro: AgentOutputRow | null): SynthesizedRecommendation[] {
  return candidates.map((candidate) => {
    const scenarios = buildScenarioSet(candidate, macro);
    const newsScore = candidate.news?.normalizedScore ?? 0;
    const fundamentalsScore = candidate.fundamentals?.normalizedScore ?? 0;
    const macroScore = macro?.normalized_score ?? 0;
    const bearScore = candidate.bearCase?.normalizedScore ?? 0;
    const newsConfidence = candidate.news?.confidenceScore ?? 0.45;
    const fundamentalsConfidence = candidate.fundamentals?.confidenceScore ?? 0.45;
    const macroConfidence = macro?.confidence_score ?? 0.4;
    const bearConfidence = candidate.bearCase?.confidenceScore ?? 0.35;
    const hasPosition = (candidate.currentWeight ?? 0) > 0;
    const currentWeight = candidate.currentWeight ?? 0;

    const weightedSignal = newsScore * 0.34 + fundamentalsScore * 0.33 + macroScore * 0.13 + bearScore * 0.2;
    const evidenceQuality = newsConfidence * 0.34 + fundamentalsConfidence * 0.3 + macroConfidence * 0.14 + bearConfidence * 0.22;
    const momentumAdjustment = clamp((candidate.priceChangePct ?? 0) / 40, -0.18, 0.18);
    const lossAdjustment = (candidate.gainLossPct ?? 0) < -12 ? -0.06 : (candidate.gainLossPct ?? 0) > 25 ? 0.03 : 0;
    const sizePenalty = currentWeight > 12 ? clamp((currentWeight - 12) / 20, 0, 0.22) : 0;

    const blendedSignal = clamp(weightedSignal * 0.82 + momentumAdjustment + lossAdjustment - sizePenalty, -1, 1);
    const convictionBase = evidenceQuality * 100;
    const disagreementPenalty = Math.abs(newsScore - fundamentalsScore) * 12 + Math.max(0, -bearScore - Math.max(newsScore, fundamentalsScore)) * 18;
    const conviction = clamp(Math.round(convictionBase + Math.max(0, blendedSignal) * 18 - disagreementPenalty), 18, 92);

    const action = blendedSignal >= 0.22 ? "buy" : blendedSignal <= -0.24 ? (hasPosition ? "trim" : "watch") : "hold";

    const rawWeightTilt = (candidate.news?.targetWeightDelta ?? 0) * 0.45 + (candidate.fundamentals?.targetWeightDelta ?? 0) * 0.4 + (macroScore > 0.2 ? 0.6 : macroScore < -0.2 ? -0.75 : 0);
    const targetWeight = hasPosition
      ? action === "trim"
        ? clamp(Number(Math.max(0, currentWeight + Math.min(rawWeightTilt, -0.75) - Math.max(0.5, conviction / 120)).toFixed(2)), 0, 15)
        : clamp(Number((currentWeight + (action === "buy" ? Math.max(0.5, rawWeightTilt) : rawWeightTilt * 0.35)).toFixed(2)), 0.5, 15)
      : action === "buy"
        ? clamp(Number((2 + Math.max(0.4, rawWeightTilt) + Math.max(0, blendedSignal) * 2.2).toFixed(2)), 1, 7)
        : null;

    const summary =
      action === "buy"
        ? `${candidate.ticker}: add selectively, because the ${scenarios.archetype} valuation anchor and current agent mix still support disciplined upside exposure.`
        : action === "trim"
          ? `${candidate.ticker}: reduce exposure, because the downside scenario is strong enough to outweigh the current upside case.`
          : action === "watch"
            ? `${candidate.ticker}: stay on watch, because the scenario-weighted target is not attractive enough yet to justify new risk.`
            : `${candidate.ticker}: hold current sizing, because the scenario-weighted valuation is constructive but not decisive enough to press harder.`;

    const risks =
      bearScore < -0.2
        ? `${candidate.ticker}: the bear case is still live, with roughly ${Math.round(scenarios.bearProbability * 100)}% weight on the downside scenario.`
        : `${candidate.ticker}: mixed evidence or weaker follow-through could pull the outcome back toward the bear case.`;

    const validation = validateTarget(candidate, scenarios);

    return {
      symbolId: candidate.symbolId,
      action,
      targetWeight,
      targetPrice: scenarios.weightedTarget,
      convictionScore: Math.max(conviction, scenarios.valuationConfidence),
      summary,
      risks,
      confidence: confidenceLabel(Math.max(conviction, scenarios.valuationConfidence)),
      targetValidationStatus: validation.status,
      targetValidationSummary: validation.summary,
      impliedUpsidePct: validation.impliedUpsidePct,
    };
  });
}

async function synthesizeWithOpenAI(candidates: SynthesisCandidate[], macro: AgentOutputRow | null): Promise<SynthesizedRecommendation[]> {
  const client = getOpenAIClient();
  if (!client) throw new Error("OPENAI_API_KEY is not configured.");

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
    candidates: candidates.map((candidate) => ({
      ...candidate,
      valuationScenarios: buildScenarioSet(candidate, macro),
    })),
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
              "You are a portfolio recommendation synthesizer. Combine a global macro agent, a per-symbol news agent, a per-symbol bear case agent, a per-symbol fundamentals agent, and a valuation scenario engine into advisory recommendations. The valuation engine provides archetype-based bull/base/bear scenarios and a weighted target. Use that valuation output as the target-price anchor. Return strict JSON only. Actions must be one of: buy, hold, trim, watch. Conviction score must be 0-100. Confidence must be one of: low, medium, high. Keep summaries and risks concise, concrete, and investment-advisory in tone. Do not summarize headlines, do not mention agents, and do not explain chain-of-thought. Respect current weight and avoid absurd target weights. When the valuation anchor and agent stack disagree, lower conviction instead of forcing a strong call.",
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
                  targetValidationStatus: { type: "string", enum: ["plausible", "stretched", "aggressive", "unavailable"] },
                  targetValidationSummary: { type: "string" },
                  impliedUpsidePct: { type: ["number", "null"] },
                },
                required: ["symbolId", "action", "targetWeight", "targetPrice", "convictionScore", "summary", "risks", "confidence", "targetValidationStatus", "targetValidationSummary", "impliedUpsidePct"],
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
    targetValidationStatus: ["plausible", "stretched", "aggressive", "unavailable"].includes(item.targetValidationStatus)
      ? item.targetValidationStatus
      : "unavailable",
    targetValidationSummary: String(item.targetValidationSummary || "Target validation unavailable."),
    impliedUpsidePct: item.impliedUpsidePct === null ? null : Number(item.impliedUpsidePct),
  }));
}

export async function runRecommendationSynthesis(ownerId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase env vars are not configured yet.");

  const { data: synthesisRun, error: synthesisRunError } = await supabase
    .from("synthesis_runs")
    .insert({
      owner_id: ownerId,
      model: "gpt-4.1-mini",
      status: "running",
      trigger_type: "manual",
      summary: "Synthesizing advisory recommendations from current news, bear case, fundamentals, macro, and valuation scenario outputs.",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (synthesisRunError || !synthesisRun) {
    throw new Error(synthesisRunError?.message || "Failed to create synthesis run.");
  }

  try {
    const [{ data: agentOutputs, error: agentOutputsError }, { data: positions, error: positionsError }, { data: watchlistItems, error: watchlistError }, { data: fundamentalsSnapshots, error: fundamentalsSnapshotsError }] = await Promise.all([
      supabase
        .from("agent_outputs")
        .select("id, symbol_id, scope_type, scope_key, agent_name, stance, normalized_score, confidence_score, action_bias, target_weight_delta, summary, thesis, created_at")
        .eq("owner_id", ownerId)
        .in("agent_name", ["news-agent", "bear-case-agent", "fundamentals-agent", "macro-agent"])
        .order("created_at", { ascending: false }),
      supabase
        .from("portfolio_positions")
        .select("portfolio_id, quantity, average_cost, portfolios(id, name), symbols(id, ticker, name, symbol_price_snapshots(price, percent_change, fetched_at))"),
      supabase
        .from("watchlist_items")
        .select("symbols(id, ticker, name, symbol_price_snapshots(price, percent_change, fetched_at))"),
      supabase
        .from("symbol_fundamentals")
        .select("symbol_id, pe_ttm, pb_ttm, ps_ttm, revenue_growth_ttm, eps_growth_5y, net_margin_ttm, operating_margin_ttm, roe_ttm, market_cap_m"),
    ]);

    if (agentOutputsError) throw new Error(agentOutputsError.message);
    if (positionsError) throw new Error(positionsError.message);
    if (watchlistError) throw new Error(watchlistError.message);
    if (fundamentalsSnapshotsError) throw new Error(fundamentalsSnapshotsError.message);

    const outputs = (agentOutputs || []) as AgentOutputRow[];
    const macro = outputs.find((row) => row.agent_name === "macro-agent" && row.scope_type === "global") || null;
    const newsBySymbol = new Map<string, AgentOutputRow>();
    const bearCaseBySymbol = new Map<string, AgentOutputRow>();
    const fundamentalsBySymbol = new Map<string, AgentOutputRow>();

    outputs.forEach((row) => {
      if (!row.symbol_id) return;
      if (row.agent_name === "news-agent" && !newsBySymbol.has(row.symbol_id)) newsBySymbol.set(row.symbol_id, row);
      if (row.agent_name === "bear-case-agent" && !bearCaseBySymbol.has(row.symbol_id)) bearCaseBySymbol.set(row.symbol_id, row);
      if (row.agent_name === "fundamentals-agent" && !fundamentalsBySymbol.has(row.symbol_id)) fundamentalsBySymbol.set(row.symbol_id, row);
    });

    const positionRows = (positions || []) as PositionRow[];
    const watchlistRows = (watchlistItems || []) as WatchlistRow[];
    const fundamentalsRows = (fundamentalsSnapshots || []) as SymbolFundamentalsRow[];
    const fundamentalsSnapshotsBySymbol = new Map(fundamentalsRows.map((row) => [row.symbol_id, row]));

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
      const bearCase = bearCaseBySymbol.get(symbol.id);
      const fundamentals = fundamentalsBySymbol.get(symbol.id);
      const fundamentalsSnapshot = fundamentalsSnapshotsBySymbol.get(symbol.id);

      candidates.push({
        symbolId: symbol.id,
        portfolioId: portfolio?.id || null,
        ticker: symbol.ticker,
        name: symbol.name,
        currentWeight,
        gainLossPct,
        priceChangePct: quote?.percent_change ?? null,
        currentPrice: quote?.price ?? null,
        fundamentalsSnapshot: fundamentalsSnapshot
          ? {
              peTtm: fundamentalsSnapshot.pe_ttm ?? null,
              pbTtm: fundamentalsSnapshot.pb_ttm ?? null,
              psTtm: fundamentalsSnapshot.ps_ttm ?? null,
              revenueGrowthTtm: fundamentalsSnapshot.revenue_growth_ttm ?? null,
              epsGrowth5Y: fundamentalsSnapshot.eps_growth_5y ?? null,
              netMarginTtm: fundamentalsSnapshot.net_margin_ttm ?? null,
              operatingMarginTtm: fundamentalsSnapshot.operating_margin_ttm ?? null,
              roeTtm: fundamentalsSnapshot.roe_ttm ?? null,
              marketCapM: fundamentalsSnapshot.market_cap_m ?? null,
            }
          : null,
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
        bearCase: bearCase
          ? {
              stance: bearCase.stance,
              normalizedScore: bearCase.normalized_score,
              confidenceScore: bearCase.confidence_score,
              actionBias: bearCase.action_bias,
              targetWeightDelta: bearCase.target_weight_delta,
              summary: bearCase.summary,
              thesis: bearCase.thesis,
            }
          : null,
        fundamentals: fundamentals
          ? {
              stance: fundamentals.stance,
              normalizedScore: fundamentals.normalized_score,
              confidenceScore: fundamentals.confidence_score,
              actionBias: fundamentals.action_bias,
              targetWeightDelta: fundamentals.target_weight_delta,
              summary: fundamentals.summary,
              thesis: fundamentals.thesis,
            }
          : null,
      });
    });

    watchlistRows.forEach((item) => {
      const symbol = firstRelation(item.symbols);
      const quote = firstRelation(symbol?.symbol_price_snapshots || null);
      if (!symbol?.id || seenSymbolIds.has(symbol.id)) return;
      const news = newsBySymbol.get(symbol.id);
      const bearCase = bearCaseBySymbol.get(symbol.id);
      const fundamentals = fundamentalsBySymbol.get(symbol.id);
      const fundamentalsSnapshot = fundamentalsSnapshotsBySymbol.get(symbol.id);

      candidates.push({
        symbolId: symbol.id,
        portfolioId: null,
        ticker: symbol.ticker,
        name: symbol.name,
        currentWeight: null,
        gainLossPct: null,
        priceChangePct: quote?.percent_change ?? null,
        currentPrice: quote?.price ?? null,
        fundamentalsSnapshot: fundamentalsSnapshot
          ? {
              peTtm: fundamentalsSnapshot.pe_ttm ?? null,
              pbTtm: fundamentalsSnapshot.pb_ttm ?? null,
              psTtm: fundamentalsSnapshot.ps_ttm ?? null,
              revenueGrowthTtm: fundamentalsSnapshot.revenue_growth_ttm ?? null,
              epsGrowth5Y: fundamentalsSnapshot.eps_growth_5y ?? null,
              netMarginTtm: fundamentalsSnapshot.net_margin_ttm ?? null,
              operatingMarginTtm: fundamentalsSnapshot.operating_margin_ttm ?? null,
              roeTtm: fundamentalsSnapshot.roe_ttm ?? null,
              marketCapM: fundamentalsSnapshot.market_cap_m ?? null,
            }
          : null,
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
        bearCase: bearCase
          ? {
              stance: bearCase.stance,
              normalizedScore: bearCase.normalized_score,
              confidenceScore: bearCase.confidence_score,
              actionBias: bearCase.action_bias,
              targetWeightDelta: bearCase.target_weight_delta,
              summary: bearCase.summary,
              thesis: bearCase.thesis,
            }
          : null,
        fundamentals: fundamentals
          ? {
              stance: fundamentals.stance,
              normalizedScore: fundamentals.normalized_score,
              confidenceScore: fundamentals.confidence_score,
              actionBias: fundamentals.action_bias,
              targetWeightDelta: fundamentals.target_weight_delta,
              summary: fundamentals.summary,
              thesis: fundamentals.thesis,
            }
          : null,
      });
    });

    if (!candidates.length) throw new Error("No symbols available for synthesis.");

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
    if (insertError) throw new Error(insertError.message);

    await supabase
      .from("synthesis_runs")
      .update({
        model: usedModel,
        status: "completed",
        summary: `Synthesized ${rowsToInsert.length} advisory recommendation${rowsToInsert.length === 1 ? "" : "s"} from news, bear case, fundamentals, macro, and valuation scenarios.`,
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
