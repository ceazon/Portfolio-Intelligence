"use client";

import { ReactNode, useState } from "react";

export function PortfolioExpandablePanel({
  title,
  description,
  buttonLabel,
  children,
  defaultOpen = false,
}: {
  title: string;
  description: string;
  buttonLabel?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-zinc-100">{title}</h3>
          <p className="mt-1 text-sm text-zinc-400">{description}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-200 hover:border-sky-500 hover:text-zinc-50"
        >
          {open ? "Hide" : buttonLabel || "Open"}
        </button>
      </div>

      {open ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}
