"use client";

import { useActionState } from "react";
import { refreshDiscovery, type FormState } from "@/app/actions";

const initialFormState: FormState = {
  ok: false,
  error: "",
};

export function DiscoveryRefreshForm() {
  const [state, formAction, pending] = useActionState(refreshDiscovery, initialFormState);

  return (
    <form action={formAction} className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 className="text-base font-semibold text-zinc-100">Refresh S&P 500 Discovery</h3>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">
            Pull the S&P 500 universe, refresh a working batch of quotes, consensus targets, fundamentals, and rebuild the ranked research-candidate list.
          </p>
          {state?.error ? <p className="mt-2 text-sm text-amber-300">{state.error}</p> : null}
          {state?.notice ? <p className="mt-2 text-sm text-emerald-300">{state.notice}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-zinc-400" htmlFor="discovery-refresh-limit">Batch</label>
          <select id="discovery-refresh-limit" name="limit" defaultValue="500" className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-sky-500">
            <option value="100">100-symbol rotating sample</option>
            <option value="200">200-symbol rotating sample</option>
            <option value="500">Full S&P 500 scan</option>
          </select>
          <button type="submit" disabled={pending} className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60">
            {pending ? "Refreshing..." : "Refresh Discovery"}
          </button>
        </div>
      </div>
    </form>
  );
}
