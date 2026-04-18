import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getFinnhubCompanyProfile, getFinnhubQuote } from "@/lib/finnhub";

export async function enrichSymbolAndRefreshQuote(symbolId: string, ticker: string) {
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

  return { profileLoaded: Boolean(profile), quoteLoaded: Boolean(quote) };
}
