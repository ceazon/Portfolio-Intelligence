"use client";

import { useActionState } from "react";
import { updatePortfolio, type FormState } from "@/app/actions";
import { formatMoney } from "@/lib/currency";

const initialFormState: FormState = {
  ok: false,
  error: "",
};

export function EditCashPositionForm({
  id,
  name,
  description,
  benchmark,
  displayCurrency,
  cashPosition,
  cashCurrency,
  recommendationCashMode,
  cashInDisplay,
}: {
  id: string;
  name: string;
  description: string | null;
  benchmark: string | null;
  displayCurrency: "USD" | "CAD";
  cashPosition: number | null;
  cashCurrency: "USD" | "CAD";
  recommendationCashMode: "managed-cash" | "fully-invested";
  cashInDisplay: number;
}) {
  const [state, formAction, pending] = useActionState(updatePortfolio, initialFormState);

  return (
    <form action={formAction} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="description" value={description || ""} />
      <input type="hidden" name="benchmark" value={benchmark || "SPY"} />
      <input type="hidden" name="displayCurrency" value={displayCurrency} />
      <input type="hidden" name="recommendationCashMode" value={recommendationCashMode} />

      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-zinc-100">Cash position</p>
          <p className="mt-1 text-xs text-zinc-500">Update uninvested cash directly without opening full portfolio settings.</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Shown in {displayCurrency}</p>
          <p className="mt-1 text-sm font-medium text-zinc-100">{formatMoney(cashInDisplay, displayCurrency)}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px_auto]">
        <input
          name="cashPosition"
          type="number"
          min="0"
          step="0.01"
          defaultValue={cashPosition ?? 0}
          className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-sky-500"
        />
        <select
          name="cashCurrency"
          defaultValue={cashCurrency}
          className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-sky-500"
        >
          <option value="USD">USD cash</option>
          <option value="CAD">CAD cash</option>
        </select>
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Saving..." : "Update cash"}
        </button>
      </div>

      {state?.error ? <p className="mt-3 text-xs text-amber-300">{state.error}</p> : null}
      {state?.ok ? <p className="mt-3 text-xs text-emerald-300">Cash updated.</p> : null}
    </form>
  );
}
