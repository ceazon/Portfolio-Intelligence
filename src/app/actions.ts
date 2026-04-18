"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { searchFinnhubSymbols } from "@/lib/finnhub";
import { enrichSymbolAndRefreshQuote, refreshTrackedSymbols } from "@/lib/symbol-sync";

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return fallback;
}

export type FormState = {
  ok: boolean;
  error: string;
};

export async function createWatchlist(_prevState: FormState, formData: FormData): Promise<FormState> {
  try {
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return { ok: false, error: "Supabase env vars are not configured yet." };
    }

    const name = String(formData.get("name") || "").trim();
    const description = String(formData.get("description") || "").trim();

    if (!name) {
      return { ok: false, error: "Watchlist name is required." };
    }

    const { error } = await supabase.from("watchlists").insert({ name, description: description || null });

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/watchlist");
    revalidatePath("/dashboard");
    return { ok: true, error: "" };
  } catch (error) {
    return { ok: false, error: getErrorMessage(error, "Failed to create watchlist.") };
  }
}

export async function createPortfolio(_prevState: FormState, formData: FormData): Promise<FormState> {
  try {
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return { ok: false, error: "Supabase env vars are not configured yet." };
    }

    const name = String(formData.get("name") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const benchmark = String(formData.get("benchmark") || "SPY").trim() || "SPY";

    if (!name) {
      return { ok: false, error: "Portfolio name is required." };
    }

    const { error } = await supabase.from("portfolios").insert({
      name,
      description: description || null,
      benchmark,
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/portfolio");
    revalidatePath("/dashboard");
    return { ok: true, error: "" };
  } catch (error) {
    return { ok: false, error: getErrorMessage(error, "Failed to create portfolio.") };
  }
}

export async function upsertPortfolioPosition(_prevState: FormState, formData: FormData): Promise<FormState> {
  try {
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return { ok: false, error: "Supabase env vars are not configured yet." };
    }

    const portfolioId = String(formData.get("portfolioId") || "").trim();
    const symbolId = String(formData.get("symbolId") || "").trim();
    const quantityRaw = String(formData.get("quantity") || "").trim();
    const averageCostRaw = String(formData.get("averageCost") || "").trim();
    const notes = String(formData.get("notes") || "").trim();

    if (!portfolioId) {
      return { ok: false, error: "Portfolio is required." };
    }

    if (!symbolId) {
      return { ok: false, error: "Symbol is required." };
    }

    const quantity = quantityRaw ? Number(quantityRaw) : null;
    const averageCost = averageCostRaw ? Number(averageCostRaw) : null;

    const numericValues = [quantity, averageCost].filter((value) => value !== null);
    if (numericValues.some((value) => value !== null && Number.isNaN(value))) {
      return { ok: false, error: "Quantity and average cost must be valid numbers." };
    }

    const { error } = await supabase.from("portfolio_positions").upsert(
      {
        portfolio_id: portfolioId,
        symbol_id: symbolId,
        quantity,
        average_cost: averageCost,
        notes: notes || null,
      },
      { onConflict: "portfolio_id,symbol_id" },
    );

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/portfolio");
    revalidatePath("/dashboard");
    return { ok: true, error: "" };
  } catch (error) {
    return { ok: false, error: getErrorMessage(error, "Failed to save portfolio position.") };
  }
}

export async function generateRecommendations(_prevState: FormState): Promise<FormState> {
  try {
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return { ok: false, error: "Supabase env vars are not configured yet." };
    }

    const { data: positions, error: positionsError } = await supabase
      .from("portfolio_positions")
      .select(
        "portfolio_id, quantity, average_cost, notes, symbols!inner(id, ticker, name, symbol_price_snapshots(price, percent_change))",
      );

    if (positionsError) {
      return { ok: false, error: positionsError.message };
    }

    const { data: watchlistItems, error: watchlistError } = await supabase
      .from("watchlist_items")
      .select("symbol_id, status, notes, symbols!inner(id, ticker, name, symbol_price_snapshots(price, percent_change))");

    if (watchlistError) {
      return { ok: false, error: watchlistError.message };
    }

    const recommendationsToInsert: Array<{
      portfolio_id: string | null;
      symbol_id: string;
      action: string;
      status: string;
      target_weight: number | null;
      conviction_score: number | null;
      summary: string;
      risks: string;
      confidence: string;
    }> = [];

    (positions || []).forEach((position) => {
      const symbolRelation = Array.isArray(position.symbols) ? position.symbols[0] : position.symbols;
      const quoteRelation = Array.isArray(symbolRelation?.symbol_price_snapshots)
        ? symbolRelation.symbol_price_snapshots[0]
        : symbolRelation?.symbol_price_snapshots;

      if (!symbolRelation?.id) {
        return;
      }

      const quantity = position.quantity ?? 0;
      const averageCost = position.average_cost ?? 0;
      const currentPrice = quoteRelation?.price ?? null;
      const pctChange = quoteRelation?.percent_change ?? null;
      const gainLossPct = currentPrice !== null && averageCost > 0 ? ((currentPrice - averageCost) / averageCost) * 100 : null;

      let action = "hold";
      let confidence = "medium";
      let summary = `${symbolRelation.ticker} is broadly aligned with the current holding profile.`;
      let risks = "Keep monitoring price movement and concentration before changing target exposure.";
      let recommendedTargetWeight: number | null = null;
      let programConviction: number | null = null;

      if (gainLossPct !== null && gainLossPct >= 15) {
        action = "trim";
        confidence = gainLossPct >= 25 ? "high" : "medium";
        recommendedTargetWeight = 8;
        programConviction = gainLossPct >= 25 ? 82 : 68;
        summary = `${symbolRelation.ticker} has appreciated meaningfully versus cost basis and may be ready for a partial trim.`;
        risks = "Trimming too early can cut off compounding if the trend remains strong.";
      } else if (gainLossPct !== null && gainLossPct <= -8) {
        action = "watch";
        confidence = "medium";
        recommendedTargetWeight = 3;
        programConviction = 42;
        summary = `${symbolRelation.ticker} is trading materially below cost basis and deserves review before adding capital.`;
        risks = "A drawdown can deepen if the thesis weakened along with price.";
      } else if (pctChange !== null && pctChange > 1.5) {
        action = "buy";
        confidence = "medium";
        recommendedTargetWeight = 6;
        programConviction = 64;
        summary = `${symbolRelation.ticker} shows constructive momentum and looks like a candidate for additional allocation.`;
        risks = "Adding after short-term strength can raise entry risk if momentum fades.";
      }

      recommendationsToInsert.push({
        portfolio_id: position.portfolio_id,
        symbol_id: symbolRelation.id,
        action,
        status: "open",
        target_weight: recommendedTargetWeight,
        conviction_score: programConviction,
        summary,
        risks,
        confidence,
      });
    });

    (watchlistItems || []).forEach((item) => {
      const symbolRelation = Array.isArray(item.symbols) ? item.symbols[0] : item.symbols;
      const quoteRelation = Array.isArray(symbolRelation?.symbol_price_snapshots)
        ? symbolRelation.symbol_price_snapshots[0]
        : symbolRelation?.symbol_price_snapshots;

      if (!symbolRelation?.id) {
        return;
      }

      const alreadyIncluded = recommendationsToInsert.some((recommendation) => recommendation.symbol_id === symbolRelation.id);
      if (alreadyIncluded) {
        return;
      }

      const pctChange = quoteRelation?.percent_change ?? null;
      const action = pctChange !== null && pctChange <= -3 ? "watch" : "buy";

      recommendationsToInsert.push({
        portfolio_id: null,
        symbol_id: symbolRelation.id,
        action,
        status: "open",
        target_weight: null,
        conviction_score: null,
        summary:
          action === "buy"
            ? `${symbolRelation.ticker} stands out from the watchlist as a candidate for deeper portfolio review.`
            : `${symbolRelation.ticker} is on the watchlist and deserves monitoring after a recent pullback.`,
        risks:
          action === "buy"
            ? "Watchlist ideas still need explicit sizing and thesis validation before entering the portfolio."
            : "A falling watchlist name can keep weakening without a stronger thesis or catalyst.",
        confidence: action === "buy" ? "medium" : "low",
      });
    });

    if (!recommendationsToInsert.length) {
      return { ok: false, error: "No portfolio positions or watchlist symbols are available yet." };
    }

    const symbolIds = [...new Set(recommendationsToInsert.map((item) => item.symbol_id))];
    const portfolioIds = [...new Set(recommendationsToInsert.map((item) => item.portfolio_id).filter(Boolean))];

    if (symbolIds.length) {
      await supabase.from("recommendations").delete().in("symbol_id", symbolIds);
    }

    if (portfolioIds.length) {
      await supabase.from("recommendations").delete().in("portfolio_id", portfolioIds);
    }

    const { error: insertError } = await supabase.from("recommendations").insert(recommendationsToInsert);
    if (insertError) {
      return { ok: false, error: insertError.message };
    }

    revalidatePath("/recommendations");
    revalidatePath("/dashboard");
    return { ok: true, error: "" };
  } catch (error) {
    return { ok: false, error: getErrorMessage(error, "Failed to generate recommendations.") };
  }
}

