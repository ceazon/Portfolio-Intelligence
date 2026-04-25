export const roadmapCards = [
  {
    title: "Where we are now",
    body: "The product has moved beyond a rough agent demo into a usable portfolio intelligence system. Recommendations are now more investor-facing, less repetitive, and backed by structured explanation fields stored end-to-end in the database and UI.",
  },
  {
    title: "What is working",
    body: "The current core loop is in place: tracked symbols, research capture, fundamentals, macro context, recommendation synthesis, and compact recommendation cards with expandable rationale. The app now does a much better job explaining why a stock looks attractive or risky in plain investment language.",
  },
  {
    title: "Current constraint",
    body: "External market target validation is conceptually in the right place, but provider quality is the main bottleneck. Finnhub is not reliable for analyst target coverage on the current plan, so the next data-source upgrade should focus on a stronger consensus target provider such as FMP.",
  },
  {
    title: "What could come next",
    body: "From here, the biggest upside is deeper intelligence rather than more surface area: richer company understanding, stronger valuation context, better target realism, more durable monitoring, and a dashboard that feels like a portfolio operating system instead of just a tool launcher.",
  },
];

export const nextBuildTargets = [
  "Replace fragile consensus-target coverage with a stronger provider abstraction, ideally FMP first",
  "Add recommendation history and change tracking so each idea shows how conviction, target, and thesis evolve over time",
  "Create deeper company drill-down pages for quality, valuation, risks, and catalyst monitoring",
  "Expand the dashboard into a true portfolio overview with best ideas, weakest holdings, watchlist upgrades, and capital allocation suggestions",
  "Add more specialized intelligence layers such as earnings quality, estimate revision pressure, capital allocation quality, and management execution",
  "Increase automation so refresh, research, and synthesis stay current with less manual intervention",
];
