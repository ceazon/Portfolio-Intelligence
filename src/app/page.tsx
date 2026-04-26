import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getCurrentUser } from "@/lib/auth";

export default async function HomePage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto grid min-h-screen max-w-6xl gap-8 px-6 py-12 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-sky-300">Portfolio Intelligence</p>
          <h1 className="mt-4 text-4xl font-bold text-zinc-50 sm:text-5xl">Build a personal investing workspace for analyst-driven portfolio rebalancing.</h1>
          <p className="mt-4 max-w-2xl text-lg text-zinc-400">
            Track positions, compare current holdings against analyst estimates, generate rebalance plans, and keep every user portfolio separate behind login.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-300">Portfolio holdings with live calculated metrics</div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-300">Rebalance plans, target allocations, and review workflow</div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-300">Manual refresh runs and analyst-estimate-driven portfolio tracking</div>
          </div>
        </div>

        <AuthForm />
      </div>
    </main>
  );
}
