"use client";

import { useActionState } from "react";
import { updateMarketEstimateFallback, type FormState } from "@/app/actions";

const initialFormState: FormState = {
  ok: false,
  error: "",
};

export function MarketEstimateForm({ marketEstimatePct }: { marketEstimatePct: number }) {
  const [state, formAction, pending] = useActionState(updateMarketEstimateFallback, initialFormState);

  return (
    <form action={formAction} className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm">
      <label htmlFor="market-estimate-pct" className="text-xs uppercase tracking-wide text-zinc-500">Fallback market estimate</label>
      <div className="mt-3 flex items-center gap-2">
        <input
          id="market-estimate-pct"
          name="marketEstimatePct"
          type="number"
          min="-50"
          max="100"
          step="0.1"
          defaultValue={marketEstimatePct}
          className="w-24 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-sky-500"
        />
        <span className="text-zinc-400">%</span>
        <button
          type="submit"
          disabled={pending}
          className="ml-auto rounded-xl border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-200 transition hover:border-sky-500/70 hover:text-sky-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Saving..." : "Save"}
        </button>
      </div>
      <p className="mt-2 text-xs leading-5 text-zinc-500">Used only when a holding has no analyst target.</p>
      {state?.error ? <p className="mt-2 text-xs text-amber-300">{state.error}</p> : null}
      {state?.ok ? <p className="mt-2 text-xs text-emerald-300">Saved.</p> : null}
    </form>
  );
}
