"use client";

import { useActionState } from "react";
import { synthesizeRecommendations, type FormState } from "@/app/actions";

const initialFormState: FormState = {
  ok: false,
  error: "",
};

export function SynthesizeRecommendationsForm() {
  const [state, formAction, pending] = useActionState(synthesizeRecommendations, initialFormState);

  return (
    <form action={formAction} className="space-y-3 rounded-2xl border border-indigo-800/60 bg-indigo-950/20 p-4">
      <div>
        <h3 className="text-base font-semibold text-zinc-100">Run synthesis</h3>
        <p className="mt-1 text-sm text-zinc-400">Create fresh synthesized recommendations from the News, Bear Case, Fundamentals, and Macro agents.</p>
      </div>

      {state?.error ? <p className="text-sm text-amber-300">{state.error}</p> : null}
      {state?.ok ? <p className="text-sm text-emerald-300">Synthesis completed.</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-indigo-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-indigo-300 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Synthesizing..." : "Run synthesis"}
      </button>
    </form>
  );
}
