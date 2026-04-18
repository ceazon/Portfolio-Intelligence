import { NextResponse } from "next/server";
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
    const result = await runCentralQuoteRefresh(marketState.cadenceLabel);

    return NextResponse.json({
      ok: true,
      cadenceLabel: marketState.cadenceLabel,
      recommendedEveryMinutes: marketState.recommendedEveryMinutes,
      ...result,
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
