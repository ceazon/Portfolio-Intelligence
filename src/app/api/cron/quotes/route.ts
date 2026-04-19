import { NextResponse } from "next/server";
import { refreshFxRate } from "@/lib/fx-sync";
import { runCentralQuoteRefresh } from "@/lib/symbol-sync";
import { getMarketHoursState } from "@/lib/market-hours";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  const expectedToken = process.env.CRON_SECRET || "";

  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const marketState = getMarketHoursState();
    const [quoteResult, fxResult] = await Promise.all([
      runCentralQuoteRefresh(marketState.cadenceLabel),
      refreshFxRate("USD/CAD", marketState.cadenceLabel),
    ]);

    return NextResponse.json({
      ok: true,
      cadenceLabel: marketState.cadenceLabel,
      recommendedEveryMinutes: marketState.recommendedEveryMinutes,
      quoteRefresh: quoteResult,
      fxRefresh: fxResult,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Quote refresh failed.",
      },
      { status: 500 },
    );
  }
}
