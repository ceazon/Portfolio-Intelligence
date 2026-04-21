import { getFinnhubPriceTarget } from "@/lib/finnhub";

type ConsensusTargetResult = {
  meanTarget: number | null;
  medianTarget: number | null;
  highTarget: number | null;
  lowTarget: number | null;
  source: "finnhub" | "unavailable";
};

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
      })(),
    );
  }

  return cache.get(symbol)!;
}
