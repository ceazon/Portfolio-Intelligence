import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { CreatePortfolioForm } from "@/components/create-portfolio-form";
import { CreatePositionForm } from "@/components/create-position-form";
import { EditPositionInlineForm } from "@/components/edit-position-inline-form";
import { createSupabaseServerClient } from "@/lib/supabase-server";

type PortfolioRow = {
  id: string;
  name: string;
  description: string | null;
  benchmark: string | null;
  created_at: string;
};

type RecommendationRow = {
  symbol_id: string;
  action: string;
  target_weight: number | null;
  conviction_score: number | null;
};

type PortfolioPositionRow = {
  id: string;
  quantity: number | null;
  average_cost: number | null;
  notes: string | null;
  portfolio_id?: string;
  symbol_id?: string;
  portfolios: { id: string; name: string } | { id: string; name: string }[] | null;
  symbols:
    | {
        id: string;
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
        id: string;
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
        .select("id, portfolio_id, symbol_id, quantity, average_cost, notes, portfolios(id, name), symbols(id, ticker, name, exchange, symbol_price_snapshots(price, percent_change, fetched_at))")
        .order("created_at", { ascending: false })
    : { data: [] as PortfolioPositionRow[] };

  const { data: symbols } = supabase
    ? await supabase.from("symbols").select("id, ticker, name").order("ticker", { ascending: true })
    : { data: [] as SymbolOption[] };

  const { data: recommendations } = supabase
    ? await supabase.from("recommendations").select("symbol_id, action, target_weight, conviction_score").eq("status", "open")
    : { data: [] as RecommendationRow[] };

  const recommendationBySymbol = new Map<string, RecommendationRow>();
  (recommendations || []).forEach((recommendation) => {
    recommendationBySymbol.set(recommendation.symbol_id, recommendation);
  });

  const positionsByPortfolio = new Map<string, PortfolioPositionRow[]>();
  const portfolioMarketValues = new Map<string, number>();

  (positions || []).forEach((position) => {
    const portfolio = firstRelation(position.portfolios);
    const symbol = firstRelation(position.symbols);
    const quote = firstRelation(symbol?.symbol_price_snapshots || null);
    if (!portfolio) {
      return;
    }

    const existing = positionsByPortfolio.get(portfolio.id) || [];
    existing.push(position);
    positionsByPortfolio.set(portfolio.id, existing);

    const marketValue = (position.quantity ?? 0) * (quote?.price ?? 0);
    portfolioMarketValues.set(portfolio.id, (portfolioMarketValues.get(portfolio.id) || 0) + marketValue);
  });

  return (
    <AppShell>
      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-6">
          <SectionCard
            title="Portfolios"
            description="Manage the current state of each holding inline. Calculated metrics update from quantity, average cost, and live prices."
          >
            {portfolios && portfolios.length > 0 ? (
              <div className="space-y-4">
                {portfolios.map((portfolio) => {
                  const portfolioPositions = positionsByPortfolio.get(portfolio.id) || [];
                  const totalMarketValue = portfolioMarketValues.get(portfolio.id) || 0;

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
                              const recommendation = symbol?.id ? recommendationBySymbol.get(symbol.id) : undefined;
                              const currentPrice = quote?.price ?? null;
                              const quantity = position.quantity ?? 0;
                              const averageCost = position.average_cost ?? 0;
                              const bookValue = quantity * averageCost;
                              const marketValue = quantity * (currentPrice ?? 0);
                              const gainLoss = currentPrice !== null ? marketValue - bookValue : null;
                              const currentWeight = totalMarketValue > 0 ? (marketValue / totalMarketValue) * 100 : null;
                              const quotePositive = typeof quote?.percent_change === "number" ? quote.percent_change >= 0 : null;
                              const gainPositive = typeof gainLoss === "number" ? gainLoss >= 0 : null;

                              return (
                                <div key={position.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
                                  <div className="flex items-start justify-between gap-4">
                                    <div>
                                      <p className="text-sm font-semibold text-zinc-100">
                                        {symbol?.ticker || "Unknown ticker"}
                                        <span className="ml-2 text-zinc-400">{symbol?.name || "Unnamed symbol"}</span>
                                      </p>
                                      <p className="mt-1 text-xs uppercase tracking-wide text-zinc-500">
                                        {symbol?.exchange ? symbol.exchange : "Exchange unavailable"}
                                      </p>
                                    </div>

                                    <div className="text-right text-sm">
                                      {typeof currentPrice === "number" ? <p className="text-zinc-100">${currentPrice.toFixed(2)}</p> : null}
                                      {typeof quote?.percent_change === "number" ? (
                                        <p className={quotePositive ? "text-emerald-300" : "text-rose-300"}>
                                          {quotePositive ? "+" : ""}
                                          {quote.percent_change.toFixed(2)}%
                                        </p>
                                      ) : null}
                                    </div>
                                  </div>

                                  <div className="mt-3 grid gap-2 text-sm text-zinc-300 sm:grid-cols-3 lg:grid-cols-6">
                                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
                                      <p className="text-xs uppercase tracking-wide text-zinc-500">Quantity</p>
                                      <p className="mt-1 font-medium text-zinc-100">{quantity ? quantity.toFixed(4).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1") : "--"}</p>
                                    </div>
                                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
                                      <p className="text-xs uppercase tracking-wide text-zinc-500">Average cost</p>
                                      <p className="mt-1 font-medium text-zinc-100">{averageCost ? `$${averageCost.toFixed(2)}` : "--"}</p>
                                    </div>
                                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
                                      <p className="text-xs uppercase tracking-wide text-zinc-500">Book value</p>
                                      <p className="mt-1 font-medium text-zinc-100">{bookValue ? `$${bookValue.toFixed(2)}` : "--"}</p>
                                    </div>
                                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
                                      <p className="text-xs uppercase tracking-wide text-zinc-500">Market value</p>
                                      <p className="mt-1 font-medium text-zinc-100">{marketValue ? `$${marketValue.toFixed(2)}` : "--"}</p>
                                    </div>
                                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
                                      <p className="text-xs uppercase tracking-wide text-zinc-500">Gain/Loss</p>
                                      <p className={`mt-1 font-medium ${gainPositive === null ? "text-zinc-100" : gainPositive ? "text-emerald-300" : "text-rose-300"}`}>
                                        {typeof gainLoss === "number" ? `${gainPositive ? "+" : ""}$${gainLoss.toFixed(2)}` : "--"}
                                      </p>
                                    </div>
                                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
                                      <p className="text-xs uppercase tracking-wide text-zinc-500">Current weight</p>
                                      <p className="mt-1 font-medium text-zinc-100">{currentWeight !== null ? `${currentWeight.toFixed(2)}%` : "--"}</p>
                                    </div>
                                  </div>

                                  <div className="mt-3 grid gap-2 text-sm text-zinc-300 sm:grid-cols-3">
                                    <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-3">
                                      <p className="text-xs uppercase tracking-wide text-zinc-500">Program action</p>
                                      <p className="mt-1 font-medium text-zinc-100">{recommendation?.action || "--"}</p>
                                    </div>
                                    <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-3">
                                      <p className="text-xs uppercase tracking-wide text-zinc-500">Target weight</p>
                                      <p className="mt-1 font-medium text-zinc-100">{recommendation?.target_weight !== null && recommendation?.target_weight !== undefined ? `${recommendation.target_weight}%` : "--"}</p>
                                    </div>
                                    <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-3">
                                      <p className="text-xs uppercase tracking-wide text-zinc-500">Program conviction</p>
                                      <p className="mt-1 font-medium text-zinc-100">{recommendation?.conviction_score !== null && recommendation?.conviction_score !== undefined ? recommendation.conviction_score : "--"}</p>
                                    </div>
                                  </div>

                                  <EditPositionInlineForm
                                    portfolioId={portfolio.id}
                                    symbolId={symbol?.id || ""}
                                    quantity={position.quantity}
                                    averageCost={position.average_cost}
                                    notes={position.notes}
                                  />
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
            title="Add new position"
            description="Add a new symbol to a portfolio. Existing holdings can now be edited inline directly in the portfolio cards."
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
