export const roadmapCards = [
  {
    title: "Current project state",
    body: "Portfolio Intelligence is now operating as a real rebalance-first workspace. Portfolios, holdings, cash settings, live quotes, analyst consensus targets, and deterministic rebalance outputs are all connected in the main workflow, and the latest owner-scoping issue in rebalancing has been fixed in production.",
  },
  {
    title: "What is implemented",
    body: "The app can create portfolios, import symbols, track positions, refresh market data, store cash in either managed-cash or fully-invested mode, generate target-weight rebalance plans, and compare current versus proposed allocation visually. Supporting layers for research, fundamentals, and agent outputs are also live as optional context.",
  },
  {
    title: "What still feels transitional",
    body: "The product still carries some older recommendation, research, and agent framing beside the stronger rebalance workflow. That means parts of the app are useful but not yet fully aligned around one clean operating story, so the dashboard should help clarify what is core, what is supporting context, and what is legacy.",
  },
  {
    title: "Where this can go next",
    body: "The strongest direction now is to deepen the operating layer rather than add more AI theater. That means better dashboard summaries, clearer rebalance run history, more practical portfolio oversight signals, and cleaner explanations of what changed and why on each plan refresh.",
  },
];

export const nextBuildTargets = [
  "Add a dashboard summary for biggest adds, biggest trims, residual cash, and top implied-upside names from the latest rebalance run",
  "Show per-portfolio rebalance run history with what changed since the last plan",
  "Tighten copy across recommendations, research, and agents so the core workflow consistently reads as rebalance planning",
  "Add production sanity checks for portfolio ownership, position persistence, and cash-mode behavior",
  "Validate analyst target coverage across real held portfolios and decide where fallback logic actually helps",
  "Gradually reduce or hide legacy research-first surfaces if the rebalance operating view becomes the clear product center",
];
