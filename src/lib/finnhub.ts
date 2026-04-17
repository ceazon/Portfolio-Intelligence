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

export async function searchFinnhubSymbols(query: string): Promise<FinnhubSymbolResult[]> {
  const apiKey = getFinnhubKey();
  if (!apiKey || !query.trim()) {
    return [];
  }

  const url = `${FINNHUB_BASE_URL}/search?q=${encodeURIComponent(query.trim())}&token=${apiKey}`;
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Finnhub search failed with status ${response.status}`);
  }

  const json = (await response.json()) as { result?: FinnhubSymbolResult[] };
  return Array.isArray(json.result) ? json.result.slice(0, 10) : [];
}
