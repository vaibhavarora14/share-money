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
 *         Returns formatted amount without symbol if currencyCode is invalid (safe fallback)
 */
export function formatCurrency(amount: number | string, currencyCode: string): string {
  // Safe fallback: if currency is invalid, return formatted amount without symbol
  if (!currencyCode || typeof currencyCode !== 'string' || currencyCode.trim() === '') {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(num)) {
      return '0.00';
    }
    return Math.abs(num).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  const normalizedCode = currencyCode.trim().toUpperCase();
  
  // Validate ISO 4217 format (3 uppercase letters)
  if (!/^[A-Z]{3}$/.test(normalizedCode)) {
    // Invalid format - return formatted amount without symbol as fallback
    if (isNaN(num)) {
      return '0.00';
    }
    return Math.abs(num).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  
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
