"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { searchFinnhubSymbols } from "@/lib/finnhub";
import { refreshFxRate } from "@/lib/fx-sync";
import { runSharedNewsResearch } from "@/lib/news-research";
import { runGlobalMacroAgent } from "@/lib/macro-agent";
import { getResearchEvidenceContext } from "@/lib/recommendation-evidence";
import { enrichSymbolAndRefreshQuote, refreshTrackedSymbols, runCentralQuoteRefresh } from "@/lib/symbol-sync";

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

async function requireActionUser() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { error: "Supabase env vars are not configured yet.", user: null } as const;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be logged in.", user: null } as const;
  }

  return { error: null, user } as const;
}

export async function createWatchlist(_prevState: FormState, formData: FormData): Promise<FormState> {
  try {
    const auth = await requireActionUser();
    if (auth.error || !auth.user) {
      return { ok: false, error: auth.error || "You must be logged in." };
    }

    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return { ok: false, error: "Supabase env vars are not configured yet." };
    }

    const name = String(formData.get("name") || "").trim();
    const description = String(formData.get("description") || "").trim();

    if (!name) {
      return { ok: false, error: "Watchlist name is required." };
    }

    const { error } = await supabase.from("watchlists").insert({ name, description: description || null, owner_id: auth.user.id });

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
    const auth = await requireActionUser();
    if (auth.error || !auth.user) {
      return { ok: false, error: auth.error || "You must be logged in." };
    }

    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return { ok: false, error: "Supabase env vars are not configured yet." };
    }

    const name = String(formData.get("name") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const benchmark = String(formData.get("benchmark") || "SPY").trim() || "SPY";
    const displayCurrency = String(formData.get("displayCurrency") || "USD").trim() === "CAD" ? "CAD" : "USD";

    if (!name) {
      return { ok: false, error: "Portfolio name is required." };
    }

    const { error } = await supabase.from("portfolios").insert({
      name,
      description: description || null,
      benchmark,
      display_currency: displayCurrency,
      owner_id: auth.user.id,
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

export async function updatePortfolio(_prevState: FormState, formData: FormData): Promise<FormState> {
  try {
    const auth = await requireActionUser();
    if (auth.error || !auth.user) {
      return { ok: false, error: auth.error || "You must be logged in." };
    }

    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return { ok: false, error: "Supabase env vars are not configured yet." };
    }

    const id = String(formData.get("id") || "").trim();
    const name = String(formData.get("name") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const benchmark = String(formData.get("benchmark") || "SPY").trim() || "SPY";
    const displayCurrency = String(formData.get("displayCurrency") || "USD").trim() === "CAD" ? "CAD" : "USD";

    if (!id || !name) {
      return { ok: false, error: "Portfolio id and name are required." };
    }

    const { error } = await supabase
      .from("portfolios")
      .update({ name, description: description || null, benchmark, display_currency: displayCurrency })
      .eq("id", id)
      .eq("owner_id", auth.user.id);
    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/portfolio");
    revalidatePath("/dashboard");
    return { ok: true, error: "" };
  } catch (error) {
    return { ok: false, error: getErrorMessage(error, "Failed to update portfolio.") };
  }
}

export async function updateWatchlist(_prevState: FormState, formData: FormData): Promise<FormState> {
  try {
    const auth = await requireActionUser();
    if (auth.error || !auth.user) {
      return { ok: false, error: auth.error || "You must be logged in." };
    }

    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return { ok: false, error: "Supabase env vars are not configured yet." };
    }

    const id = String(formData.get("id") || "").trim();
    const name = String(formData.get("name") || "").trim();
    const description = String(formData.get("description") || "").trim();

    if (!id || !name) {
      return { ok: false, error: "Watchlist id and name are required." };
    }

    const { error } = await supabase.from("watchlists").update({ name, description: description || null }).eq("id", id).eq("owner_id", auth.user.id);
    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/watchlist");
    revalidatePath("/dashboard");
    return { ok: true, error: "" };
  } catch (error) {
    return { ok: false, error: getErrorMessage(error, "Failed to update watchlist.") };
  }
}

export async function deletePortfolioPosition(_prevState: FormState, formData: FormData): Promise<FormState> {
  try {
    const auth = await requireActionUser();
    if (auth.error || !auth.user) {
      return { ok: false, error: auth.error || "You must be logged in." };
    }

    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return { ok: false, error: "Supabase env vars are not configured yet." };
    }

    const portfolioId = String(formData.get("portfolioId") || "").trim();
    const symbolId = String(formData.get("symbolId") || "").trim();

    if (!portfolioId || !symbolId) {
      return { ok: false, error: "Portfolio and symbol are required." };
    }

    const { data: ownedPortfolio } = await supabase.from("portfolios").select("id").eq("id", portfolioId).eq("owner_id", auth.user.id).maybeSingle();
    if (!ownedPortfolio) {
      return { ok: false, error: "Portfolio not found for this user." };
    }

    const { error } = await supabase.from("portfolio_positions").delete().eq("portfolio_id", portfolioId).eq("symbol_id", symbolId);
    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/portfolio");
    revalidatePath("/recommendations");
    revalidatePath("/dashboard");
    return { ok: true, error: "" };
  } catch (error) {
    return { ok: false, error: getErrorMessage(error, "Failed to remove position.") };
  }
}

export async function upsertPortfolioPosition(_prevState: FormState, formData: FormData): Promise<FormState> {
  try {
    const auth = await requireActionUser();
    if (auth.error || !auth.user) {
      return { ok: false, error: auth.error || "You must be logged in." };
    }

    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return { ok: false, error: "Supabase env vars are not configured yet." };
    }

    const portfolioId = String(formData.get("portfolioId") || "").trim();
    const symbolId = String(formData.get("symbolId") || "").trim();
    const quantityRaw = String(formData.get("quantity") || "").trim();
    const averageCostRaw = String(formData.get("averageCost") || "").trim();
    const averageCostCurrency = String(formData.get("averageCostCurrency") || "USD").trim() === "CAD" ? "CAD" : "USD";
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

    const { data: ownedPortfolio } = await supabase.from("portfolios").select("id").eq("id", portfolioId).eq("owner_id", auth.user.id).maybeSingle();
    if (!ownedPortfolio) {
      return { ok: false, error: "Portfolio not found for this user." };
    }

    const { error } = await supabase.from("portfolio_positions").upsert(
      {
        portfolio_id: portfolioId,
        symbol_id: symbolId,
        quantity,
        average_cost: averageCost,
        average_cost_currency: averageCostCurrency,
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

export async function updateRecommendationStatus(_prevState: FormState, formData: FormData): Promise<FormState> {
  try {
    const auth = await requireActionUser();
    if (auth.error || !auth.user) {
      return { ok: false, error: auth.error || "You must be logged in." };
    }

    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return { ok: false, error: "Supabase env vars are not configured yet." };
    }

    const recommendationId = String(formData.get("recommendationId") || "").trim();
    const status = String(formData.get("status") || "").trim();

    if (!recommendationId || !status) {
      return { ok: false, error: "Recommendation id and status are required." };
    }

    const { error } = await supabase.from("recommendations").update({ status }).eq("id", recommendationId).eq("owner_id", auth.user.id);
    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/recommendations");
    revalidatePath("/portfolio");
    revalidatePath("/dashboard");
    return { ok: true, error: "" };
  } catch (error) {
    return { ok: false, error: getErrorMessage(error, "Failed to update recommendation status.") };
  }
}

export async function generateRecommendations(_prevState: FormState): Promise<FormState> {
  try {
    const auth = await requireActionUser();
    if (auth.error || !auth.user) {
      return { ok: false, error: auth.error || "You must be logged in." };
    }

    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return { ok: false, error: "Supabase env vars are not configured yet." };
    }

    const { data: positions, error: positionsError } = await supabase
      .from("portfolio_positions")
      .select(
        "portfolio_id, quantity, average_cost, notes, portfolios!inner(owner_id), symbols!inner(id, ticker, name, symbol_price_snapshots(price, percent_change))",
      )
      .eq("portfolios.owner_id", auth.user.id);

    if (positionsError) {
      return { ok: false, error: positionsError.message };
    }

    const { data: watchlistItems, error: watchlistError } = await supabase
      .from("watchlist_items")
      .select("symbol_id, status, notes, watchlists!inner(owner_id), symbols!inner(id, ticker, name, symbol_price_snapshots(price, percent_change))")
      .eq("watchlists.owner_id", auth.user.id);

    if (watchlistError) {
      return { ok: false, error: watchlistError.message };
    }

    const { data: recommendationRun, error: recommendationRunError } = await supabase
      .from("recommendation_runs")
      .insert({
        owner_id: auth.user.id,
        trigger_type: "manual",
        target_type: "portfolio",
        status: "running",
        summary: "Generating recommendations from current portfolio and watchlist state.",
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (recommendationRunError || !recommendationRun) {
      return { ok: false, error: recommendationRunError?.message || "Failed to create recommendation run." };
    }

    const recommendationsToInsert: Array<{
      owner_id: string;
      recommendation_run_id: string;
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

    const candidateSymbolIds = [
      ...new Set(
        [
          ...(positions || []).map((position) => {
            const symbolRelation = Array.isArray(position.symbols) ? position.symbols[0] : position.symbols;
            return symbolRelation?.id || null;
          }),
          ...(watchlistItems || []).map((item) => {
            const symbolRelation = Array.isArray(item.symbols) ? item.symbols[0] : item.symbols;
            return symbolRelation?.id || null;
          }),
        ].filter(Boolean),
      ),
    ] as string[];

    const evidenceContextBySymbol = await getResearchEvidenceContext(auth.user.id, candidateSymbolIds);

    const portfolioTotals = new Map<string, number>();
    (positions || []).forEach((position) => {
      const symbolRelation = Array.isArray(position.symbols) ? position.symbols[0] : position.symbols;
      const quoteRelation = Array.isArray(symbolRelation?.symbol_price_snapshots)
        ? symbolRelation.symbol_price_snapshots[0]
        : symbolRelation?.symbol_price_snapshots;
      const marketValue = (position.quantity ?? 0) * (quoteRelation?.price ?? 0);
      const currentTotal = portfolioTotals.get(position.portfolio_id) || 0;
      portfolioTotals.set(position.portfolio_id, currentTotal + marketValue);
    });

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
      const marketValue = quantity * (currentPrice ?? 0);
      const portfolioTotal = portfolioTotals.get(position.portfolio_id) || 0;
      const currentWeight = portfolioTotal > 0 ? (marketValue / portfolioTotal) * 100 : 0;
      const gainLossPct = currentPrice !== null && averageCost > 0 ? ((currentPrice - averageCost) / averageCost) * 100 : null;

      let action = "hold";
      let confidence = "medium";
      let summary = `${symbolRelation.ticker} is broadly aligned with the current holding profile.`;
      let risks = "Keep monitoring price movement and concentration before changing target exposure.";
      let recommendedTargetWeight: number | null = Math.max(2, Math.min(12, Number((currentWeight || 0).toFixed(2))));
      let programConviction: number | null = 55;

      if (gainLossPct !== null && gainLossPct >= 20 && currentWeight > 10) {
        action = "trim";
        confidence = gainLossPct >= 30 ? "high" : "medium";
        recommendedTargetWeight = Math.max(4, Number((currentWeight - 2).toFixed(2)));
        programConviction = gainLossPct >= 30 ? 84 : 72;
        summary = `${symbolRelation.ticker} has grown into a larger winner and now looks oversized versus the rest of the portfolio.`;
        risks = "Trimming a strong compounder too quickly can leave upside on the table.";
      } else if (gainLossPct !== null && gainLossPct <= -10) {
        action = "watch";
        confidence = "medium";
        recommendedTargetWeight = Math.max(2, Number((currentWeight || 3).toFixed(2)));
        programConviction = 40;
        summary = `${symbolRelation.ticker} is below cost basis enough to justify caution before adding more.`;
        risks = "A weak position can stay weak if the underlying thesis is deteriorating.";
      } else if (pctChange !== null && pctChange > 1.5 && currentWeight < 8) {
        action = "buy";
        confidence = currentWeight < 4 ? "high" : "medium";
        recommendedTargetWeight = Math.min(10, Number((currentWeight + 2.5).toFixed(2)));
        programConviction = currentWeight < 4 ? 78 : 66;
        summary = `${symbolRelation.ticker} is showing constructive strength and remains underweight relative to a fuller allocation.`;
        risks = "Buying into short-term strength can be painful if momentum rolls over.";
      }

      const evidenceContext = evidenceContextBySymbol.get(symbolRelation.id);
      const adjustedConviction = programConviction !== null ? Math.max(5, Math.min(95, programConviction + (evidenceContext?.convictionDelta || 0))) : null;

      recommendationsToInsert.push({
        owner_id: auth.user.id,
        recommendation_run_id: recommendationRun.id,
        portfolio_id: position.portfolio_id,
        symbol_id: symbolRelation.id,
        action,
        status: "open",
        target_weight: recommendedTargetWeight,
        conviction_score: adjustedConviction,
        summary: `${summary}${evidenceContext?.summaryAddon || ""}`,
        risks: `${risks}${evidenceContext?.riskAddon || ""}`,
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

      const evidenceContext = evidenceContextBySymbol.get(symbolRelation.id);

      recommendationsToInsert.push({
        owner_id: auth.user.id,
        recommendation_run_id: recommendationRun.id,
        portfolio_id: null,
        symbol_id: symbolRelation.id,
        action,
        status: "open",
        target_weight: null,
        conviction_score: evidenceContext ? Math.max(10, Math.min(90, 50 + evidenceContext.convictionDelta)) : null,
        summary: `${
          action === "buy"
            ? `${symbolRelation.ticker} stands out from the watchlist as a candidate for deeper portfolio review.`
            : `${symbolRelation.ticker} is on the watchlist and deserves monitoring after a recent pullback.`
        }${evidenceContext?.summaryAddon || ""}`,
        risks: `${
          action === "buy"
            ? "Watchlist ideas still need explicit sizing and thesis validation before entering the portfolio."
            : "A falling watchlist name can keep weakening without a stronger thesis or catalyst."
        }${evidenceContext?.riskAddon || ""}`,
        confidence: action === "buy" ? "medium" : "low",
      });
    });

    if (!recommendationsToInsert.length) {
      await supabase
        .from("recommendation_runs")
        .update({
          status: "failed",
          summary: "No portfolio positions or watchlist symbols are available yet.",
          completed_at: new Date().toISOString(),
        })
        .eq("id", recommendationRun.id)
        .eq("owner_id", auth.user.id);

      return { ok: false, error: "No portfolio positions or watchlist symbols are available yet." };
    }

    const symbolIds = [...new Set(recommendationsToInsert.map((item) => item.symbol_id))];
    const portfolioIds = [...new Set(recommendationsToInsert.map((item) => item.portfolio_id).filter(Boolean))];

    if (symbolIds.length) {
      await supabase.from("recommendations").delete().eq("owner_id", auth.user.id).in("symbol_id", symbolIds);
    }

    if (portfolioIds.length) {
      await supabase.from("recommendations").delete().eq("owner_id", auth.user.id).in("portfolio_id", portfolioIds as string[]);
    }

    const { data: insertedRecommendations, error: insertError } = await supabase
      .from("recommendations")
      .insert(recommendationsToInsert)
      .select("id, symbol_id");
    if (insertError) {
      await supabase
        .from("recommendation_runs")
        .update({
          status: "failed",
          summary: insertError.message,
          completed_at: new Date().toISOString(),
        })
        .eq("id", recommendationRun.id)
        .eq("owner_id", auth.user.id);

      return { ok: false, error: insertError.message };
    }

    if (insertedRecommendations?.length) {
      const evidenceToInsert = insertedRecommendations.flatMap((recommendation) => {
        const evidenceContext = evidenceContextBySymbol.get(recommendation.symbol_id);
        if (!evidenceContext?.evidenceRows?.length) {
          return [];
        }

        return evidenceContext.evidenceRows.map((evidence) => ({
          recommendation_id: recommendation.id,
          research_insight_id: evidence.research_insight_id,
          weight: evidence.weight,
          note: evidence.note,
        }));
      });

      if (evidenceToInsert.length) {
        const { error: evidenceInsertError } = await supabase.from("recommendation_evidence").insert(evidenceToInsert);
        if (evidenceInsertError) {
          await supabase
            .from("recommendation_runs")
            .update({
              status: "failed",
              summary: evidenceInsertError.message,
              completed_at: new Date().toISOString(),
            })
            .eq("id", recommendationRun.id)
            .eq("owner_id", auth.user.id);

          return { ok: false, error: evidenceInsertError.message };
        }
      }
    }

    await supabase
      .from("recommendation_runs")
      .update({
        status: "completed",
        summary: `Generated ${recommendationsToInsert.length} recommendations from current portfolio and watchlist state, with ${insertedRecommendations?.length || 0} evidence-linked records.`,
        completed_at: new Date().toISOString(),
      })
      .eq("id", recommendationRun.id)
      .eq("owner_id", auth.user.id);

    revalidatePath("/recommendations");
    revalidatePath("/dashboard");
    revalidatePath("/agent-activity");
    return { ok: true, error: "" };
  } catch (error) {
    return { ok: false, error: getErrorMessage(error, "Failed to generate recommendations.") };
  }
}

export async function refreshMarketData(_prevState: FormState): Promise<FormState> {
  try {
    const auth = await requireActionUser();
    if (auth.error || !auth.user) {
      return { ok: false, error: auth.error || "You must be logged in." };
    }

    const [quoteResult] = await Promise.all([runCentralQuoteRefresh("manual"), refreshFxRate("USD/CAD", "manual")]);
    revalidatePath("/symbols");
    revalidatePath("/dashboard");
    revalidatePath("/agent-activity");
    revalidatePath("/recommendations");
    revalidatePath("/portfolio");
    return { ok: true, error: quoteResult.refreshedCount ? "" : "No symbols refreshed." };
  } catch (error) {
    return { ok: false, error: getErrorMessage(error, "Failed to refresh tracked symbols.") };
  }
}

export async function runNewsResearch(_prevState: FormState): Promise<FormState> {
  try {
    const auth = await requireActionUser();
    if (auth.error || !auth.user) {
      return { ok: false, error: auth.error || "You must be logged in." };
    }

    await runSharedNewsResearch(auth.user.id);
    await runGlobalMacroAgent(auth.user.id);
    revalidatePath("/research");
    revalidatePath("/agents");
    revalidatePath("/agent-activity");
    revalidatePath("/dashboard");
    return { ok: true, error: "" };
  } catch (error) {
    return { ok: false, error: getErrorMessage(error, "Failed to run shared news research.") };
  }
}

export async function importSymbol(_prevState: FormState, formData: FormData): Promise<FormState> {
  try {
    const auth = await requireActionUser();
    if (auth.error || !auth.user) {
      return { ok: false, error: auth.error || "You must be logged in." };
    }

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

    await enrichSymbolAndRefreshQuote(symbolRow.id, match.symbol, auth.user.id);

    if (watchlistId) {
      const { data: ownedWatchlist } = await supabase.from("watchlists").select("id").eq("id", watchlistId).eq("owner_id", auth.user.id).maybeSingle();
      if (!ownedWatchlist) {
        return { ok: false, error: "Watchlist not found for this user." };
      }

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
