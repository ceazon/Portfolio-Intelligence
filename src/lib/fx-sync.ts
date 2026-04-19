import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getFinnhubExchangeRate } from "@/lib/finnhub";

const DEFAULT_PAIR = "USD/CAD";

export async function getLatestFxRate(pair = DEFAULT_PAIR) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new Error("Supabase env vars are not configured yet.");
  }

  const { data, error } = await supabase.from("fx_rate_snapshots").select("pair, rate, fetched_at").eq("pair", pair).maybeSingle();
  if (error) {
    throw new Error(error.message);
  }

  return data || null;
}

export async function refreshFxRate(pair = DEFAULT_PAIR, triggerType = "manual") {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new Error("Supabase env vars are not configured yet.");
  }

  const { data: runRow, error: runInsertError } = await supabase
    .from("fx_refresh_runs")
    .insert({
      trigger_type: triggerType,
      pair,
      status: "running",
      started_at: new Date().toISOString(),
      summary: `Refreshing FX rate for ${pair}.`,
    })
    .select("id")
    .single();

  if (runInsertError || !runRow) {
    throw new Error(runInsertError?.message || "Failed to create FX refresh run.");
  }

  try {
    const [from, to] = pair.split("/");
    const rate = await getFinnhubExchangeRate(from, to);
    if (!rate) {
      throw new Error(`No FX rate returned for ${pair}.`);
    }

    const payload = {
      pair,
      rate,
      fetched_at: new Date().toISOString(),
      source: "finnhub",
      raw_payload: { pair, rate },
    };

    const { error: upsertError } = await supabase.from("fx_rate_snapshots").upsert(payload, { onConflict: "pair" });
    if (upsertError) {
      throw new Error(upsertError.message);
    }

    await supabase
      .from("fx_refresh_runs")
      .update({
        status: "completed",
        summary: `FX refresh completed for ${pair} at ${rate}.`,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runRow.id);

    return { runId: runRow.id, pair, rate };
  } catch (error) {
    const message = error instanceof Error ? error.message : "FX refresh failed.";
    await supabase
      .from("fx_refresh_runs")
      .update({
        status: "failed",
        summary: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runRow.id);

    throw error;
  }
}
