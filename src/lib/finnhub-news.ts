type FinnhubNewsItem = {
  category?: string;
  datetime?: number;
  headline?: string;
  id?: number;
  image?: string;
  related?: string;
  source?: string;
  summary?: string;
  url?: string;
};

type NewsItem = {
  title: string;
  url: string;
  source: string;
  published_at?: string | null;
  snippet?: string | null;
  source_type: "finnhub";
};

function getFinnhubKey() {
  return process.env.FINNHUB_API_KEY || "";
}

export async function getFinnhubCompanyNews(symbol: string): Promise<NewsItem[]> {
  const apiKey = getFinnhubKey();
  if (!apiKey || !symbol.trim()) {
    return [];
  }

  const to = new Date();
  const from = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7);
  const url = new URL("https://finnhub.io/api/v1/company-news");
  url.searchParams.set("symbol", symbol.trim().toUpperCase());
  url.searchParams.set("from", from.toISOString().slice(0, 10));
  url.searchParams.set("to", to.toISOString().slice(0, 10));
  url.searchParams.set("token", apiKey);

  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) {
    return [];
  }

  const json = (await response.json()) as FinnhubNewsItem[];
  return (json || [])
    .filter((item) => item.headline && item.url)
    .slice(0, 5)
    .map((item) => ({
      title: item.headline || symbol,
      url: item.url || "",
      source: item.source || "Finnhub",
      published_at: item.datetime ? new Date(item.datetime * 1000).toISOString() : null,
      snippet: item.summary || null,
      source_type: "finnhub" as const,
    }));
}
