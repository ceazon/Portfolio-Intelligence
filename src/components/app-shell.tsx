import Link from "next/link";
import { ReactNode } from "react";
import { primaryNav } from "@/lib/nav";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-col gap-4 rounded-3xl border border-zinc-800 bg-zinc-900/60 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-sky-300">Portfolio Intelligence</p>
            <h1 className="mt-2 text-2xl font-bold text-zinc-50">Agent-guided long-term investing workspace</h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">
              Track your portfolio, rank your watchlist, inspect agent reasoning, and turn daily signals into slower, higher-conviction monthly decisions.
            </p>
          </div>
          <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
            Phase 1 in progress, app shell + Supabase foundation
          </div>
        </header>

        <nav className="mb-6 flex flex-wrap gap-2">
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

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
