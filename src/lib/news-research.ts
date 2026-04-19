import { createSupabaseAdminClient } from "@/lib/supabase-admin";

import { getFinnhubCompanyNews } from "@/lib/finnhub-news";
import { getGoogleNewsRssItems } from "@/lib/google-news";

export type NewsItem = {
  title: string;
  url: string;
  source: string;
  published_at?: string | null;
  snippet?: string | null;
  source_type: "finnhub" | "google-news";
};

type TrackedSymbol = {
  id: string;
  ticker: string;
  name: string | null;
};

export type SharedNewsResearchResult = {
  runId: string;
  insightsCreated: number;
  symbolsConsidered: number;
  summary: string;
};

const NEWS_QUERY_LIMIT = 5;
const NEWS_RESULT_LIMIT = 5;
const SHARED_AGENT_NAME = "shared-news-agent";
const SHARED_RUN_TYPE = "news-research";
const NEWS_AGENT_NAME = "news-agent";
const BEAR_CASE_AGENT_NAME = "bear-case-agent";

function inferDirection(snippets: string[]) {
  const text = snippets.join(" ").toLowerCase();
  const bullishTerms = ["beat", "surge", "growth", "upgrade", "record", "profit", "strong", "partnership"];
  const bearishTerms = ["miss", "fall", "drop", "downgrade", "probe", "lawsuit", "cut", "weak", "decline"];

  const bullishScore = bullishTerms.reduce((count, term) => count + (text.includes(term) ? 1 : 0), 0);
  const bearishScore = bearishTerms.reduce((count, term) => count + (text.includes(term) ? 1 : 0), 0);

  if (bullishScore === bearishScore) {
    return "mixed";
  }

  return bullishScore > bearishScore ? "bullish" : "bearish";
}

function normalizeUrl(url: string) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url;
  }
}

