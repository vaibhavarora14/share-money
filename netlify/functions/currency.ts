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
 * Formats currency amount for display
 * @param amount - Amount to format (number or string)
 * @param currencyCode - Currency code (e.g., 'USD', 'INR'). Required, no default.
 * @returns Formatted currency string (e.g., "$50.00" or "₹50.00")
 * @throws Error if currencyCode is not provided or invalid
 */
export function formatCurrency(amount: number | string, currencyCode: string): string {
  if (!currencyCode || typeof currencyCode !== 'string' || currencyCode.trim() === '') {
    throw new Error('Currency code is required');
  }
  
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  const normalizedCode = currencyCode.toUpperCase();
  
  if (isNaN(num)) {
    const symbol = CURRENCY_SYMBOLS[normalizedCode] || normalizedCode;
    return `${symbol}0.00`;
  }
  
  const symbol = CURRENCY_SYMBOLS[normalizedCode] || normalizedCode;
  // For currencies like JPY that don't use decimals
  const decimals = ['JPY', 'KRW'].includes(normalizedCode) ? 0 : 2;
  const formattedAmount = Math.abs(num).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${symbol}${formattedAmount}`;
}
