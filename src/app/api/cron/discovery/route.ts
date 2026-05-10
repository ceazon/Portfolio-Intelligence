import { NextResponse } from "next/server";
import { refreshDiscoveryScreener } from "@/lib/discovery";

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  const expectedToken = process.env.CRON_SECRET || "";

  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const maxSymbols = parsePositiveInt(url.searchParams.get("symbols"), 25, 100);
  const maxFmpFundamentalCalls = parsePositiveInt(url.searchParams.get("fmp"), 1, 10);
  const maxFinnhubFundamentalCalls = parsePositiveInt(url.searchParams.get("finnhub"), 1, 10);
  const maxAlphaVantageCalls = parsePositiveInt(url.searchParams.get("alpha"), 0, 5);
  const maxEodhdQuoteCalls = parsePositiveInt(url.searchParams.get("eodhd"), 10, 50);

  try {
    const result = await refreshDiscoveryScreener({
      maxSymbols,
      maxFmpFundamentalCalls,
      maxFinnhubFundamentalCalls,
      maxAlphaVantageCalls,
      maxEodhdQuoteCalls,
    });

    return NextResponse.json({
      ok: true,
      mode: "paced-discovery-enrichment",
      budgets: {
        maxSymbols,
        maxFmpFundamentalCalls,
        maxFinnhubFundamentalCalls,
        maxAlphaVantageCalls,
        maxEodhdQuoteCalls,
      },
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Discovery enrichment failed.",
      },
      { status: 500 },
    );
  }
}
