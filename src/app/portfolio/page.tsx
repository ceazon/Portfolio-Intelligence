import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { PortfolioActionBar } from "@/components/portfolio-action-bar";
import { PortfolioAllocationOverview } from "@/components/portfolio-allocation-overview";
import { PortfolioRebalanceSummary } from "@/components/portfolio-rebalance-summary";
import { PortfolioExpandablePanel } from "@/components/portfolio-expandable-panel";
import { PortfolioCard } from "@/components/portfolio-card";
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
  cash_position: number | null;
  cash_currency: SupportedCurrency | null;
  created_at: string;
};

type RecommendationRow = {
  symbol_id: string;
  action: string;
  recommendation_engine?: string | null;
  target_weight: number | null;
  target_price: number | null;
  conviction_score: number | null;
  summary: string | null;
  risks: string | null;
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
        logo_url: string | null;
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
        logo_url: string | null;
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

function convertUsdToDisplay(value: number | null, currency: SupportedCurrency, usdCadRate: number) {
  if (value === null || !Number.isFinite(value)) return 0;
  return currency === "CAD" ? value * usdCadRate : value;
}

export default async function PortfolioPage() {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const { data: portfolios } = supabase
    ? await supabase.from("portfolios").select("id, name, description, benchmark, display_currency, cash_position, cash_currency, created_at").eq("owner_id", user.id).order("created_at", { ascending: false })
    : { data: [] as PortfolioRow[] };

  const { data: positions } = supabase
    ? await supabase
        .from("portfolio_positions")
        .select("id, portfolio_id, symbol_id, quantity, average_cost, average_cost_currency, notes, portfolios(id, name), symbols(id, ticker, name, exchange, logo_url, symbol_price_snapshots(price, percent_change, fetched_at))")
        .order("created_at", { ascending: false })
    : { data: [] as PortfolioPositionRow[] };

  const { data: symbols } = supabase
    ? await supabase.from("symbols").select("id, ticker, name").order("ticker", { ascending: true })
    : { data: [] as SymbolOption[] };

  const { data: recommendations } = supabase
    ? await supabase
        .from("recommendations")
        .select("symbol_id, action, recommendation_engine, target_weight, target_price, conviction_score, summary, risks, recommendation_evidence(research_insights(direction, title))")
        .eq("owner_id", user.id)
        .eq("status", "open")
        .eq("recommendation_engine", "synthesis-v1")
    : { data: [] as RecommendationRow[] };

  const latestFxRate = supabase ? await getLatestFxRate("USD/CAD") : null;
  const usdCadRate = latestFxRate?.rate ? Number(latestFxRate.rate) : 1.39;

  const recommendationBySymbol = new Map<string, RecommendationRow>();
  (recommendations || []).forEach((recommendation) => {
    recommendationBySymbol.set(recommendation.symbol_id, recommendation);
  });

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

  const portfolioOptions = (portfolios || []).map((portfolio) => ({ id: portfolio.id, name: portfolio.name }));
  const symbolOptions = (symbols || []).map((symbol) => ({ id: symbol.id, ticker: symbol.ticker, name: symbol.name }));

  const overviewCards = (portfolios || []).map((portfolio) => {
    const portfolioPositions = positionsByPortfolio.get(portfolio.id) || [];
    const displayCurrency = normalizeCurrency(portfolio.display_currency);
    const cashCurrency = normalizeCurrency(portfolio.cash_currency ?? portfolio.display_currency);
    const cashValue = convertUsdToDisplay(
      cashCurrency === "USD" ? portfolio.cash_position ?? 0 : ((portfolio.cash_position ?? 0) / usdCadRate),
      displayCurrency,
      usdCadRate,
    );

    const baseSlices = portfolioPositions
      .map((position) => {
        const symbol = firstRelation(position.symbols);
        const quote = firstRelation(symbol?.symbol_price_snapshots || null);
        const price = quote?.price ?? null;
        const quantity = position.quantity ?? 0;
        const marketValue = convertUsdToDisplay((price ?? 0) * quantity, displayCurrency, usdCadRate);
        return {
          symbolId: symbol?.id || "",
          label: symbol?.ticker || "Unknown",
          marketValue,
        };
      })
      .filter((slice) => slice.marketValue > 0);

    const totalValue = baseSlices.reduce((sum, slice) => sum + slice.marketValue, 0) + cashValue;

    const currentSlices = [
      ...baseSlices.map((slice) => {
        const recommendation = recommendationBySymbol.get(slice.symbolId);
        return {
          label: slice.label,
          value: slice.marketValue,
          weight: totalValue > 0 ? (slice.marketValue / totalValue) * 100 : 0,
          targetWeight: recommendation?.target_weight ?? null,
        };
      }),
      {
        label: "Cash",
        value: cashValue,
        weight: totalValue > 0 ? (cashValue / totalValue) * 100 : 0,
        targetWeight: null,
      },
    ];

    const explicitTargetEntries = currentSlices
      .filter((slice) => slice.label !== "Cash" && slice.targetWeight !== null)
      .map((slice) => ({ ...slice, rawTargetWeight: Math.max(slice.targetWeight ?? 0, 0) }));

    const explicitTargetWeightSum = explicitTargetEntries.reduce((sum, slice) => sum + slice.rawTargetWeight, 0);
    const currentCashWeight = totalValue > 0 ? (cashValue / totalValue) * 100 : 0;
    const residualCashWeight = Math.max(0, 100 - explicitTargetWeightSum);

    const compareSlices = [
      ...currentSlices
        .filter((slice) => slice.label !== "Cash")
        .map((slice) => {
          const explicitTarget = explicitTargetEntries.find((entry) => entry.label === slice.label)?.rawTargetWeight ?? null;
          const normalizedTarget = explicitTargetWeightSum > 100
            ? explicitTarget !== null
              ? (explicitTarget / explicitTargetWeightSum) * 100
              : 0
            : explicitTarget ?? 0;

          return {
            ...slice,
            weight: normalizedTarget,
            targetWeight: normalizedTarget,
            comparisonBaselineWeight: slice.weight,
          };
        }),
      {
        label: "Cash",
        value: cashValue,
        weight: explicitTargetWeightSum > 100 ? Math.max(0, (residualCashWeight / explicitTargetWeightSum) * 100) : residualCashWeight,
        targetWeight: explicitTargetWeightSum > 100 ? Math.max(0, (residualCashWeight / explicitTargetWeightSum) * 100) : residualCashWeight,
        comparisonBaselineWeight: currentCashWeight,
      },
    ];

    return {
      portfolio,
      positions: portfolioPositions,
      displayCurrency,
      cashPosition: portfolio.cash_position ?? 0,
      cashCurrency,
      currentSlices,
      compareSlices,
    };
  });

  return (
    <AppShell viewer={user}>
      <div className="space-y-6">
        <PortfolioActionBar portfolios={portfolioOptions} symbols={symbolOptions} />

        {(portfolios || []).length > 0 ? (
          overviewCards.map(({ portfolio, positions, displayCurrency, cashPosition, cashCurrency, currentSlices, compareSlices }) => (
            <div key={portfolio.id} className="space-y-6">
              <SectionCard
                title={portfolio.name}
                description="Manage the current state of each holding inline. Calculated metrics update from quantity, average cost, live prices, and recommendation context."
              >
                <PortfolioCard
                  id={portfolio.id}
                  name={portfolio.name}
                  description={portfolio.description}
                  benchmark={portfolio.benchmark}
                  displayCurrency={displayCurrency}
                  cashPosition={cashPosition}
                  cashCurrency={cashCurrency}
                  positions={positions}
                  recommendationBySymbol={recommendationBySymbol}
                  usdCadRate={usdCadRate}
                />
              </SectionCard>

              <PortfolioAllocationOverview
                title={`${portfolio.name} current allocation`}
                description="Current holdings mix based on live market value weightings."
                slices={currentSlices}
              />

              <PortfolioExpandablePanel
                title="See proposed rebalance"
                description="Open this to see what the current recommendation set would imply for target weights and rebalance moves."
                buttonLabel="See proposed rebalance"
              >
                <div className="space-y-4">
                  <PortfolioAllocationOverview
                    title={`${portfolio.name} target allocation`}
                    description="A target mix based on explicit recommendation weights, with residual cash shown separately when the set is not fully invested."
                    slices={compareSlices}
                    compareMode
                  />

                  <PortfolioRebalanceSummary
                    rows={currentSlices.map((slice) => ({
                      label: slice.label,
                      currentWeight: slice.weight,
                      targetWeight:
                        compareSlices.find((targetSlice) => targetSlice.label === slice.label)?.weight ?? slice.weight,
                    }))}
                  />
                </div>
              </PortfolioExpandablePanel>
            </div>
          ))
        ) : (
          <SectionCard
            title="Portfolios"
            description="Create your first portfolio from the action bar, then we’ll replace empty space with live allocation views and recommendation comparison."
          >
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">
              No portfolios yet. Create your first paper portfolio to unlock allocation charts, holding comparisons, and target-weight analysis.
            </div>
          </SectionCard>
        )}
      </div>
    </AppShell>
  );
}
