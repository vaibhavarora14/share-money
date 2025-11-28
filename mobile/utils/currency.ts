import { Currency } from "../types";

/**
 * Currency symbol mapping
 * Aligned with backend CURRENCY_SYMBOLS for consistency
 */
const CURRENCY_SYMBOLS: Record<string, string> = {
  'USD': '$',
  'INR': '₹',
  'EUR': '€',
  'GBP': '£',
  'JPY': '¥',
  'KRW': '₩',
  'CNY': '¥',
  'AUD': 'A$',
  'CAD': 'C$',
};

/**
 * Common currencies with their symbols and names
 * Used for currency picker UI
 */
export const CURRENCIES: Currency[] = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'KRW', symbol: '₩', name: 'South Korean Won' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
];

/**
 * Gets the default currency code from environment variable
 * Defaults to INR for frontend (can be overridden via EXPO_PUBLIC_DEFAULT_CURRENCY)
 * Note: Backend defaults to USD, but frontend uses INR by default for user preference
 * @returns Currency code string (e.g., 'INR', 'USD')
 */
export function getDefaultCurrency(): string {
  return process.env.EXPO_PUBLIC_DEFAULT_CURRENCY || 'INR';
}

/**
 * Gets the currency symbol for a given currency code
 * Uses case-insensitive lookup and falls back to '$' if currency not found
 * @param currencyCode - Currency code (e.g., 'USD', 'INR'). Defaults to default currency
 * @returns Currency symbol string (e.g., '$', '₹')
 */
export function getCurrencySymbol(currencyCode: string = getDefaultCurrency()): string {
  const normalizedCode = currencyCode.toUpperCase();
  return CURRENCY_SYMBOLS[normalizedCode] || CURRENCY_SYMBOLS['USD'] || '$';
}

/**
 * Formats currency amount for display with thousands separators
 * Uses en-US locale for comma formatting (e.g., 1000 -> 1,000.00)
 * Handles currencies without decimals (JPY, KRW) and negative amounts
 * @param amount - Amount to format (number)
 * @param currencyCode - Currency code (e.g., 'USD', 'INR'). Defaults to default currency
 * @returns Formatted currency string (e.g., "$1,000.00" or "₹1,000.00")
 */
export function formatCurrency(amount: number, currencyCode: string = getDefaultCurrency()): string {
  let normalizedCode = currencyCode.toUpperCase();
  // Validate currency code
  if (!CURRENCY_SYMBOLS[normalizedCode]) {
    normalizedCode = getDefaultCurrency();
  }
  const symbol = getCurrencySymbol(normalizedCode);
  // For currencies like JPY that don't use decimals
  const decimals = ['JPY', 'KRW'].includes(normalizedCode) ? 0 : 2;
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
