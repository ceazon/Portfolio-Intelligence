import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { SynthesizeRecommendationsForm } from "@/components/synthesize-recommendations-form";
import { RecommendationStatusForm } from "@/components/recommendation-status-form";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireUser } from "@/lib/auth";

type RecommendationRow = {
  id: string;
  synthesis_run_id: string | null;
  recommendation_engine: string | null;
  action: string;
  status: string;
  target_weight: number | null;
  target_price: number | null;
  conviction_score: number | null;
  summary: string | null;
  risks: string | null;
  confidence: string | null;
  created_at: string;
  portfolios: { name: string } | { name: string }[] | null;
  symbols:
    | {
        ticker: string;
        name: string | null;
        symbol_price_snapshots:
          | { price: number | null; percent_change: number | null; fetched_at: string }
          | { price: number | null; percent_change: number | null; fetched_at: string }[]
          | null;
      }
    | {
        ticker: string;
        name: string | null;
        symbol_price_snapshots:
          | { price: number | null; percent_change: number | null; fetched_at: string }
          | { price: number | null; percent_change: number | null; fetched_at: string }[]
          | null;
      }[]
    | null;
};

function firstRelation<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

export default async function RecommendationsPage() {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data: recommendations } = supabase
    ? await supabase
        .from("recommendations")
        .select(
          "id, synthesis_run_id, recommendation_engine, action, status, target_weight, target_price, conviction_score, summary, risks, confidence, created_at, portfolios(name), symbols(ticker, name, symbol_price_snapshots(price, percent_change, fetched_at))",
        )
        .eq("owner_id", user.id)
        .eq("recommendation_engine", "synthesis-v1")
        .neq("status", "archived")
        .order("conviction_score", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
    : { data: [] as RecommendationRow[] };

  return (
    <AppShell viewer={user}>
      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-6">
          <SectionCard title="Recommendations" description="Focused synthesized recommendations ranked by strongest conviction.">
            {recommendations && recommendations.length > 0 ? (
              <div className="space-y-3">
                {recommendations.map((recommendation) => {
                  const symbol = firstRelation(recommendation.symbols);
                  const portfolio = firstRelation(recommendation.portfolios);
                  const quote = firstRelation(symbol?.symbol_price_snapshots || null);
                  const quotePositive = typeof quote?.percent_change === "number" ? quote.percent_change >= 0 : null;
                  const actionLabel = recommendation.action.toUpperCase();
                  const targetWeightLabel = portfolio?.name ? "Target portfolio weight" : "Suggested starter weight";

                  return (
                    <div key={recommendation.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-zinc-100">
                            {symbol?.ticker || "Unknown ticker"}
                            <span className="ml-2 text-zinc-400">{symbol?.name || "Unnamed symbol"}</span>
                          </p>
                          <p className="mt-1 text-xs uppercase tracking-wide text-zinc-500">
                            {actionLabel} · {recommendation.confidence || "medium"} confidence
                            {portfolio?.name ? ` · ${portfolio.name}` : " · Watchlist candidate"}
                          </p>
                        </div>

                        <div className="text-right text-sm">
                          {typeof quote?.price === "number" ? <p className="text-zinc-100">${quote.price.toFixed(2)}</p> : null}
                          {typeof quote?.percent_change === "number" ? (
                            <p className={quotePositive ? "text-emerald-300" : "text-rose-300"}>
                              {quotePositive ? "+" : ""}
                              {quote.percent_change.toFixed(2)}%
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <p className="mt-3 text-base text-zinc-200">{recommendation.summary || "No recommendation provided."}</p>

                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-400">
                        {recommendation.target_weight !== null ? <span className="rounded-full border border-zinc-700 px-2 py-1">{targetWeightLabel} {recommendation.target_weight}%</span> : null}
                        {recommendation.target_price !== null ? <span className="rounded-full border border-zinc-700 px-2 py-1">12-month target price ${recommendation.target_price.toFixed(2)}</span> : null}
                        {recommendation.conviction_score !== null ? <span className="rounded-full border border-zinc-700 px-2 py-1">Conviction {recommendation.conviction_score}</span> : null}
                      </div>

                      <div className="mt-3 text-sm text-zinc-500">Risk: {recommendation.risks || "No risk summary provided."}</div>

                      <RecommendationStatusForm recommendationId={recommendation.id} currentStatus={recommendation.status} />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">
                No synthesized recommendations yet. Run synthesis to populate this view.
              </div>
            )}
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SynthesizeRecommendationsForm />
        </div>
      </div>
    </AppShell>
  );
}
