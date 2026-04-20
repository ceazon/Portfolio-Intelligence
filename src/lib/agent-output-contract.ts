export const AGENT_SCOPE_TYPES = ["symbol", "global"] as const;
export type AgentScopeType = (typeof AGENT_SCOPE_TYPES)[number];

export const AGENT_STANCES = ["bullish", "neutral", "bearish"] as const;
export type AgentStance = (typeof AGENT_STANCES)[number];

export const AGENT_ACTION_BIASES = ["increase", "hold", "reduce", "avoid"] as const;
export type AgentActionBias = (typeof AGENT_ACTION_BIASES)[number];

export type AgentEvidence = Record<string, unknown>;

export type AgentOutputContract = {
  owner_id: string;
  agent_name: string;
  symbol_id?: string;
  research_run_id?: string;
  scope_type: AgentScopeType;
  scope_key: string;
  stance: AgentStance;
  normalized_score: number;
  confidence_score: number;
  summary: string;
  thesis: string;
  evidence_json: AgentEvidence;
  action_bias?: AgentActionBias;
  target_weight_delta?: number;
  time_horizon?: string;
  expires_at?: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function clampNormalizedScore(value: number) {
  return Number(clamp(value, -1, 1).toFixed(2));
}

export function clampConfidenceScore(value: number) {
  return Number(clamp(value, 0, 1).toFixed(2));
}

export function scoreFromPercent(value: number) {
  return clampNormalizedScore((value - 50) / 50);
}

export function confidenceFromPercent(value: number) {
  return clampConfidenceScore(value / 100);
}

export function percentFromScore(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return Number((clamp(value, -1, 1) * 50 + 50).toFixed(2));
}

export function percentFromConfidence(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return Number((clamp(value, 0, 1) * 100).toFixed(2));
}

export function inferStanceFromScore(score: number): AgentStance {
  if (score >= 0.2) return "bullish";
  if (score <= -0.2) return "bearish";
  return "neutral";
}

export function buildAgentOutputContract(input: AgentOutputContract): AgentOutputContract {
  return {
    ...input,
    normalized_score: clampNormalizedScore(input.normalized_score),
    confidence_score: clampConfidenceScore(input.confidence_score),
    stance: inferStanceFromScore(input.normalized_score),
    action_bias: input.action_bias,
    target_weight_delta: typeof input.target_weight_delta === "number" ? Number(input.target_weight_delta.toFixed(2)) : undefined,
  };
}
