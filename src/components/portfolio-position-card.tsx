"use client";

import { useMemo, useState } from "react";
import { DeletePositionForm } from "@/components/delete-position-form";
import { EditPositionInlineForm } from "@/components/edit-position-inline-form";
import { convertMoney, formatMoney, formatQuantity, type SupportedCurrency } from "@/lib/currency";

type ResearchInsight = {
  direction: string | null;
  title: string;
};

type RecommendationRow = {
  action: string;
  target_weight: number | null;
  conviction_score: number | null;
  recommendation_evidence:
    | { research_insights: ResearchInsight | ResearchInsight[] | null }
    | { research_insights: ResearchInsight | ResearchInsight[] | null }[]
    | null
    | undefined;
};

type PositionCardProps = {
  portfolioId: string;
  positionId: string;
  symbolId: string;
  ticker: string;
  name: string;
  exchange: string | null;
  quantity: number;
  averageCost: number;
  averageCostCurrency: SupportedCurrency;
  currentPrice: number | null;
  displayCurrency: SupportedCurrency;
  usdCadRate: number;
  percentChange: number | null;
  currentWeight: number | null;
  notes: string | null;
  recommendation?: RecommendationRow;
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export function PortfolioPositionCard(props: PositionCardProps) {
  const {
    portfolioId,
    symbolId,
    ticker,
    name,
    exchange,
    quantity,
    averageCost,
    averageCostCurrency,
    currentPrice,
    displayCurrency,
    usdCadRate,
    percentChange,
    currentWeight,
    notes,
    recommendation,
  } = props;
  const [showOriginalCostBasis, setShowOriginalCostBasis] = useState(false);
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
    const currentPriceDisplay = convertMoney(currentPrice, "USD", displayCurrency, usdCadRate);
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
  }, [averageCost, averageCostCurrency, currentPrice, displayCurrency, quantity, usdCadRate]);

  const quotePositive = typeof percentChange === "number" ? percentChange >= 0 : null;
  const gainPositive = typeof converted.gainLoss === "number" ? converted.gainLoss >= 0 : null;

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-zinc-100">
            {ticker}
            <span className="ml-2 text-zinc-400">{name}</span>
          </p>
          <p className="mt-1 text-xs uppercase tracking-wide text-zinc-500">{exchange || "Exchange unavailable"}</p>
        </div>

        <div className="text-right text-sm">
          <div className="mb-2 inline-flex rounded-xl border border-zinc-700 bg-zinc-950/70 px-2 py-1 text-xs text-zinc-300">Display {displayCurrency}</div>
          {typeof converted.currentPriceDisplay === "number" ? <p className="text-zinc-100">{formatMoney(converted.currentPriceDisplay, displayCurrency)}</p> : null}
          {typeof percentChange === "number" ? (
            <p className={quotePositive ? "text-emerald-300" : "text-rose-300"}>
              {quotePositive ? "+" : ""}
              {percentChange.toFixed(2)}%
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 grid gap-2 text-sm text-zinc-300 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Quantity</p>
          <p className="mt-1 font-medium text-zinc-100">{formatQuantity(quantity)}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Average cost</p>
          <p className="mt-1 font-medium text-zinc-100">{formatMoney(converted.averageCostDisplay, displayCurrency)}</p>
          <button type="button" onClick={() => setShowOriginalCostBasis((value) => !value)} className="mt-1 text-xs text-sky-300 hover:text-sky-200">
            {showOriginalCostBasis ? "Hide original basis" : `Show original ${averageCostCurrency} basis`}
          </button>
          {showOriginalCostBasis && averageCostCurrency !== displayCurrency ? (
            <p className="mt-1 text-xs text-zinc-500">Original: {formatMoney(averageCost, averageCostCurrency)}</p>
          ) : null}
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Book value</p>
          <p className="mt-1 font-medium text-zinc-100">{formatMoney(converted.bookValue, displayCurrency)}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Market value</p>
          <p className="mt-1 font-medium text-zinc-100">{formatMoney(converted.marketValue, displayCurrency)}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Gain/Loss</p>
          <p className={`mt-1 font-medium ${gainPositive === null ? "text-zinc-100" : gainPositive ? "text-emerald-300" : "text-rose-300"}`}>
            {typeof converted.gainLoss === "number" ? formatMoney(converted.gainLoss, displayCurrency) : "--"}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Current weight</p>
          <p className="mt-1 font-medium text-zinc-100">{currentWeight !== null ? `${currentWeight.toFixed(2)}%` : "--"}</p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 text-sm text-zinc-300 sm:grid-cols-3">
        <div role="button" tabIndex={0} onClick={() => setExpanded((value) => !value)} onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setExpanded((value) => !value);
          }
        }} className="cursor-pointer rounded-xl border border-sky-500/20 bg-sky-500/5 p-3 text-left transition hover:border-sky-400/40 hover:bg-sky-500/10">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Program action</p>
          <p className="mt-1 font-medium text-zinc-100">{recommendation?.action || "--"}</p>
        </div>
        <div role="button" tabIndex={0} onClick={() => setExpanded((value) => !value)} onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setExpanded((value) => !value);
          }
        }} className="cursor-pointer rounded-xl border border-sky-500/20 bg-sky-500/5 p-3 text-left transition hover:border-sky-400/40 hover:bg-sky-500/10">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Target weight</p>
          <p className="mt-1 font-medium text-zinc-100">{recommendation?.target_weight !== null && recommendation?.target_weight !== undefined ? `${recommendation.target_weight}%` : "--"}</p>
        </div>
        <div role="button" tabIndex={0} onClick={() => setExpanded((value) => !value)} onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setExpanded((value) => !value);
          }
        }} className="cursor-pointer rounded-xl border border-sky-500/20 bg-sky-500/5 p-3 text-left transition hover:border-sky-400/40 hover:bg-sky-500/10">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Program conviction</p>
          <p className="mt-1 font-medium text-zinc-100">{recommendation?.conviction_score !== null && recommendation?.conviction_score !== undefined ? recommendation.conviction_score : "--"}</p>
        </div>
      </div>

      {expanded ? (
        <div className="mt-3 space-y-3">
          {firstInsight ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3 text-sm text-zinc-300">
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
