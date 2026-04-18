"use client";

import { useActionState } from "react";
import { deletePortfolioPosition, type FormState } from "@/app/actions";

const initialFormState: FormState = {
  ok: false,
  error: "",
};

export function DeletePositionForm({ portfolioId, symbolId }: { portfolioId: string; symbolId: string }) {
  const [state, formAction, pending] = useActionState(deletePortfolioPosition, initialFormState);

  return (
    <form action={formAction} className="mt-3 flex items-center gap-3">
      <input type="hidden" name="portfolioId" value={portfolioId} />
      <input type="hidden" name="symbolId" value={symbolId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-full border border-rose-500/40 px-3 py-1 text-xs text-rose-300 hover:border-rose-400 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Removing..." : "Remove position"}
      </button>
      {state?.error ? <p className="text-xs text-amber-300">{state.error}</p> : null}
      {state?.ok ? <p className="text-xs text-emerald-300">Removed.</p> : null}
    </form>
  );
}
