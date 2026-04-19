import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type SearchResult = {
  title?: string;
  url?: string;
  source?: string;
  published_at?: string;
  snippet?: string;
};

type SearchResponse = {
  web?: {
    results?: SearchResult[];
  };
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
const NEWS_RESULT_LIMIT = 3;
const SHARED_AGENT_NAME = "shared-news-agent";
const SHARED_RUN_TYPE = "news-research";

function getBraveApiKey() {
  return process.env.BRAVE_API_KEY || "";
}

function buildQuery(symbol: TrackedSymbol) {
  const parts = [symbol.ticker];
  if (symbol.name) {
    parts.push(`"${symbol.name}"`);
  }

  parts.push("stock OR company news OR earnings OR guidance");
  return parts.join(" ");
}

async function fetchBraveNewsResults(query: string): Promise<SearchResult[]> {
  const apiKey = getBraveApiKey();
  if (!apiKey) {
    throw new Error("BRAVE_API_KEY is not configured.");
  }

  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(NEWS_RESULT_LIMIT));
  url.searchParams.set("freshness", "pw");
  url.searchParams.set("search_lang", "en");
  url.searchParams.set("country", "us");

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Brave search failed with status ${response.status}`);
  }

  const json = (await response.json()) as SearchResponse;
  return json.web?.results?.slice(0, NEWS_RESULT_LIMIT) || [];
}

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

function buildInsight(symbol: TrackedSymbol, results: SearchResult[]) {
  const usable = results.filter((item) => item.title && item.url);
  const snippets = usable.map((item) => item.snippet || item.title || "").filter(Boolean);
  const direction = inferDirection(snippets);
  const top = usable[0];
  const sourceCount = usable.length;

  return {
    title: `${symbol.ticker} shared news pulse`,
    summary:
      sourceCount > 0
        ? `${symbol.ticker} surfaced ${sourceCount} recent news signal${sourceCount === 1 ? "" : "s"}, led by ${top?.source || "recent coverage"}.`
        : `${symbol.ticker} had no recent news coverage captured in this pass.`,
    thesis:
      sourceCount > 0
        ? snippets.slice(0, 2).join(" ")
        : `No strong recent news signal was captured for ${symbol.ticker} in this pass.`,
    direction,
    confidenceScore: Math.min(85, 35 + sourceCount * 15),
    evidenceJson: usable.map((item) => ({
      title: item.title,
      source: item.source || null,
      published_at: item.published_at || null,
      snippet: item.snippet || null,
      url: item.url,
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
      summary: `Scanning recent news for ${trackedSymbols.length} tracked symbols.`,
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
      const results = await fetchBraveNewsResults(buildQuery(symbol));
      if (!results.length) {
        continue;
      }

      const insight = buildInsight(symbol, results);
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
      ? `Generated ${insightsToInsert.length} shared news insight${insightsToInsert.length === 1 ? "" : "s"} across ${trackedSymbols.length} tracked symbols.`
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
