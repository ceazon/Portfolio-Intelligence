"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { searchFinnhubSymbols } from "@/lib/finnhub";
import { enrichSymbolAndRefreshQuote } from "@/lib/symbol-sync";

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

export async function addPortfolioPosition(_prevState: FormState, formData: FormData): Promise<FormState> {
  try {
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return { ok: false, error: "Supabase env vars are not configured yet." };
    }

    const portfolioId = String(formData.get("portfolioId") || "").trim();
    const symbolId = String(formData.get("symbolId") || "").trim();
    const targetWeightRaw = String(formData.get("targetWeight") || "").trim();
    const currentWeightRaw = String(formData.get("currentWeight") || "").trim();
    const convictionScoreRaw = String(formData.get("convictionScore") || "").trim();
    const status = String(formData.get("status") || "active").trim() || "active";
    const notes = String(formData.get("notes") || "").trim();

    if (!portfolioId) {
      return { ok: false, error: "Portfolio is required." };
    }

    if (!symbolId) {
      return { ok: false, error: "Symbol is required." };
    }

    const targetWeight = targetWeightRaw ? Number(targetWeightRaw) : null;
    const currentWeight = currentWeightRaw ? Number(currentWeightRaw) : null;
    const convictionScore = convictionScoreRaw ? Number(convictionScoreRaw) : null;

    const numericValues = [targetWeight, currentWeight, convictionScore].filter((value) => value !== null);
    if (numericValues.some((value) => value !== null && Number.isNaN(value))) {
      return { ok: false, error: "Weights and conviction score must be valid numbers." };
    }

    const { error } = await supabase.from("portfolio_positions").upsert(
      {
        portfolio_id: portfolioId,
        symbol_id: symbolId,
        target_weight: targetWeight,
        current_weight: currentWeight,
        conviction_score: convictionScore,
        status,
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
    return { ok: false, error: getErrorMessage(error, "Failed to add portfolio position.") };
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
        "portfolio_id, target_weight, current_weight, conviction_score, status, notes, symbols!inner(id, ticker, name, symbol_price_snapshots(price, percent_change))",
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

      const target = position.target_weight ?? 0;
      const current = position.current_weight ?? 0;
      const conviction = position.conviction_score ?? 0;
      const pctChange = quoteRelation?.percent_change ?? null;

      let action = "hold";
      let confidence = "medium";
      let summary = `${symbolRelation.ticker} is roughly aligned with the current portfolio plan.`;
      let risks = "Monitor conviction drift and price moves before changing the position.";

      if (position.status === "trim" || current > target + 2) {
        action = "trim";
        confidence = current > target + 5 ? "high" : "medium";
        summary = `${symbolRelation.ticker} is above its target weight and looks like a trim candidate.`;
        risks = "Selling too early could cap upside if momentum continues.";
      } else if (conviction >= 70 && target > current && (pctChange === null || pctChange > -3)) {
        action = "buy";
        confidence = conviction >= 85 ? "high" : "medium";
        summary = `${symbolRelation.ticker} has room to move toward target weight with solid conviction support.`;
        risks = "Adding too quickly can increase concentration risk.";
      } else if (pctChange !== null && pctChange <= -4 && conviction < 60) {
        action = "watch";
        confidence = "medium";
        summary = `${symbolRelation.ticker} sold off sharply, but conviction is not strong enough for an automatic add.`;
        risks = "Weak conviction plus downside momentum can turn a dip-buy into dead money.";
      }

      recommendationsToInsert.push({
        portfolio_id: position.portfolio_id,
        symbol_id: symbolRelation.id,
        action,
        status: "open",
        target_weight: position.target_weight,
        conviction_score: position.conviction_score,
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