export function dedupeNews(items: NewsItem[]) {
  const seen = new Set<string>();
  const deduped: NewsItem[] = [];

  for (const item of items) {
    const key = `${normalizeUrl(item.url)}::${item.title.trim().toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

export function buildInsight(symbol: TrackedSymbol, results: NewsItem[]) {
  const usable = dedupeNews(results).slice(0, NEWS_RESULT_LIMIT);
  const snippets = usable.map((item) => item.snippet || item.title || "").filter(Boolean);
  const direction = inferDirection(snippets);
  const uniqueFeeds = new Set(usable.map((item) => item.source_type));
  const sourceCount = usable.length;
  const corroborated = uniqueFeeds.size > 1;

  return {
    title: `${symbol.ticker} shared news pulse`,
    summary:
      sourceCount > 0
        ? `${symbol.ticker} surfaced ${sourceCount} recent news signal${sourceCount === 1 ? "" : "s"}${corroborated ? " across Finnhub and Google News" : ""}.`
        : `${symbol.ticker} had no recent news coverage captured in this pass.`,
    thesis:
      sourceCount > 0
        ? snippets.slice(0, 3).join(" ")
        : `No strong recent news signal was captured for ${symbol.ticker} in this pass.`,
    direction,
    corroborated,
    sourceCount,
    confidenceScore: Math.min(92, 35 + sourceCount * 10 + (corroborated ? 12 : 0)),
    evidenceJson: usable.map((item) => ({
      title: item.title,
      source: item.source,
      published_at: item.published_at || null,
      snippet: item.snippet || null,
      url: item.url,
      source_type: item.source_type,
    })),
    sourceUrlsJson: usable.map((item) => item.url),
  };
}

function buildNewsAgentOutput(ownerId: string, researchRunId: string, symbol: TrackedSymbol, insight: ReturnType<typeof buildInsight>) {
  const stance = insight.direction;
  const normalizedScore =
    stance === "bullish"
      ? Math.min(100, 55 + insight.confidenceScore * 0.45)
      : stance === "bearish"
        ? Math.max(0, 45 - insight.confidenceScore * 0.35)
        : 50;
  const actionBias =
    stance === "bullish"
      ? "increase"
      : stance === "bearish"
        ? "decrease"
        : "hold";
  const targetWeightDelta =
    stance === "bullish"
      ? Math.min(4, Number((insight.confidenceScore / 25).toFixed(2)))
      : stance === "bearish"
        ? -Math.min(4, Number((insight.confidenceScore / 28).toFixed(2)))
        : 0;

  return {
    owner_id: ownerId,
    research_run_id: researchRunId,
    agent_name: NEWS_AGENT_NAME,
    symbol_id: symbol.id,
    scope_type: "symbol",
    scope_key: symbol.ticker,
    stance,
    normalized_score: Number(normalizedScore.toFixed(2)),
    confidence_score: insight.confidenceScore,
    action_bias: actionBias,
    target_weight_delta: Number(targetWeightDelta.toFixed(2)),
    time_horizon: "days",
    thesis: insight.thesis,
    summary: insight.summary,
    evidence_json: {
      corroborated: insight.corroborated,
      source_count: insight.sourceCount,
      evidence: insight.evidenceJson,
    },
    expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
  };
}

function buildBearCaseAgentOutput(ownerId: string, researchRunId: string, symbol: TrackedSymbol, insight: ReturnType<typeof buildInsight>) {
  const downsidePressure =
    insight.direction === "bearish"
      ? Math.min(95, 55 + insight.confidenceScore * 0.45)
      : insight.direction === "bullish"
        ? Math.max(18, 42 - insight.confidenceScore * 0.2)
        : Math.min(70, 38 + insight.confidenceScore * 0.2);

  const stance = downsidePressure >= 62 ? "bearish" : downsidePressure <= 32 ? "limited" : "cautious";
  const actionBias = downsidePressure >= 62 ? "decrease" : downsidePressure <= 32 ? "hold" : "decrease";
  const targetWeightDelta = downsidePressure >= 62 ? -Math.min(4.5, Number((insight.confidenceScore / 20).toFixed(2))) : downsidePressure >= 45 ? -Math.min(2.5, Number((insight.confidenceScore / 35).toFixed(2))) : 0;
  const summary =
    stance === "bearish"
      ? `${symbol.ticker} bear case is material right now, with enough downside pressure to challenge the upside thesis.`
      : stance === "cautious"
        ? `${symbol.ticker} still has a live downside case, even if it is not strong enough yet to fully break the setup.`
        : `${symbol.ticker} bear case currently looks limited, with no dominant downside signal in the latest research pass.`;
  const thesis =
    stance === "bearish"
      ? `If the current setup weakens, ${symbol.ticker} could re-rate lower because recent signals include enough cautionary pressure to challenge confidence.`
      : stance === "cautious"
        ? `The downside case for ${symbol.ticker} is not dominant, but there is enough caution in recent coverage to justify tighter risk discipline.`
        : `The downside case for ${symbol.ticker} currently looks contained, though that can change quickly if new negative catalysts appear.`;

  return {
    owner_id: ownerId,
    research_run_id: researchRunId,
    agent_name: BEAR_CASE_AGENT_NAME,
    symbol_id: symbol.id,
    scope_type: "symbol",
    scope_key: symbol.ticker,
    stance,
    normalized_score: Number(downsidePressure.toFixed(2)),
    confidence_score: Math.max(25, insight.confidenceScore - (insight.direction === "bullish" ? 10 : 0)),
    action_bias: actionBias,
    target_weight_delta: Number(targetWeightDelta.toFixed(2)),
    time_horizon: "days",
    thesis,
    summary,
    evidence_json: {
      derived_from: "shared-news-research",
      downside_pressure: Number(downsidePressure.toFixed(2)),
      evidence: insight.evidenceJson,
    },
    expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
  };
}

async function getTrackedSymbols() {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new Error("Supabase env vars are not configured yet.");
  }

  const [watchlistItemsResult, portfolioPositionsResult] = await Promise.all([
    supabase.from("watchlist_items").select("symbol_id"),
    supabase.from("portfolio_positions").select("symbol_id"),
  ]);

  if (watchlistItemsResult.error) {
    throw new Error(watchlistItemsResult.error.message);
  }

  if (portfolioPositionsResult.error) {
    throw new Error(portfolioPositionsResult.error.message);
  }

  const symbolIds = [
    ...(watchlistItemsResult.data || []).map((item) => item.symbol_id),
    ...(portfolioPositionsResult.data || []).map((item) => item.symbol_id),
  ].filter(Boolean);

  const uniqueSymbolIds = [...new Set(symbolIds)];
  if (!uniqueSymbolIds.length) {
    return [] as TrackedSymbol[];
  }

  const { data: symbols, error } = await supabase
    .from("symbols")
    .select("id, ticker, name")
    .in("id", uniqueSymbolIds)
    .order("ticker", { ascending: true })
    .limit(NEWS_QUERY_LIMIT);

  if (error) {
    throw new Error(error.message);
  }

  return (symbols || []) as TrackedSymbol[];
}

export async function runSharedNewsResearch(ownerId: string): Promise<SharedNewsResearchResult> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new Error("Supabase env vars are not configured yet.");
  }

  const trackedSymbols = await getTrackedSymbols();

  const { data: runRow, error: runError } = await supabase
    .from("research_runs")
    .insert({
      owner_id: ownerId,
      agent_name: SHARED_AGENT_NAME,
      run_type: SHARED_RUN_TYPE,
      scope_type: "shared",
      scope_key: "tracked-universe",
      status: "running",
      summary: `Scanning recent news for ${trackedSymbols.length} tracked symbols via Finnhub and Google News.`,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (runError || !runRow) {
    throw new Error(runError?.message || "Failed to create research run.");
  }

  try {
    const insightsToInsert: Array<Record<string, unknown>> = [];
    const agentOutputsToInsert: Array<Record<string, unknown>> = [];

    for (const symbol of trackedSymbols) {
      const [finnhubResults, googleResults] = await Promise.all([
        getFinnhubCompanyNews(symbol.ticker),
        getGoogleNewsRssItems(symbol.ticker, symbol.name || undefined),
      ]);

      const mergedResults = dedupeNews([...finnhubResults, ...googleResults]);
      if (!mergedResults.length) {
        continue;
      }

      const insight = buildInsight(symbol, mergedResults);
      insightsToInsert.push({
        owner_id: ownerId,
        research_run_id: runRow.id,
        insight_type: "news",
        scope_type: "symbol",
        scope_key: symbol.ticker,
        symbol_id: symbol.id,
        title: insight.title,
        summary: insight.summary,
        thesis: insight.thesis,
        direction: insight.direction,
        confidence_score: insight.confidenceScore,
        time_horizon: "days",
        evidence_json: insight.evidenceJson,
        source_urls_json: insight.sourceUrlsJson,
        expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
      });

      agentOutputsToInsert.push(buildNewsAgentOutput(ownerId, runRow.id, symbol, insight));
      agentOutputsToInsert.push(buildBearCaseAgentOutput(ownerId, runRow.id, symbol, insight));
    }

    if (insightsToInsert.length) {
      const { error: insertError } = await supabase.from("research_insights").insert(insightsToInsert);
      if (insertError) {
        throw new Error(insertError.message);
      }
    }

    if (agentOutputsToInsert.length) {
      const symbolIds = agentOutputsToInsert.map((row) => row.symbol_id).filter(Boolean);
      if (symbolIds.length) {
        await supabase.from("agent_outputs").delete().eq("owner_id", ownerId).in("agent_name", [NEWS_AGENT_NAME, BEAR_CASE_AGENT_NAME]).in("symbol_id", symbolIds);
      }

      const { error: agentOutputError } = await supabase.from("agent_outputs").insert(agentOutputsToInsert);
      if (agentOutputError) {
        throw new Error(agentOutputError.message);
      }
    }

    const summary = insightsToInsert.length
      ? `Generated ${insightsToInsert.length} shared news insight${insightsToInsert.length === 1 ? "" : "s"} and ${agentOutputsToInsert.length} structured agent output${agentOutputsToInsert.length === 1 ? "" : "s"} across ${trackedSymbols.length} tracked symbols using Finnhub and Google News.`
      : `Scanned ${trackedSymbols.length} tracked symbols but did not capture usable news results.`;

    await supabase
      .from("research_runs")
      .update({
        status: "completed",
        summary,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runRow.id);

    return {
      runId: runRow.id,
      insightsCreated: insightsToInsert.length,
      symbolsConsidered: trackedSymbols.length,
      summary,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Shared news research failed.";

    await supabase
      .from("research_runs")
      .update({
        status: "failed",
        summary: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runRow.id);

    throw error;
  }
}
