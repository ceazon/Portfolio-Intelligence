import { ImportSymbolForm } from "@/components/import-symbol-form";
import { hasFinnhubKey } from "@/lib/finnhub";

type WatchlistOption = {
  id: string;
  name: string;
};

export function SymbolImportPanel({ watchlists }: { watchlists: WatchlistOption[] }) {
  if (!hasFinnhubKey()) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
        Add <span className="font-semibold">FINNHUB_API_KEY</span> to local and Vercel env vars to enable live symbol search and import.
      </div>
    );
  }

  return <ImportSymbolForm watchlists={watchlists} />;
}
