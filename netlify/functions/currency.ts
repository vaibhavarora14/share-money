/**
 * Currency formatting utilities
 */

/**
 * Formats currency amount for display
 * @param amount - Amount to format (number or string)
 * @returns Formatted currency string (e.g., "$50.00")
 */
export function formatCurrency(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '$0.00';
  return `$${num.toFixed(2)}`;
}
