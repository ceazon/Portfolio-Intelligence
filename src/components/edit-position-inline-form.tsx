"use client";

import { useActionState } from "react";
import { upsertPortfolioPosition, type FormState } from "@/app/actions";

const initialFormState: FormState = {
  ok: false,
  error: "",
};

export function EditPositionInlineForm({
  portfolioId,
  symbolId,
  quantity,
  averageCost,
  notes,
}: {
  portfolioId: string;
  symbolId: string;
  quantity: number | null;
  averageCost: number | null;
  notes: string | null;
}) {
  const [state, formAction, pending] = useActionState(upsertPortfolioPosition, initialFormState);

  return (
    <form action={formAction} className="mt-4 space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
      <input type="hidden" name="portfolioId" value={portfolioId} />
      <input type="hidden" name="symbolId" value={symbolId} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">Quantity</label>
          <input
            name="quantity"
            type="number"
            min="0"
            step="0.000001"
            defaultValue={quantity ?? ""}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-sky-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">Average cost</label>
          <input
            name="averageCost"
            type="number"
            min="0"
            step="0.000001"
            defaultValue={averageCost ?? ""}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-sky-500"
          />
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">Notes</label>
        <textarea
          name="notes"
          rows={2}
          defaultValue={notes ?? ""}
          className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-sky-500"
        />
      </div>

      {state?.error ? <p className="text-sm text-amber-300">{state.error}</p> : null}
      {state?.ok ? <p className="text-sm text-emerald-300">Position updated.</p> : null}
    </form>
  );
}
