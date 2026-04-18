import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getFinnhubCompanyProfile, getFinnhubQuote } from "@/lib/finnhub";

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

export async function enrichSymbolAndRefreshQuote(symbolId: string, ticker: string, ownerId?: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new Error("Supabase env vars are not configured yet.");
  }

  const [profile, quote] = await Promise.all([getFinnhubCompanyProfile(ticker), getFinnhubQuote(ticker)]);

  if (profile) {
    const { error: symbolUpdateError } = await supabase
      .from("symbols")
      .update({
        name: profile.name || undefined,
        exchange: profile.exchange || undefined,
        country: profile.country || undefined,
        currency: profile.currency || undefined,
        sector: profile.finnhubIndustry || undefined,
        industry: profile.finnhubIndustry || undefined,
        logo_url: profile.logo || undefined,
        web_url: profile.weburl || undefined,
        market_cap: profile.marketCapitalization || undefined,
        ipo_date: profile.ipo || undefined,
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
      price: quote.c ?? null,
      change: quote.d ?? null,
      percent_change: quote.dp ?? null,
      high: quote.h ?? null,
      low: quote.l ?? null,
      open: quote.o ?? null,
      previous_close: quote.pc ?? null,
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

  await recordAgentRun(
    "symbol-refresh",
    "completed",
    `Refreshed ${ticker} profile=${profile ? "yes" : "no"} quote=${quote ? "yes" : "no"}`,
    ownerId,
  );

  return { profileLoaded: Boolean(profile), quoteLoaded: Boolean(quote) };
}

export async function refreshTrackedSymbols(ownerId?: string) {
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
    const { data: symbols, error } = await supabase.from("symbols").select("id");
    if (error) {
      throw new Error(error.message);
    }
    symbolIds = (symbols || []).map((symbol) => symbol.id);
  }

  const uniqueSymbolIds = [...new Set(symbolIds)];
  if (!uniqueSymbolIds.length) {
    throw new Error("No tracked symbols found.");
  }

  const { data: symbols, error } = await supabase.from("symbols").select("id, ticker").in("id", uniqueSymbolIds).order("ticker", { ascending: true });
  if (error) {
    throw new Error(error.message);
  }

  if (!symbols || symbols.length === 0) {
    throw new Error("No tracked symbols found.");
  }

  let refreshedCount = 0;
  for (const symbol of symbols) {
    await enrichSymbolAndRefreshQuote(symbol.id, symbol.ticker, ownerId);
    refreshedCount += 1;
  }

  await recordAgentRun("bulk-symbol-refresh", "completed", `Refreshed ${refreshedCount} tracked symbols.`, ownerId);
  return { refreshedCount };
}
