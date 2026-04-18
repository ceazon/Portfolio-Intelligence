const FINNHUB_BASE_URL = "https://finnhub.io/api/v1";

function getFinnhubKey() {
  return process.env.FINNHUB_API_KEY || "";
}

export function hasFinnhubKey() {
  return Boolean(getFinnhubKey());
}

type FinnhubSymbolResult = {
  description: string;
  displaySymbol: string;
  symbol: string;
  type: string;
};

type FinnhubCompanyProfile = {
  country?: string;
  currency?: string;
  exchange?: string;
  finnhubIndustry?: string;
  ipo?: string;
  logo?: string;
  marketCapitalization?: number;
  name?: string;
  phone?: string;
  shareOutstanding?: number;
  ticker?: string;
  weburl?: string;
  currencySymbol?: string;
  finnhubIndustry2?: string;
};

type FinnhubQuote = {
  c?: number;
  d?: number;
  dp?: number;
  h?: number;
  l?: number;
  o?: number;
  pc?: number;
  t?: number;
};

async function fetchFinnhub<T>(path: string, params: Record<string, string>) {
  const apiKey = getFinnhubKey();
  if (!apiKey) {
    throw new Error("Finnhub API key is not configured.");
  }

  const searchParams = new URLSearchParams({ ...params, token: apiKey });
  const url = `${FINNHUB_BASE_URL}${path}?${searchParams.toString()}`;
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Finnhub request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function searchFinnhubSymbols(query: string): Promise<FinnhubSymbolResult[]> {
  if (!query.trim()) {
    return [];
  }

  const json = await fetchFinnhub<{ result?: FinnhubSymbolResult[] }>("/search", {
    q: query.trim(),
  });

  return Array.isArray(json.result) ? json.result.slice(0, 10) : [];
}

export async function getFinnhubCompanyProfile(symbol: string): Promise<FinnhubCompanyProfile | null> {
  if (!symbol.trim()) {
    return null;
  }

  const profile = await fetchFinnhub<FinnhubCompanyProfile>("/stock/profile2", {
    symbol: symbol.trim(),
  });

  return Object.keys(profile || {}).length > 0 ? profile : null;
}

export async function getFinnhubQuote(symbol: string): Promise<FinnhubQuote | null> {
  if (!symbol.trim()) {
    return null;
  }

  const quote = await fetchFinnhub<FinnhubQuote>("/quote", {
    symbol: symbol.trim(),
  });

  const hasData = [quote.c, quote.d, quote.dp, quote.h, quote.l, quote.o, quote.pc].some((value) => typeof value === "number");
  return hasData ? quote : null;
}

export type { FinnhubCompanyProfile, FinnhubQuote, FinnhubSymbolResult };
