import { percentFromConfidence } from "@/lib/agent-output-contract";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type ResearchInsightRow = {
  id: string;
  symbol_id: string | null;
  title: string;
  summary: string | null;
  thesis: string | null;
  direction: string | null;
  confidence_score: number | null;
  generated_at: string;
};

export type RecommendationEvidenceContext = {
  summaryAddon: string;
  riskAddon: string;
  convictionDelta: number;
  evidenceRows: Array<{
    research_insight_id: string;
    weight: number;
    note: string;
  }>;
};

export async function getResearchEvidenceContext(ownerId: string, symbolIds: string[]) {
  const supabase = createSupabaseAdminClient();
  if (!supabase || !symbolIds.length) {
    return new Map<string, RecommendationEvidenceContext>();
  }

  const { data, error } = await supabase
    .from("research_insights")
    .select("id, symbol_id, title, summary, thesis, direction, confidence_score, generated_at")
    .eq("owner_id", ownerId)
    .eq("insight_type", "news")
    .in("symbol_id", symbolIds)
    .order("generated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const grouped = new Map<string, ResearchInsightRow[]>();
  ((data || []) as ResearchInsightRow[]).forEach((row) => {
    if (!row.symbol_id) {
      return;
    }

    const existing = grouped.get(row.symbol_id) || [];
    if (existing.length < 2) {
      existing.push(row);
      grouped.set(row.symbol_id, existing);
    }
  });

  const contextBySymbol = new Map<string, RecommendationEvidenceContext>();

  grouped.forEach((insights, symbolId) => {
    const bullish = insights.filter((item) => item.direction === "bullish").length;
    const bearish = insights.filter((item) => item.direction === "bearish").length;
    const mixed = insights.length - bullish - bearish;
    const avgConfidence = insights.reduce((sum, item) => sum + (percentFromConfidence(item.confidence_score) ?? 50), 0) / insights.length;
    const dominant = bullish === bearish ? "mixed" : bullish > bearish ? "bullish" : "bearish";

    const summaryAddon =
      dominant === "bullish"
        ? ` Recent news flow is leaning constructive, with ${bullish} supportive insight${bullish === 1 ? "" : "s"} in the shared research feed.`
        : dominant === "bearish"
          ? ` Recent news flow is leaning cautious, with ${bearish} negative insight${bearish === 1 ? "" : "s"} in the shared research feed.`
          : ` Recent news flow is mixed, with ${mixed || insights.length} cross-current insight${insights.length === 1 ? "" : "s"} in the shared research feed.`;

    const riskAddon =
      dominant === "bullish"
        ? " Shared news evidence is constructive right now, but headline tone can reverse quickly."
        : dominant === "bearish"
          ? " Shared news evidence is cautionary right now, so thesis drift needs closer review."
          : " Shared news evidence is mixed right now, which lowers clarity even if price action looks clean.";

    const convictionDelta = dominant === "bullish" ? Math.round(avgConfidence / 12) : dominant === "bearish" ? -Math.round(avgConfidence / 14) : 0;

    const evidenceRows = insights.map((insight, index) => ({
      research_insight_id: insight.id,
      weight: Math.max(0.2, Number((((percentFromConfidence(insight.confidence_score) ?? 50) / 100) - index * 0.1).toFixed(2))),
      note: insight.summary || insight.thesis || insight.title,
    }));

    contextBySymbol.set(symbolId, {
      summaryAddon,
      riskAddon,
      convictionDelta,
      evidenceRows,
    });
  });

  return contextBySymbol;
}
