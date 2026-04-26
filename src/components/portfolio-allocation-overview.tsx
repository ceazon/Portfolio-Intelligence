type Slice = {
  label: string;
  weight: number;
  value: number;
  targetWeight: number | null;
  comparisonBaselineWeight?: number | null;
};

function polarToCartesian(cx: number, cy: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians),
  };
}

function describeArc(cx: number, cy: number, radius: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return ["M", cx, cy, "L", start.x, start.y, "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y, "Z"].join(" ");
}

const COLORS = ["#38bdf8", "#818cf8", "#34d399", "#f59e0b", "#f472b6", "#fb7185", "#22d3ee", "#a78bfa"];

export function PortfolioAllocationOverview({
  title,
  description,
  slices,
  compareMode = false,
}: {
  title: string;
  description: string;
  slices: Slice[];
  compareMode?: boolean;
}) {
  const normalized = slices.filter((slice) => slice.weight > 0.01);
  let currentAngle = 0;

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-zinc-100">{title}</h3>
        <p className="mt-1 text-sm text-zinc-400">{description}</p>
      </div>

      {normalized.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-[240px_1fr] lg:items-center">
          <div className="flex items-center justify-center">
            <svg viewBox="0 0 220 220" className="h-56 w-56">
              {normalized.map((slice, index) => {
                const sweep = (slice.weight / 100) * 360;
                const path = describeArc(110, 110, 90, currentAngle, currentAngle + sweep);
                const element = <path key={slice.label} d={path} fill={COLORS[index % COLORS.length]} stroke="#09090b" strokeWidth="2" />;
                currentAngle += sweep;
                return element;
              })}
              <circle cx="110" cy="110" r="42" fill="#09090b" />
              <text x="110" y="105" textAnchor="middle" className="fill-zinc-100 text-[12px] font-semibold">
                {compareMode ? "Target" : "Current"}
              </text>
              <text x="110" y="123" textAnchor="middle" className="fill-zinc-500 text-[10px]">
                Weights
              </text>
            </svg>
          </div>

          <div className="space-y-2">
            {normalized.map((slice, index) => {
                const baseline = slice.comparisonBaselineWeight ?? (compareMode ? slice.targetWeight : slice.weight);
                const delta = slice.targetWeight !== null && baseline !== null ? slice.targetWeight - baseline : null;
                return (
                  <div key={slice.label} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                      <span className="truncate text-zinc-200">{slice.label}</span>
                    </div>
                    <div className="flex items-center gap-3 text-right">
                      <span className="text-zinc-100">{slice.weight.toFixed(1)}%</span>
                      {delta !== null ? (
                        <span className={delta > 0.05 ? "text-emerald-300" : delta < -0.05 ? "text-rose-300" : "text-zinc-500"}>
                          {delta > 0 ? "+" : ""}
                          {delta.toFixed(1)} pts
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-400">No holdings yet. Add positions to see the allocation mix.</div>
      )}
    </div>
  );
}
