"use client";

import { useMemo, useState } from "react";

type AllocationRow = {
  label: string;
  currentWeight: number;
  targetWeight: number;
};

type DecisionState = "pending" | "accepted" | "snoozed" | "rejected" | "watching";

const decisionLabels: Record<DecisionState, string> = {
  pending: "Pending",
  accepted: "Accepted",
  snoozed: "Snoozed",
  rejected: "Rejected",
  watching: "Watching",
};

function getSeverity(maxDrift: number, totalDrift: number) {
  if (maxDrift >= 10 || totalDrift >= 25) {
    return {
      label: "Action recommended",
      tone: "text-rose-300 border-rose-800/70 bg-rose-950/25",
      body: "The current plan has enough drift that a rebalance would meaningfully change portfolio shape.",
    };
  }

  if (maxDrift >= 5 || totalDrift >= 12) {
    return {
      label: "Small rebalance suggested",
      tone: "text-amber-300 border-amber-800/70 bg-amber-950/25",
      body: "The portfolio is not broken, but there are visible allocation gaps worth tightening.",
    };
  }

  if (maxDrift >= 2 || totalDrift >= 6) {
    return {
      label: "Monitor",
      tone: "text-sky-300 border-sky-800/70 bg-sky-950/25",
      body: "The portfolio is close enough that action can wait unless there is a strategic reason to move now.",
    };
  }

  return {
    label: "No action needed",
    tone: "text-emerald-300 border-emerald-800/70 bg-emerald-950/25",
    body: "Current weights are close to the target plan. Staying put is reasonable.",
  };
}

function getDecisionClasses(state: DecisionState) {
  if (state === "accepted") return "border-emerald-700 bg-emerald-950/40 text-emerald-200";
  if (state === "snoozed") return "border-amber-700 bg-amber-950/40 text-amber-200";
  if (state === "rejected") return "border-rose-700 bg-rose-950/40 text-rose-200";
  if (state === "watching") return "border-sky-700 bg-sky-950/40 text-sky-200";
  return "border-zinc-700 bg-zinc-900 text-zinc-300";
}

