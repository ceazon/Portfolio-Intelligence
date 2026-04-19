export type SupportedCurrency = "USD" | "CAD";

const FX_RATES_TO_USD: Record<SupportedCurrency, number> = {
  USD: 1,
  CAD: 1 / 1.39,
};

export function normalizeCurrency(value: string | null | undefined): SupportedCurrency {
  return value === "CAD" ? "CAD" : "USD";
}

export function convertMoney(value: number | null, fromCurrency: SupportedCurrency, toCurrency: SupportedCurrency) {
  if (value === null || Number.isNaN(value)) {
    return null;
  }

  const usdValue = value * FX_RATES_TO_USD[fromCurrency];
  if (toCurrency === "USD") {
    return usdValue;
  }

  return usdValue / FX_RATES_TO_USD[toCurrency];
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
