import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";

export default function AgentActivityPage() {
  return (
    <AppShell>
      <SectionCard
        title="Agent Activity"
        description="Daily news scans, fundamental refreshes, macro notes, and explanation traces will show up here."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
            <h3 className="text-base font-semibold text-zinc-100">Today</h3>
            <p className="mt-2 text-sm text-zinc-400">No jobs scheduled yet.</p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
            <h3 className="text-base font-semibold text-zinc-100">Planned agent feeds</h3>
            <ul className="mt-2 space-y-2 text-sm text-zinc-400">
              <li>News and event agent</li>
              <li>Fundamental agent</li>
              <li>Macro regime agent</li>
              <li>Portfolio manager summaries</li>
            </ul>
          </div>
        </div>
      </SectionCard>
    </AppShell>
  );
}
