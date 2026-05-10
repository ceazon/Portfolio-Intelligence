const EODHD_BASE_URL = "https://eodhd.com/api/v1.1";

export class EodhdError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "EodhdError";
    this.status = status;
  }
}

type EodhdFundamentalsRaw = {
  Code?: string;
  Name?: string;
  Exchange?: string;
  CurrencyCode?: string;
  CountryName?: string;
  Sector?: string;
  Industry?: string;
  WebURL?: string;
  LogoURL?: string;
  IPODate?: string;
  Highlights?: {
    MarketCapitalization?: string | number;
    MarketCapitalizationMln?: string | number;
    PERatio?: string | number;
    WallStreetTargetPrice?: string | number;
    QuarterlyRevenueGrowthYOY?: string | number;
    RevenueGrowthYOY?: string | number;
  };
  Valuation?: {
    TrailingPE?: string | number;
    ForwardPE?: string | number;
  };
  AnalystRatings?: {
    TargetPrice?: string | number;
    StrongBuy?: string | number;
    Buy?: string | number;
    Hold?: string | number;
    Sell?: string | number;
    StrongSell?: string | number;
    Rating?: string | number;
  };
  General?: {
    Code?: string;
    Name?: string;
    Exchange?: string;
    CurrencyCode?: string;
    CountryName?: string;
    Sector?: string;
    Industry?: string;
    WebURL?: string;
    LogoURL?: string;
    IPODate?: string;
  };
};

export type EodhdFundamentals = {
  symbol: string | null;
  name: string | null;
  exchange: string | null;
  currency: string | null;
  country: string | null;
  sector: string | null;
  industry: string | null;
  website: string | null;
  logoUrl: string | null;
  ipoDate: string | null;
  marketCap: number | null;
  peRatio: number | null;
  forwardPe: number | null;
  analystTargetPrice: number | null;
  revenueGrowthTtm: number | null;
  raw: EodhdFundamentalsRaw;
};

function getEodhdKey() {
  return process.env.EODHD_API_KEY || process.env.EODHD_API_TOKEN || "";
}

export function hasEodhdKey() {
  return Boolean(getEodhdKey());
}

function parseNumber(value: string | number | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "none" || trimmed === "-" || trimmed.toLowerCase() === "na") return null;
  const parsed = Number(trimmed.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function toEodhdSymbol(symbol: string) {
  const cleaned = symbol.trim().toUpperCase().replace(".", "-");
  return cleaned.includes(".") ? cleaned : `${cleaned}.US`;
}

async function fetchEodhd<T>(path: string) {
  const apiKey = getEodhdKey();
  if (!apiKey) {
    throw new EodhdError("EODHD API key is not configured.");
  }

  const url = `${EODHD_BASE_URL}${path}${path.includes("?") ? "&" : "?"}api_token=${encodeURIComponent(apiKey)}&fmt=json`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new EodhdError(`EODHD request failed with status ${response.status}`, response.status);
  }

  const json = (await response.json()) as T & { message?: string; error?: string };
  const providerMessage = json?.message || json?.error;
  if (providerMessage) {
    const lower = providerMessage.toLowerCase();
    throw new EodhdError(providerMessage, lower.includes("limit") || lower.includes("rate") ? 429 : undefined);
  }

  return json as T;
}

export async function getEodhdFundamentals(symbol: string): Promise<EodhdFundamentals | null> {
  if (!symbol.trim()) return null;

  const raw = await fetchEodhd<EodhdFundamentalsRaw>(`/fundamentals/${encodeURIComponent(toEodhdSymbol(symbol))}`);
  if (!raw || Object.keys(raw).length === 0) return null;

  const general = raw.General || raw;
  const highlights = raw.Highlights || {};
  const valuation = raw.Valuation || {};
  const analystRatings = raw.AnalystRatings || {};
  const marketCap = parseNumber(highlights.MarketCapitalization) ?? (() => {
    const marketCapM = parseNumber(highlights.MarketCapitalizationMln);
    return marketCapM === null ? null : marketCapM * 1_000_000;
  })();

  return {
    symbol: general.Code || raw.Code || null,
    name: general.Name || raw.Name || null,
    exchange: general.Exchange || raw.Exchange || null,
    currency: general.CurrencyCode || raw.CurrencyCode || null,
    country: general.CountryName || raw.CountryName || null,
    sector: general.Sector || raw.Sector || null,
    industry: general.Industry || raw.Industry || null,
    website: general.WebURL || raw.WebURL || null,
    logoUrl: general.LogoURL || raw.LogoURL || null,
    ipoDate: general.IPODate || raw.IPODate || null,
    marketCap,
    peRatio: parseNumber(highlights.PERatio) ?? parseNumber(valuation.TrailingPE),
    forwardPe: parseNumber(valuation.ForwardPE),
    analystTargetPrice: parseNumber(analystRatings.TargetPrice) ?? parseNumber(highlights.WallStreetTargetPrice),
    revenueGrowthTtm: parseNumber(highlights.QuarterlyRevenueGrowthYOY) ?? parseNumber(highlights.RevenueGrowthYOY),
    raw,
  };
}
