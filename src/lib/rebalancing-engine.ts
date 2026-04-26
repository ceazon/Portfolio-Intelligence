import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getConsensusTargetForSymbol } from "@/lib/consensus-targets";

type SupportedCurrency = "USD" | "CAD";

export type RebalanceAction = "increase" | "reduce" | "maintain" | "initiate" | "exit" | "watch";

export type RebalancePlanItem = {
  symbolId: string;
  portfolioId: string | null;
  portfolioName: string | null;
  ticker: string;
  name: string | null;
  action: RebalanceAction;
  currentWeight: number | null;
  targetWeight: number | null;
  weightDelta: number | null;
  currentPrice: number | null;
  consensusTarget: number | null;
  impliedUpsidePct: number | null;
  rationale: string;
  confidence: "low" | "medium" | "high";
};

export type RebalancePlan = {
  engine: "analyst-rebalance-v1";
  summary: string;
  items: RebalancePlanItem[];
};

type PortfolioPositionRow = {
  id: string;
  portfolio_id: string;
  quantity: number | null;
  portfolios:
    | {
        id: string;
        name: string;
        cash_position: number | null;
        cash_currency: SupportedCurrency | null;
        display_currency: SupportedCurrency | null;
        recommendation_cash_mode: "managed-cash" | "fully-invested" | null;
      }
    | {
        id: string;
        name: string;
        cash_position: number | null;
        cash_currency: SupportedCurrency | null;
        display_currency: SupportedCurrency | null;
        recommendation_cash_mode: "managed-cash" | "fully-invested" | null;
      }[]
    | null;
  symbols:
    | {
        id: string;
        ticker: string;
        name: string | null;
        symbol_price_snapshots:
          | { price: number | null; percent_change: number | null; fetched_at: string }
          | { price: number | null; percent_change: number | null; fetched_at: string }[]
          | null;
      }
    | {
        id: string;
        ticker: string;
        name: string | null;
        symbol_price_snapshots:
          | { price: number | null; percent_change: number | null; fetched_at: string }
          | { price: number | null; percent_change: number | null; fetched_at: string }[]
          | null;
      }[]
    | null;
};

function firstRelation<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function confidenceLabel(score: number): "low" | "medium" | "high" {
  if (score >= 70) return "high";
  if (score >= 45) return "medium";
  return "low";
}

function toUsd(amount: number, currency: SupportedCurrency | null) {
  if (!amount) return 0;
  return currency === "CAD" ? amount / 1.39 : amount;
}

