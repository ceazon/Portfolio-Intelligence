export const roadmapCards = [
  {
    title: "Current project state",
    body: "Portfolio Intelligence is now meaningfully positioned as an analyst-driven rebalancing workspace. Cash-aware portfolio support is in place, deterministic rebalance runs are live, analyst consensus targets are flowing into the core logic, and the live database schema is caught up with the current cash fields.",
  },
  {
    title: "What is already solid",
    body: "The product can now track holdings, quote refreshes, analyst targets, portfolio cash, and rebalance outputs in one loop. Current versus target allocation views are working, and the product story is much stronger when it stays anchored on portfolio math instead of black-box recommendation theater.",
  },
  {
    title: "Immediate product gap",
    body: "The biggest remaining gap is coherence. Legacy recommendation, research, and agent surfaces still sit beside the new rebalance model, and the dashboard needs to more clearly reflect what is real, what is legacy, and what the next operator actions should be.",
  },
  {
    title: "Next strategic step",
    body: "The next phase should harden this into a practical operating tool: production sanity checks, rebalance-first dashboard modules, cleaner copy across the app, and run history that explains what changed without making AI the center of the product again.",
  },
];

export const nextBuildTargets = [
  "Run a production sanity pass on portfolio cash persistence, fully-invested vs managed-cash behavior, and residual cash display",
  "Add dashboard cards for biggest adds, biggest trims, residual cash, and highest implied-upside holdings",
  "Reframe remaining recommendation-first copy so the main workflow consistently reads as rebalance planning",
  "Add rebalance history and what-changed tracking so each portfolio becomes easier to operate over time",
  "Validate analyst target coverage across real held portfolios and only add fallback logic where genuine gaps exist",
  "Reduce or hide legacy research and agent-first surfaces once the rebalance workflow feels complete",
];
