import { getSp500Universe } from "@/lib/discovery";
import { getGoogleNewsSearchItems } from "@/lib/google-news";

export type NewsIdea = {
  ticker: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
  catalyst: string;
  summary: string;
  tone: "bullish" | "bearish" | "mixed";
  score: number;
  sourceCount: number;
  themes: string[];
  evidence: Array<{
    title: string;
    source: string;
    url: string;
    published_at?: string | null;
  }>;
};

type UniverseMember = Awaited<ReturnType<typeof getSp500Universe>>[number];

type CandidateMatch = {
  member: UniverseMember;
  evidence: NewsIdea["evidence"];
  themes: Set<string>;
  bullishHits: number;
  bearishHits: number;
};

const IDEA_QUERIES = [
  { query: "stocks earnings beat analyst upgrade AI demand growth", theme: "earnings or analyst momentum" },
  { query: "stocks rally product launch partnership demand growth", theme: "product or demand catalyst" },
  { query: "market movers stocks to watch today upgrade price target", theme: "market momentum" },
  { query: "S&P 500 stocks strong outlook revenue growth", theme: "growth outlook" },
  { query: "stocks under pressure lawsuit probe downgrade guidance risk", theme: "risk watch" },
];

const BULLISH_TERMS = ["beat", "beats", "surge", "surges", "rally", "jumps", "upgrade", "raises", "raised", "outperform", "growth", "strong", "record", "demand", "partnership", "launch"];
const BEARISH_TERMS = ["downgrade", "falls", "drops", "slumps", "miss", "probe", "lawsuit", "warning", "cut", "weak", "risk", "under pressure", "decline"];
const COMPANY_SUFFIX_PATTERN = /\b(incorporated|inc|corporation|corp|company|co|plc|ltd|limited|class a|class b|common stock|ordinary shares|holdings|holding|group|the)\b/gi;

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeCompanyName(name: string) {
  return name
    .replace(COMPANY_SUFFIX_PATTERN, " ")
    .replace(/[^a-zA-Z0-9\s&-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function candidateAliases(member: UniverseMember) {
  const normalizedName = normalizeCompanyName(member.name || "");
  const aliases = new Set<string>([member.ticker]);
  if (normalizedName.length >= 4) aliases.add(normalizedName);
  const leadingWords = normalizedName.split(" ").slice(0, 2).join(" ");
  if (leadingWords.length >= 4) aliases.add(leadingWords);
  return [...aliases].filter((alias) => alias.length >= 2);
}

function textMentionsAlias(text: string, alias: string) {
  if (/^[A-Z.]{1,6}$/.test(alias)) {
    return new RegExp(`(^|[^A-Z])${escapeRegex(alias)}([^A-Z]|$)`, "i").test(text);
  }

  return new RegExp(`\\b${escapeRegex(alias)}\\b`, "i").test(text);
}

function countTerms(text: string, terms: string[]) {
  const lower = text.toLowerCase();
  return terms.reduce((count, term) => count + (lower.includes(term) ? 1 : 0), 0);
}

function inferCatalyst(themes: string[], bullishHits: number, bearishHits: number) {
  if (bearishHits > bullishHits) return "Risk or selloff watch";
  if (themes.includes("earnings or analyst momentum")) return "Earnings / analyst momentum";
  if (themes.includes("product or demand catalyst")) return "Product or demand catalyst";
  if (themes.includes("growth outlook")) return "Growth outlook";
  return "Market momentum";
}

export async function discoverNewsIdeas(limit = 12): Promise<NewsIdea[]> {
  const universe = await getSp500Universe();
  const aliasEntries = universe.flatMap((member) => candidateAliases(member).map((alias) => ({ alias, member })));
  const matches = new Map<string, CandidateMatch>();

  const queryResults = await Promise.all(
    IDEA_QUERIES.map(async (ideaQuery) => ({
      ...ideaQuery,
      items: await getGoogleNewsSearchItems(ideaQuery.query, 12),
    })),
  );

  for (const result of queryResults) {
    for (const item of result.items) {
      const text = `${item.title} ${item.snippet || ""}`;
      const matchedTicker = new Set<string>();

      for (const { alias, member } of aliasEntries) {
        if (matchedTicker.has(member.ticker)) continue;
        if (!textMentionsAlias(text, alias)) continue;
        matchedTicker.add(member.ticker);

        const existing = matches.get(member.ticker) || {
          member,
          evidence: [],
          themes: new Set<string>(),
          bullishHits: 0,
          bearishHits: 0,
        };

        existing.themes.add(result.theme);
        existing.bullishHits += countTerms(text, BULLISH_TERMS);
        existing.bearishHits += countTerms(text, BEARISH_TERMS);
        if (!existing.evidence.some((evidence) => evidence.url === item.url)) {
          existing.evidence.push({
            title: item.title,
            source: item.source,
            url: item.url,
            published_at: item.published_at || null,
          });
        }
        matches.set(member.ticker, existing);
      }
    }
  }

  return [...matches.values()]
    .map((match) => {
      const sourceCount = match.evidence.length;
      const themes = [...match.themes];
      const tone = match.bearishHits > match.bullishHits ? "bearish" : match.bullishHits > match.bearishHits ? "bullish" : "mixed";
      const score = Math.min(100, Math.round(35 + sourceCount * 13 + themes.length * 8 + Math.max(match.bullishHits, match.bearishHits) * 3));
      const catalyst = inferCatalyst(themes, match.bullishHits, match.bearishHits);
      const leadEvidence = match.evidence[0];

      return {
        ticker: match.member.ticker,
        name: match.member.name,
        sector: match.member.sector,
        industry: match.member.industry,
        catalyst,
        summary: leadEvidence
          ? `${match.member.ticker} surfaced from recent coverage around ${themes.slice(0, 2).join(" and ") || "market momentum"}. Lead item: ${leadEvidence.title}`
          : `${match.member.ticker} surfaced from recent market coverage.`,
        tone,
        score,
        sourceCount,
        themes,
        evidence: match.evidence.slice(0, 3),
      } satisfies NewsIdea;
    })
    .sort((a, b) => b.score - a.score || b.sourceCount - a.sourceCount)
    .slice(0, limit);
}
