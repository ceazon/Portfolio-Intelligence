import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { FmpError, getFmpProfile, getFmpQuote } from "@/lib/fmp";
import { getYahooChartQuote } from "@/lib/yahoo-finance";

async function recordAgentRun(runType: string, status: string, summary: string, ownerId?: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return;
  }

  await supabase.from("agent_runs").insert({
    owner_id: ownerId || null,
    agent_name: "market-data-sync",
    run_type: runType,
    status,
    summary,
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  });
}

async function getTrackedSymbolRows(ownerId?: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new Error("Supabase env vars are not configured yet.");
  }

  let symbolIds: string[] = [];

  if (ownerId) {
    const [watchlistItemsResult, portfolioPositionsResult] = await Promise.all([
      supabase
        .from("watchlist_items")
        .select("symbol_id, watchlists!inner(owner_id)")
        .eq("watchlists.owner_id", ownerId),
      supabase
        .from("portfolio_positions")
        .select("symbol_id, portfolios!inner(owner_id)")
        .eq("portfolios.owner_id", ownerId),
    ]);

    if (watchlistItemsResult.error) {
      throw new Error(watchlistItemsResult.error.message);
    }

    if (portfolioPositionsResult.error) {
      throw new Error(portfolioPositionsResult.error.message);
    }

    symbolIds = [
      ...(watchlistItemsResult.data || []).map((item) => item.symbol_id),
      ...(portfolioPositionsResult.data || []).map((item) => item.symbol_id),
    ].filter(Boolean);
  } else {
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

    symbolIds = [
      ...(watchlistItemsResult.data || []).map((item) => item.symbol_id),
      ...(portfolioPositionsResult.data || []).map((item) => item.symbol_id),
    ].filter(Boolean);
  }

  const uniqueSymbolIds = [...new Set(symbolIds)];
  if (!uniqueSymbolIds.length) {
    return [] as Array<{ id: string; ticker: string }>;
  }

  const { data: symbols, error } = await supabase.from("symbols").select("id, ticker").in("id", uniqueSymbolIds).order("ticker", { ascending: true });
  if (error) {
    throw new Error(error.message);
  }

  return symbols || [];
}

export async function enrichSymbolAndRefreshQuote(symbolId: string, ticker: string, ownerId?: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new Error("Supabase env vars are not configured yet.");
  }

  const [profileResult, quoteResult] = await Promise.allSettled([getFmpProfile(ticker), getFmpQuote(ticker)]);

  const profile = profileResult.status === "fulfilled" ? profileResult.value : null;
  const fmpQuote = quoteResult.status === "fulfilled" ? quoteResult.value : null;

  const profileError = profileResult.status === "rejected" ? profileResult.reason : null;
  const quoteError = quoteResult.status === "rejected" ? quoteResult.reason : null;

  const nonFmpError = [profileError, quoteError].find((error) => error && !(error instanceof FmpError));
  if (nonFmpError) {
    throw nonFmpError;
  }

  const yahooQuote = !fmpQuote ? await getYahooChartQuote(ticker) : null;
  const quote = fmpQuote
    ? {
        price: fmpQuote.price ?? null,
        change: fmpQuote.change ?? null,
        percentChange: fmpQuote.changesPercentage ?? null,
        high: fmpQuote.dayHigh ?? null,
        low: fmpQuote.dayLow ?? null,
        open: fmpQuote.open ?? null,
        previousClose: fmpQuote.previousClose ?? null,
        source: "fmp" as const,
      }
    : yahooQuote
      ? {
          price: yahooQuote.price,
          change: yahooQuote.change,
          percentChange: yahooQuote.percentChange,
          high: null,
          low: null,
          open: null,
          previousClose: yahooQuote.previousClose,
          source: "yahoo" as const,
        }
      : null;

  if (profile) {
    const { error: symbolUpdateError } = await supabase
      .from("symbols")
      .update({
        name: profile.companyName || undefined,
        exchange: profile.exchangeFullName || profile.exchange || undefined,
        country: profile.country || undefined,
        currency: profile.currency || undefined,
        sector: profile.sector || profile.industry || undefined,
        industry: profile.industry || profile.sector || undefined,
        logo_url: profile.image || undefined,
        web_url: profile.website || undefined,
        market_cap: profile.mktCap || undefined,
        ipo_date: profile.ipoDate || undefined,
        raw_profile: profile,
        last_profile_sync_at: new Date().toISOString(),
      })
      .eq("id", symbolId);

    if (symbolUpdateError) {
      throw new Error(symbolUpdateError.message);
    }
  }

  if (quote) {
    const { error: quoteError } = await supabase.from("symbol_price_snapshots").upsert({
      symbol_id: symbolId,
      price: quote.price ?? null,
      change: quote.change ?? null,
      percent_change: quote.percentChange ?? null,
      high: quote.high ?? null,
      low: quote.low ?? null,
      open: quote.open ?? null,
      previous_close: quote.previousClose ?? null,
      fetched_at: new Date().toISOString(),
    });

    if (quoteError) {
      throw new Error(quoteError.message);
    }

    const { error: syncStampError } = await supabase
      .from("symbols")
      .update({ last_quote_sync_at: new Date().toISOString() })
      .eq("id", symbolId);

    if (syncStampError) {
      throw new Error(syncStampError.message);
    }
  }

  const fmpIssue = [profileError, quoteError].find((error) => error instanceof FmpError) as FmpError | undefined;
  await recordAgentRun(
    "symbol-refresh",
    "completed",
    fmpIssue
      ? `Refreshed ${ticker} with partial data. FMP unavailable: ${fmpIssue.message}. Yahoo fallback quote=${yahooQuote ? "yes" : "no"}`
      : `Refreshed ${ticker} profile=${profile ? "yes" : "no"} quote=${quote ? `yes (${quote.source})` : "no"}`,
    ownerId,
  );

  return { profileLoaded: Boolean(profile), quoteLoaded: Boolean(quote), partial: Boolean(fmpIssue) };
}

