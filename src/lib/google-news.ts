type NewsItem = {
  title: string;
  url: string;
  source: string;
  published_at?: string | null;
  snippet?: string | null;
  source_type: "google-news";
};

function decodeXml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractTag(block: string, tag: string) {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXml(match[1].trim()) : null;
}

export async function getGoogleNewsSearchItems(query: string, limit = 5): Promise<NewsItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    return [];
  }

  const xml = await response.text();
  const items = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];

  return items.slice(0, limit).map((item) => {
    const title = extractTag(item, "title") || query;
    const link = extractTag(item, "link") || "";
    const pubDate = extractTag(item, "pubDate");
    const sourceMatch = item.match(/<source[^>]*>([\s\S]*?)<\/source>/i);

    return {
      title,
      url: link,
      source: sourceMatch ? decodeXml(sourceMatch[1].trim()) : "Google News",
      published_at: pubDate ? new Date(pubDate).toISOString() : null,
      snippet: title,
      source_type: "google-news" as const,
    };
  }).filter((item) => item.url);
}

export async function getGoogleNewsRssItems(ticker: string, name?: string): Promise<NewsItem[]> {
  return getGoogleNewsSearchItems(`${ticker}${name ? ` ${name}` : ""} stock`, 5);
}
