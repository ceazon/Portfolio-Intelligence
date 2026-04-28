"use client";

import { useActionState } from "react";
import { runNewsResearch, type FormState } from "@/app/actions";

const initialFormState: FormState = {
  ok: false,
  error: "",
};

export function RunNewsResearchForm() {
  const [state, formAction, pending] = useActionState(runNewsResearch, initialFormState);

  return (
    <form action={formAction} className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
      <div>
        <h3 className="text-base font-semibold text-zinc-100">Run shared news research</h3>
        <p className="mt-1 text-sm text-zinc-400">Scan the shared tracked symbol universe, capture recent headlines, store reusable research insights, and refresh the first global macro signal.</p>
      </div>

      {state?.error ? <p className="text-sm text-amber-300">{state.error}</p> : null}
      {state?.notice ? <p className="text-sm text-amber-200">{state.notice}</p> : null}
      {state?.ok && !state?.notice ? <p className="text-sm text-emerald-300">Shared news research and macro refresh completed.</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Running..." : "Run news research"}
      </button>
    </form>
  );
}
