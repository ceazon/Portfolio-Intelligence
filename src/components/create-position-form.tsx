"use client";

import { useActionState } from "react";
import { upsertPortfolioPosition, type FormState } from "@/app/actions";

const initialFormState: FormState = {
  ok: false,
  error: "",
};

type PortfolioOption = {
  id: string;
  name: string;
};

type SymbolOption = {
  id: string;
  ticker: string;
  name: string | null;
};

export function CreatePositionForm({ portfolios, symbols }: { portfolios: PortfolioOption[]; symbols: SymbolOption[] }) {
  const [state, formAction, pending] = useActionState(upsertPortfolioPosition, initialFormState);

  return (
    <form action={formAction} className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
      <div>
        <h3 className="text-base font-semibold text-zinc-100">Add or update position</h3>
        <p className="mt-1 text-sm text-zinc-400">Enter the current holding state. Portfolio analytics and rebalance planning will derive from these inputs.</p>
      </div>

      <select
        name="portfolioId"
        className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-sky-500"
        defaultValue=""
      >
        <option value="">Select portfolio</option>
        {portfolios.map((portfolio) => (
          <option key={portfolio.id} value={portfolio.id}>
            {portfolio.name}
          </option>
        ))}
      </select>

      <select
        name="symbolId"
        className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-sky-500"
        defaultValue=""
      >
        <option value="">Select imported symbol</option>
        {symbols.map((symbol) => (
          <option key={symbol.id} value={symbol.id}>
            {symbol.ticker}{symbol.name ? ` · ${symbol.name}` : ""}
          </option>
        ))}
      </select>

      <div className="grid gap-3 sm:grid-cols-3">
        <input
          name="quantity"
          type="number"
          min="0"
          step="0.000001"
          placeholder="Quantity"
          className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-sky-500"
        />
        <input
          name="averageCost"
          type="number"
          min="0"
          step="0.000001"
          placeholder="Average cost per share"
          className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-sky-500"
        />
        <select
          name="averageCostCurrency"
          defaultValue="USD"
          className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-sky-500"
        >
          <option value="USD">Average cost in USD</option>
          <option value="CAD">Average cost in CAD</option>
        </select>
      </div>

      <textarea
        name="notes"
        placeholder="Optional notes about this holding"
        rows={3}
        className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-sky-500"
      />

      {state?.error ? <p className="text-sm text-amber-300">{state.error}</p> : null}
      {state?.ok ? <p className="text-sm text-emerald-300">Position saved.</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Saving..." : "Save position"}
      </button>
    </form>
  );
}
