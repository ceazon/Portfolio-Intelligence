"use client";

import { useActionState } from "react";
import { refreshMarketData, type FormState } from "@/app/actions";

const initialFormState: FormState = {
  ok: false,
  error: "",
};

export function RefreshMarketDataForm() {
  const [state, formAction, pending] = useActionState(refreshMarketData, initialFormState);

  return (
    <form action={formAction} className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
      <div>
        <h3 className="text-base font-semibold text-zinc-100">Run market + FX refresh</h3>
        <p className="mt-1 text-sm text-zinc-400">Refresh shared tracked quotes, update the stored USD/CAD FX rate, and refresh fundamentals for your tracked symbols.</p>
      </div>

      {state?.error ? <p className="text-sm text-amber-300">{state.error}</p> : null}
      {state?.notice ? <p className="text-sm text-amber-200">{state.notice}</p> : null}
      {state?.ok && !state?.notice ? <p className="text-sm text-emerald-300">Market, FX, and fundamentals refresh completed.</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Refreshing..." : "Run market + FX refresh"}
      </button>
    </form>
  );
}
