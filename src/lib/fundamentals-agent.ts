import { buildAgentOutputContract, confidenceFromPercent, scoreFromPercent } from "@/lib/agent-output-contract";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const FMP_BASE_URL = "https://financialmodelingprep.com";
const FUNDAMENTALS_AGENT_NAME = "fundamentals-agent";

function getFmpKey() {
  return process.env.FMP_API_KEY || "";
}

async function fetchFmpJson<T>(path: string) {
  const apiKey = getFmpKey();
  if (!apiKey) {
    throw new Error("FMP API key is not configured.");
  }

  const url = `${FMP_BASE_URL}${path}${path.includes("?") ? "&" : "?"}apikey=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`FMP request failed with status ${response.status} for ${path}.`);
  }

  return (await response.json()) as T;
}

type FmpKeyMetricsRow = {
  peRatioTTM?: number;
  pbRatioTTM?: number;
  currentRatioTTM?: number;
  marketCap?: number;
};

type FmpRatiosRow = {
  priceToSalesRatioTTM?: number;
  netProfitMarginTTM?: number;
  operatingProfitMarginTTM?: number;
  returnOnEquityTTM?: number;
};

type FmpGrowthRow = {
  growthRevenue?: number;
  growthNetIncome?: number;
};

async function fetchFmpFundamentals(symbol: string) {
  const [keyMetricsResult, ratiosResult, growthResult] = await Promise.allSettled([
    fetchFmpJson<FmpKeyMetricsRow[]>(`/stable/key-metrics-ttm?symbol=${encodeURIComponent(symbol)}`),
    fetchFmpJson<FmpRatiosRow[]>(`/stable/ratios-ttm?symbol=${encodeURIComponent(symbol)}`),
    fetchFmpJson<FmpGrowthRow[]>(`/stable/income-statement-growth?symbol=${encodeURIComponent(symbol)}`),
  ]);

  const keyMetricsRows = keyMetricsResult.status === "fulfilled" ? keyMetricsResult.value : [];
  const ratiosRows = ratiosResult.status === "fulfilled" ? ratiosResult.value : [];
  const growthRows = growthResult.status === "fulfilled" ? growthResult.value : [];
  const errors = [keyMetricsResult, ratiosResult, growthResult]
    .filter((result) => result.status === "rejected")
    .map((result) => (result as PromiseRejectedResult).reason)
    .map((reason) => (reason instanceof Error ? reason.message : String(reason)));

  const keyMetrics = Array.isArray(keyMetricsRows) ? (keyMetricsRows[0] ?? {}) : {};
  const ratios = Array.isArray(ratiosRows) ? (ratiosRows[0] ?? {}) : {};
  const growth = Array.isArray(growthRows) ? (growthRows[0] ?? {}) : {};

  const hasAnyData = Object.keys(keyMetrics).length > 0 || Object.keys(ratios).length > 0 || Object.keys(growth).length > 0;
  if (!hasAnyData) {
    throw new Error(errors[0] || `No FMP fundamentals data returned for ${symbol}.`);
  }

  return {
    keyMetrics,
    ratios,
    growth,
    errors,
  };
}

type TrackedSymbol = {
  id: string;
  ticker: string;
  name: string | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

async function getTrackedSymbols(ownerId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new Error("Supabase env vars are not configured yet.");
  }

  const [watchlistItemsResult, portfolioPositionsResult] = await Promise.all([
    supabase.from("watchlist_items").select("symbol_id, watchlists!inner(owner_id)").eq("watchlists.owner_id", ownerId),
    supabase.from("portfolio_positions").select("symbol_id, portfolios!inner(owner_id)").eq("portfolios.owner_id", ownerId),
  ]);

  if (watchlistItemsResult.error) throw new Error(watchlistItemsResult.error.message);
  if (portfolioPositionsResult.error) throw new Error(portfolioPositionsResult.error.message);

  const symbolIds = [
    ...(watchlistItemsResult.data || []).map((item) => item.symbol_id),
    ...(portfolioPositionsResult.data || []).map((item) => item.symbol_id),
  ].filter(Boolean);

  const uniqueSymbolIds = [...new Set(symbolIds)];
  if (!uniqueSymbolIds.length) return [] as TrackedSymbol[];

  const { data, error } = await supabase.from("symbols").select("id, ticker, name").in("id", uniqueSymbolIds).order("ticker", { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []) as TrackedSymbol[];
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function buildFundamentalsAgentOutput(ownerId: string, symbol: TrackedSymbol, metrics: Record<string, unknown>) {
  const pe = numberOrNull(metrics.peTTM);
  const pb = numberOrNull(metrics.pbAnnual);
  const ps = numberOrNull(metrics.psTTM);
  const revenueGrowth = numberOrNull(metrics.revenueGrowthTTMYoy);
  const epsGrowth5Y = numberOrNull(metrics.epsGrowth5Y);
  const netMargin = numberOrNull(metrics.netMarginTTM);
  const operatingMargin = numberOrNull(metrics.operatingMarginTTM);
  const roe = numberOrNull(metrics.roeTTM);
  const currentRatio = numberOrNull(metrics.currentRatioQuarterly);
  const marketCap = numberOrNull(metrics.marketCapitalization);

  let score = 50;
  if (revenueGrowth !== null) score += revenueGrowth > 10 ? 8 : revenueGrowth > 0 ? 3 : -6;
  if (epsGrowth5Y !== null) score += epsGrowth5Y > 10 ? 7 : epsGrowth5Y > 0 ? 3 : -5;
  if (netMargin !== null) score += netMargin > 15 ? 7 : netMargin > 5 ? 3 : -4;
  if (operatingMargin !== null) score += operatingMargin > 20 ? 5 : operatingMargin > 10 ? 2 : -3;
  if (roe !== null) score += roe > 20 ? 6 : roe > 10 ? 3 : -3;
  if (currentRatio !== null) score += currentRatio < 0.9 ? -3 : currentRatio > 1.2 ? 2 : 0;
  if (pe !== null) score += pe < 20 ? 5 : pe < 30 ? 1 : pe > 45 ? -7 : -2;
  if (ps !== null) score += ps > 12 ? -4 : ps < 4 ? 2 : 0;
  if (pb !== null) score += pb > 10 ? -3 : pb < 4 ? 1 : 0;

  const rawScore = clamp(Math.round(score), 0, 100);
  const rawConfidence = clamp(
    35 + [pe, revenueGrowth, epsGrowth5Y, netMargin, operatingMargin, roe].filter((value) => value !== null).length * 8,
    30,
    90,
  );

  const normalizedScore = scoreFromPercent(rawScore);
  const confidenceScore = confidenceFromPercent(rawConfidence);

  const stance = normalizedScore >= 0.2 ? "bullish" : normalizedScore <= -0.2 ? "bearish" : "neutral";
  const actionBias = normalizedScore >= 0.2 ? "increase" : normalizedScore <= -0.2 ? "reduce" : "hold";
  const targetWeightDelta = normalizedScore >= 0.2 ? 1.5 : normalizedScore <= -0.2 ? -1.5 : 0;

  const summary =
    stance === "bullish"
      ? `${symbol.ticker} fundamentals look supportive overall, with enough quality and growth to reinforce the long case.`
      : stance === "bearish"
        ? `${symbol.ticker} fundamentals look weak enough to limit confidence in the current setup.`
        : `${symbol.ticker} fundamentals are mixed, with some support but not enough clarity to strongly raise conviction.`;

  const thesis = `P/E ${pe ?? "n/a"}, revenue growth ${revenueGrowth ?? "n/a"}%, EPS growth 5Y ${epsGrowth5Y ?? "n/a"}%, net margin ${netMargin ?? "n/a"}%, ROE ${roe ?? "n/a"}%.`;

  return buildAgentOutputContract({
    owner_id: ownerId,
    agent_name: FUNDAMENTALS_AGENT_NAME,
    symbol_id: symbol.id,
    scope_type: "symbol",
    scope_key: symbol.ticker,
    stance,
    normalized_score: normalizedScore,
    confidence_score: confidenceScore,
    action_bias: actionBias,
    target_weight_delta: targetWeightDelta,
    time_horizon: "months",
    summary,
    thesis,
    evidence_json: {
      pe_ttm: pe,
      pb_ttm: pb,
      ps_ttm: ps,
      revenue_growth_ttm: revenueGrowth,
      eps_growth_5y: epsGrowth5Y,
      net_margin_ttm: netMargin,
      operating_margin_ttm: operatingMargin,
      roe_ttm: roe,
      current_ratio_quarterly: currentRatio,
      market_cap_m: marketCap,
    },
    expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
  });
}

export async function refreshFundamentalsAndAgent(ownerId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new Error("Supabase env vars are not configured yet.");
  }

  const trackedSymbols = await getTrackedSymbols(ownerId);
  if (!trackedSymbols.length) {
    return { refreshedCount: 0 };
  }

  const fundamentalsRows: Array<Record<string, unknown>> = [];
  const agentRows: Array<Record<string, unknown>> = [];
  const skippedSymbols: string[] = [];
  const skipReasons: string[] = [];

  for (const symbol of trackedSymbols) {
    try {
      const result = await fetchFmpFundamentals(symbol.ticker);
      const metrics = {
        peTTM: result.keyMetrics.peRatioTTM,
        pbAnnual: result.keyMetrics.pbRatioTTM,
        psTTM: result.ratios.priceToSalesRatioTTM,
        revenueGrowthTTMYoy: typeof result.growth.growthRevenue === "number" ? result.growth.growthRevenue * 100 : null,
        epsGrowth5Y: null,
        netMarginTTM: typeof result.ratios.netProfitMarginTTM === "number" ? result.ratios.netProfitMarginTTM * 100 : null,
        operatingMarginTTM: typeof result.ratios.operatingProfitMarginTTM === "number" ? result.ratios.operatingProfitMarginTTM * 100 : null,
        roeTTM: typeof result.ratios.returnOnEquityTTM === "number" ? result.ratios.returnOnEquityTTM * 100 : null,
        currentRatioQuarterly: result.keyMetrics.currentRatioTTM,
        marketCapitalization: typeof result.keyMetrics.marketCap === "number" ? result.keyMetrics.marketCap / 1_000_000 : null,
      };

      fundamentalsRows.push({
        symbol_id: symbol.id,
        pe_ttm: numberOrNull(metrics.peTTM),
        pb_ttm: numberOrNull(metrics.pbAnnual),
        ps_ttm: numberOrNull(metrics.psTTM),
        revenue_growth_ttm: numberOrNull(metrics.revenueGrowthTTMYoy),
        eps_growth_5y: numberOrNull(metrics.epsGrowth5Y),
        net_margin_ttm: numberOrNull(metrics.netMarginTTM),
        operating_margin_ttm: numberOrNull(metrics.operatingMarginTTM),
        roe_ttm: numberOrNull(metrics.roeTTM),
        current_ratio_quarterly: numberOrNull(metrics.currentRatioQuarterly),
        market_cap_m: numberOrNull(metrics.marketCapitalization),
        raw_metrics: result,
        fetched_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      agentRows.push(buildFundamentalsAgentOutput(ownerId, symbol, metrics));

      if (result.errors.length) {
        skipReasons.push(`${symbol.ticker}: partial FMP coverage (${result.errors.join(" | ")})`);
      }
    } catch (error) {
      skippedSymbols.push(symbol.ticker);
      skipReasons.push(`${symbol.ticker}: ${error instanceof Error ? error.message : "Unknown fundamentals refresh failure."}`);
      continue;
    }
  }

  if (fundamentalsRows.length) {
    const { error } = await supabase.from("symbol_fundamentals").upsert(fundamentalsRows, { onConflict: "symbol_id" });
    if (error) throw new Error(error.message);
  }

  const symbolIds = trackedSymbols.map((symbol) => symbol.id);
  if (symbolIds.length) {
    await supabase.from("agent_outputs").delete().eq("owner_id", ownerId).eq("agent_name", FUNDAMENTALS_AGENT_NAME).in("symbol_id", symbolIds);
  }

  if (agentRows.length) {
    const { error } = await supabase.from("agent_outputs").insert(agentRows);
    if (error) throw new Error(error.message);
  }

  return { refreshedCount: fundamentalsRows.length, consideredCount: trackedSymbols.length, skippedSymbols, skipReasons };
}