export function PortfolioRebalanceSummary({ rows }: { rows: AllocationRow[] }) {
  const [decision, setDecision] = useState<DecisionState>("pending");

  const actionable = rows
    .map((row) => ({
      ...row,
      delta: row.targetWeight - row.currentWeight,
    }))
    .filter((row) => Math.abs(row.delta) >= 0.1)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const briefing = useMemo(() => {
    const additions = actionable.filter((row) => row.delta > 0);
    const trims = actionable.filter((row) => row.delta < 0);
    const maxDrift = actionable[0] ? Math.abs(actionable[0].delta) : 0;
    const totalDrift = actionable.reduce((sum, row) => sum + Math.abs(row.delta), 0);
    const severity = getSeverity(maxDrift, totalDrift);
    const largestTrim = trims[0] || null;
    const largestAdd = additions[0] || null;
    const cashRow = actionable.find((row) => row.label.toLowerCase() === "cash") || null;

    const changedBullets = [
      largestTrim ? `${largestTrim.label} is the biggest overweight at ${Math.abs(largestTrim.delta).toFixed(1)} pts above target.` : null,
      largestAdd ? `${largestAdd.label} is the biggest underweight at ${largestAdd.delta.toFixed(1)} pts below target.` : null,
      cashRow ? `Cash is part of the plan: ${cashRow.delta > 0 ? "raise" : "deploy"} ${Math.abs(cashRow.delta).toFixed(1)} pts.` : null,
      actionable.length > 0 ? `${actionable.length} holdings are far enough from target to mention.` : "No material allocation drift is showing right now.",
    ].filter((item): item is string => Boolean(item));

    const safestAction = largestTrim && largestAdd
      ? `Start with a partial trim of ${largestTrim.label}, then route proceeds toward ${largestAdd.label}${cashRow && cashRow.delta > 0 ? " and cash" : ""}.`
      : largestTrim
        ? `Start by trimming ${largestTrim.label}; there is no clear add target with comparable urgency.`
        : largestAdd
          ? `Add gradually to ${largestAdd.label}; there is no major trim candidate with comparable urgency.`
          : "No immediate action is needed; keep monitoring allocation drift.";

    const conservative = largestTrim
      ? `Trim only half of the largest drift: ${largestTrim.label} by ${(Math.abs(largestTrim.delta) / 2).toFixed(1)} pts.`
      : "Do nothing now and review after the next quote refresh.";
    const balanced = largestTrim && largestAdd
      ? `Move the largest pair: trim ${largestTrim.label} by ${Math.abs(largestTrim.delta).toFixed(1)} pts and add ${largestAdd.label} by ${largestAdd.delta.toFixed(1)} pts.`
      : safestAction;
    const aggressive = actionable.length > 0
      ? `Execute the full target plan across all ${actionable.length} drift items.`
      : "No aggressive action recommended because there is no meaningful drift.";

    return {
      additions,
      trims,
      maxDrift,
      totalDrift,
      severity,
      changedBullets,
      safestAction,
      options: [
        { label: "Conservative", body: conservative },
        { label: "Balanced", body: balanced },
        { label: "Aggressive", body: aggressive },
      ],
    };
  }, [actionable]);

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-zinc-100">Rebalance summary</h3>
        <p className="mt-1 text-sm text-zinc-400">A clearer view of what the current rebalance plan implies for holdings.</p>
      </div>

      {actionable.length > 0 ? (
        <div className="space-y-2">
          {actionable.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm">
              <div>
                <p className="font-medium text-zinc-100">{row.label}</p>
                <p className="text-zinc-500">
                  Current {row.currentWeight.toFixed(1)}% → Target {row.targetWeight.toFixed(1)}%
                </p>
              </div>
              <div className={row.delta > 0 ? "text-emerald-300" : "text-rose-300"}>
                {row.delta > 0 ? "Add" : "Trim"} {Math.abs(row.delta).toFixed(1)} pts
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-400">
          Current holdings are already close to the target rebalance weights.
        </div>
      )}

      <div className="mt-4 rounded-2xl border border-sky-900/50 bg-sky-950/10 p-4">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-sky-400">AI copilot briefing</p>
            <h4 className="mt-1 text-base font-semibold text-zinc-100">Why this rebalance matters</h4>
            <p className="mt-1 text-sm leading-6 text-zinc-400">A decision-first readout based on current allocation drift versus target weights.</p>
          </div>
          <span className={`w-fit rounded-full border px-3 py-1 text-xs font-medium ${briefing.severity.tone}`}>{briefing.severity.label}</span>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
          <div className="space-y-3">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
              <p className="text-xs uppercase tracking-wide text-zinc-500">What changed</p>
              <ul className="mt-2 space-y-2 text-sm leading-6 text-zinc-300">
                {briefing.changedBullets.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Safest next action</p>
              <p className="mt-2 text-sm leading-6 text-zinc-300">{briefing.safestAction}</p>
              <p className="mt-2 text-xs leading-5 text-zinc-500">{briefing.severity.body}</p>
            </div>
          </div>

          <div className="space-y-3">
            {briefing.options.map((option) => (
              <div key={option.label} className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
                <p className="text-sm font-semibold text-zinc-100">{option.label}</p>
                <p className="mt-1 text-sm leading-6 text-zinc-400">{option.body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-zinc-500">Decision</p>
              <p className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-medium ${getDecisionClasses(decision)}`}>{decisionLabels[decision]}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {([
                ["accepted", "Accept"],
                ["watching", "Watch"],
                ["snoozed", "Snooze"],
                ["rejected", "Reject"],
              ] as const).map(([state, label]) => (
                <button
                  key={state}
                  type="button"
                  onClick={() => setDecision(state)}
                  className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-3 text-xs leading-5 text-zinc-500">MVP note: this decision state is local for now. Next step is saving decisions into a rebalance journal so future runs can say what changed since your last accept/snooze/reject.</p>
        </div>
      </div>
    </div>
  );
}
