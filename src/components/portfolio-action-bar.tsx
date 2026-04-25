"use client";

import { useState } from "react";
import { CreatePortfolioForm } from "@/components/create-portfolio-form";
import { CreatePositionForm } from "@/components/create-position-form";

type PortfolioOption = {
  id: string;
  name: string;
};

type SymbolOption = {
  id: string;
  ticker: string;
  name: string | null;
};

export function PortfolioActionBar({ portfolios, symbols }: { portfolios: PortfolioOption[]; symbols: SymbolOption[] }) {
  const [openPanel, setOpenPanel] = useState<"create-portfolio" | "add-position" | null>(null);

  const toggle = (panel: "create-portfolio" | "add-position") => {
    setOpenPanel((current) => (current === panel ? null : panel));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3">
        <button
          type="button"
          onClick={() => toggle("create-portfolio")}
          className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-200 hover:border-sky-500 hover:text-zinc-50"
        >
          {openPanel === "create-portfolio" ? "Hide create portfolio" : "Create portfolio"}
        </button>

        <button
          type="button"
          onClick={() => toggle("add-position")}
          className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-200 hover:border-sky-500 hover:text-zinc-50"
        >
          {openPanel === "add-position" ? "Hide add or update position" : "Add or update position"}
        </button>
      </div>

      {openPanel === "create-portfolio" ? <CreatePortfolioForm /> : null}

      {openPanel === "add-position" ? (
        portfolios.length > 0 ? (
          symbols.length > 0 ? (
            <CreatePositionForm portfolios={portfolios} symbols={symbols} />
          ) : (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
              Import symbols first on the Symbols page before adding positions.
            </div>
          )
        ) : (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">
            Create a portfolio first, then add symbols as positions.
          </div>
        )
      ) : null}
    </div>
  );
}
