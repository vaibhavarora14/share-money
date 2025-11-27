/**
 * Currency formatting utilities
 */

/**
 * Currency symbol mapping
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
 * Default currency code
 */
const DEFAULT_CURRENCY = 'USD';

/**
 * Formats currency amount for display
 * @param amount - Amount to format (number or string)
 * @param currencyCode - Currency code (e.g., 'USD', 'INR'). Defaults to 'USD'
 * @returns Formatted currency string (e.g., "$50.00" or "₹50.00")
 */
export function formatCurrency(amount: number | string, currencyCode: string = DEFAULT_CURRENCY): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) {
    const symbol = CURRENCY_SYMBOLS[currencyCode.toUpperCase()] || '$';
    return `${symbol}0.00`;
  }
  
  const symbol = CURRENCY_SYMBOLS[currencyCode.toUpperCase()] || CURRENCY_SYMBOLS[DEFAULT_CURRENCY] || '$';
  // For currencies like JPY that don't use decimals
  const decimals = ['JPY', 'KRW'].includes(currencyCode.toUpperCase()) ? 0 : 2;
  const formattedAmount = Math.abs(num).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${symbol}${formattedAmount}`;
}
