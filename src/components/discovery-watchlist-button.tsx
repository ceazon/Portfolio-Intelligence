"use client";

import { useActionState } from "react";
import { addDiscoveryCandidateToWatchlist, type FormState } from "@/app/actions";

const initialFormState: FormState = {
  ok: false,
  error: "",
};

export function DiscoveryWatchlistButton({ ticker, alreadyWatchlisted }: { ticker: string; alreadyWatchlisted: boolean }) {
  const [state, formAction, pending] = useActionState(addDiscoveryCandidateToWatchlist, initialFormState);

  return (
    <form action={formAction} className="flex flex-col items-start gap-1">
      <input type="hidden" name="ticker" value={ticker} />
      <button
        type="submit"
        disabled={pending || alreadyWatchlisted}
        className="rounded-lg border border-zinc-700 px-2.5 py-1 text-xs font-medium text-zinc-200 transition hover:border-sky-500/70 hover:text-sky-200 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {alreadyWatchlisted ? "Saved idea" : pending ? "Saving..." : "Save idea"}
      </button>
      {state?.error ? <span className="text-xs text-amber-300">{state.error}</span> : null}
      {state?.notice ? <span className="text-xs text-emerald-300">{state.notice}</span> : null}
    </form>
  );
}
