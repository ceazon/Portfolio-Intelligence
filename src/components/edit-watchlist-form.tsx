"use client";

import { useActionState } from "react";
import { updateWatchlist, type FormState } from "@/app/actions";

const initialFormState: FormState = {
  ok: false,
  error: "",
};

export function EditWatchlistForm({ id, name, description }: { id: string; name: string; description: string | null }) {
  const [state, formAction, pending] = useActionState(updateWatchlist, initialFormState);

  return (
    <form action={formAction} className="mt-4 space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      <input type="hidden" name="id" value={id} />
      <input
        name="name"
        defaultValue={name}
        className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-sky-500"
      />
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
          {pending ? "Saving..." : "Save watchlist details"}
        </button>
        {state?.error ? <p className="text-xs text-amber-300">{state.error}</p> : null}
        {state?.ok ? <p className="text-xs text-emerald-300">Saved.</p> : null}
      </div>
    </form>
  );
}
