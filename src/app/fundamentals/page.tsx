import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireUser } from "@/lib/auth";

type FundamentalsRow = {
  pe_ttm: number | null;
  pb_ttm: number | null;
  ps_ttm: number | null;
  revenue_growth_ttm: number | null;
  eps_growth_5y: number | null;
  net_margin_ttm: number | null;
  operating_margin_ttm: number | null;
  roe_ttm: number | null;
  current_ratio_quarterly: number | null;
  market_cap_m: number | null;
  fetched_at: string;
  symbols: { ticker: string; name: string | null } | { ticker: string; name: string | null }[] | null;
};

function firstRelation<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function formatPercent(value: number | null) {
  return value === null ? "--" : `${value.toFixed(2)}%`;
}

function formatNumber(value: number | null) {
  return value === null ? "--" : value.toFixed(2);
}

function formatMarketCap(value: number | null) {
  if (value === null) return "--";
  if (value >= 1000) return `$${(value / 1000).toFixed(2)}B`;
  return `$${value.toFixed(0)}M`;
}

export default async function FundamentalsPage() {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const { data: rows } = supabase
    ? await supabase
        .from("symbol_fundamentals")
        .select("pe_ttm, pb_ttm, ps_ttm, revenue_growth_ttm, eps_growth_5y, net_margin_ttm, operating_margin_ttm, roe_ttm, current_ratio_quarterly, market_cap_m, fetched_at, symbols(ticker, name)")
        .order("fetched_at", { ascending: false })
    : { data: [] as FundamentalsRow[] };

  return (
    <AppShell viewer={user}>
      <SectionCard title="Fundamentals" description="Tracked company basics and valuation context used by the Fundamentals Agent.">
        {rows && rows.length > 0 ? (
          <div className="space-y-3">
            {rows.map((row, index) => {
              const symbol = firstRelation(row.symbols);
              return (
                <div key={`${symbol?.ticker || "symbol"}-${index}`} className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-zinc-100">
                        {symbol?.ticker || "Unknown ticker"}
                        <span className="ml-2 text-zinc-400">{symbol?.name || "Unnamed symbol"}</span>
                      </p>
                      <p className="mt-1 text-xs uppercase tracking-wide text-zinc-500">Fundamentals snapshot</p>
                    </div>
                    <div className="text-xs text-zinc-500">Updated {new Date(row.fetched_at).toLocaleString()}</div>
                  </div>

                  <div className="mt-4 grid gap-2 text-sm text-zinc-300 sm:grid-cols-2 lg:grid-cols-5">
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3"><p className="text-xs uppercase tracking-wide text-zinc-500">P/E</p><p className="mt-1 font-medium text-zinc-100">{formatNumber(row.pe_ttm)}</p></div>
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3"><p className="text-xs uppercase tracking-wide text-zinc-500">P/B</p><p className="mt-1 font-medium text-zinc-100">{formatNumber(row.pb_ttm)}</p></div>
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3"><p className="text-xs uppercase tracking-wide text-zinc-500">P/S</p><p className="mt-1 font-medium text-zinc-100">{formatNumber(row.ps_ttm)}</p></div>
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3"><p className="text-xs uppercase tracking-wide text-zinc-500">Revenue growth</p><p className="mt-1 font-medium text-zinc-100">{formatPercent(row.revenue_growth_ttm)}</p></div>
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3"><p className="text-xs uppercase tracking-wide text-zinc-500">EPS growth 5Y</p><p className="mt-1 font-medium text-zinc-100">{formatPercent(row.eps_growth_5y)}</p></div>
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3"><p className="text-xs uppercase tracking-wide text-zinc-500">Net margin</p><p className="mt-1 font-medium text-zinc-100">{formatPercent(row.net_margin_ttm)}</p></div>
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3"><p className="text-xs uppercase tracking-wide text-zinc-500">Operating margin</p><p className="mt-1 font-medium text-zinc-100">{formatPercent(row.operating_margin_ttm)}</p></div>
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3"><p className="text-xs uppercase tracking-wide text-zinc-500">ROE</p><p className="mt-1 font-medium text-zinc-100">{formatPercent(row.roe_ttm)}</p></div>
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3"><p className="text-xs uppercase tracking-wide text-zinc-500">Current ratio</p><p className="mt-1 font-medium text-zinc-100">{formatNumber(row.current_ratio_quarterly)}</p></div>
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3"><p className="text-xs uppercase tracking-wide text-zinc-500">Market cap</p><p className="mt-1 font-medium text-zinc-100">{formatMarketCap(row.market_cap_m)}</p></div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">No fundamentals snapshots yet. Run news research to refresh tracked-symbol fundamentals and populate this view.</div>
        )}
      </SectionCard>
    </AppShell>
  );
}
