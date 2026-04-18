"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { searchFinnhubSymbols } from "@/lib/finnhub";

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return fallback;
}

function logServerActionError(action: string, error: unknown, context: Record<string, unknown>) {
  console.error(`[server-action:${action}]`, {
    message: getErrorMessage(error, `Failed to run ${action}.`),
    context,
    error,
  });
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
    logServerActionError("createWatchlist", error, {
      name: String(formData.get("name") || "").trim(),
    });
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
    logServerActionError("createPortfolio", error, {
      name: String(formData.get("name") || "").trim(),
      benchmark: String(formData.get("benchmark") || "SPY").trim() || "SPY",
    });
    return { ok: false, error: getErrorMessage(error, "Failed to create portfolio.") };
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

    revalidatePath("/watchlist");
    revalidatePath("/dashboard");
    return { ok: true, error: "" };
  } catch (error) {
    logServerActionError("importSymbol", error, {
      query: String(formData.get("query") || "").trim(),
      selectedSymbol: String(formData.get("selectedSymbol") || "").trim(),
      watchlistId: String(formData.get("watchlistId") || "").trim(),
    });
    return { ok: false, error: getErrorMessage(error, "Failed to import symbol.") };
  }
}
