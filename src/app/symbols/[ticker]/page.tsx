import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { requireUser } from "@/lib/auth";
import { formatConfidencePercent, formatNormalizedScore, getReadableBiasLabel } from "@/lib/agent-output-format";
import { buildPaceSummary, formatMoney, formatPaceLabel, formatPercent, formatRatio, getPaceTone } from "@/lib/performance-metrics";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { formatAppDateTime, getAppTimeZoneLabel } from "@/lib/time";

type SymbolRow = {
  id: string;
  ticker: string;
  name: string | null;
  asset_type: string | null;
  exchange: string | null;
  country: string | null;
  sector: string | null;
  industry: string | null;
  currency: string | null;
  logo_url: string | null;
  web_url: string | null;
  market_cap: number | null;
  ipo_date: string | null;
  last_profile_sync_at: string | null;
  last_quote_sync_at: string | null;
  is_etf: boolean | null;
};

type QuoteRow = {
  price: number | null;
  change: number | null;
  percent_change: number | null;
  previous_close: number | null;
  fetched_at: string;
};

type PriceHistoryRow = {
  price: number | null;
  captured_at: string;
};

type TargetSnapshotRow = {
  mean_target: number | null;
  median_target: number | null;
  high_target: number | null;
  low_target: number | null;
  current_price: number | null;
  current_price_currency: string | null;
  captured_at: string;
};

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
};

type EvidenceItem = {
  title?: string;
  source?: string | null;
  published_at?: string | null;
  snippet?: string | null;
  url?: string;
  source_type?: string;
};

type ResearchInsightRow = {
  id: string;
  title: string;
  summary: string | null;
  thesis: string | null;
  direction: string | null;
  confidence_score: number | null;
  time_horizon: string | null;
  evidence_json: EvidenceItem[] | null;
  source_urls_json: string[] | null;
  created_at: string;
  expires_at: string | null;
};

type AgentOutputRow = {
  id: string;
  agent_name: string;
  stance: string | null;
  normalized_score: number | null;
  confidence_score: number | null;
  action_bias: string | null;
  target_weight_delta: number | null;
  summary: string | null;
  thesis: string | null;
  created_at: string;
};

type PositionRow = {
  quantity: number | null;
  average_cost: number | null;
  average_cost_currency: string | null;
  notes: string | null;
  portfolios: { name: string } | { name: string }[] | null;
};

type SymbolPageProps = {
  params: Promise<{ ticker: string }>;
};

const CHART_WIDTH = 720;
const CHART_HEIGHT = 280;
const PADDING = 38;
const TARGET_HORIZON_DAYS = 365;

function firstRelation<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function formatMarketCap(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}B`;
  return `$${value.toFixed(1)}M`;
}

function formatPlainPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(2)}%`;
}

