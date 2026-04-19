export type SupportedCurrency = "USD" | "CAD";

const DEFAULT_USD_CAD_RATE = 1.39;

function getFxRatesToUsd(usdCadRate = DEFAULT_USD_CAD_RATE): Record<SupportedCurrency, number> {
  return {
    USD: 1,
    CAD: 1 / usdCadRate,
  };
}

export function normalizeCurrency(value: string | null | undefined): SupportedCurrency {
  return value === "CAD" ? "CAD" : "USD";
}

export function convertMoney(value: number | null, fromCurrency: SupportedCurrency, toCurrency: SupportedCurrency, usdCadRate = DEFAULT_USD_CAD_RATE) {
  if (value === null || Number.isNaN(value)) {
    return null;
  }

  const fxRatesToUsd = getFxRatesToUsd(usdCadRate);
  const usdValue = value * fxRatesToUsd[fromCurrency];
  if (toCurrency === "USD") {
    return usdValue;
  }

  return usdValue / fxRatesToUsd[toCurrency];
}

export function formatMoney(value: number | null, currency: SupportedCurrency) {
  if (value === null || Number.isNaN(value)) {
    return "--";
  }

  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatQuantity(value: number) {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: 4,
  });
}
