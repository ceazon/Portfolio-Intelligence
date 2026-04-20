import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const DEFAULT_PAIR = "USD/CAD";
const OPEN_ER_API_BASE_URL = "https://open.er-api.com/v6/latest";

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

async function getPublicExchangeRate(from: string, to: string) {
  const response = await fetch(`${OPEN_ER_API_BASE_URL}/${encodeURIComponent(from.trim().toUpperCase())}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Public FX request failed with status ${response.status}`);
  }

  const json = (await response.json()) as {
    result?: string;
    rates?: Record<string, number>;
    time_last_update_utc?: string;
    time_next_update_utc?: string;
  };

  const rate = json.rates?.[to.trim().toUpperCase()];
  if (typeof rate !== "number" || !Number.isFinite(rate)) {
    throw new Error(`No FX rate returned for ${from}/${to}.`);
  }

  return {
    rate,
    provider: "open.er-api.com",
    raw: json,
  };
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
    const result = await getPublicExchangeRate(from, to);

    const payload = {
      pair,
      rate: result.rate,
      fetched_at: new Date().toISOString(),
      source: result.provider,
      raw_payload: result.raw,
    };

    const { error: upsertError } = await supabase.from("fx_rate_snapshots").upsert(payload, { onConflict: "pair" });
    if (upsertError) {
      throw new Error(upsertError.message);
    }

    await supabase
      .from("fx_refresh_runs")
      .update({
        status: "completed",
        summary: `FX refresh completed for ${pair} at ${result.rate}.`,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runRow.id);

    return { runId: runRow.id, pair, rate: result.rate };
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
