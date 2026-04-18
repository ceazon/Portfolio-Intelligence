import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { CreatePortfolioForm } from "@/components/create-portfolio-form";
import { CreatePositionForm } from "@/components/create-position-form";
import { createSupabaseServerClient } from "@/lib/supabase-server";

type PortfolioRow = {
  id: string;
  name: string;
  description: string | null;
  benchmark: string | null;
  created_at: string;
};

type PortfolioPositionRow = {
  id: string;
  status: string;
  target_weight: number | null;
  current_weight: number | null;
  conviction_score: number | null;
  notes: string | null;
  portfolios: { id: string; name: string } | { id: string; name: string }[] | null;
  symbols:
    | {
        ticker: string;
        name: string | null;
        exchange: string | null;
        symbol_price_snapshots:
          | {
              price: number | null;
              percent_change: number | null;
              fetched_at: string;
            }
          | {
              price: number | null;
              percent_change: number | null;
              fetched_at: string;
            }[]
          | null;
      }
    | {
        ticker: string;
        name: string | null;
        exchange: string | null;
        symbol_price_snapshots:
          | {
              price: number | null;
              percent_change: number | null;
              fetched_at: string;
            }
          | {
              price: number | null;
              percent_change: number | null;
              fetched_at: string;
            }[]
          | null;
      }[]
    | null;
};

type SymbolOption = {
  id: string;
  ticker: string;
  name: string | null;
};

function firstRelation<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

export default async function PortfolioPage() {
  const supabase = await createSupabaseServerClient();

  const { data: portfolios } = supabase
    ? await supabase.from("portfolios").select("id, name, description, benchmark, created_at").order("created_at", { ascending: false })
    : { data: [] as PortfolioRow[] };

  const { data: positions } = supabase
    ? await supabase
        .from("portfolio_positions")
        .select(
          "id, status, target_weight, current_weight, conviction_score, notes, portfolios(id, name), symbols(ticker, name, exchange, symbol_price_snapshots(price, percent_change, fetched_at))",
        )
        .order("created_at", { ascending: false })
    : { data: [] as PortfolioPositionRow[] };

  const { data: symbols } = supabase
    ? await supabase.from("symbols").select("id, ticker, name").order("ticker", { ascending: true })
    : { data: [] as SymbolOption[] };

  const positionsByPortfolio = new Map<string, PortfolioPositionRow[]>();
  (positions || []).forEach((position) => {
    const portfolio = firstRelation(position.portfolios);
    if (!portfolio) {
      return;
    }

    const existing = positionsByPortfolio.get(portfolio.id) || [];
    existing.push(position);
    positionsByPortfolio.set(portfolio.id, existing);
  });

  return (
    <AppShell>
      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-6">
          <SectionCard
            title="Portfolios"
            description="Manage the core paper portfolio that future recommendations will rebalance over time."
          >
            {portfolios && portfolios.length > 0 ? (
              <div className="space-y-4">
                {portfolios.map((portfolio) => {
                  const portfolioPositions = positionsByPortfolio.get(portfolio.id) || [];

                  return (
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

                      <div className="mt-4">
                        {portfolioPositions.length > 0 ? (
                          <div className="space-y-3">
                            {portfolioPositions.map((position) => {
                              const symbol = firstRelation(position.symbols);
                              const quote = firstRelation(symbol?.symbol_price_snapshots || null);
                              const quotePositive = typeof quote?.percent_change === "number" ? quote.percent_change >= 0 : null;

                              return (
                                <div key={position.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
                                  <div className="flex items-start justify-between gap-4">
                                    <div>
                                      <p className="text-sm font-semibold text-zinc-100">
                                        {symbol?.ticker || "Unknown ticker"}
                                        <span className="ml-2 text-zinc-400">{symbol?.name || "Unnamed symbol"}</span>
                                      </p>
                                      <p className="mt-1 text-xs uppercase tracking-wide text-zinc-500">
                                        {position.status}
                                        {symbol?.exchange ? ` · ${symbol.exchange}` : ""}
                                      </p>
                                    </div>

                                    <div className="text-right text-sm">
                                      {typeof quote?.price === "number" ? <p className="text-zinc-100">${quote.price.toFixed(2)}</p> : null}
                                      {typeof quote?.percent_change === "number" ? (
                                        <p className={quotePositive ? "text-emerald-300" : "text-rose-300"}>
                                          {quotePositive ? "+" : ""}
                                          {quote.percent_change.toFixed(2)}%
                                        </p>
                                      ) : null}
                                    </div>
                                  </div>

                                  <div className="mt-3 grid gap-2 text-sm text-zinc-300 sm:grid-cols-3">
                                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
                                      <p className="text-xs uppercase tracking-wide text-zinc-500">Target weight</p>
                                      <p className="mt-1 font-medium text-zinc-100">{position.target_weight !== null ? `${position.target_weight}%` : "--"}</p>
                                    </div>
                                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
                                      <p className="text-xs uppercase tracking-wide text-zinc-500">Current weight</p>
                                      <p className="mt-1 font-medium text-zinc-100">{position.current_weight !== null ? `${position.current_weight}%` : "--"}</p>
                                    </div>
                                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
                                      <p className="text-xs uppercase tracking-wide text-zinc-500">Conviction</p>
                                      <p className="mt-1 font-medium text-zinc-100">{position.conviction_score !== null ? position.conviction_score : "--"}</p>
                                    </div>
                                  </div>

                                  {position.notes ? <p className="mt-3 text-sm text-zinc-400">{position.notes}</p> : null}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-400">
                            No positions yet. Add an imported symbol on the right to start building this portfolio.
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">
                No portfolios yet. Create your first paper portfolio on the right, then we’ll start attaching positions and recommendation history.
              </div>
            )}
          </SectionCard>
        </div>

        <div className="space-y-6">
          <CreatePortfolioForm />

          <SectionCard
            title="Portfolio positions"
            description="Turn imported symbols into actual tracked holdings and target allocations."
          >
            {portfolios && portfolios.length > 0 ? (
              symbols && symbols.length > 0 ? (
                <CreatePositionForm
                  portfolios={portfolios.map((portfolio) => ({ id: portfolio.id, name: portfolio.name }))}
                  symbols={(symbols || []).map((symbol) => ({ id: symbol.id, ticker: symbol.ticker, name: symbol.name }))}
                />
              ) : (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
                  Import symbols first on the Symbols page before adding positions.
                </div>
              )
            ) : (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">
                Create a portfolio first, then add symbols as positions here.
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </AppShell>
  );
}
