"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export async function createWatchlist(formData: FormData) {
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
  return { ok: true };
}

export async function createPortfolio(formData: FormData) {
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
  return { ok: true };
}
