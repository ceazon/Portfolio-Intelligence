import { NextResponse } from "next/server";
import { runPerformanceEvaluation } from "@/lib/performance-evaluator";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  const expectedToken = process.env.CRON_SECRET || "";

  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runPerformanceEvaluation();

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Performance evaluation failed.",
      },
      { status: 500 },
    );
  }
}
