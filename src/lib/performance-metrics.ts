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

export type PaceStatus = "ahead" | "on-pace" | "behind" | "unavailable";

export type PaceSummary = {
  status: PaceStatus;
  expectedPriceToday: number | null;
  deltaValue: number | null;
  deltaPct: number | null;
  elapsedDays: number | null;
  startDate: string | null;
  startPrice: number | null;
  targetPrice: number | null;
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

export function getPaceStatus(deltaPct: number | null, tolerancePct = 5): PaceStatus {
  if (deltaPct === null || !Number.isFinite(deltaPct)) {
    return "unavailable";
  }

  if (deltaPct > tolerancePct) {
    return "ahead";
  }

  if (deltaPct < -tolerancePct) {
    return "behind";
  }

  return "on-pace";
}

export function buildPaceSummary({
  startDate,
  startPrice,
  targetPrice,
  currentPrice,
  now = new Date(),
  horizonDays = 365,
  tolerancePct = 5,
}: {
  startDate: string | null;
  startPrice: number | null;
  targetPrice: number | null;
  currentPrice: number | null;
  now?: Date;
  horizonDays?: number;
  tolerancePct?: number;
}): PaceSummary {
  if (!startDate || startPrice === null || targetPrice === null || currentPrice === null) {
    return {
      status: "unavailable",
      expectedPriceToday: null,
      deltaValue: null,
      deltaPct: null,
      elapsedDays: null,
      startDate,
      startPrice,
      targetPrice,
    };
  }

  const start = new Date(startDate);
  if (Number.isNaN(start.getTime()) || horizonDays <= 0) {
    return {
      status: "unavailable",
      expectedPriceToday: null,
      deltaValue: null,
      deltaPct: null,
      elapsedDays: null,
      startDate,
      startPrice,
      targetPrice,
    };
  }

  const elapsedRaw = (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  const elapsedDays = Math.max(0, Math.min(horizonDays, elapsedRaw));
  const expectedPriceToday = startPrice + ((targetPrice - startPrice) * elapsedDays) / horizonDays;
  const deltaValue = currentPrice - expectedPriceToday;
  const deltaPct = expectedPriceToday !== 0 ? (deltaValue / expectedPriceToday) * 100 : null;

  return {
    status: getPaceStatus(deltaPct, tolerancePct),
    expectedPriceToday,
    deltaValue,
    deltaPct,
    elapsedDays,
    startDate,
    startPrice,
    targetPrice,
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

export function getPaceTone(status: PaceStatus) {
  if (status === "ahead") return "positive" as const;
  if (status === "behind") return "negative" as const;
  return "neutral" as const;
}

export function getPaceSeverity(deltaPct: number | null, tolerancePct = 5) {
  if (deltaPct === null || !Number.isFinite(deltaPct)) {
    return "neutral" as const;
  }

  if (Math.abs(deltaPct) <= tolerancePct) {
    return "good" as const;
  }

  if (Math.abs(deltaPct) <= tolerancePct * 2) {
    return "caution" as const;
  }

  return "warning" as const;
}

export function formatPaceLabel(status: PaceStatus) {
  if (status === "ahead") return "Ahead of pace";
  if (status === "behind") return "Behind pace";
  if (status === "on-pace") return "On pace";
  return "Waiting for target history";
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
