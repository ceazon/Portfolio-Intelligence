import { getFmpProfile, getFmpQuote, searchFmpSymbols } from "@/lib/fmp";

type ImportSymbolResult = {
  description: string;
  displaySymbol: string;
  symbol: string;
  type: string;
};

export function normalizeImportSymbol(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

export function findImportSymbolMatch(results: ImportSymbolResult[], selectedSymbol: string | null | undefined) {
  const normalizedSelectedSymbol = normalizeImportSymbol(selectedSymbol);

  if (!normalizedSelectedSymbol) {
    return results[0] ?? null;
  }

  return results.find((item) => normalizeImportSymbol(item.symbol) === normalizedSelectedSymbol) || results[0] || null;
}

function classifyAssetType(type: string | undefined, exchange: string | undefined) {
  const value = `${type || ""} ${exchange || ""}`.toLowerCase();
  if (value.includes("etf")) {
    return { assetType: "etf", isEtf: true };
  }

  return { assetType: "stock", isEtf: false };
}

export async function searchImportSymbols(query: string): Promise<ImportSymbolResult[]> {
  const results = await searchFmpSymbols(query);

  return results.map((item) => ({
    description: item.name || item.symbol,
    displaySymbol: item.symbol,
    symbol: item.symbol,
    type: item.type || item.exchangeFullName || item.exchange || "stock",
  }));
}

export async function getImportSymbolSeed(symbol: string) {
  const [profile, quote] = await Promise.allSettled([getFmpProfile(symbol), getFmpQuote(symbol)]);

  const profileValue = profile.status === "fulfilled" ? profile.value : null;
  const quoteValue = quote.status === "fulfilled" ? quote.value : null;

  const asset = classifyAssetType(undefined, profileValue?.exchange || undefined);

  return {
    name: profileValue?.companyName || symbol,
    exchange: profileValue?.exchangeFullName || profileValue?.exchange || null,
    country: profileValue?.country || null,
    currency: profileValue?.currency || null,
    sector: profileValue?.sector || profileValue?.industry || null,
    industry: profileValue?.industry || profileValue?.sector || null,
    logo_url: profileValue?.image || null,
    web_url: profileValue?.website || null,
    market_cap: profileValue?.mktCap || null,
    ipo_date: profileValue?.ipoDate || null,
    raw_profile: profileValue,
    quote: quoteValue,
    asset_type: asset.assetType,
    is_etf: asset.isEtf,
  };
}
