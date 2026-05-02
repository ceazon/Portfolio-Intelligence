type YahooChartQuoteResult = {
  price: number | null;
  change: number | null;
  percentChange: number | null;
  previousClose: number | null;
  currency: string | null;
  exchange: string | null;
};

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      meta?: {
        symbol?: string;
        currency?: string;
        exchangeName?: string;
        regularMarketPrice?: number;
        previousClose?: number;
        chartPreviousClose?: number;
      };
      indicators?: {
        quote?: Array<{
          close?: Array<number | null>;
        }>;
      };
    }>;
    error?: { code?: string; description?: string } | null;
  };
};

function normalizeYahooSymbol(symbol: string) {
  return symbol.trim().toUpperCase();
}

function getFallbackCloses(closes: Array<number | null> | undefined) {
  const numericCloses = (closes || []).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const lastClose = numericCloses.at(-1) ?? null;
  const priorClose = numericCloses.length > 1 ? numericCloses.at(-2) ?? null : null;
  return { lastClose, priorClose };
}

export async function getYahooChartQuote(symbol: string): Promise<YahooChartQuoteResult | null> {
  const normalizedSymbol = normalizeYahooSymbol(symbol);
  if (!normalizedSymbol) {
    return null;
  }

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(normalizedSymbol)}?interval=1d&range=5d`;
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      "user-agent": "Mozilla/5.0",
    },
  });

  if (!response.ok) {
    return null;
  }

  const json = (await response.json()) as YahooChartResponse;
  const result = json.chart?.result?.[0];
  if (!result) {
    return null;
  }

  const meta = result.meta || {};
  const closes = result.indicators?.quote?.[0]?.close;
  const { lastClose, priorClose } = getFallbackCloses(closes);

  const price = typeof meta.regularMarketPrice === "number" ? meta.regularMarketPrice : lastClose;
  const previousClose = typeof meta.previousClose === "number" ? meta.previousClose : typeof meta.chartPreviousClose === "number" ? meta.chartPreviousClose : priorClose;
  const change = typeof price === "number" && typeof previousClose === "number" ? price - previousClose : null;
  const percentChange = typeof change === "number" && typeof previousClose === "number" && previousClose !== 0 ? (change / previousClose) * 100 : null;

  if (typeof price !== "number") {
    return null;
  }

  return {
    price,
    change,
    percentChange,
    previousClose: typeof previousClose === "number" ? previousClose : null,
    currency: typeof meta.currency === "string" ? meta.currency : null,
    exchange: typeof meta.exchangeName === "string" ? meta.exchangeName : null,
  };
}
