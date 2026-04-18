"use client";

import { useActionState } from "react";
import { createPortfolio, type FormState } from "@/app/actions";

const initialFormState: FormState = {
  ok: false,
  error: "",
};

export function CreatePortfolioForm() {
  const [state, formAction, pending] = useActionState(createPortfolio, initialFormState);

  return (
    <form action={formAction} className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
      <div>
        <h3 className="text-base font-semibold text-zinc-100">Create portfolio</h3>
        <p className="mt-1 text-sm text-zinc-400">Set up the core paper portfolio that recommendations will manage over time.</p>
      </div>
      <input
        name="name"
        placeholder="Aggressive Growth Core"
        className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-sky-500"
      />
      <input
        name="benchmark"
        placeholder="SPY"
        defaultValue="SPY"
        className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-sky-500"
      />
      <textarea
        name="description"
        placeholder="Core 4-5 positions with a long-term aggressive growth bias and monthly decision cadence"
        rows={3}
        className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-sky-500"
      />
      {state?.error ? <p className="text-sm text-amber-300">{state.error}</p> : null}
      {state?.ok ? <p className="text-sm text-emerald-300">Portfolio created.</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Creating..." : "Create portfolio"}
      </button>
    </form>
  );
}
