import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { GenerateRecommendationsForm } from "@/components/generate-recommendations-form";
import { RecommendationStatusForm } from "@/components/recommendation-status-form";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireUser } from "@/lib/auth";

type RecommendationRow = {
  id: string;
  recommendation_run_id: string | null;
  action: string;
  status: string;
  target_weight: number | null;
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
          "id, recommendation_run_id, action, status, target_weight, conviction_score, summary, risks, confidence, created_at, portfolios(name), symbols(ticker, name, symbol_price_snapshots(price, percent_change, fetched_at))",
        )
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
    : { data: [] as RecommendationRow[] };

  return (
    <AppShell viewer={user}>
      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="space-y-6">
          <SectionCard
            title="Recommendations"
            description="Portfolio-aware suggestions generated from current holdings, portfolio concentration, and live market data."
          >
            {recommendations && recommendations.length > 0 ? (
              <div className="space-y-3">
                {recommendations.map((recommendation) => {
                  const symbol = firstRelation(recommendation.symbols);
                  const portfolio = firstRelation(recommendation.portfolios);
                  const quote = firstRelation(symbol?.symbol_price_snapshots || null);
                  const quotePositive = typeof quote?.percent_change === "number" ? quote.percent_change >= 0 : null;

                  return (
                    <div key={recommendation.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-zinc-100">
                            {symbol?.ticker || "Unknown ticker"}
                            <span className="ml-2 text-zinc-400">{symbol?.name || "Unnamed symbol"}</span>
                          </p>
                          <p className="mt-1 text-xs uppercase tracking-wide text-zinc-500">
                            {recommendation.action} · {recommendation.confidence || "medium"} confidence
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

                      <p className="mt-3 text-sm text-zinc-300">{recommendation.summary || "No summary provided."}</p>
                      <p className="mt-2 text-sm text-zinc-500">Risk: {recommendation.risks || "No risk summary provided."}</p>

                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-400">
                        <span className="rounded-full border border-zinc-700 px-2 py-1">Status {recommendation.status}</span>
                        {recommendation.recommendation_run_id ? (
                          <span className="rounded-full border border-zinc-700 px-2 py-1">Run {recommendation.recommendation_run_id.slice(0, 8)}</span>
                        ) : null}
                        {recommendation.target_weight !== null ? (
                          <span className="rounded-full border border-zinc-700 px-2 py-1">Target {recommendation.target_weight}%</span>
                        ) : null}
                        {recommendation.conviction_score !== null ? (
                          <span className="rounded-full border border-zinc-700 px-2 py-1">Conviction {recommendation.conviction_score}</span>
                        ) : null}
                      </div>

                      <RecommendationStatusForm recommendationId={recommendation.id} currentStatus={recommendation.status} />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">
                No recommendations yet. Generate the first rules-based set from your current portfolios and watchlists.
              </div>
            )}
          </SectionCard>
        </div>

        <div className="space-y-6">
          <GenerateRecommendationsForm />

          <SectionCard
            title="Current logic"
            description="This version now uses portfolio concentration as part of the recommendation process."
          >
            <ul className="space-y-3 text-sm text-zinc-300">
              <li className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3">Trim winners that have become oversized relative to the rest of the portfolio.</li>
              <li className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3">Buy strong names that still look underweight in the portfolio.</li>
              <li className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3">Watch names that are materially below cost basis until the setup improves.</li>
              <li className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3">Allow review workflow with accept, dismiss, and archive actions.</li>
            </ul>
          </SectionCard>
        </div>
      </div>
    </AppShell>
  );
}