export async function buildRebalancePlan(ownerId: string): Promise<RebalancePlan> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return {
      engine: "analyst-rebalance-v1",
      summary: "Supabase is not configured, so rebalance planning is unavailable.",
      items: [],
    };
  }

  const { data: positions } = await supabase
    .from("portfolio_positions")
    .select(
      "id, portfolio_id, quantity, portfolios(id, name, cash_position, cash_currency, display_currency, recommendation_cash_mode), symbols(id, ticker, name, symbol_price_snapshots(price, percent_change, fetched_at))",
    )
    .eq("owner_id", ownerId)
    .gt("quantity", 0);

  const rows = (positions || []) as PortfolioPositionRow[];
  if (!rows.length) {
    return {
      engine: "analyst-rebalance-v1",
      summary: "No held positions yet. Add portfolio holdings to generate a rebalance plan.",
      items: [],
    };
  }

  const totalInvestedByPortfolio = new Map<string, number>();
  const portfolioMeta = new Map<string, { name: string; cashUsd: number; recommendationCashMode: "managed-cash" | "fully-invested" }>();

  rows.forEach((row) => {
    const portfolio = firstRelation(row.portfolios);
    const symbol = firstRelation(row.symbols);
    const quote = firstRelation(symbol?.symbol_price_snapshots || null);
    const marketValue = (row.quantity ?? 0) * (quote?.price ?? 0);
    totalInvestedByPortfolio.set(row.portfolio_id, (totalInvestedByPortfolio.get(row.portfolio_id) || 0) + marketValue);

    if (portfolio) {
      portfolioMeta.set(row.portfolio_id, {
        name: portfolio.name,
        cashUsd: toUsd(portfolio.cash_position ?? 0, portfolio.cash_currency ?? portfolio.display_currency ?? "USD"),
        recommendationCashMode: portfolio.recommendation_cash_mode === "fully-invested" ? "fully-invested" : "managed-cash",
      });
    }
  });

  const perPortfolio = new Map<string, RebalancePlanItem[]>();

  await Promise.all(
    rows.map(async (row) => {
      const portfolio = firstRelation(row.portfolios);
      const symbol = firstRelation(row.symbols);
      const quote = firstRelation(symbol?.symbol_price_snapshots || null);
      if (!portfolio || !symbol) return;

      const currentPrice = quote?.price ?? null;
      const marketValue = (row.quantity ?? 0) * (currentPrice ?? 0);
      const cashMeta = portfolioMeta.get(row.portfolio_id);
      const totalInvested = totalInvestedByPortfolio.get(row.portfolio_id) || 0;
      const totalPortfolioValue = totalInvested + (cashMeta?.cashUsd || 0);
      const currentWeight = totalPortfolioValue > 0 ? (marketValue / totalPortfolioValue) * 100 : null;

      const consensus = await getConsensusTargetForSymbol(symbol.ticker);
      const consensusTarget = consensus.meanTarget;
      const impliedUpsidePct = typeof consensusTarget === "number" && typeof currentPrice === "number" && currentPrice > 0
        ? ((consensusTarget - currentPrice) / currentPrice) * 100
        : null;

      const provisional = clamp(((impliedUpsidePct ?? 0) + 15) / 30, 0.2, 2.2);
      const continuityBoost = currentWeight !== null && currentWeight > 0 ? clamp(currentWeight / 10, 0.2, 1.5) : 0.2;
      const score = currentPrice && consensusTarget ? provisional + continuityBoost : continuityBoost * 0.75;

      const action: RebalanceAction =
        impliedUpsidePct === null
          ? "maintain"
          : impliedUpsidePct >= 15
            ? "increase"
            : impliedUpsidePct <= -10
              ? "reduce"
              : "maintain";

      const rationale =
        impliedUpsidePct === null
          ? "No analyst consensus target was available, so this holding stays near its current weight for now."
          : impliedUpsidePct >= 15
            ? `Analyst consensus implies meaningful upside of ${impliedUpsidePct.toFixed(1)}%, which supports allocating more weight here.`
            : impliedUpsidePct <= -10
              ? `Analyst consensus sits ${Math.abs(impliedUpsidePct).toFixed(1)}% below the current price, which argues for a lighter allocation.`
              : `Analyst consensus is fairly close to the current price, so this looks more like a hold than an aggressive rebalance move.`;

      const item: RebalancePlanItem = {
        symbolId: symbol.id,
        portfolioId: portfolio.id,
        portfolioName: portfolio.name,
        ticker: symbol.ticker,
        name: symbol.name,
        action,
        currentWeight,
        targetWeight: score,
        weightDelta: null,
        currentPrice,
        consensusTarget,
        impliedUpsidePct: impliedUpsidePct !== null ? Number(impliedUpsidePct.toFixed(1)) : null,
        rationale,
        confidence: confidenceLabel(Math.abs(impliedUpsidePct ?? 0) + (currentWeight ?? 0)),
      };

      const existing = perPortfolio.get(row.portfolio_id) || [];
      existing.push(item);
      perPortfolio.set(row.portfolio_id, existing);
    }),
  );

  const items: RebalancePlanItem[] = [];
  perPortfolio.forEach((portfolioItems, portfolioId) => {
    const meta = portfolioMeta.get(portfolioId);
    const targetInvestedPct = meta?.recommendationCashMode === "fully-invested" ? 100 : 95;
    const rawScoreTotal = portfolioItems.reduce((sum, item) => sum + (item.targetWeight ?? 0), 0);

    portfolioItems
      .map((item) => {
        const normalizedTarget = rawScoreTotal > 0 ? ((item.targetWeight ?? 0) / rawScoreTotal) * targetInvestedPct : item.currentWeight ?? 0;
        const boundedTarget = clamp(normalizedTarget, 2, 40);
        const weightDelta = item.currentWeight !== null ? boundedTarget - item.currentWeight : null;
        const action: RebalanceAction =
          item.currentWeight === null || item.currentWeight < 0.1
            ? boundedTarget >= 2
              ? "initiate"
              : "watch"
            : weightDelta !== null && weightDelta >= 1
              ? "increase"
              : weightDelta !== null && weightDelta <= -1
                ? "reduce"
                : "maintain";

        return {
          ...item,
          action,
          targetWeight: Number(boundedTarget.toFixed(1)),
          weightDelta: weightDelta !== null ? Number(weightDelta.toFixed(1)) : null,
        };
      })
      .sort((a, b) => {
        const deltaA = Math.abs(a.weightDelta ?? 0);
        const deltaB = Math.abs(b.weightDelta ?? 0);
        if (deltaB !== deltaA) return deltaB - deltaA;
        return (b.impliedUpsidePct ?? -999) - (a.impliedUpsidePct ?? -999);
      })
      .forEach((item) => items.push(item));
  });

  return {
    engine: "analyst-rebalance-v1",
    summary: `Built a deterministic rebalance plan for ${perPortfolio.size} portfolio${perPortfolio.size === 1 ? "" : "s"} using current holdings and analyst consensus targets.`,
    items,
  };
}
