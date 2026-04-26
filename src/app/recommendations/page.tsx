import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { SynthesizeRecommendationsForm } from "@/components/synthesize-recommendations-form";
import { requireUser } from "@/lib/auth";
import { buildRebalancePlan } from "@/lib/rebalancing-engine";

export default async function RecommendationsPage() {
  const user = await requireUser();
  const plan = await buildRebalancePlan(user.id);

  return (
    <AppShell viewer={user}>
      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-6">
          <SectionCard title="Rebalance plan" description={plan.summary}>
            {plan.items.length > 0 ? (
              <div className="space-y-3">
                {plan.items.map((item) => {
                  const quotePositive = typeof item.impliedUpsidePct === "number" ? item.impliedUpsidePct >= 0 : null;
                  const actionLabel = item.action.toUpperCase();
                  const actionTone =
                    item.action === "increase" || item.action === "initiate"
                      ? "text-emerald-300"
                      : item.action === "reduce" || item.action === "exit"
                        ? "text-rose-300"
                        : "text-zinc-300";

                  return (
                    <details key={`${item.portfolioId || "none"}-${item.symbolId}`} className="group rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 open:border-zinc-700 open:bg-zinc-950">
                      <summary className="cursor-pointer list-none">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-semibold text-zinc-100">
                              {item.ticker}
                              <span className="ml-2 text-zinc-400">{item.name || "Unnamed symbol"}</span>
                            </p>
                            <p className="mt-1 text-xs uppercase tracking-wide text-zinc-500">
                              <span className={actionTone}>{actionLabel}</span>
                              {item.portfolioName ? ` · ${item.portfolioName}` : ""}
                              {item.confidence ? ` · ${item.confidence} confidence` : ""}
                            </p>
                          </div>

                          <div className="text-right text-sm">
                            {typeof item.currentPrice === "number" ? <p className="text-zinc-100">${item.currentPrice.toFixed(2)}</p> : null}
                            {typeof item.impliedUpsidePct === "number" ? (
                              <p className={quotePositive ? "text-emerald-300" : "text-rose-300"}>
                                {quotePositive ? "+" : ""}
                                {item.impliedUpsidePct.toFixed(1)}%
                              </p>
                            ) : null}
                          </div>
                        </div>

                        <div className="mt-3 flex items-start justify-between gap-4">
                          <p className="text-base font-medium text-zinc-100">{item.rationale}</p>
                          <span className="mt-0.5 text-xs text-zinc-500 group-open:hidden">Click to expand</span>
                          <span className="mt-0.5 hidden text-xs text-zinc-500 group-open:inline">Click to collapse</span>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-400">
                          {item.currentWeight !== null ? <span className="rounded-full border border-zinc-700 px-2 py-1">Current weight {item.currentWeight.toFixed(1)}%</span> : null}
                          {item.targetWeight !== null ? <span className="rounded-full border border-zinc-700 px-2 py-1">Target weight {item.targetWeight.toFixed(1)}%</span> : null}
                          {item.weightDelta !== null ? (
                            <span className={`rounded-full border px-2 py-1 ${item.weightDelta >= 1 ? "border-emerald-700/60 bg-emerald-950/20 text-emerald-200" : item.weightDelta <= -1 ? "border-rose-700/60 bg-rose-950/20 text-rose-200" : "border-zinc-700 text-zinc-300"}`}>
                              Delta {item.weightDelta > 0 ? "+" : ""}{item.weightDelta.toFixed(1)} pts
                            </span>
                          ) : null}
                          {typeof item.consensusTarget === "number" ? <span className="rounded-full border border-indigo-700/60 bg-indigo-950/20 px-2 py-1 text-indigo-200">Consensus target ${item.consensusTarget.toFixed(2)}</span> : null}
                        </div>
                      </summary>

                      <div className="mt-4 border-t border-zinc-800 pt-4 grid gap-3 lg:grid-cols-2">
                        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3">
                          <p className="text-xs uppercase tracking-wide text-zinc-500">Current vs target</p>
                          <p className="mt-2 text-sm text-zinc-300">
                            {item.currentWeight !== null ? `${item.currentWeight.toFixed(1)}%` : "--"} → {item.targetWeight !== null ? `${item.targetWeight.toFixed(1)}%` : "--"}
                          </p>
                        </div>
                        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3">
                          <p className="text-xs uppercase tracking-wide text-zinc-500">Analyst target context</p>
                          <p className="mt-2 text-sm text-zinc-300">
                            {typeof item.consensusTarget === "number"
                              ? `$${item.consensusTarget.toFixed(2)}${typeof item.impliedUpsidePct === "number" ? ` (${item.impliedUpsidePct >= 0 ? "+" : ""}${item.impliedUpsidePct.toFixed(1)}%)` : ""}`
                              : "No analyst target available"}
                          </p>
                        </div>
                      </div>
                    </details>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">
                No rebalance plan yet. Generate a plan to populate this view.
              </div>
            )}
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SynthesizeRecommendationsForm />
        </div>
      </div>
    </AppShell>
  );
}
