"use client";

import { useState } from "react";
import { formatAppDateTime } from "@/lib/time";
import { formatMoney, formatPaceLabel, formatPercent, getPaceSeverity, type PaceSummary } from "@/lib/performance-metrics";

function getSeverityClasses(deltaPct: number | null) {
  const severity = getPaceSeverity(deltaPct);
  if (severity === "good") {
    return {
      badge: "border-emerald-800/70 bg-emerald-950/25 text-emerald-300",
      accent: "text-emerald-300",
    };
  }

  if (severity === "caution") {
    return {
      badge: "border-amber-800/70 bg-amber-950/25 text-amber-300",
      accent: "text-amber-300",
    };
  }

  if (severity === "warning") {
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
  reliabilityLabel,
  evaluatedSnapshotCount,
  evaluationWindowDays,
}: {
  currency: string;
  latest: PaceSummary;
  original: PaceSummary;
  reliabilityLabel: string;
  evaluatedSnapshotCount: number;
  evaluationWindowDays: number;
}) {
  const [open, setOpen] = useState(false);
  const tone = getSeverityClasses(original.deltaPct);
  const originalDateLabel = original.startDate ? formatAppDateTime(original.startDate) : null;

  return (
    <div className="relative w-fit min-w-0">
      <div className="inline-flex items-center gap-2">
        <span className={`inline-flex w-fit items-center whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium ${tone.badge}`}>
          {formatPaceLabel(original.status)}
        </span>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-sm text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
          aria-label={open ? "Collapse pace detail" : "Expand pace detail"}
          title={open ? "Collapse pace detail" : "Expand pace detail"}
        >
          {open ? "−" : "+"}
        </button>
      </div>

      {open ? (
        <div className="absolute right-0 top-full z-30 mt-3 w-[min(92vw,560px)] min-w-[420px] space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950/95 p-4 shadow-2xl shadow-black/40 backdrop-blur-sm">
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Original target date</p>
            <p className={`mt-2 text-sm font-semibold ${tone.accent}`}>{formatPaceLabel(original.status)}</p>
            <p className="mt-1 text-xs text-zinc-500">{originalDateLabel ? `Original snapshot from ${originalDateLabel}` : "Original snapshot history has not accumulated yet"}</p>
            <div className="mt-3 grid gap-x-4 gap-y-2 text-sm text-zinc-300 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">Expected today</p>
                <p className="mt-1 whitespace-nowrap">{formatMoney(original.expectedPriceToday, currency)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">Delta vs date</p>
                <p className={`mt-1 whitespace-nowrap ${tone.accent}`}>{formatMoney(original.deltaValue, currency)} ({formatPercent(original.deltaPct)})</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">Start price</p>
                <p className="mt-1 whitespace-nowrap">{formatMoney(original.startPrice, currency)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">Target price</p>
                <p className="mt-1 whitespace-nowrap">{formatMoney(original.targetPrice, currency)}</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">Reliability</p>
                <p className="mt-1 text-sm text-zinc-200">{reliabilityLabel}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">Evaluated snapshots</p>
                <p className="mt-1 text-sm text-zinc-200">{evaluatedSnapshotCount} ({evaluationWindowDays}d basis)</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
