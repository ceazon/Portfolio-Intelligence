"use client";

import { useActionState } from "react";
import { updateRecommendationStatus, type FormState } from "@/app/actions";

const initialFormState: FormState = {
  ok: false,
  error: "",
};

export function RecommendationStatusForm({ recommendationId, currentStatus }: { recommendationId: string; currentStatus: string }) {
  const [state, formAction, pending] = useActionState(updateRecommendationStatus, initialFormState);

  return (
    <form action={formAction} className="mt-3 flex flex-wrap gap-2">
      <input type="hidden" name="recommendationId" value={recommendationId} />

      {[
        { value: "accepted", label: "Accept" },
        { value: "dismissed", label: "Dismiss" },
        { value: "archived", label: "Archive" },
      ].map((option) => (
        <button
          key={option.value}
          type="submit"
          name="status"
          value={option.value}
          disabled={pending || currentStatus === option.value}
          className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:border-sky-500/60 hover:text-sky-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {option.label}
        </button>
      ))}

      {state?.error ? <p className="basis-full text-xs text-amber-300">{state.error}</p> : null}
      {state?.ok ? <p className="basis-full text-xs text-emerald-300">Recommendation updated.</p> : null}
    </form>
  );
}
