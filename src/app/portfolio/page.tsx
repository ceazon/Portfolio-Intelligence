import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { CreatePortfolioForm } from "@/components/create-portfolio-form";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export default async function PortfolioPage() {
  const supabase = await createSupabaseServerClient();
  const { data: portfolios } = supabase
    ? await supabase.from("portfolios").select("id, name, description, benchmark, created_at").order("created_at", { ascending: false })
    : { data: [] as { id: string; name: string; description: string | null; benchmark: string | null; created_at: string }[] };

  return (
    <AppShell>
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <SectionCard
          title="Portfolios"
          description="Manage the core paper portfolio that future recommendations will rebalance over time."
        >
          {portfolios && portfolios.length > 0 ? (
            <div className="space-y-3">
              {portfolios.map((portfolio) => (
                <div key={portfolio.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-base font-semibold text-zinc-100">{portfolio.name}</h3>
                      <p className="mt-1 text-sm text-zinc-400">{portfolio.description || "No description yet."}</p>
                    </div>
                    <span className="rounded-full border border-sky-500/40 px-3 py-1 text-xs text-sky-300">
                      Benchmark {portfolio.benchmark || "SPY"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">
              No portfolios yet. Create your first paper portfolio on the right, then we’ll start attaching positions and recommendation history.
            </div>
          )}
        </SectionCard>

        <CreatePortfolioForm />
      </div>
    </AppShell>
  );
}
