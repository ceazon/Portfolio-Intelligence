import { percentFromConfidence, percentFromScore } from "@/lib/agent-output-contract";

export function formatNormalizedScore(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
}

export function formatConfidencePercent(value: number | null | undefined) {
  const percent = percentFromConfidence(value);
  if (typeof percent !== "number") return null;
  return `${Math.round(percent)}%`;
}

export function formatScorePercent(value: number | null | undefined) {
  const percent = percentFromScore(value);
  if (typeof percent !== "number") return null;
  return `${Math.round(percent)}%`;
}

export function formatStanceLabel(value: string | null | undefined) {
  if (!value) return "no stance";
  return value.replace(/-/g, " ");
}