export async function refreshTrackedSymbols(ownerId?: string) {
  const symbols = await getTrackedSymbolRows(ownerId);

  if (!symbols.length) {
    throw new Error("No tracked symbols found.");
  }

  let refreshedCount = 0;
  for (const symbol of symbols) {
    await enrichSymbolAndRefreshQuote(symbol.id, symbol.ticker, ownerId);
    refreshedCount += 1;
  }

  await recordAgentRun("bulk-symbol-refresh", "completed", `Refreshed ${refreshedCount} tracked symbols.`, ownerId);
  return { refreshedCount, consideredCount: symbols.length };
}

export async function runCentralQuoteRefresh(cadenceLabel = "manual") {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new Error("Supabase env vars are not configured yet.");
  }

  const { data: runRow, error: runInsertError } = await supabase
    .from("quote_refresh_runs")
    .insert({
      trigger_type: cadenceLabel === "manual" ? "manual" : "scheduled",
      cadence_label: cadenceLabel,
      status: "running",
      started_at: new Date().toISOString(),
      summary: "Refreshing tracked quotes across the shared symbol universe.",
    })
    .select("id")
    .single();

  if (runInsertError || !runRow) {
    throw new Error(runInsertError?.message || "Failed to create quote refresh run.");
  }

  try {
    const symbols = await getTrackedSymbolRows();
    if (!symbols.length) {
      await supabase
        .from("quote_refresh_runs")
        .update({
          status: "completed",
          symbols_considered: 0,
          symbols_refreshed: 0,
          summary: "No tracked symbols found for central quote refresh.",
          completed_at: new Date().toISOString(),
        })
        .eq("id", runRow.id);

      return { runId: runRow.id, consideredCount: 0, refreshedCount: 0 };
    }

    let refreshedCount = 0;

    for (const symbol of symbols) {
      await enrichSymbolAndRefreshQuote(symbol.id, symbol.ticker);
      refreshedCount += 1;
    }

    await supabase
      .from("quote_refresh_runs")
      .update({
        status: "completed",
        symbols_considered: symbols.length,
        symbols_refreshed: refreshedCount,
        summary: `Central quote refresh completed for ${refreshedCount} tracked symbols.`,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runRow.id);

    return { runId: runRow.id, consideredCount: symbols.length, refreshedCount };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Quote refresh failed.";
    await supabase
      .from("quote_refresh_runs")
      .update({
        status: "failed",
        summary: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runRow.id);

    throw error;
  }
}
