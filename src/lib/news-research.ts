import { createSupabaseAdminClient } from "@/lib/supabase-admin";

import { getFinnhubCompanyNews } from "@/lib/finnhub-news";
import { getGoogleNewsRssItems } from "@/lib/google-news";

type NewsItem = {
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

function dedupeNews(items: NewsItem[]) {
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

function buildInsight(symbol: TrackedSymbol, results: NewsItem[]) {
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

export async function runSharedNewsResearch(ownerId: string): Promise<SharedNewsResearchResult> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new Error("Supabase env vars are not configured yet.");
  }

  const { data: trackedRows, error: trackedError } = await supabase
    .from("symbols")
    .select("id, ticker, name")
    .or(`id.in.(select symbol_id from watchlist_items),id.in.(select symbol_id from portfolio_positions)`)
    .order("ticker", { ascending: true })
    .limit(NEWS_QUERY_LIMIT);

  if (trackedError) {
    throw new Error(trackedError.message);
  }

  const trackedSymbols = (trackedRows || []) as TrackedSymbol[];

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
    }

    if (insightsToInsert.length) {
      const { error: insertError } = await supabase.from("research_insights").insert(insightsToInsert);
      if (insertError) {
        throw new Error(insertError.message);
      }
    }

    const summary = insightsToInsert.length
      ? `Generated ${insightsToInsert.length} shared news insight${insightsToInsert.length === 1 ? "" : "s"} across ${trackedSymbols.length} tracked symbols using Finnhub and Google News.`
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
