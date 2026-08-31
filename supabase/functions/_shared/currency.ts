/**
 * Currency formatting utilities
 */

import { CURRENCY_SYMBOLS, ZERO_DECIMAL_CURRENCIES } from './isoCurrencies.ts';

/**
 * Default currency code
 */
const DEFAULT_CURRENCY = 'USD';

function getCurrencySymbol(currencyCode: string): string {
  const normalized = currencyCode.toUpperCase();
  return CURRENCY_SYMBOLS[normalized] || normalized;
}

function getCurrencyDecimals(currencyCode: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currencyCode.toUpperCase()) ? 0 : 2;
}

/**
 * Formats currency amount for display
 * @param amount - Amount to format (number or string)
 * @param currencyCode - Currency code (e.g., 'USD', 'INR'). Defaults to 'USD'
 * @returns Formatted currency string (e.g., "$50.00" or "₹50.00")
 */
export function formatCurrency(amount: number | string, currencyCode: string = DEFAULT_CURRENCY): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  const symbol = getCurrencySymbol(currencyCode);
  const decimals = getCurrencyDecimals(currencyCode);
  if (isNaN(num)) {
    return `${symbol}${decimals === 0 ? '0' : '0.00'}`;
  }

  const formattedAmount = Math.abs(num).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${symbol}${formattedAmount}`;
}
