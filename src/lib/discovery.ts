import { getConsensusTargetForSymbol } from "@/lib/consensus-targets";
import { FmpError, getFmpKeyMetricsTtm, getFmpProfile, getFmpQuote } from "@/lib/fmp";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getYahooChartQuote } from "@/lib/yahoo-finance";

const SP500_CONSTITUENTS_URL = "https://raw.githubusercontent.com/datasets/s-and-p-500-companies/master/data/constituents.csv";
const DISCOVERY_UNIVERSE = "sp500";

type DiscoveryUniverseMember = {
  ticker: string;
  providerTicker: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
};

type DiscoveryRefreshOptions = {
  maxSymbols?: number;
};

function normalizeTickerForProvider(ticker: string) {
  return ticker.trim().toUpperCase().replace(".", "-");
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const next = line[index + 1];

    if (character === '"' && next === '"' && inQuotes) {
      current += '"';
      index += 1;
    } else if (character === '"') {
      inQuotes = !inQuotes;
    } else if (character === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }

  values.push(current.trim());
  return values;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function scoreDiscoveryCandidate(input: {
  impliedUpsidePct: number | null;
  peTtm: number | null;
  revenueGrowthTtm: number | null;
  hasConsensus: boolean;
  hasPrice: boolean;
}) {
  const upsideScore = input.impliedUpsidePct === null ? 0 : clamp((input.impliedUpsidePct + 10) / 50, 0, 1) * 40;
  const valuationScore = input.peTtm === null
    ? 8
    : input.peTtm <= 0
      ? 4
      : input.peTtm <= 18
        ? 20
        : input.peTtm <= 28
          ? 16
          : input.peTtm <= 45
            ? 10
            : 4;
  const qualityScore = input.revenueGrowthTtm === null ? 8 : clamp((input.revenueGrowthTtm + 0.05) / 0.25, 0, 1) * 20;
  const dataScore = (input.hasConsensus ? 10 : 0) + (input.hasPrice ? 10 : 0);
  const score = Number((upsideScore + valuationScore + qualityScore + dataScore).toFixed(3));

  const flags = [
    input.hasConsensus ? null : "No consensus target coverage yet",
    input.hasPrice ? null : "No current quote available yet",
    typeof input.impliedUpsidePct === "number" && input.impliedUpsidePct > 35 ? "Very high upside — verify thesis quality" : null,
    typeof input.peTtm === "number" && input.peTtm > 45 ? "Expensive on trailing earnings" : null,
  ].filter((flag): flag is string => Boolean(flag));

  return {
    score,
    flags,
    breakdown: {
      upside: Number(upsideScore.toFixed(3)),
      valuation: Number(valuationScore.toFixed(3)),
      quality: Number(qualityScore.toFixed(3)),
      dataCoverage: dataScore,
    },
  };
}

export async function getSp500Universe(): Promise<DiscoveryUniverseMember[]> {
  const response = await fetch(SP500_CONSTITUENTS_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to fetch S&P 500 constituents (${response.status}).`);
  }

  const csv = await response.text();
  const [headerLine, ...lines] = csv.split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(headerLine);
  const symbolIndex = headers.indexOf("Symbol");
  const nameIndex = headers.indexOf("Security");
  const sectorIndex = headers.indexOf("GICS Sector");
  const industryIndex = headers.indexOf("GICS Sub-Industry");

  return lines
    .map((line) => parseCsvLine(line))
    .map((row) => {
      const ticker = String(row[symbolIndex] || "").trim().toUpperCase();
      return {
        ticker,
        providerTicker: normalizeTickerForProvider(ticker),
        name: row[nameIndex] || ticker,
        sector: row[sectorIndex] || null,
        industry: row[industryIndex] || null,
      };
    })
    .filter((member) => member.ticker);
}

async function refreshDiscoverySymbolFallback(selectedMembers: DiscoveryUniverseMember[], now: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new Error("Supabase env vars are not configured yet.");
  }

  let refreshedCount = 0;
  let failedCount = 0;

  await mapWithConcurrency(selectedMembers, 5, async (member) => {
    try {
      const [profileResult, fmpQuoteResult, yahooQuoteResult, consensusResult] = await Promise.allSettled([
        getFmpProfile(member.providerTicker),
        getFmpQuote(member.providerTicker),
        getYahooChartQuote(member.providerTicker),
        getConsensusTargetForSymbol(member.providerTicker),
      ]);

      const profile = profileResult.status === "fulfilled" ? profileResult.value : null;
      const fmpQuote = fmpQuoteResult.status === "fulfilled" ? fmpQuoteResult.value : null;
      const yahooQuote = yahooQuoteResult.status === "fulfilled" ? yahooQuoteResult.value : null;
      const quote = yahooQuote
        ? {
            price: yahooQuote.price,
            change: yahooQuote.change,
            changesPercentage: yahooQuote.percentChange,
            dayHigh: null,
            dayLow: null,
            open: null,
            previousClose: yahooQuote.previousClose,
            currency: yahooQuote.currency,
          }
        : fmpQuote
          ? { ...fmpQuote, currency: profile?.currency || null }
          : null;
      const consensus = consensusResult.status === "fulfilled" ? consensusResult.value : null;

      const { data: symbolRow, error: symbolError } = await supabase
        .from("symbols")
        .upsert(
          {
            ticker: member.ticker,
            name: profile?.companyName || member.name || member.ticker,
            exchange: profile?.exchangeFullName || profile?.exchange || null,
            country: profile?.country || null,
            currency: profile?.currency || null,
            sector: profile?.sector || member.sector,
            industry: profile?.industry || member.industry,
            logo_url: profile?.image || null,
            web_url: profile?.website || null,
            market_cap: profile?.mktCap ?? null,
            ipo_date: profile?.ipoDate || null,
            raw_profile: profile,
            last_profile_sync_at: profile ? now : null,
            asset_type: "stock",
            is_etf: false,
          },
          { onConflict: "ticker" },
        )
        .select("id")
        .single();

      if (symbolError || !symbolRow) throw new Error(symbolError?.message || "Failed to upsert symbol.");

      const previousClose = quote?.previousClose ?? (typeof quote?.price === "number" && typeof quote?.change === "number" ? quote.price - quote.change : null);
      const change = quote?.change ?? (typeof quote?.price === "number" && typeof previousClose === "number" ? quote.price - previousClose : null);
      const percentChange = quote?.changesPercentage ?? (typeof change === "number" && typeof previousClose === "number" && previousClose !== 0 ? (change / previousClose) * 100 : null);

      if (quote) {
        await supabase.from("symbol_price_snapshots").upsert({
          symbol_id: symbolRow.id,
          price: quote.price ?? null,
          change,
          percent_change: percentChange,
          high: quote.dayHigh ?? null,
          low: quote.dayLow ?? null,
          open: quote.open ?? null,
          previous_close: previousClose,
          fetched_at: now,
        });
      }

      const hasConsensusData = [consensus?.meanTarget, consensus?.medianTarget, consensus?.highTarget, consensus?.lowTarget].some((value) => typeof value === "number");
      if (hasConsensusData) {
        await supabase.from("analyst_target_snapshots").insert({
          owner_id: null,
          symbol_id: symbolRow.id,
          ticker: member.ticker,
          source: consensus?.source || "unavailable",
          captured_at: now,
          current_price: quote?.price ?? null,
          current_price_currency: profile?.currency || quote?.currency || null,
          mean_target: consensus?.meanTarget ?? null,
          median_target: consensus?.medianTarget ?? null,
          high_target: consensus?.highTarget ?? null,
          low_target: consensus?.lowTarget ?? null,
        });
      }

      refreshedCount += 1;
    } catch {
      failedCount += 1;
    }
  });

  return { refreshedCount, failedCount };
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T, index: number) => Promise<R>) {
  const results: R[] = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

export async function refreshDiscoveryScreener(options: DiscoveryRefreshOptions = {}) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new Error("Supabase env vars are not configured yet.");
  }

  const universe = await getSp500Universe();
  const cappedMax = Math.max(10, Math.min(options.maxSymbols || 100, universe.length));
  const selectedMembers = universe.slice(0, cappedMax);
  const now = new Date().toISOString();

  const { error: universeError } = await supabase.from("discovery_universe_symbols").upsert(
    universe.map((member) => ({
      universe: DISCOVERY_UNIVERSE,
      ticker: member.ticker,
      provider_ticker: member.providerTicker,
      name: member.name,
      sector: member.sector,
      industry: member.industry,
      source: "datasets/s-and-p-500-companies",
      is_active: true,
      updated_at: now,
    })),
    { onConflict: "universe,ticker" },
  );

  if (universeError) {
    if (universeError.message.toLowerCase().includes("discovery_universe_symbols")) {
      const fallback = await refreshDiscoverySymbolFallback(selectedMembers, now);
      return {
        universeCount: universe.length,
        consideredCount: selectedMembers.length,
        refreshedCount: fallback.refreshedCount,
        failedCount: fallback.failedCount,
      };
    }

    throw new Error(universeError.message);
  }

  let refreshedCount = 0;
  let failedCount = 0;

  const rows = await mapWithConcurrency(selectedMembers, 5, async (member) => {
    try {
      const [profileResult, fmpQuoteResult, yahooQuoteResult, metricsResult, consensusResult] = await Promise.allSettled([
        getFmpProfile(member.providerTicker),
        getFmpQuote(member.providerTicker),
        getYahooChartQuote(member.providerTicker),
        getFmpKeyMetricsTtm(member.providerTicker),
        getConsensusTargetForSymbol(member.providerTicker),
      ]);

      const profile = profileResult.status === "fulfilled" ? profileResult.value : null;
      const fmpQuote = fmpQuoteResult.status === "fulfilled" ? fmpQuoteResult.value : null;
      const yahooQuote = yahooQuoteResult.status === "fulfilled" ? yahooQuoteResult.value : null;
      const quote = yahooQuote
        ? {
            price: yahooQuote.price,
            change: yahooQuote.change,
            changesPercentage: yahooQuote.percentChange,
            dayHigh: null,
            dayLow: null,
            open: null,
            previousClose: yahooQuote.previousClose,
            currency: yahooQuote.currency,
          }
        : fmpQuote
          ? { ...fmpQuote, currency: profile?.currency || null }
          : null;
      const metrics = metricsResult.status === "fulfilled" ? metricsResult.value : null;
      const consensus = consensusResult.status === "fulfilled" ? consensusResult.value : null;
      const price = quote?.price ?? profile?.price ?? null;
      const target = consensus?.meanTarget ?? null;
      const impliedUpsidePct = typeof price === "number" && price > 0 && typeof target === "number"
        ? ((target - price) / price) * 100
        : null;
      const peTtm = metrics?.peRatioTTM ?? null;
      const revenueGrowthTtm = metrics?.revenueGrowthTTM ?? null;
      const scoring = scoreDiscoveryCandidate({
        impliedUpsidePct,
        peTtm,
        revenueGrowthTtm,
        hasConsensus: typeof target === "number",
        hasPrice: typeof price === "number",
      });

      refreshedCount += 1;

      return {
        universe: DISCOVERY_UNIVERSE,
        ticker: member.ticker,
        provider_ticker: member.providerTicker,
        name: profile?.companyName || member.name,
        sector: profile?.sector || member.sector,
        industry: profile?.industry || member.industry,
        price,
        currency: profile?.currency || quote?.currency || null,
        consensus_target: target,
        median_target: consensus?.medianTarget ?? null,
        high_target: consensus?.highTarget ?? null,
        low_target: consensus?.lowTarget ?? null,
        implied_upside_pct: impliedUpsidePct === null ? null : Number(impliedUpsidePct.toFixed(3)),
        market_cap: profile?.mktCap ?? null,
        pe_ttm: peTtm,
        revenue_growth_ttm: revenueGrowthTtm,
        score: scoring.score,
        score_breakdown_json: scoring.breakdown,
        flags_json: scoring.flags,
        captured_at: now,
      };
    } catch (error) {
      failedCount += 1;
      if (error instanceof FmpError && error.status === 429) {
        return null;
      }
      return null;
    }
  });

  const validRows = rows.filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (validRows.length) {
    const { error: snapshotError } = await supabase.from("discovery_snapshots").upsert(validRows, { onConflict: "universe,ticker" });
    if (snapshotError) {
      throw new Error(snapshotError.message);
    }
  }

  return {
    universeCount: universe.length,
    consideredCount: selectedMembers.length,
    refreshedCount,
    failedCount,
  };
}

export async function ensureDiscoveryCandidateSymbol(ticker: string) {
  const normalizedTicker = ticker.trim().toUpperCase();
  const providerTicker = normalizeTickerForProvider(normalizedTicker);
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new Error("Supabase env vars are not configured yet.");
  }

  const [universeResult, profileResult, fmpQuoteResult, yahooQuoteResult] = await Promise.allSettled([
    supabase.from("discovery_universe_symbols").select("name, sector, industry").eq("universe", DISCOVERY_UNIVERSE).eq("ticker", normalizedTicker).maybeSingle(),
    getFmpProfile(providerTicker),
    getFmpQuote(providerTicker),
    getYahooChartQuote(providerTicker),
  ]);

  const universe = universeResult.status === "fulfilled" ? universeResult.value.data : null;
  const profile = profileResult.status === "fulfilled" ? profileResult.value : null;
  const fmpQuote = fmpQuoteResult.status === "fulfilled" ? fmpQuoteResult.value : null;
  const yahooQuote = yahooQuoteResult.status === "fulfilled" ? yahooQuoteResult.value : null;
  const quote = yahooQuote
    ? {
        price: yahooQuote.price,
        change: yahooQuote.change,
        changesPercentage: yahooQuote.percentChange,
        dayHigh: null,
        dayLow: null,
        open: null,
        previousClose: yahooQuote.previousClose,
      }
    : fmpQuote;

  const { data: symbolRow, error: symbolError } = await supabase
    .from("symbols")
    .upsert(
      {
        ticker: normalizedTicker,
        name: profile?.companyName || universe?.name || normalizedTicker,
        exchange: profile?.exchangeFullName || profile?.exchange || null,
        country: profile?.country || null,
        currency: profile?.currency || null,
        sector: profile?.sector || universe?.sector || null,
        industry: profile?.industry || universe?.industry || null,
        logo_url: profile?.image || null,
        web_url: profile?.website || null,
        market_cap: profile?.mktCap || null,
        ipo_date: profile?.ipoDate || null,
        raw_profile: profile,
        last_profile_sync_at: profile ? new Date().toISOString() : null,
        asset_type: "stock",
        is_etf: false,
      },
      { onConflict: "ticker" },
    )
    .select("id")
    .single();

  if (symbolError || !symbolRow) {
    throw new Error(symbolError?.message || "Failed to import discovery symbol.");
  }

  if (quote) {
    const previousClose = quote.previousClose ?? (typeof quote.price === "number" && typeof quote.change === "number" ? quote.price - quote.change : null);
    const change = quote.change ?? (typeof quote.price === "number" && typeof previousClose === "number" ? quote.price - previousClose : null);
    const percentChange = quote.changesPercentage ?? (typeof change === "number" && typeof previousClose === "number" && previousClose !== 0 ? (change / previousClose) * 100 : null);

    await supabase.from("symbol_price_snapshots").upsert({
      symbol_id: symbolRow.id,
      price: quote.price ?? null,
      change,
      percent_change: percentChange,
      high: quote.dayHigh ?? null,
      low: quote.dayLow ?? null,
      open: quote.open ?? null,
      previous_close: previousClose,
      fetched_at: new Date().toISOString(),
    });
  }

  return symbolRow.id as string;
}
