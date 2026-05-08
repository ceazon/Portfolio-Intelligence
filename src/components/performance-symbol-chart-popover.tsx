"use client";

import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/performance-metrics";
import { formatAppDateTime } from "@/lib/time";

type PricePoint = {
  capturedAt: string;
  price: number;
};

type PerformanceSymbolChartPopoverProps = {
  ticker: string;
  name: string | null;
  currency: string;
  startDate: string | null;
  startPrice: number | null;
  targetPrice: number | null;
  currentPrice: number | null;
  priceHistory: PricePoint[];
};

const CHART_WIDTH = 640;
const CHART_HEIGHT = 260;
const PADDING = 34;
const TARGET_HORIZON_DAYS = 365;

function daysBetween(startDate: Date, endDate: Date) {
  return Math.max(0, (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
}

function expectedPriceAtDay(startPrice: number, targetPrice: number, day: number) {
  const clampedDay = Math.max(0, Math.min(TARGET_HORIZON_DAYS, day));
  return startPrice + ((targetPrice - startPrice) * clampedDay) / TARGET_HORIZON_DAYS;
}

function formatCompactDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric" }).format(new Date(value));
}

function buildPath(points: { x: number; y: number }[]) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
}

export function PerformanceSymbolChartPopover({
  ticker,
  name,
  currency,
  startDate,
  startPrice,
  targetPrice,
  currentPrice,
  priceHistory,
}: PerformanceSymbolChartPopoverProps) {
  const [open, setOpen] = useState(false);

  const chart = useMemo(() => {
    if (!startDate || startPrice === null || targetPrice === null) {
      return null;
    }

    const start = new Date(startDate);
    if (Number.isNaN(start.getTime())) {
      return null;
    }

    const datedActual = priceHistory
      .filter((point) => Number.isFinite(point.price))
      .map((point) => ({ ...point, date: new Date(point.capturedAt) }))
      .filter((point) => !Number.isNaN(point.date.getTime()) && point.date >= start)
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    const now = new Date();
    const latestActualDate = datedActual.at(-1)?.date ?? now;
    const elapsedDays = Math.max(1, daysBetween(start, latestActualDate));
    const chartDays = Math.max(7, elapsedDays);
    const expectedToday = expectedPriceAtDay(startPrice, targetPrice, daysBetween(start, latestActualDate));

    const actualPoints = [{ capturedAt: startDate, price: startPrice, date: start }, ...datedActual]
      .filter((point, index, list) => index === 0 || point.capturedAt !== list[index - 1]?.capturedAt);
    const expectedPoints = [
      { day: 0, price: startPrice },
      { day: chartDays, price: expectedPriceAtDay(startPrice, targetPrice, chartDays) },
    ];

    const prices = [
      startPrice,
      targetPrice,
      expectedToday,
      currentPrice,
      ...actualPoints.map((point) => point.price),
      ...expectedPoints.map((point) => point.price),
    ].filter((value): value is number => value !== null && Number.isFinite(value));

    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const pricePadding = Math.max(1, (maxPrice - minPrice) * 0.15);
    const yMin = minPrice - pricePadding;
    const yMax = maxPrice + pricePadding;
    const plotWidth = CHART_WIDTH - PADDING * 2;
    const plotHeight = CHART_HEIGHT - PADDING * 2;

    const xForDay = (day: number) => PADDING + (Math.max(0, Math.min(chartDays, day)) / chartDays) * plotWidth;
    const yForPrice = (price: number) => PADDING + ((yMax - price) / Math.max(1, yMax - yMin)) * plotHeight;

    const actualSvgPoints = actualPoints.map((point) => ({
      x: xForDay(daysBetween(start, point.date)),
      y: yForPrice(point.price),
      price: point.price,
      capturedAt: point.capturedAt,
    }));
    const expectedSvgPoints = expectedPoints.map((point) => ({
      x: xForDay(point.day),
      y: yForPrice(point.price),
    }));

    return {
      actualSvgPoints,
      expectedSvgPoints,
      actualPath: buildPath(actualSvgPoints),
      expectedPath: buildPath(expectedSvgPoints),
      startLabel: formatCompactDate(startDate),
      endLabel: formatCompactDate(latestActualDate.toISOString()),
      elapsedDays,
      expectedToday,
      latestActualPrice: actualPoints.at(-1)?.price ?? currentPrice,
      yMin,
      yMax,
    };
  }, [currentPrice, priceHistory, startDate, startPrice, targetPrice]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-left font-semibold text-zinc-100 underline decoration-zinc-700 underline-offset-4 transition hover:text-sky-300 hover:decoration-sky-500"
        title={`Open ${ticker} expectation vs actual chart`}
      >
        {ticker}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-3xl rounded-3xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl shadow-black/60">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-sky-400">Expectation vs actual</p>
                <h3 className="mt-1 text-xl font-bold text-zinc-50">{ticker}</h3>
                <p className="text-sm text-zinc-500">{name || "Tracked symbol"}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-50"
              >
                Close
              </button>
            </div>

            {chart ? (
              <div className="space-y-4">
                <div className="grid gap-3 text-sm sm:grid-cols-3">
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3">
                    <p className="text-xs uppercase tracking-wide text-zinc-500">Start</p>
                    <p className="mt-1 font-semibold text-zinc-100">{formatMoney(startPrice, currency)}</p>
                    <p className="text-xs text-zinc-500">{startDate ? formatAppDateTime(startDate) : "—"}</p>
                  </div>
                  <div className="rounded-2xl border border-sky-900/70 bg-sky-950/20 p-3">
                    <p className="text-xs uppercase tracking-wide text-sky-400">Expected now</p>
                    <p className="mt-1 font-semibold text-sky-200">{formatMoney(chart.expectedToday, currency)}</p>
                    <p className="text-xs text-zinc-500">Linear path to target</p>
                  </div>
                  <div className="rounded-2xl border border-emerald-900/70 bg-emerald-950/20 p-3">
                    <p className="text-xs uppercase tracking-wide text-emerald-400">Actual latest</p>
                    <p className="mt-1 font-semibold text-emerald-200">{formatMoney(chart.latestActualPrice ?? null, currency)}</p>
                    <p className="text-xs text-zinc-500">Target {formatMoney(targetPrice, currency)}</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-black/30 p-3">
                  <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="h-auto w-full" role="img" aria-label={`${ticker} expected price path compared with actual price history`}>
                    <line x1={PADDING} y1={CHART_HEIGHT - PADDING} x2={CHART_WIDTH - PADDING} y2={CHART_HEIGHT - PADDING} stroke="#3f3f46" strokeWidth="1" />
                    <line x1={PADDING} y1={PADDING} x2={PADDING} y2={CHART_HEIGHT - PADDING} stroke="#3f3f46" strokeWidth="1" />
                    <text x={PADDING} y={CHART_HEIGHT - 8} fill="#71717a" fontSize="12">{chart.startLabel}</text>
                    <text x={CHART_WIDTH - PADDING - 48} y={CHART_HEIGHT - 8} fill="#71717a" fontSize="12">{chart.endLabel}</text>
                    <text x={PADDING + 4} y={PADDING - 10} fill="#71717a" fontSize="12">{formatMoney(chart.yMax, currency)}</text>
                    <text x={PADDING + 4} y={CHART_HEIGHT - PADDING - 8} fill="#71717a" fontSize="12">{formatMoney(chart.yMin, currency)}</text>

                    <path d={chart.expectedPath} fill="none" stroke="#38bdf8" strokeDasharray="6 5" strokeLinecap="round" strokeWidth="3" />
                    <path d={chart.actualPath} fill="none" stroke="#34d399" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
                    {chart.actualSvgPoints.map((point) => (
                      <circle key={`${point.capturedAt}-${point.price}`} cx={point.x} cy={point.y} r="4" fill="#34d399" stroke="#052e16" strokeWidth="2" />
                    ))}
                  </svg>
                  <div className="mt-3 flex flex-wrap gap-4 text-xs text-zinc-400">
                    <span className="inline-flex items-center gap-2"><span className="h-0.5 w-6 rounded bg-emerald-400" /> Actual price</span>
                    <span className="inline-flex items-center gap-2"><span className="h-0.5 w-6 rounded border-t-2 border-dashed border-sky-400" /> Expected path</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">
                Not enough target and price history to chart this symbol yet.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