export async function refreshMarketData(_prevState: FormState): Promise<FormState> {
  try {
    const result = await refreshTrackedSymbols();
    revalidatePath("/symbols");
    revalidatePath("/dashboard");
    revalidatePath("/agent-activity");
    revalidatePath("/recommendations");
    revalidatePath("/portfolio");
    return { ok: true, error: result.refreshedCount ? "" : "No symbols refreshed." };
  } catch (error) {
    return { ok: false, error: getErrorMessage(error, "Failed to refresh tracked symbols.") };
  }
}

export async function importSymbol(_prevState: FormState, formData: FormData): Promise<FormState> {
  try {
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return { ok: false, error: "Supabase env vars are not configured yet." };
    }

    const query = String(formData.get("query") || "").trim();
    const selectedSymbol = String(formData.get("selectedSymbol") || "").trim();
    const watchlistId = String(formData.get("watchlistId") || "").trim();

    if (!query) {
      return { ok: false, error: "Search query is required." };
    }

    const results = await searchFinnhubSymbols(query);
    if (!results.length) {
      return { ok: false, error: "No symbols found from Finnhub." };
    }

    const match = results.find((item) => item.symbol === selectedSymbol) || results[0];

    const { data: symbolRow, error: symbolError } = await supabase
      .from("symbols")
      .upsert(
        {
          ticker: match.symbol,
          name: match.description || match.displaySymbol || match.symbol,
          exchange: null,
          country: null,
          asset_type: match.type?.toLowerCase().includes("etf") ? "etf" : "stock",
          is_etf: match.type?.toLowerCase().includes("etf") || false,
        },
        { onConflict: "ticker" },
      )
      .select("id")
      .single();

    if (symbolError || !symbolRow) {
      return { ok: false, error: symbolError?.message || "Failed to import symbol." };
    }

    await enrichSymbolAndRefreshQuote(symbolRow.id, match.symbol);

    if (watchlistId) {
      const { error: watchlistError } = await supabase.from("watchlist_items").upsert(
        {
          watchlist_id: watchlistId,
          symbol_id: symbolRow.id,
          status: "watch",
        },
        { onConflict: "watchlist_id,symbol_id" },
      );

      if (watchlistError) {
        return { ok: false, error: watchlistError.message };
      }
    }

    revalidatePath("/symbols");
    revalidatePath("/watchlist");
    revalidatePath("/dashboard");
    return { ok: true, error: "" };
  } catch (error) {
    return { ok: false, error: getErrorMessage(error, "Failed to import symbol.") };
  }
}
