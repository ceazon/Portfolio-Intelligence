"use client";

import { useState } from "react";
import { EditPortfolioForm } from "@/components/edit-portfolio-form";
import { type SupportedCurrency } from "@/lib/currency";

export function PortfolioSettingsPanel({
  id,
  name,
  description,
  benchmark,
  displayCurrency,
  cashPosition,
  cashCurrency,
  recommendationCashMode,
}: {
  id: string;
  name: string;
  description: string | null;
  benchmark: string | null;
  displayCurrency: SupportedCurrency;
  cashPosition: number | null;
  cashCurrency: SupportedCurrency;
  recommendationCashMode: "managed-cash" | "fully-invested";
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-3">
      <button type="button" onClick={() => setExpanded((value) => !value)} className="flex w-full items-center justify-between gap-3 text-left">
        <div>
          <p className="text-sm font-medium text-zinc-100">Portfolio settings</p>
          <p className="mt-1 text-xs text-zinc-500">Name, benchmark, display currency, recommendation mode, and description</p>
        </div>
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-700 text-lg font-semibold text-zinc-300">
          {expanded ? "−" : "+"}
        </span>
      </button>

      {expanded ? (
        <EditPortfolioForm
          id={id}
          name={name}
          description={description}
          benchmark={benchmark}
          displayCurrency={displayCurrency}
          cashPosition={cashPosition}
          cashCurrency={cashCurrency}
          recommendationCashMode={recommendationCashMode}
        />
      ) : null}
    </div>
  );
}
