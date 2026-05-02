"use client";

import { useMemo, useState } from "react";
import { DeletePositionForm } from "@/components/delete-position-form";
import { EditPositionInlineForm } from "@/components/edit-position-inline-form";
import { convertMoney, formatMoney, formatQuantity, type SupportedCurrency } from "@/lib/currency";
import { formatAppDateTime } from "@/lib/time";

type ResearchInsight = {
  direction: string | null;
  title: string;
};

type RecommendationRow = {
  action: string;
  target_weight: number | null;
  target_price?: number | null;
  conviction_score?: number | null;
  summary?: string | null;
  risks?: string | null;
  recommendation_evidence?:
    | { research_insights: ResearchInsight | ResearchInsight[] | null }
    | { research_insights: ResearchInsight | ResearchInsight[] | null }[]
    | null
    | undefined;
};

type PositionListItemProps = {
  portfolioId: string;
  positionId: string;
  symbolId: string;
  ticker: string;
  name: string;
  exchange: string | null;
  logoUrl: string | null;
  quantity: number;
  averageCost: number;
  averageCostCurrency: SupportedCurrency;
  currentPrice: number | null;
  quoteCurrency: SupportedCurrency;
  displayCurrency: SupportedCurrency;
  usdCadRate: number;
  percentChange: number | null;
  currentWeight: number | null;
  notes: string | null;
  recommendation?: RecommendationRow;
  updatedAt?: string | null;
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export function PortfolioPositionListItem(props: PositionListItemProps) {
  const {
    portfolioId,
    symbolId,
    ticker,
    name,
    exchange,
    logoUrl,
    quantity,
    averageCost,
    averageCostCurrency,
    currentPrice,
    quoteCurrency,
    displayCurrency,
    usdCadRate,
    percentChange,
    currentWeight,
    notes,
    recommendation,
    updatedAt,
  } = props;
  const [expanded, setExpanded] = useState(false);

  const recommendationEvidence = Array.isArray(recommendation?.recommendation_evidence)
    ? recommendation.recommendation_evidence
    : recommendation?.recommendation_evidence
      ? [recommendation.recommendation_evidence]
      : [];
  const firstEvidence = recommendationEvidence[0];
  const firstInsight = firstRelation(firstEvidence?.research_insights || null);

  const converted = useMemo(() => {
    const averageCostDisplay = convertMoney(averageCost, averageCostCurrency, displayCurrency, usdCadRate);
    const currentPriceDisplay = convertMoney(currentPrice, quoteCurrency, displayCurrency, usdCadRate);
    const bookValue = averageCostDisplay !== null ? quantity * averageCostDisplay : null;
    const marketValue = currentPriceDisplay !== null ? quantity * currentPriceDisplay : null;
    const gainLoss = currentPriceDisplay !== null && averageCostDisplay !== null ? marketValue! - bookValue! : null;

    return {
      averageCostDisplay,
      currentPriceDisplay,
      bookValue,
      marketValue,
      gainLoss,
    };
  }, [averageCost, averageCostCurrency, currentPrice, quoteCurrency, displayCurrency, quantity, usdCadRate]);

  const quotePositive = typeof percentChange === "number" ? percentChange >= 0 : null;
  const gainPositive = typeof converted.gainLoss === "number" ? converted.gainLoss >= 0 : null;

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
      <button type="button" onClick={() => setExpanded((value) => !value)} className="w-full text-left">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" className="h-8 w-8 rounded-full bg-white object-contain p-1" />
              ) : null}
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-100">
                  {ticker}
                  <span className="ml-2 text-zinc-400">{name}</span>
                </p>
                <p className="mt-1 text-xs uppercase tracking-wide text-zinc-500">
                  {exchange || "Exchange unavailable"}
                  {currentWeight !== null ? ` · ${currentWeight.toFixed(2)}% portfolio weight` : ""}
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-400">
                  <span className="rounded-full border border-sky-500/20 bg-sky-500/5 px-2 py-1 text-sky-200">
                    Program Action {recommendation?.action || "--"}
                  </span>
                  <span className="rounded-full border border-zinc-700 px-2 py-1">
                    Target Price {recommendation?.target_price !== null && recommendation?.target_price !== undefined ? formatMoney(recommendation.target_price, displayCurrency) : "--"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="min-w-[140px] text-right">
              <div className="mb-2 inline-flex rounded-xl border border-zinc-700 bg-zinc-950/70 px-2 py-1 text-xs text-zinc-300">Display {displayCurrency}</div>
              {typeof converted.currentPriceDisplay === "number" ? <p className="text-lg font-semibold text-zinc-100">{formatMoney(converted.currentPriceDisplay, displayCurrency)}</p> : null}
              {typeof percentChange === "number" ? (
                <p className={quotePositive ? "mt-1 text-sm text-emerald-300" : "mt-1 text-sm text-rose-300"}>
                  {quotePositive ? "+" : ""}
                  {percentChange.toFixed(2)}%
                </p>
              ) : null}
              {updatedAt ? <p className="mt-1 text-xs text-zinc-500">Updated {formatAppDateTime(updatedAt)}</p> : null}
            </div>
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-700 text-lg font-semibold text-zinc-300">
              {expanded ? "−" : "+"}
            </span>
          </div>
        </div>
      </button>

      {expanded ? (
        <div className="mt-4 space-y-4 border-t border-zinc-800 pt-4">
          <div className="grid gap-2 text-sm text-zinc-300 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Quantity</p>
              <p className="mt-1 font-medium text-zinc-100">{formatQuantity(quantity)}</p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Average cost</p>
              <p className="mt-1 font-medium text-zinc-100">{formatMoney(converted.averageCostDisplay, displayCurrency)}</p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Book value</p>
              <p className="mt-1 font-medium text-zinc-100">{formatMoney(converted.bookValue, displayCurrency)}</p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Market value</p>
              <p className="mt-1 font-medium text-zinc-100">{formatMoney(converted.marketValue, displayCurrency)}</p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Gain/Loss</p>
              <p className={`mt-1 font-medium ${gainPositive === null ? "text-zinc-100" : gainPositive ? "text-emerald-300" : "text-rose-300"}`}>
                {typeof converted.gainLoss === "number" ? formatMoney(converted.gainLoss, displayCurrency) : "--"}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Program action</p>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div>
                <p className="text-xs text-zinc-500">Action</p>
                <p className="mt-1 font-medium text-zinc-100">{recommendation?.action || "--"}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Target portfolio weight</p>
                <p className="mt-1 font-medium text-zinc-100">{recommendation?.target_weight !== null && recommendation?.target_weight !== undefined ? `${recommendation.target_weight}%` : "--"}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Conviction</p>
                <p className="mt-1 font-medium text-zinc-100">{recommendation?.conviction_score !== null && recommendation?.conviction_score !== undefined ? recommendation.conviction_score : "--"}</p>
              </div>
            </div>
            {recommendation?.target_price !== null && recommendation?.target_price !== undefined ? (
              <p className="mt-3 text-sm text-zinc-300">Target price: {formatMoney(recommendation.target_price, displayCurrency)}</p>
            ) : null}
            {recommendation?.summary ? <p className="mt-3 text-sm text-zinc-300">{recommendation.summary}</p> : null}
            {recommendation?.risks ? <p className="mt-2 text-sm text-zinc-500">Risk: {recommendation.risks}</p> : null}
          </div>

          {firstInsight ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-sm text-zinc-300">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Linked research signal</p>
              <p className="mt-1 font-medium text-zinc-100">{firstInsight.title}</p>
              <p className="mt-1 text-zinc-400">Direction: {firstInsight.direction || "mixed"}</p>
            </div>
          ) : null}

          <EditPositionInlineForm
            portfolioId={portfolioId}
            symbolId={symbolId}
            quantity={quantity}
            averageCost={averageCost}
            averageCostCurrency={averageCostCurrency}
            notes={notes}
          />
          <DeletePositionForm portfolioId={portfolioId} symbolId={symbolId} />
        </div>
      ) : null}
    </div>
  );
}
