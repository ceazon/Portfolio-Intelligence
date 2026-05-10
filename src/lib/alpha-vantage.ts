const ALPHA_VANTAGE_BASE_URL = "https://www.alphavantage.co/query";

export class AlphaVantageError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "AlphaVantageError";
    this.status = status;
  }
}

type AlphaVantageOverviewRaw = {
  Symbol?: string;
  Name?: string;
  Description?: string;
  Exchange?: string;
  Currency?: string;
  Country?: string;
  Sector?: string;
  Industry?: string;
  MarketCapitalization?: string;
  PERatio?: string;
  ForwardPE?: string;
  PEGRatio?: string;
  AnalystTargetPrice?: string;
  QuarterlyRevenueGrowthYOY?: string;
  QuarterlyEarningsGrowthYOY?: string;
  RevenueTTM?: string;
};

export type AlphaVantageOverview = {
  symbol: string | null;
  name: string | null;
  exchange: string | null;
  currency: string | null;
  country: string | null;
  sector: string | null;
  industry: string | null;
  marketCap: number | null;
  peRatio: number | null;
  forwardPe: number | null;
  analystTargetPrice: number | null;
  revenueGrowthTtm: number | null;
};

function getAlphaVantageKey() {
  return process.env.ALPHA_VANTAGE_API_KEY || "";
}

export function hasAlphaVantageKey() {
  return Boolean(getAlphaVantageKey());
}

function parseNumber(value: string | number | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "none" || trimmed === "-") return null;
  const parsed = Number(trimmed.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchAlphaVantage<T>(params: Record<string, string>) {
  const apiKey = getAlphaVantageKey();
  if (!apiKey) {
    throw new AlphaVantageError("Alpha Vantage API key is not configured.");
  }

  const searchParams = new URLSearchParams({ ...params, apikey: apiKey });
  const response = await fetch(`${ALPHA_VANTAGE_BASE_URL}?${searchParams.toString()}`, { cache: "no-store" });

  if (!response.ok) {
    throw new AlphaVantageError(`Alpha Vantage request failed with status ${response.status}`, response.status);
  }

  const json = (await response.json()) as T & { Note?: string; Information?: string; "Error Message"?: string };
  const providerMessage = json.Note || json.Information || json["Error Message"];
  if (providerMessage) {
    throw new AlphaVantageError(providerMessage, providerMessage.toLowerCase().includes("rate") || providerMessage.toLowerCase().includes("frequency") ? 429 : undefined);
  }

  return json as T;
}

export async function getAlphaVantageOverview(symbol: string): Promise<AlphaVantageOverview | null> {
  if (!symbol.trim()) {
    return null;
  }

  const raw = await fetchAlphaVantage<AlphaVantageOverviewRaw>({
    function: "OVERVIEW",
    symbol: symbol.trim().toUpperCase(),
  });

  if (!raw || Object.keys(raw).length === 0 || !raw.Symbol) {
    return null;
  }

  return {
    symbol: raw.Symbol || null,
    name: raw.Name || null,
    exchange: raw.Exchange || null,
    currency: raw.Currency || null,
    country: raw.Country || null,
    sector: raw.Sector || null,
    industry: raw.Industry || null,
    marketCap: parseNumber(raw.MarketCapitalization),
    peRatio: parseNumber(raw.PERatio),
    forwardPe: parseNumber(raw.ForwardPE),
    analystTargetPrice: parseNumber(raw.AnalystTargetPrice),
    revenueGrowthTtm: parseNumber(raw.QuarterlyRevenueGrowthYOY),
  };
}
