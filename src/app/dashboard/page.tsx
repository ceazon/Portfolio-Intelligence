import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { dashboardStats, roadmapCards } from "@/lib/mock-data";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { hasSupabaseEnv } from "@/lib/env";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  let symbolCount: string | null = null;

  if (supabase) {
    const { count } = await supabase.from("symbols").select("id", { count: "exact", head: true });
    symbolCount = count !== null ? String(count) : "0";
  }

  const stats = dashboardStats.map((stat) =>
    stat.label === "Tracked Symbols" && symbolCount !== null ? { ...stat, value: symbolCount, detail: "Loaded from Supabase" } : stat,
  );

  return (
    <AppShell>
      <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
        <div className="space-y-6">
          <SectionCard
            title="Mission control"
            description="This first milestone sets up the product shell before we wire in real market data, portfolio logic, and agents."
          >
            <div className="mb-4 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">
              Supabase status: {hasSupabaseEnv() ? "configured" : "not configured yet, add env vars before deployment"}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {stats.map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                  <p className="text-xs uppercase tracking-wide text-zinc-500">{stat.label}</p>
                  <p className="mt-3 text-3xl font-bold text-zinc-50">{stat.value}</p>
                  <p className="mt-2 text-sm text-zinc-400">{stat.detail}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            title="Build roadmap"
            description="The immediate plan is website shell, Supabase foundation, then market data, portfolio entities, and agents."
          >
            <div className="grid gap-4 lg:grid-cols-3">
              {roadmapCards.map((card) => (
                <div key={card.title} className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                  <h3 className="text-base font-semibold text-zinc-100">{card.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">{card.body}</p>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard
            title="Next build targets"
            description="What we should wire next after this shell is in place."
          >
            <ul className="space-y-3 text-sm text-zinc-300">
              <li className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3">Create high-level tables for symbols, watchlists, portfolios, recommendations</li>
              <li className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3">Connect auth and user workspace state</li>
              <li className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3">Build watchlist and portfolio CRUD flows</li>
              <li className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3">Start market data ingestion jobs</li>
            </ul>
          </SectionCard>

          <SectionCard
            title="Agent status"
            description="Agents are not live yet, but this is where their orchestration status will surface."
          >
            <div className="rounded-2xl border border-dashed border-zinc-700 p-4 text-sm text-zinc-400">
              No agent runs yet. Phase 1 is focused on the app shell and data foundation.
            </div>
          </SectionCard>
        </div>
      </div>
    </AppShell>
  );
}
