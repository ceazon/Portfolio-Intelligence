import { getFinnhubPriceTarget } from "@/lib/finnhub";

type ConsensusTargetResult = {
  meanTarget: number | null;
  medianTarget: number | null;
  highTarget: number | null;
  lowTarget: number | null;
  source: "fmp" | "finnhub" | "unavailable";
};

function getFmpKey() {
  return process.env.FMP_API_KEY || "";
}

async function getFmpPriceTarget(symbol: string): Promise<ConsensusTargetResult | null> {
  const apiKey = getFmpKey();
  if (!apiKey) return null;

  const url = `https://financialmodelingprep.com/stable/price-target-consensus?symbol=${encodeURIComponent(symbol.trim())}&apikey=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`FMP price target request failed with status ${response.status}`);
  }

  const json = (await response.json()) as Array<{
    targetConsensus?: number;
    targetMedian?: number;
    targetHigh?: number;
    targetLow?: number;
  }>;

  const item = Array.isArray(json) ? json[0] : null;
  if (!item) return null;

  const hasData = [item.targetConsensus, item.targetMedian, item.targetHigh, item.targetLow].some((value) => typeof value === "number");
  if (!hasData) return null;

  return {
    meanTarget: item.targetConsensus ?? null,
    medianTarget: item.targetMedian ?? null,
    highTarget: item.targetHigh ?? null,
    lowTarget: item.targetLow ?? null,
    source: "fmp",
  };
}

const cache = new Map<string, Promise<ConsensusTargetResult>>();

export async function getConsensusTargetForSymbol(ticker: string): Promise<ConsensusTargetResult> {
  const symbol = ticker.trim().toUpperCase();
  if (!symbol) {
    return {
      meanTarget: null,
      medianTarget: null,
      highTarget: null,
      lowTarget: null,
      source: "unavailable",
    };
  }

  if (!cache.has(symbol)) {
    cache.set(
      symbol,
      (async () => {
        try {
          const fmpResult = await getFmpPriceTarget(symbol);
          if (fmpResult) {
            return fmpResult;
          }

          const result = await getFinnhubPriceTarget(symbol);
          if (!result) {
            return {
              meanTarget: null,
              medianTarget: null,
              highTarget: null,
              lowTarget: null,
              source: "unavailable" as const,
            };
          }

          return {
            meanTarget: result.targetMean ?? null,
            medianTarget: result.targetMedian ?? null,
            highTarget: result.targetHigh ?? null,
            lowTarget: result.targetLow ?? null,
            source: "finnhub" as const,
          };
        } catch {
          try {
            const result = await getFinnhubPriceTarget(symbol);
            if (!result) {
              return {
                meanTarget: null,
                medianTarget: null,
                highTarget: null,
                lowTarget: null,
                source: "unavailable" as const,
              };
            }

            return {
              meanTarget: result.targetMean ?? null,
              medianTarget: result.targetMedian ?? null,
              highTarget: result.targetHigh ?? null,
              lowTarget: result.targetLow ?? null,
              source: "finnhub" as const,
            };
          } catch {
            return {
              meanTarget: null,
              medianTarget: null,
              highTarget: null,
              lowTarget: null,
              source: "unavailable" as const,
            };
          }
        }
      })(),
    );
  }

  return cache.get(symbol)!;
}
