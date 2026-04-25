type AllocationRow = {
  label: string;
  currentWeight: number;
  targetWeight: number;
};

export function PortfolioRebalanceSummary({ rows }: { rows: AllocationRow[] }) {
  const actionable = rows
    .map((row) => ({
      ...row,
      delta: row.targetWeight - row.currentWeight,
    }))
    .filter((row) => Math.abs(row.delta) >= 0.1)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-zinc-100">Rebalance summary</h3>
        <p className="mt-1 text-sm text-zinc-400">A clearer view of what the recommendation set implies for current holdings.</p>
      </div>

      {actionable.length > 0 ? (
        <div className="space-y-2">
          {actionable.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm">
              <div>
                <p className="font-medium text-zinc-100">{row.label}</p>
                <p className="text-zinc-500">
                  Current {row.currentWeight.toFixed(1)}% → Target {row.targetWeight.toFixed(1)}%
                </p>
              </div>
              <div className={row.delta > 0 ? "text-emerald-300" : "text-rose-300"}>
                {row.delta > 0 ? "Add" : "Trim"} {Math.abs(row.delta).toFixed(1)} pts
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-400">
          Current holdings are already close to the recommendation targets.
        </div>
      )}
    </div>
  );
}
