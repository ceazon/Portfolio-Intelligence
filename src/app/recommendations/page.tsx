import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";

export default function RecommendationsPage() {
  return (
    <AppShell>
      <SectionCard
        title="Recommendations"
        description="Monthly portfolio suggestions, thesis summaries, and confidence-based actions will live here."
      >
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">
          Recommendation engine not active yet. Once the first scoring pipeline is built, this page will show add, hold, trim, and remove calls.
        </div>
      </SectionCard>
    </AppShell>
  );
}
