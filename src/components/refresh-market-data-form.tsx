"use client";

import { useActionState } from "react";
import { backfillPerformanceSnapshots, refreshMarketData, type FormState } from "@/app/actions";

const initialFormState: FormState = {
  ok: false,
  error: "",
};

export function RefreshMarketDataForm() {
  const [refreshState, refreshAction, refreshPending] = useActionState(refreshMarketData, initialFormState);
  const [backfillState, backfillAction, backfillPending] = useActionState(backfillPerformanceSnapshots, initialFormState);

  return (
    <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
      <div>
        <h3 className="text-base font-semibold text-zinc-100">Market data tools</h3>
        <p className="mt-1 text-sm text-zinc-400">Refresh shared quote state, update FX, and seed missing target-history baselines for older imported symbols.</p>
      </div>

      <form action={refreshAction} className="space-y-3">
        {refreshState?.error ? <p className="text-sm text-amber-300">{refreshState.error}</p> : null}
        {refreshState?.ok ? <p className="text-sm text-emerald-300">Market and FX refresh completed.</p> : null}

        <button
          type="submit"
          disabled={refreshPending}
          className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {refreshPending ? "Refreshing..." : "Run market + FX refresh"}
        </button>
      </form>

      <div className="h-px bg-zinc-800" />

      <form action={backfillAction} className="space-y-3">
        <div>
          <p className="text-sm font-medium text-zinc-100">Seed missing target history</p>
          <p className="mt-1 text-sm text-zinc-400">Create a day-zero estimate snapshot for imported symbols that predate estimate tracking.</p>
        </div>

        {backfillState?.error ? <p className="text-sm text-amber-300">{backfillState.error}</p> : null}
        {backfillState?.notice ? <p className="text-sm text-emerald-300">{backfillState.notice}</p> : null}
        {backfillState?.ok && !backfillState?.notice ? <p className="text-sm text-emerald-300">Target-history backfill completed.</p> : null}

        <button
          type="submit"
          disabled={backfillPending}
          className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-semibold text-zinc-100 hover:border-zinc-500 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {backfillPending ? "Seeding..." : "Seed missing target history"}
        </button>
      </form>
    </div>
  );
}
