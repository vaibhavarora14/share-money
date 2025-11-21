import { Currency } from "../types";

// Common currencies with their symbols
export const CURRENCIES: Currency[] = [
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
];

export function getDefaultCurrency(): string {
  return process.env.EXPO_PUBLIC_DEFAULT_CURRENCY || 'INR';
}

export function getCurrencySymbol(currencyCode: string = getDefaultCurrency()): string {
  const currency = CURRENCIES.find(c => c.code === currencyCode);
  return currency?.symbol || '$';
}

export function formatCurrency(amount: number, currencyCode: string = getDefaultCurrency()): string {
  const symbol = getCurrencySymbol(currencyCode);
  // For currencies like JPY that don't use decimals
  const decimals = ['JPY', 'KRW'].includes(currencyCode) ? 0 : 2;
  const formattedAmount = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${symbol}${formattedAmount}`;
}
