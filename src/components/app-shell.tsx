import Link from "next/link";
import { ReactNode } from "react";
import { legacyNav, primaryNav } from "@/lib/nav";
import { LogoutButton } from "@/components/logout-button";

type Viewer = {
  email?: string;
};

export function AppShell({ children, viewer }: { children: ReactNode; viewer?: Viewer | null }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-col gap-4 rounded-3xl border border-zinc-800 bg-zinc-900/60 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-sky-300">Portfolio Intelligence</p>
            <h1 className="mt-2 text-2xl font-bold text-zinc-50">AI-assisted portfolio rebalancing workspace</h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">
              Track your portfolio, compare current allocations against analyst targets, and turn market context into clearer rebalance decisions.
            </p>
          </div>
          <div className="flex flex-col items-start gap-3 lg:items-end">
            <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
              Portfolio tracking + rebalance workflow live
            </div>
            <div className="flex items-center gap-3 text-sm text-zinc-400">
              {viewer?.email ? <span>{viewer.email}</span> : null}
              <LogoutButton />
            </div>
          </div>
        </header>

        <nav className="mb-3 flex flex-wrap gap-2">
          {primaryNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition hover:border-sky-500/60 hover:bg-sky-500/10 hover:text-sky-200"
            >
              {item.label}
            </Link>
          ))}
        </nav>


        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/20 p-3 text-xs text-zinc-500">
          <span>Portfolio workflow is the primary product surface. Older research and agent tools remain available as secondary archives.</span>
          <div className="flex flex-wrap gap-2">
            {legacyNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full border border-zinc-800 px-3 py-1.5 text-xs text-zinc-500 transition hover:border-zinc-600 hover:bg-zinc-800/40 hover:text-zinc-300"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
