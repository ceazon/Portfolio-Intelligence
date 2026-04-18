"use client";

import { useActionState } from "react";
import { importSymbol, type FormState } from "@/app/actions";

const initialFormState: FormState = {
  ok: false,
  error: "",
};

type WatchlistOption = {
  id: string;
  name: string;
};

export function ImportSymbolForm({ watchlists }: { watchlists: WatchlistOption[] }) {
  const [state, formAction, pending] = useActionState(importSymbol, initialFormState);

  return (
    <form action={formAction} className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
      <div>
        <h3 className="text-base font-semibold text-zinc-100">Import symbol from API</h3>
        <p className="mt-1 text-sm text-zinc-400">
          Search by ticker or company name. We’ll pull the symbol from Finnhub and store it in Supabase.
        </p>
      </div>

      <input
        name="query"
        placeholder="NVDA or Nvidia"
        className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-sky-500"
      />

      <input
        name="selectedSymbol"
        placeholder="Optional exact ticker, e.g. NVDA"
        className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-sky-500"
      />

      <select
        name="watchlistId"
        className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-sky-500"
        defaultValue=""
      >
        <option value="">Do not attach to a watchlist yet</option>
        {watchlists.map((watchlist) => (
          <option key={watchlist.id} value={watchlist.id}>
            {watchlist.name}
          </option>
        ))}
      </select>

      {state?.error ? <p className="text-sm text-amber-300">{state.error}</p> : null}
      {state?.ok ? <p className="text-sm text-emerald-300">Symbol imported.</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Importing..." : "Import symbol"}
      </button>
    </form>
  );
}
