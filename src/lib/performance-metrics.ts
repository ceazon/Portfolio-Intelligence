type PerformanceSummaryInput = {
  symbolId: string;
  ticker: string;
  name: string | null;
  exchange: string | null;
  currency: string | null;
  currentPrice: number | null;
  currentPriceFetchedAt: string | null;
  currentConsensusTarget: number | null;
  currentConsensusTargetCurrency: string | null;
  impliedUpsidePct: number | null;
  evaluationWindowDays: number;
  evaluatedSnapshotCount: number;
  hitCount: number;
  avgAlphaVsConsensusPct: number | null;
};

export type PerformanceSummaryRow = PerformanceSummaryInput & {
  hitRatePct: number | null;
  reliabilityLabel: "analysts too conservative" | "analysts fairly accurate" | "analysts too optimistic" | "limited history";
};

export function getReliabilityLabel(avgAlphaVsConsensusPct: number | null, evaluatedSnapshotCount: number): PerformanceSummaryRow["reliabilityLabel"] {
  if (evaluatedSnapshotCount < 3 || avgAlphaVsConsensusPct === null) {
    return "limited history";
  }

  if (avgAlphaVsConsensusPct >= 10) {
    return "analysts too conservative";
  }

  if (avgAlphaVsConsensusPct <= -10) {
    return "analysts too optimistic";
  }

  return "analysts fairly accurate";
}

export function buildPerformanceSummaryRow(input: PerformanceSummaryInput): PerformanceSummaryRow {
  const hitRatePct = input.evaluatedSnapshotCount > 0 ? (input.hitCount / input.evaluatedSnapshotCount) * 100 : null;

  return {
    ...input,
    hitRatePct,
    reliabilityLabel: getReliabilityLabel(input.avgAlphaVsConsensusPct, input.evaluatedSnapshotCount),
  };
}

export function formatPercent(value: number | null, digits = 1) {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

export function getPerformanceTone(value: number | null) {
  if (value === null || !Number.isFinite(value) || value === 0) {
    return "neutral" as const;
  }

  return value > 0 ? "positive" as const : "negative" as const;
}

export function formatMoney(value: number | null, currency = "USD") {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }

  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}
