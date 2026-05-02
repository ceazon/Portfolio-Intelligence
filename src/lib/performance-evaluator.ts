import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const EVALUATION_WINDOWS = [90, 180, 365] as const;

function isoDaysAfter(input: string, days: number) {
  const date = new Date(input);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function percentReturn(fromPrice: number, toPrice: number) {
  return ((toPrice - fromPrice) / fromPrice) * 100;
}

export async function runPerformanceEvaluation() {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new Error("Supabase env vars are not configured yet.");
  }

  const nowIso = new Date().toISOString();

  const { data: snapshots, error: snapshotError } = await supabase
    .from("analyst_target_snapshots")
    .select("id, owner_id, symbol_id, ticker, captured_at, current_price, mean_target")
    .not("current_price", "is", null)
    .not("mean_target", "is", null)
    .order("captured_at", { ascending: true });

  if (snapshotError) {
    throw new Error(snapshotError.message);
  }

  const eligibleSnapshots = (snapshots || []).filter((snapshot) => {
    if (!snapshot.captured_at || typeof snapshot.current_price !== "number" || typeof snapshot.mean_target !== "number") {
      return false;
    }

    return EVALUATION_WINDOWS.some((days) => isoDaysAfter(snapshot.captured_at, days) <= nowIso);
  });

  let evaluationsCreated = 0;

  for (const snapshot of eligibleSnapshots) {
    for (const days of EVALUATION_WINDOWS) {
      const targetDateIso = isoDaysAfter(snapshot.captured_at, days);
      if (targetDateIso > nowIso) {
        continue;
      }

      const { data: existingRow, error: existingError } = await supabase
        .from("analyst_target_performance")
        .select("id")
        .eq("target_snapshot_id", snapshot.id)
        .eq("evaluation_window_days", days)
        .maybeSingle();

      if (existingError) {
        throw new Error(existingError.message);
      }

      if (existingRow) {
        continue;
      }

      const { data: priceRow, error: priceError } = await supabase
        .from("symbol_price_history")
        .select("price, captured_at")
        .eq("symbol_id", snapshot.symbol_id)
        .gte("captured_at", targetDateIso)
        .order("captured_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (priceError) {
        throw new Error(priceError.message);
      }

      if (!priceRow || typeof priceRow.price !== "number" || snapshot.current_price <= 0) {
        continue;
      }

      const expectedReturnPctAtCapture = percentReturn(snapshot.current_price, snapshot.mean_target);
      const actualReturnPct = percentReturn(snapshot.current_price, priceRow.price);
      const alphaVsConsensusPct = actualReturnPct - expectedReturnPctAtCapture;
      const hitTarget = priceRow.price >= snapshot.mean_target;
      const daysToTargetHit = Math.max(
        0,
        Math.round((new Date(priceRow.captured_at).getTime() - new Date(snapshot.captured_at).getTime()) / (1000 * 60 * 60 * 24)),
      );

      const { error: insertError } = await supabase.from("analyst_target_performance").insert({
        owner_id: snapshot.owner_id || null,
        target_snapshot_id: snapshot.id,
        symbol_id: snapshot.symbol_id,
        evaluation_window_days: days,
        price_at_evaluation: priceRow.price,
        actual_return_pct: Number(actualReturnPct.toFixed(3)),
        expected_return_pct_at_capture: Number(expectedReturnPctAtCapture.toFixed(3)),
        alpha_vs_consensus_pct: Number(alphaVsConsensusPct.toFixed(3)),
        hit_target: hitTarget,
        days_to_target_hit: hitTarget ? daysToTargetHit : null,
        evaluated_at: new Date().toISOString(),
      });

      if (insertError) {
        throw new Error(insertError.message);
      }

      evaluationsCreated += 1;
    }
  }

  return {
    snapshotsConsidered: eligibleSnapshots.length,
    evaluationsCreated,
    windows: [...EVALUATION_WINDOWS],
  };
}
