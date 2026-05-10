const EODHD_BASE_URL = "https://eodhd.com/api";

export class EodhdError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "EodhdError";
    this.status = status;
  }
}

type EodhdRealtimeRaw = {
  code?: string;
  timestamp?: number;
  gmtoffset?: number;
  open?: number | string;
  high?: number | string;
  low?: number | string;
  close?: number | string;
  volume?: number | string;
  previousClose?: number | string;
  change?: number | string;
  change_p?: number | string;
};

export type EodhdQuote = {
  symbol: string | null;
  price: number | null;
  change: number | null;
  percentChange: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  open: number | null;
  previousClose: number | null;
  currency: string | null;
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

export async function getEodhdQuote(symbol: string): Promise<EodhdQuote | null> {
  if (!symbol.trim()) return null;

  const raw = await fetchEodhd<EodhdRealtimeRaw>(`/real-time/${encodeURIComponent(toEodhdSymbol(symbol))}`);
  const price = parseNumber(raw.close);
  if (price === null) return null;

  const previousClose = parseNumber(raw.previousClose);
  const change = parseNumber(raw.change) ?? (previousClose !== null ? price - previousClose : null);
  const percentChange = parseNumber(raw.change_p) ?? (change !== null && previousClose ? (change / previousClose) * 100 : null);

  return {
    symbol: raw.code || null,
    price,
    change,
    percentChange,
    dayHigh: parseNumber(raw.high),
    dayLow: parseNumber(raw.low),
    open: parseNumber(raw.open),
    previousClose,
    currency: null,
  };
}
