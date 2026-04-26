"use client";

import { useMemo, useState } from "react";
import { PortfolioPositionListItem } from "@/components/portfolio-position-list-item";
import { PortfolioSettingsPanel } from "@/components/portfolio-settings-panel";
import { convertMoney, formatMoney, type SupportedCurrency } from "@/lib/currency";

type ResearchInsight = {
  direction: string | null;
  title: string;
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

type PositionRow = {
  id: string;
  quantity: number | null;
  average_cost: number | null;
  average_cost_currency: SupportedCurrency | null;
  notes: string | null;
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

type PortfolioCardProps = {
  id: string;
  name: string;
  description: string | null;
  benchmark: string | null;
  displayCurrency: SupportedCurrency;
  cashPosition: number | null;
  cashCurrency: SupportedCurrency;
  recommendationCashMode: "managed-cash" | "fully-invested";
  positions: PositionRow[];
  recommendationBySymbol: Map<string, RecommendationRow>;
  usdCadRate: number;
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export function PortfolioCard({ id, name, description, benchmark, displayCurrency, cashPosition, cashCurrency, recommendationCashMode, positions, recommendationBySymbol, usdCadRate }: PortfolioCardProps) {
  const [expanded, setExpanded] = useState(false);

  const summary = useMemo(() => {
    return positions.reduce(
      (acc, position) => {
        const symbol = firstRelation(position.symbols);
        const quote = firstRelation(symbol?.symbol_price_snapshots || null);
        const quantity = position.quantity ?? 0;
        const avgCost = convertMoney(position.average_cost ?? 0, position.average_cost_currency ?? displayCurrency, displayCurrency, usdCadRate) ?? 0;
        const currentPrice = convertMoney(quote?.price ?? null, "USD", displayCurrency, usdCadRate) ?? 0;
        const bookValue = quantity * avgCost;
        const marketValue = quantity * currentPrice;

        acc.bookValue += bookValue;
        acc.marketValue += marketValue;
        return acc;
      },
      { bookValue: 0, marketValue: 0 },
    );
  }, [positions, displayCurrency, usdCadRate]);

  const cashInDisplay = convertMoney(cashPosition ?? 0, cashCurrency, displayCurrency, usdCadRate) ?? 0;

  const gainLoss = summary.marketValue - summary.bookValue;
  const gainLossPct = summary.bookValue > 0 ? (gainLoss / summary.bookValue) * 100 : null;
  const gainPositive = gainLoss >= 0;

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
      <button type="button" onClick={() => setExpanded((value) => !value)} className="w-full text-left">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-zinc-100">{name}</h3>
            <p className="mt-1 text-sm text-zinc-400">{description || "No description yet."}</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3 text-xs text-zinc-400">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-zinc-500">Invested</p>
                <p className="mt-1 text-sm font-medium text-zinc-100">{formatMoney(summary.marketValue, displayCurrency)}</p>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-zinc-500">Cash</p>
                <p className="mt-1 text-sm font-medium text-zinc-100">{formatMoney(cashInDisplay, displayCurrency)}</p>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-zinc-500">Total</p>
                <p className="mt-1 text-sm font-medium text-zinc-100">{formatMoney(summary.marketValue + cashInDisplay, displayCurrency)}</p>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-zinc-500">PnL</p>
                <p className={`mt-1 text-sm font-medium ${gainPositive ? "text-emerald-300" : "text-rose-300"}`}>
                  {gainPositive ? "+" : ""}
                  {formatMoney(gainLoss, displayCurrency)}
                  {gainLossPct !== null ? ` (${gainPositive ? "+" : ""}${gainLossPct.toFixed(2)}%)` : ""}
                </p>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-zinc-500">Holdings</p>
                <p className="mt-1 text-sm font-medium text-zinc-100">{positions.length}</p>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-zinc-500">Benchmark</p>
                <p className="mt-1 text-sm font-medium text-zinc-100">{benchmark || "SPY"}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-3">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-700 text-lg font-semibold text-zinc-300">
              {expanded ? "−" : "+"}
            </span>
          </div>
        </div>
      </button>

      {expanded ? (
        <div className="mt-4 space-y-4 border-t border-zinc-800 pt-4">
          <PortfolioSettingsPanel
            id={id}
            name={name}
            description={description}
            benchmark={benchmark}
            displayCurrency={displayCurrency}
            cashPosition={cashPosition}
            cashCurrency={cashCurrency}
            recommendationCashMode={recommendationCashMode}
          />

          {positions.length > 0 ? (
            <div className="space-y-3">
              {positions.map((position) => {
                const symbol = firstRelation(position.symbols);
                const quote = firstRelation(symbol?.symbol_price_snapshots || null);
                const recommendation = symbol?.id ? recommendationBySymbol.get(symbol.id) : undefined;
                const currentPrice = quote?.price ?? null;
                const quantity = position.quantity ?? 0;
                const positionMarketValueUsd = quantity * (currentPrice ?? 0);
                const totalMarketValueUsd = positions.reduce((sum, innerPosition) => {
                  const innerSymbol = firstRelation(innerPosition.symbols);
                  const innerQuote = firstRelation(innerSymbol?.symbol_price_snapshots || null);
                  return sum + (innerPosition.quantity ?? 0) * (innerQuote?.price ?? 0);
                }, 0);
                const currentWeight = totalMarketValueUsd > 0 ? (positionMarketValueUsd / totalMarketValueUsd) * 100 : null;

                return (
                  <PortfolioPositionListItem
                    key={position.id}
                    portfolioId={id}
                    positionId={position.id}
                    symbolId={symbol?.id || ""}
                    ticker={symbol?.ticker || "Unknown ticker"}
                    name={symbol?.name || "Unnamed symbol"}
                    exchange={symbol?.exchange || null}
                    logoUrl={symbol?.logo_url || null}
                    quantity={quantity}
                    averageCost={position.average_cost ?? 0}
                    averageCostCurrency={position.average_cost_currency ?? displayCurrency}
                    currentPrice={currentPrice}
                    displayCurrency={displayCurrency}
                    usdCadRate={usdCadRate}
                    percentChange={quote?.percent_change ?? null}
                    currentWeight={currentWeight}
                    notes={position.notes}
                    recommendation={recommendation}
                    updatedAt={quote?.fetched_at ?? null}
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
      ) : null}
    </div>
  );
}
