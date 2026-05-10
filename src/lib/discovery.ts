import { getAlphaVantageOverview } from "@/lib/alpha-vantage";
import { getConsensusTargetForSymbol } from "@/lib/consensus-targets";
import { getEodhdFundamentals } from "@/lib/eodhd";
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
  maxAlphaVantageCalls?: number;
  maxEodhdCalls?: number;
};

type DiscoveryProviderAttempt = {
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  failureCount: number;
};

type DiscoveryStoredFallback = {
  hasSnapshot: boolean;
  capturedAt: string | null;
  price: number | null;
  currency: string | null;
  consensusTarget: number | null;
  medianTarget: number | null;
  highTarget: number | null;
  lowTarget: number | null;
  marketCap: number | null;
  peTtm: number | null;
  revenueGrowthTtm: number | null;
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

function isFocusedDiscoveryCandidate(input: { impliedUpsidePct: number | null; peTtm: number | null }) {
  return typeof input.impliedUpsidePct === "number"
    && input.impliedUpsidePct > 0
    && typeof input.peTtm === "number"
    && input.peTtm >= 10
    && input.peTtm <= 50;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "Unknown provider error");
}

function providerAttemptKey(ticker: string, provider: string, purpose = "fundamentals") {
  return `${ticker.toUpperCase()}::${provider}::${purpose}`;
}

