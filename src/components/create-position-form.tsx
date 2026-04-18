"use client";

import { useActionState } from "react";
import { addPortfolioPosition, type FormState } from "@/app/actions";

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
  const [state, formAction, pending] = useActionState(addPortfolioPosition, initialFormState);

  return (
    <form action={formAction} className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
      <div>
        <h3 className="text-base font-semibold text-zinc-100">Add portfolio position</h3>
        <p className="mt-1 text-sm text-zinc-400">Attach an imported symbol to a portfolio with starting target and conviction.</p>
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

      <div className="grid gap-3 sm:grid-cols-2">
        <input
          name="targetWeight"
          type="number"
          min="0"
          max="100"
          step="0.01"
          placeholder="Target weight %"
          className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-sky-500"
        />
        <input
          name="currentWeight"
          type="number"
          min="0"
          max="100"
          step="0.01"
          placeholder="Current weight %"
          className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-sky-500"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <input
          name="convictionScore"
          type="number"
          min="0"
          max="100"
          step="0.01"
          placeholder="Conviction score"
          className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-sky-500"
        />
        <select
          name="status"
          className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-sky-500"
          defaultValue="active"
        >
          <option value="active">Active</option>
          <option value="watch">Watch</option>
          <option value="trim">Trim</option>
          <option value="exit">Exit</option>
        </select>
      </div>

      <textarea
        name="notes"
        placeholder="Why this name belongs in the portfolio"
        rows={3}
        className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-sky-500"
      />

      {state?.error ? <p className="text-sm text-amber-300">{state.error}</p> : null}
      {state?.ok ? <p className="text-sm text-emerald-300">Position added.</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Adding..." : "Add position"}
      </button>
    </form>
  );
}
