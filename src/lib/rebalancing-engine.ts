export type RebalanceAction = "increase" | "reduce" | "maintain" | "initiate" | "exit" | "watch";

export type RebalancePlanItem = {
  symbolId: string;
  action: RebalanceAction;
  currentWeight: number | null;
  targetWeight: number | null;
  impliedUpsidePct: number | null;
  rationale: string;
};

export type RebalancePlan = {
  engine: "analyst-rebalance-v1";
  summary: string;
  items: RebalancePlanItem[];
};

export async function buildRebalancePlan(): Promise<RebalancePlan> {
  return {
    engine: "analyst-rebalance-v1",
    summary: "Rebalance engine stub in place. Next step is to rank current holdings using analyst targets and current portfolio weights.",
    items: [],
  };
}
