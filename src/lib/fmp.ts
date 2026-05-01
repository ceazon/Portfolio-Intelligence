const FMP_BASE_URL = "https://financialmodelingprep.com";

export class FmpError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "FmpError";
    this.status = status;
  }
}

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
  price?: number;
  change?: number;
  changePercentage?: number;
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
    throw new FmpError("FMP API key is not configured.");
  }

  const url = `${FMP_BASE_URL}${path}${path.includes("?") ? "&" : "?"}apikey=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new FmpError(`FMP request failed with status ${response.status}`, response.status);
  }

  const text = await response.text();
  let json: unknown;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }

  if (typeof json === "string" && json.toLowerCase().includes("premium query parameter")) {
    throw new FmpError("FMP credentials are valid, but this FMP plan does not include the requested symbol or endpoint.", 402);
  }

  return json as T;
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

function hasFmpQuoteData(quote: FmpQuoteResult | null | undefined) {
  return [quote?.price, quote?.change, quote?.changesPercentage, quote?.dayHigh, quote?.dayLow, quote?.open, quote?.previousClose].some(
    (value) => typeof value === "number",
  );
}

function getProfileDerivedQuote(profile: FmpProfileResult | null | undefined): FmpQuoteResult | null {
  if (!profile || typeof profile.price !== "number") {
    return null;
  }

  const derivedQuote: FmpQuoteResult = {
    symbol: profile.symbol,
    price: profile.price,
    change: typeof profile.change === "number" ? profile.change : null,
    changesPercentage: typeof profile.changePercentage === "number" ? profile.changePercentage : null,
    dayHigh: null,
    dayLow: null,
    open: null,
    previousClose:
      typeof profile.price === "number" && typeof profile.change === "number"
        ? profile.price - profile.change
        : null,
  };

  return hasFmpQuoteData(derivedQuote) ? derivedQuote : null;
}

export async function getFmpQuote(symbol: string): Promise<FmpQuoteResult | null> {
  if (!symbol.trim()) {
    return null;
  }

  const normalizedSymbol = symbol.trim();

  try {
    const json = await fetchFmp<FmpQuoteResult[]>(`/stable/quote?symbol=${encodeURIComponent(normalizedSymbol)}`);
    const quote = Array.isArray(json) ? (json[0] ?? null) : null;
    return hasFmpQuoteData(quote) ? quote : null;
  } catch (error) {
    if (!(error instanceof FmpError) || error.status !== 402) {
      throw error;
    }

    const profile = await getFmpProfile(normalizedSymbol);
    return getProfileDerivedQuote(profile);
  }
}

export type { FmpProfileResult, FmpQuoteResult, FmpSymbolResult };