function isProviderCooledDown(attempt: DiscoveryProviderAttempt | undefined, nowMs: number) {
  if (!attempt?.lastFailureAt) return false;
  const lastFailureMs = new Date(attempt.lastFailureAt).getTime();
  if (!Number.isFinite(lastFailureMs)) return false;
  const failureCount = Math.max(1, attempt.failureCount || 1);
  const cooldownHours = Math.min(24, 2 ** Math.min(failureCount - 1, 4));
  return nowMs - lastFailureMs < cooldownHours * 60 * 60 * 1000;
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

async function getStoredDiscoveryFallbacks(tickers: string[]) {
  const supabase = createSupabaseAdminClient();
  if (!supabase || !tickers.length) {
    return new Map<string, DiscoveryStoredFallback>();
  }

  const fallbackByTicker = new Map<string, DiscoveryStoredFallback>();
  const initializeFallback = (ticker: string) => {
    const existing = fallbackByTicker.get(ticker);
    if (existing) return existing;

    const fallback: DiscoveryStoredFallback = {
      hasSnapshot: false,
      capturedAt: null,
      price: null,
      currency: null,
      consensusTarget: null,
      medianTarget: null,
      highTarget: null,
      lowTarget: null,
      marketCap: null,
      peTtm: null,
      revenueGrowthTtm: null,
    };
    fallbackByTicker.set(ticker, fallback);
    return fallback;
  };

  const { data: existingSnapshots } = await supabase
    .from("discovery_snapshots")
    .select("ticker, price, currency, consensus_target, median_target, high_target, low_target, market_cap, pe_ttm, revenue_growth_ttm, captured_at")
    .eq("universe", DISCOVERY_UNIVERSE)
    .in("ticker", tickers);

  (existingSnapshots || []).forEach((row) => {
    const ticker = String(row.ticker || "").toUpperCase();
    const fallback = initializeFallback(ticker);
    fallback.hasSnapshot = true;
    fallback.capturedAt = typeof row.captured_at === "string" ? row.captured_at : fallback.capturedAt;
    fallback.price = typeof row.price === "number" ? row.price : fallback.price;
    fallback.currency = row.currency || fallback.currency;
    fallback.consensusTarget = typeof row.consensus_target === "number" ? row.consensus_target : fallback.consensusTarget;
    fallback.medianTarget = typeof row.median_target === "number" ? row.median_target : fallback.medianTarget;
    fallback.highTarget = typeof row.high_target === "number" ? row.high_target : fallback.highTarget;
    fallback.lowTarget = typeof row.low_target === "number" ? row.low_target : fallback.lowTarget;
    fallback.marketCap = typeof row.market_cap === "number" ? row.market_cap : fallback.marketCap;
    fallback.peTtm = typeof row.pe_ttm === "number" ? row.pe_ttm : fallback.peTtm;
    fallback.revenueGrowthTtm = typeof row.revenue_growth_ttm === "number" ? row.revenue_growth_ttm : fallback.revenueGrowthTtm;
  });

  const { data: symbols } = await supabase
    .from("symbols")
    .select("id, ticker, currency, market_cap, symbol_price_snapshots(price)")
    .in("ticker", tickers);

  const symbolIds = (symbols || []).map((symbol) => symbol.id).filter(Boolean);
  const tickerBySymbolId = new Map((symbols || []).map((symbol) => [symbol.id, String(symbol.ticker || "").toUpperCase()]));

  (symbols || []).forEach((symbol) => {
    const ticker = String(symbol.ticker || "").toUpperCase();
    const quote = Array.isArray(symbol.symbol_price_snapshots) ? symbol.symbol_price_snapshots[0] : symbol.symbol_price_snapshots;
    const fallback = initializeFallback(ticker);
    fallback.price = typeof quote?.price === "number" ? quote.price : fallback.price;
    fallback.currency = symbol.currency || fallback.currency;
    fallback.marketCap = typeof symbol.market_cap === "number" ? symbol.market_cap : fallback.marketCap;
  });

  if (symbolIds.length) {
    const [{ data: targetRows }, { data: fundamentalsRows }] = await Promise.all([
      supabase
        .from("analyst_target_snapshots")
        .select("symbol_id, mean_target, median_target, high_target, low_target")
        .in("symbol_id", symbolIds)
        .order("captured_at", { ascending: false }),
      supabase
        .from("symbol_fundamentals")
        .select("symbol_id, pe_ttm, revenue_growth_ttm, market_cap_m")
        .in("symbol_id", symbolIds)
        .order("fetched_at", { ascending: false }),
    ]);

    const targetSeen = new Set<string>();
    (targetRows || []).forEach((target) => {
      if (!target.symbol_id || targetSeen.has(target.symbol_id)) return;
      targetSeen.add(target.symbol_id);
      const ticker = tickerBySymbolId.get(target.symbol_id);
      if (!ticker) return;
      const fallback = initializeFallback(ticker);
      fallback.consensusTarget = typeof target.mean_target === "number" ? target.mean_target : fallback.consensusTarget;
      fallback.medianTarget = typeof target.median_target === "number" ? target.median_target : fallback.medianTarget;
      fallback.highTarget = typeof target.high_target === "number" ? target.high_target : fallback.highTarget;
      fallback.lowTarget = typeof target.low_target === "number" ? target.low_target : fallback.lowTarget;
    });

    const fundamentalsSeen = new Set<string>();
    (fundamentalsRows || []).forEach((fundamentals) => {
      if (!fundamentals.symbol_id || fundamentalsSeen.has(fundamentals.symbol_id)) return;
      fundamentalsSeen.add(fundamentals.symbol_id);
      const ticker = tickerBySymbolId.get(fundamentals.symbol_id);
      if (!ticker) return;
      const fallback = initializeFallback(ticker);
      fallback.peTtm = typeof fundamentals.pe_ttm === "number" ? fundamentals.pe_ttm : fallback.peTtm;
      fallback.revenueGrowthTtm = typeof fundamentals.revenue_growth_ttm === "number" ? fundamentals.revenue_growth_ttm : fallback.revenueGrowthTtm;
      fallback.marketCap = typeof fundamentals.market_cap_m === "number" ? fundamentals.market_cap_m : fallback.marketCap;
    });
  }

  return fallbackByTicker;
}

async function getDiscoveryProviderAttempts(tickers: string[]) {
  const supabase = createSupabaseAdminClient();
  if (!supabase || !tickers.length) {
    return new Map<string, DiscoveryProviderAttempt>();
  }

  const { data, error } = await supabase
    .from("discovery_provider_attempts")
    .select("ticker, provider, purpose, last_success_at, last_failure_at, failure_count")
    .eq("universe", DISCOVERY_UNIVERSE)
    .in("ticker", tickers);

  if (error) {
    const fallbackResult = await supabase
      .from("discovery_snapshots")
      .select("ticker, score_breakdown_json")
      .eq("universe", DISCOVERY_UNIVERSE)
      .in("ticker", tickers);

    if (fallbackResult.error) return new Map<string, DiscoveryProviderAttempt>();

    const fallbackAttempts = new Map<string, DiscoveryProviderAttempt>();
    (fallbackResult.data || []).forEach((row) => {
      const ticker = String(row.ticker || "").toUpperCase();
      const providerAttempts = (row.score_breakdown_json as { providerAttempts?: Record<string, DiscoveryProviderAttempt> } | null)?.providerAttempts || {};
      Object.entries(providerAttempts).forEach(([provider, attempt]) => {
        fallbackAttempts.set(providerAttemptKey(ticker, provider), attempt);
      });
    });
    return fallbackAttempts;
  }

  return new Map((data || []).map((row) => [
    providerAttemptKey(String(row.ticker || ""), String(row.provider || ""), String(row.purpose || "fundamentals")),
    {
      lastSuccessAt: row.last_success_at || null,
      lastFailureAt: row.last_failure_at || null,
      failureCount: Number(row.failure_count || 0),
    },
  ]));
}

async function recordDiscoveryProviderAttempt(input: {
  ticker: string;
  provider: string;
  ok: boolean;
  now: string;
  error?: unknown;
}) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;

  const previousResult = await supabase
    .from("discovery_provider_attempts")
    .select("failure_count")
    .eq("universe", DISCOVERY_UNIVERSE)
    .eq("ticker", input.ticker)
    .eq("provider", input.provider)
    .eq("purpose", "fundamentals")
    .maybeSingle();

  if (previousResult.error) return;

  const nextFailureCount = input.ok ? 0 : Number(previousResult.data?.failure_count || 0) + 1;
  await supabase.from("discovery_provider_attempts").upsert(
    {
      universe: DISCOVERY_UNIVERSE,
      ticker: input.ticker,
      provider: input.provider,
      purpose: "fundamentals",
      last_success_at: input.ok ? input.now : null,
      last_failure_at: input.ok ? null : input.now,
      failure_count: nextFailureCount,
      last_error: input.ok ? null : getErrorMessage(input.error).slice(0, 500),
      updated_at: input.now,
    },
    { onConflict: "universe,ticker,provider,purpose" },
  );
}

