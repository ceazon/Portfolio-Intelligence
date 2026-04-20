import { formatConfidencePercent } from "@/lib/agent-output-format";
import { formatAppDateTime } from "@/lib/time";

type EvidenceItem = {
  title?: string;
  source?: string | null;
  published_at?: string | null;
  snippet?: string | null;
  url?: string;
  source_type?: string;
};

type ResearchSymbolCardProps = {
  ticker: string;
  name: string;
  summary: string;
  thesis: string | null;
  direction: string | null;
  confidenceScore: number | null;
  createdAt: string;
  expiresAt: string | null;
  evidence: EvidenceItem[];
};

function getFreshnessLabel(expiresAt: string | null) {
  if (!expiresAt) {
    return "No expiry";
  }

  const now = Date.now();
  const expiry = new Date(expiresAt).getTime();
  if (expiry <= now) {
    return "Needs refresh";
  }

  const hours = Math.round((expiry - now) / (1000 * 60 * 60));
  return hours <= 24 ? `Fresh for ~${hours}h` : "Fresh";
}

export function ResearchSymbolCard({ ticker, name, summary, thesis, direction, confidenceScore, createdAt, expiresAt, evidence }: ResearchSymbolCardProps) {
  const finnhubCount = evidence.filter((item) => item.source_type === "finnhub").length;
  const googleCount = evidence.filter((item) => item.source_type === "google-news").length;
  const corroborated = finnhubCount > 0 && googleCount > 0;

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-zinc-100">
            {ticker}
            <span className="ml-2 text-zinc-400">{name}</span>
          </p>
          <p className="mt-1 text-xs uppercase tracking-wide text-zinc-500">
            {direction || "mixed"}
            {typeof confidenceScore === "number" ? ` · ${formatConfidencePercent(confidenceScore)} confidence` : ""}
            {corroborated ? " · corroborated" : " · single-feed"}
          </p>
        </div>
        <span className="rounded-full border border-zinc-700 px-2 py-1 text-xs text-zinc-300">{getFreshnessLabel(expiresAt)}</span>
      </div>

      <p className="mt-3 text-sm text-zinc-300">{summary}</p>
      {thesis ? <p className="mt-2 text-sm text-zinc-500">{thesis}</p> : null}

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-400">
        <span className="rounded-full border border-zinc-700 px-2 py-1">{formatAppDateTime(createdAt)}</span>
        <span className="rounded-full border border-zinc-700 px-2 py-1">Finnhub {finnhubCount}</span>
        <span className="rounded-full border border-zinc-700 px-2 py-1">Google {googleCount}</span>
        <span className="rounded-full border border-zinc-700 px-2 py-1">{evidence.length} sources</span>
      </div>

      {evidence.length ? (
        <div className="mt-3 space-y-2">
          {evidence.slice(0, 4).map((item, index) => (
            <a
              key={`${ticker}-${index}-${item.url || item.title}`}
              href={item.url || "#"}
              target="_blank"
              rel="noreferrer"
              className="block rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 hover:border-zinc-700"
            >
              <p className="text-sm font-medium text-zinc-100">{item.title || item.url || "Source"}</p>
              <p className="mt-1 text-xs text-zinc-500">
                {item.source || item.source_type || "Source"}
                {item.published_at ? ` · ${formatAppDateTime(item.published_at)}` : ""}
              </p>
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
