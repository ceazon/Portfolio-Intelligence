"use client";

import { useActionState } from "react";
import { updatePortfolio, type FormState } from "@/app/actions";

const initialFormState: FormState = {
  ok: false,
  error: "",
};

export function EditPortfolioForm({
  id,
  name,
  description,
  benchmark,
  displayCurrency,
  cashPosition,
  cashCurrency,
}: {
  id: string;
  name: string;
  description: string | null;
  benchmark: string | null;
  displayCurrency: "USD" | "CAD";
  cashPosition: number | null;
  cashCurrency: "USD" | "CAD";
}) {
  const [state, formAction, pending] = useActionState(updatePortfolio, initialFormState);

  return (
    <form action={formAction} className="mt-4 space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          name="name"
          defaultValue={name}
          className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-sky-500"
        />
        <input
          name="benchmark"
          defaultValue={benchmark || "SPY"}
          className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-sky-500"
        />
      </div>
      <select
        name="displayCurrency"
        defaultValue={displayCurrency}
        className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-sky-500"
      >
        <option value="USD">Display in USD</option>
        <option value="CAD">Display in CAD</option>
      </select>
      <div className="grid gap-3 sm:grid-cols-2">
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
          <option value="USD">Cash in USD</option>
          <option value="CAD">Cash in CAD</option>
        </select>
      </div>
      <textarea
        name="description"
        rows={2}
        defaultValue={description || ""}
        className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-sky-500"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Saving..." : "Save portfolio details"}
        </button>
        {state?.error ? <p className="text-xs text-amber-300">{state.error}</p> : null}
        {state?.ok ? <p className="text-xs text-emerald-300">Saved.</p> : null}
      </div>
    </form>
  );
}
