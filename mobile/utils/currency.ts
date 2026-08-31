import {
  CURRENCIES,
  CURRENCY_SYMBOLS,
  ZERO_DECIMAL_CURRENCIES,
  filterCurrencies,
} from "./isoCurrencies";

export { CURRENCIES, filterCurrencies };

/**
 * Gets the default currency code from environment variable
 * Defaults to INR for frontend (can be overridden via EXPO_PUBLIC_DEFAULT_CURRENCY)
 * @returns Currency code string (e.g., 'INR', 'USD')
 */
export function getDefaultCurrency(): string {
  return process.env.EXPO_PUBLIC_DEFAULT_CURRENCY || 'INR';
}

/**
 * Gets the currency symbol for a given currency code
 * Uses case-insensitive lookup and falls back to the currency code if unknown
 * @param currencyCode - Currency code (e.g., 'USD', 'INR'). Defaults to default currency
 * @returns Currency symbol string (e.g., '$', '₹')
 */
export function getCurrencySymbol(currencyCode: string = getDefaultCurrency()): string {
  const normalizedCode = currencyCode.toUpperCase();
  return CURRENCY_SYMBOLS[normalizedCode] || normalizedCode;
}

function getCurrencyDecimals(currencyCode: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currencyCode.toUpperCase()) ? 0 : 2;
}

/**
 * Formats currency amount for display with thousands separators
 * Uses en-US locale for comma formatting (e.g., 1000 -> 1,000.00)
 * Handles currencies without decimals (JPY, KRW, VND, ...) and negative amounts
 * @param amount - Amount to format (number)
 * @param currencyCode - Currency code (e.g., 'USD', 'INR'). Defaults to default currency
 * @returns Formatted currency string (e.g., "$1,000.00" or "₹1,000.00")
 */
export function formatCurrency(amount: number, currencyCode: string = getDefaultCurrency()): string {
  const normalizedCode = currencyCode.toUpperCase();
  const symbol = getCurrencySymbol(normalizedCode);
  const decimals = getCurrencyDecimals(normalizedCode);
  const formattedAmount = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${symbol}${formattedAmount}`;
}

export const formatTotals = (
  totals: Map<string, number>,
  defaultCurrency: string = getDefaultCurrency()
): string => {
  if (totals.size === 0) return formatCurrency(0, defaultCurrency);
  return Array.from(totals.entries())
    .map(([currency, amount]) => formatCurrency(amount, currency))
    .join(" + ");
};