export async function refreshDiscoveryScreener(options: DiscoveryRefreshOptions = {}) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new Error("Supabase env vars are not configured yet.");
  }

  const universe = await getSp500Universe();
  const now = new Date().toISOString();
  const nowMs = new Date(now).getTime();
  const storedFallbacks = await getStoredDiscoveryFallbacks(universe.map((member) => member.ticker));
  const providerAttempts = await getDiscoveryProviderAttempts(universe.map((member) => member.ticker));
  const requestedMax = options.maxSymbols || universe.length;
  const cappedMax = Math.max(10, Math.min(requestedMax, universe.length));
  const missingDataMembers = universe.filter((member) => {
    const fallback = storedFallbacks.get(member.ticker);
    return !fallback?.hasSnapshot || fallback.consensusTarget === null || fallback.consensusTarget === undefined || fallback.peTtm === null || fallback.peTtm === undefined;
  });
  const missingTickers = new Set(missingDataMembers.map((member) => member.ticker));
  const coveredMembers = universe.filter((member) => !missingTickers.has(member.ticker));
  const randomizedMissingMembers = [...missingDataMembers].sort((a, b) => {
    const fallbackA = storedFallbacks.get(a.ticker);
    const fallbackB = storedFallbacks.get(b.ticker);
    const completenessA = (fallbackA?.consensusTarget === null || fallbackA?.consensusTarget === undefined ? 0 : 1) + (fallbackA?.peTtm === null || fallbackA?.peTtm === undefined ? 0 : 1);
    const completenessB = (fallbackB?.consensusTarget === null || fallbackB?.consensusTarget === undefined ? 0 : 1) + (fallbackB?.peTtm === null || fallbackB?.peTtm === undefined ? 0 : 1);
    if (completenessA !== completenessB) return completenessA - completenessB;

    const capturedA = fallbackA?.capturedAt ? new Date(fallbackA.capturedAt).getTime() : 0;
    const capturedB = fallbackB?.capturedAt ? new Date(fallbackB.capturedAt).getTime() : 0;
    if (capturedA !== capturedB) return capturedA - capturedB;

    return Math.random() - 0.5;
  });
  const selectedMemberMap = new Map<string, DiscoveryUniverseMember>();
  [...randomizedMissingMembers, ...coveredMembers].slice(0, cappedMax).forEach((member) => selectedMemberMap.set(member.ticker, member));
  const selectedMembers = [...selectedMemberMap.values()];

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
  let alphaVantageCalls = 0;
  let eodhdCalls = 0;
  const alphaVantageCallLimit = Math.max(0, Math.min(options.maxAlphaVantageCalls ?? 25, selectedMembers.length));
  const eodhdCallLimit = Math.max(0, Math.min(options.maxEodhdCalls ?? 25, selectedMembers.length));
  const alphaVantageCandidateTickers = new Set(randomizedMissingMembers.slice(0, alphaVantageCallLimit).map((member) => member.ticker));
  const eodhdCandidateTickers = new Set(randomizedMissingMembers.slice(0, Math.max(alphaVantageCallLimit, eodhdCallLimit) + eodhdCallLimit).map((member) => member.ticker));

  const rows = await mapWithConcurrency(selectedMembers, 5, async (member) => {
    try {
      const storedFallback = storedFallbacks.get(member.ticker);
      const providerAttemptUpdates: Record<string, DiscoveryProviderAttempt> = {};
      const yahooQuote = await getYahooChartQuote(member.providerTicker).catch(() => null);
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
        : null;
      const needsAlphaVantage = alphaVantageCalls < alphaVantageCallLimit
        && alphaVantageCandidateTickers.has(member.ticker)
        && !isProviderCooledDown(providerAttempts.get(providerAttemptKey(member.ticker, "alpha_vantage")), nowMs)
        && (storedFallback?.consensusTarget === null || storedFallback?.consensusTarget === undefined || storedFallback?.peTtm === null || storedFallback?.peTtm === undefined);
      if (needsAlphaVantage) {
        alphaVantageCalls += 1;
      }
      const alphaOverview = needsAlphaVantage
        ? await getAlphaVantageOverview(member.providerTicker)
          .then(async (overview) => {
            await recordDiscoveryProviderAttempt({ ticker: member.ticker, provider: "alpha_vantage", ok: Boolean(overview), now });
            providerAttemptUpdates.alpha_vantage = { lastSuccessAt: overview ? now : null, lastFailureAt: overview ? null : now, failureCount: overview ? 0 : 1 };
            return overview;
          })
          .catch(async (error) => {
            await recordDiscoveryProviderAttempt({ ticker: member.ticker, provider: "alpha_vantage", ok: false, now, error });
            const previous = providerAttempts.get(providerAttemptKey(member.ticker, "alpha_vantage"));
            providerAttemptUpdates.alpha_vantage = { lastSuccessAt: previous?.lastSuccessAt || null, lastFailureAt: now, failureCount: Number(previous?.failureCount || 0) + 1 };
            return null;
          })
        : null;

      const stillNeedsProviderData = alphaOverview?.analystTargetPrice === null || alphaOverview?.analystTargetPrice === undefined || (alphaOverview?.peRatio === null && alphaOverview?.forwardPe === null);
      const needsEodhd = eodhdCalls < eodhdCallLimit
        && eodhdCandidateTickers.has(member.ticker)
        && !isProviderCooledDown(providerAttempts.get(providerAttemptKey(member.ticker, "eodhd")), nowMs)
        && ((storedFallback?.consensusTarget === null || storedFallback?.consensusTarget === undefined || storedFallback?.peTtm === null || storedFallback?.peTtm === undefined) || stillNeedsProviderData);
      if (needsEodhd) {
        eodhdCalls += 1;
      }
      const eodhdFundamentals = needsEodhd
        ? await getEodhdFundamentals(member.providerTicker)
          .then(async (fundamentals) => {
            await recordDiscoveryProviderAttempt({ ticker: member.ticker, provider: "eodhd", ok: Boolean(fundamentals), now });
            providerAttemptUpdates.eodhd = { lastSuccessAt: fundamentals ? now : null, lastFailureAt: fundamentals ? null : now, failureCount: fundamentals ? 0 : 1 };
            return fundamentals;
          })
          .catch(async (error) => {
            await recordDiscoveryProviderAttempt({ ticker: member.ticker, provider: "eodhd", ok: false, now, error });
            const previous = providerAttempts.get(providerAttemptKey(member.ticker, "eodhd"));
            providerAttemptUpdates.eodhd = { lastSuccessAt: previous?.lastSuccessAt || null, lastFailureAt: now, failureCount: Number(previous?.failureCount || 0) + 1 };
            return null;
          })
        : null;

      const firstPassPrice = quote?.price ?? storedFallback?.price ?? null;
      const firstPassTarget = alphaOverview?.analystTargetPrice ?? eodhdFundamentals?.analystTargetPrice ?? storedFallback?.consensusTarget ?? null;
      const firstPassPeTtm = alphaOverview?.peRatio ?? alphaOverview?.forwardPe ?? eodhdFundamentals?.peRatio ?? eodhdFundamentals?.forwardPe ?? storedFallback?.peTtm ?? null;
      const firstPassUpsidePct = typeof firstPassPrice === "number" && firstPassPrice > 0 && typeof firstPassTarget === "number"
        ? ((firstPassTarget - firstPassPrice) / firstPassPrice) * 100
        : null;
      const shouldEnrich = isFocusedDiscoveryCandidate({ impliedUpsidePct: firstPassUpsidePct, peTtm: firstPassPeTtm });

      const [profileResult, fmpQuoteResult, metricsResult, consensusResult] = shouldEnrich
        ? await Promise.allSettled([
            getFmpProfile(member.providerTicker),
            quote ? Promise.resolve(null) : getFmpQuote(member.providerTicker),
            getFmpKeyMetricsTtm(member.providerTicker),
            getConsensusTargetForSymbol(member.providerTicker),
          ])
        : [null, null, null, null] as const;

      const profile = profileResult && profileResult.status === "fulfilled" ? profileResult.value : null;
      const fmpQuote = fmpQuoteResult && fmpQuoteResult.status === "fulfilled" ? fmpQuoteResult.value : null;
      const metrics = metricsResult && metricsResult.status === "fulfilled" ? metricsResult.value : null;
      const consensus = consensusResult && consensusResult.status === "fulfilled" ? consensusResult.value : null;
      const finalQuote = quote || (fmpQuote ? { ...fmpQuote, currency: profile?.currency || null } : null);
      const price = finalQuote?.price ?? profile?.price ?? firstPassPrice;
      const target = consensus?.meanTarget ?? firstPassTarget;
      const impliedUpsidePct = typeof price === "number" && price > 0 && typeof target === "number"
        ? ((target - price) / price) * 100
        : null;
      const peTtm = metrics?.peRatioTTM ?? firstPassPeTtm;
      const revenueGrowthTtm = metrics?.revenueGrowthTTM ?? alphaOverview?.revenueGrowthTtm ?? eodhdFundamentals?.revenueGrowthTtm ?? storedFallback?.revenueGrowthTtm ?? null;
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
        name: profile?.companyName || alphaOverview?.name || eodhdFundamentals?.name || member.name,
        sector: profile?.sector || alphaOverview?.sector || eodhdFundamentals?.sector || member.sector,
        industry: profile?.industry || alphaOverview?.industry || eodhdFundamentals?.industry || member.industry,
        price,
        currency: profile?.currency || alphaOverview?.currency || eodhdFundamentals?.currency || finalQuote?.currency || storedFallback?.currency || null,
        consensus_target: target,
        median_target: consensus?.medianTarget ?? alphaOverview?.analystTargetPrice ?? eodhdFundamentals?.analystTargetPrice ?? storedFallback?.medianTarget ?? null,
        high_target: consensus?.highTarget ?? storedFallback?.highTarget ?? null,
        low_target: consensus?.lowTarget ?? storedFallback?.lowTarget ?? null,
        implied_upside_pct: impliedUpsidePct === null ? null : Number(impliedUpsidePct.toFixed(3)),
        market_cap: profile?.mktCap ?? alphaOverview?.marketCap ?? eodhdFundamentals?.marketCap ?? storedFallback?.marketCap ?? null,
        pe_ttm: peTtm,
        revenue_growth_ttm: revenueGrowthTtm,
        score: scoring.score,
        score_breakdown_json: {
          ...scoring.breakdown,
          providerAttempts: {
            ...Object.fromEntries(["alpha_vantage", "eodhd"].flatMap((provider) => {
              const attempt = providerAttempts.get(providerAttemptKey(member.ticker, provider));
              return attempt ? [[provider, attempt]] : [];
            })),
            ...providerAttemptUpdates,
          },
        },
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
