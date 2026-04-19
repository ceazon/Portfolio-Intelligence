import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { CreatePortfolioForm } from "@/components/create-portfolio-form";
import { CreatePositionForm } from "@/components/create-position-form";
import { EditPortfolioForm } from "@/components/edit-portfolio-form";
import { PortfolioPositionCard } from "@/components/portfolio-position-card";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireUser } from "@/lib/auth";
import { normalizeCurrency, type SupportedCurrency } from "@/lib/currency";
import { getLatestFxRate } from "@/lib/fx-sync";

type PortfolioRow = {
  id: string;
  name: string;
  description: string | null;
  benchmark: string | null;
  display_currency: SupportedCurrency | null;
  created_at: string;
};

type RecommendationRow = {
  symbol_id: string;
  action: string;
  target_weight: number | null;
  conviction_score: number | null;
  recommendation_evidence:
    | { research_insights: { direction: string | null; title: string } | { direction: string | null; title: string }[] | null }
    | { research_insights: { direction: string | null; title: string } | { direction: string | null; title: string }[] | null }[]
    | null;
};

type PortfolioPositionRow = {
  id: string;
  quantity: number | null;
  average_cost: number | null;
  average_cost_currency: SupportedCurrency | null;
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
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const { data: portfolios } = supabase
    ? await supabase.from("portfolios").select("id, name, description, benchmark, display_currency, created_at").eq("owner_id", user.id).order("created_at", { ascending: false })
    : { data: [] as PortfolioRow[] };

  const { data: positions } = supabase
    ? await supabase
        .from("portfolio_positions")
        .select("id, portfolio_id, symbol_id, quantity, average_cost, average_cost_currency, notes, portfolios(id, name), symbols(id, ticker, name, exchange, symbol_price_snapshots(price, percent_change, fetched_at))")
        .order("created_at", { ascending: false })
    : { data: [] as PortfolioPositionRow[] };

  const { data: symbols } = supabase
    ? await supabase.from("symbols").select("id, ticker, name").order("ticker", { ascending: true })
    : { data: [] as SymbolOption[] };

  const { data: recommendations } = supabase
    ? await supabase
        .from("recommendations")
        .select("symbol_id, action, target_weight, conviction_score, recommendation_evidence(research_insights(direction, title))")
        .eq("owner_id", user.id)
        .eq("status", "open")
    : { data: [] as RecommendationRow[] };

  const latestFxRate = supabase ? await getLatestFxRate("USD/CAD") : null;
  const usdCadRate = latestFxRate?.rate ? Number(latestFxRate.rate) : 1.39;

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
    <AppShell viewer={user}>
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

                      <EditPortfolioForm
                        id={portfolio.id}
                        name={portfolio.name}
                        description={portfolio.description}
                        benchmark={portfolio.benchmark}
                        displayCurrency={normalizeCurrency(portfolio.display_currency)}
                      />

                      <div className="mt-4">
                        {portfolioPositions.length > 0 ? (
                          <div className="space-y-3">
                            {portfolioPositions.map((position) => {
                              const symbol = firstRelation(position.symbols);
                              const quote = firstRelation(symbol?.symbol_price_snapshots || null);
                              const recommendation = symbol?.id ? recommendationBySymbol.get(symbol.id) : undefined;
                              const currentPrice = quote?.price ?? null;
                              const quantity = position.quantity ?? 0;
                              const marketValue = quantity * (currentPrice ?? 0);
                              const currentWeight = totalMarketValue > 0 ? (marketValue / totalMarketValue) * 100 : null;

                              return (
                                <PortfolioPositionCard
                                  key={position.id}
                                  portfolioId={portfolio.id}
                                  positionId={position.id}
                                  symbolId={symbol?.id || ""}
                                  ticker={symbol?.ticker || "Unknown ticker"}
                                  name={symbol?.name || "Unnamed symbol"}
                                  exchange={symbol?.exchange || null}
                                  quantity={quantity}
                                  averageCost={position.average_cost ?? 0}
                                  averageCostCurrency={normalizeCurrency(position.average_cost_currency)}
                                  currentPrice={currentPrice}
                                  displayCurrency={normalizeCurrency(portfolio.display_currency)}
                                  usdCadRate={usdCadRate}
                                  percentChange={quote?.percent_change ?? null}
                                  currentWeight={currentWeight}
                                  notes={position.notes}
                                  recommendation={recommendation}
                                />
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
            description="Add a new symbol to a portfolio. Existing holdings can be edited or removed inline directly in the portfolio cards."
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
