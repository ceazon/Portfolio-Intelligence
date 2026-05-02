import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getConsensusTargetForSymbol } from "@/lib/consensus-targets";

type QuoteLike = {
  price: number | null;
  source: "fmp" | "yahoo";
};

type PerformanceCaptureInput = {
  ownerId?: string;
  symbolId: string;
  ticker: string;
  quote: QuoteLike | null;
  quoteCurrency: string | null;
};

function getMarketDayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function capturePerformanceSnapshots(input: PerformanceCaptureInput) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return;
  }

  const now = new Date();
  const capturedAt = now.toISOString();
  const marketDayKey = getMarketDayKey(now);

  if (input.quote && typeof input.quote.price === "number") {
    const ownerId = input.ownerId || null;

    const { data: existingPriceRow, error: priceLookupError } = await supabase
      .from("symbol_price_history")
      .select("id")
      .eq("symbol_id", input.symbolId)
      .eq("market_day", marketDayKey)
      .is("owner_id", ownerId)
      .maybeSingle();

    if (priceLookupError) {
      throw new Error(priceLookupError.message);
    }

    if (existingPriceRow?.id) {
      const { error: updatePriceError } = await supabase
        .from("symbol_price_history")
        .update({
          ticker: input.ticker,
          source: input.quote.source,
          price: input.quote.price,
          currency: input.quoteCurrency,
          captured_at: capturedAt,
        })
        .eq("id", existingPriceRow.id);

      if (updatePriceError) {
        throw new Error(updatePriceError.message);
      }
    } else {
      const { error: insertPriceError } = await supabase.from("symbol_price_history").insert({
        owner_id: ownerId,
        symbol_id: input.symbolId,
        ticker: input.ticker,
        source: input.quote.source,
        price: input.quote.price,
        currency: input.quoteCurrency,
        market_day: marketDayKey,
        captured_at: capturedAt,
      });

      if (insertPriceError) {
        throw new Error(insertPriceError.message);
      }
    }
  }

  const consensus = await getConsensusTargetForSymbol(input.ticker);
  const hasConsensusData = [consensus.meanTarget, consensus.medianTarget, consensus.highTarget, consensus.lowTarget].some((value) => typeof value === "number");

  if (!hasConsensusData) {
    return;
  }

  const { error: insertTargetError } = await supabase.from("analyst_target_snapshots").insert({
    owner_id: input.ownerId || null,
    symbol_id: input.symbolId,
    ticker: input.ticker,
    source: consensus.source,
    captured_at: capturedAt,
    current_price: input.quote?.price ?? null,
    current_price_currency: input.quoteCurrency,
    mean_target: consensus.meanTarget,
    median_target: consensus.medianTarget,
    high_target: consensus.highTarget,
    low_target: consensus.lowTarget,
  });

  if (insertTargetError) {
    throw new Error(insertTargetError.message);
  }
}
