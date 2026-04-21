import { percentFromConfidence, percentFromScore } from "@/lib/agent-output-contract";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

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

export function getContributionLabel(score: number | null | undefined) {
  if (typeof score !== "number") return "Limited contributor";
  if (score >= 0.6) return "Strong positive contributor";
  if (score >= 0.2) return "Moderate positive contributor";
  if (score <= -0.6) return "Strong negative contributor";
  if (score <= -0.2) return "Negative contributor";
  return "Mixed contributor";
}

export function getMacroContributionLabel(score: number | null | undefined) {
  if (typeof score !== "number") return "Neutral backdrop";
  if (score >= 0.5) return "Tailwind";
  if (score >= 0.15) return "Mild tailwind";
  if (score <= -0.5) return "Headwind";
  if (score <= -0.15) return "Mild headwind";
  return "Neutral backdrop";
}

export function getReadableBiasLabel(value: string | null | undefined) {
  if (value === "increase") return "Supports adding";
  if (value === "hold") return "Supports holding";
  if (value === "reduce") return "Suggests reducing";
  if (value === "avoid") return "Suggests caution";
  return null;
}

export function getSignalStrengthLabel(score: number | null | undefined) {
  if (typeof score !== "number") return null;
  const magnitude = Math.abs(clamp(score, -1, 1));
  if (magnitude >= 0.65) return "Strong signal";
  if (magnitude >= 0.3) return "Moderate signal";
  return "Light signal";
}

export function getAgentHeadline(agentName: string, score: number | null | undefined) {
  if (agentName === "fundamentals-agent") {
    if ((score ?? 0) >= 0.2) return "Fundamentals support the long case";
    if ((score ?? 0) <= -0.2) return "Fundamentals weaken the setup";
    return "Fundamentals are mixed right now";
  }

  if (agentName === "news-agent") {
    if ((score ?? 0) >= 0.2) return "Recent news tone is positive";
    if ((score ?? 0) <= -0.2) return "Recent news tone is cautious";
    return "Recent news tone is mixed";
  }

  if (agentName === "bear-case-agent") {
    if ((score ?? 0) <= -0.2) return "Bear case is materially pressuring the setup";
    if ((score ?? 0) < 0.2) return "Bear case is active but contained";
    return "Bear case looks limited right now";
  }

  if (agentName === "macro-agent") {
    if ((score ?? 0) >= 0.2) return "Macro backdrop is supportive";
    if ((score ?? 0) <= -0.2) return "Macro backdrop is risk-off";
    return "Macro backdrop is mixed";
  }

  return formatStanceLabel(agentName);
}
