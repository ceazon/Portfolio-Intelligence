"use client";

import { useActionState } from "react";
import { createWatchlist } from "@/app/actions";

const initialState = { ok: false, error: "" };

export function CreateWatchlistForm() {
  const [state, formAction, pending] = useActionState(createWatchlist, initialState);

  return (
    <form action={formAction} className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
      <div>
        <h3 className="text-base font-semibold text-zinc-100">Create watchlist</h3>
        <p className="mt-1 text-sm text-zinc-400">Start with a simple named list for candidate stocks and ETFs.</p>
      </div>
      <input
        name="name"
        placeholder="Growth watchlist"
        className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-sky-500"
      />
      <textarea
        name="description"
        placeholder="High-conviction growth names, sector ETFs, and experimental candidates"
        rows={3}
        className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-sky-500"
      />
      {state?.error ? <p className="text-sm text-amber-300">{state.error}</p> : null}
      {state?.ok ? <p className="text-sm text-emerald-300">Watchlist created.</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Creating..." : "Create watchlist"}
      </button>
    </form>
  );
}
