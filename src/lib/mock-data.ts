export const roadmapCards = [
  {
    title: "Where we are now",
    body: "The product is moving from an AI-heavy recommendation engine into a practical rebalancing workspace. Deterministic rebalance plans now sit at the center, using current holdings and analyst targets as the main decision inputs.",
  },
  {
    title: "What is working",
    body: "The core loop is getting cleaner: tracked positions, live quotes, analyst consensus targets, portfolio cash modes, rebalance plans, and target-allocation views. The app can now show where to add, trim, or hold with much less black-box behavior.",
  },
  {
    title: "Current constraint",
    body: "The main job now is consistency across the product. Some legacy recommendation, research, and agent surfaces still exist beside the new rebalance model, so the next work is consolidating the dashboard, history, and workflows around one coherent system.",
  },
  {
    title: "What could come next",
    body: "From here, the biggest upside is turning rebalance planning into a durable operating system: run history, what-changed tracking, clearer capital-allocation summaries, and optional AI explanation layered on top of deterministic portfolio math.",
  },
];

export const nextBuildTargets = [
  "Add rebalance history and change tracking so each portfolio shows how target allocations evolve over time",
  "Build dashboard modules for biggest adds, biggest trims, and highest implied-upside holdings",
  "Validate FMP coverage across held portfolios and add fallback target support only where gaps actually appear",
  "Create deeper symbol drill-down pages for valuation context, target history, and risk notes",
  "Reduce or hide legacy agent-first surfaces once rebalance workflows fully replace them",
  "Increase automation so quotes, analyst targets, and rebalance plans stay current with less manual intervention",
];