function daysBetween(startDate: Date, endDate: Date) {
  return Math.max(0, (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
}

function expectedPriceAtDay(startPrice: number, targetPrice: number, day: number) {
  const clampedDay = Math.max(0, Math.min(TARGET_HORIZON_DAYS, day));
  return startPrice + ((targetPrice - startPrice) * clampedDay) / TARGET_HORIZON_DAYS;
}

function buildPath(points: { x: number; y: number }[]) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
}

function formatCompactDate(value: string | Date) {
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric" }).format(typeof value === "string" ? new Date(value) : value);
}

function ExpectationChart({
  currency,
  startDate,
  startPrice,
  targetPrice,
  currentPrice,
  priceHistory,
}: {
  currency: string;
  startDate: string | null;
  startPrice: number | null;
  targetPrice: number | null;
  currentPrice: number | null;
  priceHistory: PriceHistoryRow[];
}) {
  if (!startDate || startPrice === null || targetPrice === null) {
    return <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">Not enough target history to draw the expectation path yet.</div>;
  }

  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) {
    return <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">Target history has an invalid start date.</div>;
  }

  const actualPoints = [
    { captured_at: startDate, price: startPrice, date: start },
    ...priceHistory
      .filter((point) => typeof point.price === "number" && Number.isFinite(point.price))
      .map((point) => ({ ...point, price: point.price as number, date: new Date(point.captured_at) }))
      .filter((point) => !Number.isNaN(point.date.getTime()) && point.date >= start),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  const latestActualDate = actualPoints.at(-1)?.date ?? new Date();
  const chartDays = Math.max(7, daysBetween(start, latestActualDate));
  const expectedToday = expectedPriceAtDay(startPrice, targetPrice, chartDays);
  const prices = [startPrice, targetPrice, expectedToday, currentPrice, ...actualPoints.map((point) => point.price)].filter((value): value is number => value !== null && Number.isFinite(value));
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const pricePadding = Math.max(1, (maxPrice - minPrice) * 0.15);
  const yMin = minPrice - pricePadding;
  const yMax = maxPrice + pricePadding;
  const plotWidth = CHART_WIDTH - PADDING * 2;
  const plotHeight = CHART_HEIGHT - PADDING * 2;
  const xForDay = (day: number) => PADDING + (Math.max(0, Math.min(chartDays, day)) / chartDays) * plotWidth;
  const yForPrice = (price: number) => PADDING + ((yMax - price) / Math.max(1, yMax - yMin)) * plotHeight;
  const actualSvgPoints = actualPoints.map((point) => ({ x: xForDay(daysBetween(start, point.date)), y: yForPrice(point.price), key: `${point.captured_at}-${point.price}` }));
  const expectedSvgPoints = [
    { x: xForDay(0), y: yForPrice(startPrice) },
    { x: xForDay(chartDays), y: yForPrice(expectedToday) },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Start" value={formatMoney(startPrice, currency)} detail={formatAppDateTime(startDate)} />
        <MetricCard label="Expected now" value={formatMoney(expectedToday, currency)} detail="Linear path to 365-day target" tone="sky" />
        <MetricCard label="Actual latest" value={formatMoney(currentPrice ?? actualPoints.at(-1)?.price ?? null, currency)} detail={`Target ${formatMoney(targetPrice, currency)}`} tone="emerald" />
      </div>
      <div className="rounded-2xl border border-zinc-800 bg-black/30 p-3">
        <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="h-auto w-full" role="img" aria-label="Expected price path compared with actual price history">
          <line x1={PADDING} y1={CHART_HEIGHT - PADDING} x2={CHART_WIDTH - PADDING} y2={CHART_HEIGHT - PADDING} stroke="#3f3f46" />
          <line x1={PADDING} y1={PADDING} x2={PADDING} y2={CHART_HEIGHT - PADDING} stroke="#3f3f46" />
          <text x={PADDING} y={CHART_HEIGHT - 8} fill="#71717a" fontSize="12">{formatCompactDate(startDate)}</text>
          <text x={CHART_WIDTH - PADDING - 48} y={CHART_HEIGHT - 8} fill="#71717a" fontSize="12">{formatCompactDate(latestActualDate)}</text>
          <text x={PADDING + 4} y={PADDING - 10} fill="#71717a" fontSize="12">{formatMoney(yMax, currency)}</text>
          <text x={PADDING + 4} y={CHART_HEIGHT - PADDING - 8} fill="#71717a" fontSize="12">{formatMoney(yMin, currency)}</text>
          <path d={buildPath(expectedSvgPoints)} fill="none" stroke="#38bdf8" strokeDasharray="6 5" strokeLinecap="round" strokeWidth="3" />
          <path d={buildPath(actualSvgPoints)} fill="none" stroke="#34d399" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
          {actualSvgPoints.map((point) => <circle key={point.key} cx={point.x} cy={point.y} r="4" fill="#34d399" stroke="#052e16" strokeWidth="2" />)}
        </svg>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-zinc-400">
          <span className="inline-flex items-center gap-2"><span className="h-0.5 w-6 rounded bg-emerald-400" /> Actual price</span>
          <span className="inline-flex items-center gap-2"><span className="h-0.5 w-6 rounded border-t-2 border-dashed border-sky-400" /> Expected path</span>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, detail, tone = "zinc" }: { label: string; value: string; detail?: string; tone?: "zinc" | "sky" | "emerald" | "rose" }) {
  const classes = tone === "sky" ? "border-sky-900/70 bg-sky-950/20 text-sky-200" : tone === "emerald" ? "border-emerald-900/70 bg-emerald-950/20 text-emerald-200" : tone === "rose" ? "border-rose-900/70 bg-rose-950/20 text-rose-200" : "border-zinc-800 bg-zinc-950/70 text-zinc-100";
  return (
    <div className={`rounded-2xl border p-3 ${classes}`}>
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
      {detail ? <p className="mt-1 text-xs text-zinc-500">{detail}</p> : null}
    </div>
  );
}

function getPaceClasses(status: "ahead" | "on-pace" | "behind" | "unavailable") {
  const tone = getPaceTone(status);
  if (tone === "positive") return "border-emerald-800/70 bg-emerald-950/25 text-emerald-300";
  if (tone === "negative") return "border-rose-800/70 bg-rose-950/25 text-rose-300";
  return "border-zinc-700 bg-zinc-900 text-zinc-300";
}

export default async function SymbolIntelligencePage({ params }: SymbolPageProps) {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const ticker = decodeURIComponent((await params).ticker).toUpperCase();

  if (!supabase) {
    return (
      <AppShell viewer={user}>
        <SectionCard title="Symbol intelligence" description="Supabase is not configured in this environment.">
          <Link href="/symbols" className="text-sm text-sky-300 hover:text-sky-200">Back to symbols</Link>
        </SectionCard>
      </AppShell>
    );
  }

  const { data: symbolRows, error: symbolError } = await supabase
    .from("symbols")
    .select("id, ticker, name, asset_type, exchange, country, sector, industry, currency, logo_url, web_url, market_cap, ipo_date, last_profile_sync_at, last_quote_sync_at, is_etf")
    .ilike("ticker", ticker)
    .limit(1);

  const symbol = ((symbolRows || [])[0] || null) as SymbolRow | null;

  if (symbolError || !symbol) {
    return (
      <AppShell viewer={user}>
        <SectionCard title="Symbol not found" description={symbolError?.message || `No imported symbol matched ${ticker}.`}>
          <Link href="/symbols" className="rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:border-zinc-500">Back to symbols</Link>
        </SectionCard>
      </AppShell>
    );
  }

  const [quoteResult, priceHistoryResult, targetHistoryResult, fundamentalsResult, researchResult, agentResult, positionsResult] = await Promise.all([
    supabase.from("symbol_price_snapshots").select("price, change, percent_change, previous_close, fetched_at").eq("symbol_id", symbol.id).order("fetched_at", { ascending: false }).limit(1),
    supabase.from("symbol_price_history").select("price, captured_at").eq("symbol_id", symbol.id).order("captured_at", { ascending: true }).limit(180),
    supabase.from("analyst_target_snapshots").select("mean_target, median_target, high_target, low_target, current_price, current_price_currency, captured_at").eq("owner_id", user.id).eq("symbol_id", symbol.id).order("captured_at", { ascending: false }).limit(30),
    supabase.from("symbol_fundamentals").select("pe_ttm, pb_ttm, ps_ttm, revenue_growth_ttm, eps_growth_5y, net_margin_ttm, operating_margin_ttm, roe_ttm, current_ratio_quarterly, market_cap_m, fetched_at").eq("symbol_id", symbol.id).order("fetched_at", { ascending: false }).limit(1),
    supabase.from("research_insights").select("id, title, summary, thesis, direction, confidence_score, time_horizon, evidence_json, source_urls_json, created_at, expires_at").eq("owner_id", user.id).eq("symbol_id", symbol.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("agent_outputs").select("id, agent_name, stance, normalized_score, confidence_score, action_bias, target_weight_delta, summary, thesis, created_at").eq("owner_id", user.id).eq("symbol_id", symbol.id).order("created_at", { ascending: false }).limit(8),
    supabase.from("portfolio_positions").select("quantity, average_cost, average_cost_currency, notes, portfolios!inner(name, owner_id)").eq("symbol_id", symbol.id).eq("portfolios.owner_id", user.id),
  ]);

  const quote = ((quoteResult.data || [])[0] || null) as QuoteRow | null;
  const priceHistory = (priceHistoryResult.data || []) as PriceHistoryRow[];
  const targetHistory = (targetHistoryResult.data || []) as TargetSnapshotRow[];
  const latestTarget = targetHistory[0] || null;
  const originalTarget = targetHistory.at(-1) || null;
  const fundamentals = ((fundamentalsResult.data || [])[0] || null) as FundamentalsRow | null;
  const research = (researchResult.data || []) as ResearchInsightRow[];
  const agentOutputs = (agentResult.data || []) as AgentOutputRow[];
  const positions = (positionsResult.data || []) as PositionRow[];
  const currency = symbol.currency || latestTarget?.current_price_currency || "USD";
  const currentPrice = quote?.price ?? latestTarget?.current_price ?? null;
  const impliedUpsidePct = currentPrice && latestTarget?.mean_target ? ((latestTarget.mean_target - currentPrice) / currentPrice) * 100 : null;
  const quotePositive = typeof quote?.change === "number" ? quote.change >= 0 : null;
  const pace = buildPaceSummary({
    startDate: originalTarget?.captured_at ?? null,
    startPrice: originalTarget?.current_price ?? null,
    targetPrice: originalTarget?.mean_target ?? null,
    currentPrice,
  });
  const latestResearch = research[0] || null;
  const riskOutputs = agentOutputs.filter((output) => output.agent_name === "bear-case-agent" || (output.normalized_score ?? 0) < -0.15).slice(0, 3);

  return (
    <AppShell viewer={user}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/symbols" className="text-sm text-zinc-400 hover:text-zinc-100">← Back to symbols</Link>
          <div className="flex flex-wrap gap-2 text-xs text-zinc-400">
            <Link href="/performance" className="rounded-full border border-zinc-700 px-3 py-1 hover:border-sky-500/60 hover:text-sky-300">Estimate tracking</Link>
            <Link href="/research" className="rounded-full border border-zinc-700 px-3 py-1 hover:border-sky-500/60 hover:text-sky-300">Research archive</Link>
            <Link href="/fundamentals" className="rounded-full border border-zinc-700 px-3 py-1 hover:border-sky-500/60 hover:text-sky-300">Fundamentals archive</Link>
          </div>
        </div>

        <section className="rounded-3xl border border-zinc-800 bg-zinc-950/70 p-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                {symbol.logo_url ? <img src={symbol.logo_url} alt="" className="h-12 w-12 rounded-full bg-white object-contain p-1" /> : null}
                <div>
                  <p className="text-xs uppercase tracking-wide text-sky-400">Symbol intelligence</p>
                  <h1 className="mt-1 text-3xl font-bold text-zinc-50">{symbol.ticker}</h1>
                  <p className="mt-1 text-sm text-zinc-400">{symbol.name || "Tracked symbol"}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-zinc-400">
                <span className="rounded-full border border-zinc-700 px-2 py-1">{symbol.asset_type || "stock"}{symbol.is_etf ? " · ETF" : ""}</span>
                {symbol.exchange ? <span className="rounded-full border border-zinc-700 px-2 py-1">{symbol.exchange}</span> : null}
                {symbol.sector ? <span className="rounded-full border border-zinc-700 px-2 py-1">{symbol.sector}</span> : null}
                {symbol.industry ? <span className="rounded-full border border-zinc-700 px-2 py-1">{symbol.industry}</span> : null}
                {symbol.web_url ? <a href={symbol.web_url} target="_blank" rel="noreferrer" className="rounded-full border border-zinc-700 px-2 py-1 hover:border-sky-500/60 hover:text-sky-300">Website</a> : null}
              </div>
            </div>

            <div className="grid min-w-[min(100%,520px)] gap-3 sm:grid-cols-2">
              <MetricCard label="Current quote" value={formatMoney(currentPrice, currency)} detail={quote?.fetched_at ? `Updated ${formatAppDateTime(quote.fetched_at)}` : "No quote snapshot yet"} />
              <MetricCard label="Daily move" value={quotePositive === null || typeof quote?.change !== "number" ? "—" : `${quotePositive ? "+" : ""}${quote.change.toFixed(2)} (${quotePositive ? "+" : ""}${(quote.percent_change ?? 0).toFixed(2)}%)`} tone={quotePositive === null ? "zinc" : quotePositive ? "emerald" : "rose"} />
              <MetricCard label="Consensus target" value={formatMoney(latestTarget?.mean_target ?? null, currency)} detail={latestTarget?.captured_at ? formatAppDateTime(latestTarget.captured_at) : "No target captured yet"} tone="sky" />
              <MetricCard label="Implied upside" value={formatPercent(impliedUpsidePct)} detail="Current price vs consensus target" tone={impliedUpsidePct === null ? "zinc" : impliedUpsidePct >= 0 ? "emerald" : "rose"} />
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
          <div className="space-y-6">
            <SectionCard title="Expectation chart" description={`Quote history against the captured analyst target path. Times shown in ${getAppTimeZoneLabel()}.`}>
              <ExpectationChart currency={currency} startDate={originalTarget?.captured_at ?? null} startPrice={originalTarget?.current_price ?? null} targetPrice={originalTarget?.mean_target ?? null} currentPrice={currentPrice} priceHistory={priceHistory} />
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-zinc-400">
                <span className={`rounded-full border px-3 py-1 ${getPaceClasses(pace.status)}`}>{formatPaceLabel(pace.status)}</span>
                <span className="rounded-full border border-zinc-700 px-3 py-1">Expected today {formatMoney(pace.expectedPriceToday, currency)}</span>
                <span className="rounded-full border border-zinc-700 px-3 py-1">Delta {formatMoney(pace.deltaValue, currency)} ({formatPercent(pace.deltaPct)})</span>
              </div>
            </SectionCard>

            <SectionCard title="Research notes" description="Latest thesis, news corroboration, and source evidence for this symbol.">
              {research.length ? (
                <div className="space-y-3">
                  {research.map((item) => {
                    const evidence = item.evidence_json || [];
                    return (
                      <div key={item.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-semibold text-zinc-100">{item.title}</p>
                            <p className="mt-1 text-xs uppercase tracking-wide text-zinc-500">{item.direction || "mixed"}{typeof item.confidence_score === "number" ? ` · ${formatConfidencePercent(item.confidence_score)} confidence` : ""}{item.time_horizon ? ` · ${item.time_horizon}` : ""}</p>
                          </div>
                          <span className="rounded-full border border-zinc-700 px-2 py-1 text-xs text-zinc-300">{formatAppDateTime(item.created_at)}</span>
                        </div>
                        <p className="mt-3 text-sm text-zinc-300">{item.summary || "No summary provided."}</p>
                        {item.thesis ? <p className="mt-2 text-sm text-zinc-500">{item.thesis}</p> : null}
                        {evidence.length ? (
                          <div className="mt-3 grid gap-2 md:grid-cols-2">
                            {evidence.slice(0, 4).map((source, index) => (
                              <a key={`${item.id}-${index}-${source.url || source.title}`} href={source.url || "#"} target="_blank" rel="noreferrer" className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 hover:border-zinc-700">
                                <p className="line-clamp-2 text-sm font-medium text-zinc-100">{source.title || source.url || "Source"}</p>
                                <p className="mt-1 text-xs text-zinc-500">{source.source || source.source_type || "Source"}{source.published_at ? ` · ${formatAppDateTime(source.published_at)}` : ""}</p>
                              </a>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">No research notes captured yet.</div>}
            </SectionCard>
          </div>

          <div className="space-y-6">
            <SectionCard title="Fundamentals" description={fundamentals?.fetched_at ? `Latest snapshot ${formatAppDateTime(fundamentals.fetched_at)}` : "Latest company fundamentals."}>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <MetricCard label="P/E" value={formatRatio(fundamentals?.pe_ttm ?? null)} />
                <MetricCard label="P/B" value={formatRatio(fundamentals?.pb_ttm ?? null)} />
                <MetricCard label="P/S" value={formatRatio(fundamentals?.ps_ttm ?? null)} />
                <MetricCard label="Market cap" value={formatMarketCap(fundamentals?.market_cap_m ?? symbol.market_cap)} />
                <MetricCard label="Revenue growth" value={formatPlainPercent(fundamentals?.revenue_growth_ttm ?? null)} />
                <MetricCard label="EPS growth 5Y" value={formatPlainPercent(fundamentals?.eps_growth_5y ?? null)} />
                <MetricCard label="Net margin" value={formatPlainPercent(fundamentals?.net_margin_ttm ?? null)} />
                <MetricCard label="ROE" value={formatPlainPercent(fundamentals?.roe_ttm ?? null)} />
              </div>
            </SectionCard>

            <SectionCard title="Target history" description="Most recent consensus target captures.">
              {targetHistory.length ? (
                <div className="space-y-2">
                  {targetHistory.slice(0, 6).map((target) => (
                    <div key={`${target.captured_at}-${target.mean_target}`} className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-zinc-100">{formatMoney(target.mean_target, currency)}</p>
                          <p className="mt-1 text-xs text-zinc-500">Median {formatMoney(target.median_target, currency)} · Range {formatMoney(target.low_target, currency)}–{formatMoney(target.high_target, currency)}</p>
                        </div>
                        <span className="text-xs text-zinc-500">{formatAppDateTime(target.captured_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">No target snapshots yet.</div>}
            </SectionCard>

            <SectionCard title="Risks & agent notes" description="Bear cases and material negative signals, with recent agent context.">
              {riskOutputs.length || latestResearch ? (
                <div className="space-y-3">
                  {riskOutputs.map((output) => (
                    <div key={output.id} className="rounded-xl border border-rose-900/50 bg-rose-950/10 p-3">
                      <p className="text-xs uppercase tracking-wide text-rose-300">{output.agent_name}</p>
                      <p className="mt-2 text-sm text-zinc-300">{output.summary || output.thesis || "No risk summary provided."}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-400">
                        {formatNormalizedScore(output.normalized_score) ? <span className="rounded-full border border-zinc-700 px-2 py-1">Signal {formatNormalizedScore(output.normalized_score)}</span> : null}
                        {getReadableBiasLabel(output.action_bias) ? <span className="rounded-full border border-zinc-700 px-2 py-1">{getReadableBiasLabel(output.action_bias)}</span> : null}
                      </div>
                    </div>
                  ))}
                  {!riskOutputs.length && latestResearch ? <p className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3 text-sm text-zinc-400">No dedicated bear-case note captured. Latest research direction is {latestResearch.direction || "mixed"}.</p> : null}
                </div>
              ) : <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">No risk notes captured yet.</div>}
            </SectionCard>

            <SectionCard title="Portfolio exposure" description="Where this ticker currently appears.">
              {positions.length ? (
                <div className="space-y-2">
                  {positions.map((position, index) => {
                    const portfolio = firstRelation(position.portfolios);
                    const marketValue = typeof position.quantity === "number" && currentPrice !== null ? position.quantity * currentPrice : null;
                    return (
                      <div key={`${portfolio?.name || "portfolio"}-${index}`} className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
                        <p className="text-sm font-semibold text-zinc-100">{portfolio?.name || "Portfolio"}</p>
                        <p className="mt-1 text-xs text-zinc-500">Qty {position.quantity ?? "—"} · Avg cost {formatMoney(position.average_cost, position.average_cost_currency || currency)} · Value {formatMoney(marketValue, currency)}</p>
                        {position.notes ? <p className="mt-2 text-sm text-zinc-400">{position.notes}</p> : null}
                      </div>
                    );
                  })}
                </div>
              ) : <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">Not currently held in a portfolio.</div>}
            </SectionCard>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
