"use client";

import { useState } from "react";
import { formatMoney, formatPaceLabel, formatPercent, getPaceTone, type PaceSummary } from "@/lib/performance-metrics";

function getToneClasses(status: PaceSummary["status"]) {
  const tone = getPaceTone(status);
  if (tone === "positive") {
    return {
      badge: "border-emerald-800/70 bg-emerald-950/25 text-emerald-300",
      accent: "text-emerald-300",
    };
  }

  if (tone === "negative") {
    return {
      badge: "border-rose-800/70 bg-rose-950/25 text-rose-300",
      accent: "text-rose-300",
    };
  }

  return {
    badge: "border-zinc-700 bg-zinc-900 text-zinc-300",
    accent: "text-zinc-300",
  };
}

export function PerformancePacePanel({
  currency,
  latest,
  original,
}: {
  currency: string;
  latest: PaceSummary;
  original: PaceSummary;
}) {
  const [open, setOpen] = useState(false);
  const latestTone = getToneClasses(latest.status);
  const originalTone = getToneClasses(original.status);

  return (
    <div className="min-w-[220px]">
      <div className="flex flex-col gap-2">
        <span className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-medium ${latestTone.badge}`}>
          {formatPaceLabel(latest.status)}
        </span>
        <div className="text-xs text-zinc-500">
          {latest.expectedPriceToday !== null ? `Expected today ${formatMoney(latest.expectedPriceToday, currency)}` : "Latest path not available yet"}
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="w-fit rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
        >
          {open ? "Hide pace detail" : "Show pace detail"}
        </button>
      </div>

      {open ? (
        <div className="mt-3 grid gap-3">
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Latest target path</p>
            <p className={`mt-2 text-sm font-semibold ${latestTone.accent}`}>{formatPaceLabel(latest.status)}</p>
            <div className="mt-3 grid gap-2 text-sm text-zinc-300 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">Expected today</p>
                <p className="mt-1">{formatMoney(latest.expectedPriceToday, currency)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">Delta vs path</p>
                <p className={`mt-1 ${latestTone.accent}`}>{formatMoney(latest.deltaValue, currency)} ({formatPercent(latest.deltaPct)})</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">Start price</p>
                <p className="mt-1">{formatMoney(latest.startPrice, currency)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">Target price</p>
                <p className="mt-1">{formatMoney(latest.targetPrice, currency)}</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Original target path</p>
            <p className={`mt-2 text-sm font-semibold ${originalTone.accent}`}>{formatPaceLabel(original.status)}</p>
            <div className="mt-3 grid gap-2 text-sm text-zinc-300 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">Expected today</p>
                <p className="mt-1">{formatMoney(original.expectedPriceToday, currency)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">Delta vs path</p>
                <p className={`mt-1 ${originalTone.accent}`}>{formatMoney(original.deltaValue, currency)} ({formatPercent(original.deltaPct)})</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">Start price</p>
                <p className="mt-1">{formatMoney(original.startPrice, currency)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">Target price</p>
                <p className="mt-1">{formatMoney(original.targetPrice, currency)}</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
