const FMP_BASE_URL = "https://financialmodelingprep.com";

type FmpSymbolResult = {
  symbol: string;
  name?: string;
  currency?: string;
  exchange?: string;
  exchangeFullName?: string;
  type?: string;
};

type FmpProfileResult = {
  symbol?: string;
  companyName?: string;
  currency?: string;
  exchange?: string;
  exchangeFullName?: string;
  industry?: string;
  sector?: string;
  ipoDate?: string;
  image?: string;
  country?: string;
  website?: string;
  mktCap?: number;
};

type FmpQuoteResult = {
  symbol?: string;
  price?: number;
  change?: number;
  changesPercentage?: number;
  dayHigh?: number;
  dayLow?: number;
  open?: number;
  previousClose?: number;
};

function getFmpKey() {
  return process.env.FMP_API_KEY || "";
}

export function hasFmpKey() {
  return Boolean(getFmpKey());
}

async function fetchFmp<T>(path: string) {
  const apiKey = getFmpKey();
  if (!apiKey) {
    throw new Error("FMP API key is not configured.");
  }

  const url = `${FMP_BASE_URL}${path}${path.includes("?") ? "&" : "?"}apikey=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`FMP request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function searchFmpSymbols(query: string): Promise<FmpSymbolResult[]> {
  if (!query.trim()) {
    return [];
  }

  const json = await fetchFmp<FmpSymbolResult[]>(`/stable/search-symbol?query=${encodeURIComponent(query.trim())}`);
  return Array.isArray(json) ? json.slice(0, 10) : [];
}

export async function getFmpProfile(symbol: string): Promise<FmpProfileResult | null> {
  if (!symbol.trim()) {
    return null;
  }

  const json = await fetchFmp<FmpProfileResult[]>(`/stable/profile?symbol=${encodeURIComponent(symbol.trim())}`);
  const profile = Array.isArray(json) ? (json[0] ?? null) : null;
  return profile && Object.keys(profile).length > 0 ? profile : null;
}

export async function getFmpQuote(symbol: string): Promise<FmpQuoteResult | null> {
  if (!symbol.trim()) {
    return null;
  }

  const json = await fetchFmp<FmpQuoteResult[]>(`/stable/quote?symbol=${encodeURIComponent(symbol.trim())}`);
  const quote = Array.isArray(json) ? (json[0] ?? null) : null;
  if (!quote) {
    return null;
  }

  const hasData = [quote.price, quote.change, quote.changesPercentage, quote.dayHigh, quote.dayLow, quote.open, quote.previousClose].some(
    (value) => typeof value === "number",
  );
  return hasData ? quote : null;
}

export type { FmpProfileResult, FmpQuoteResult, FmpSymbolResult };

