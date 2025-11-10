import { Currency } from "../types";

// Default currency from environment variable, fallback to INR
export const DEFAULT_CURRENCY = process.env.EXPO_PUBLIC_DEFAULT_CURRENCY || 'INR';

// Common currencies with their symbols
export const CURRENCIES: Currency[] = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
  { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar' },
  { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso' },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real' },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand' },
  { code: 'KRW', symbol: '₩', name: 'South Korean Won' },
];

export function getCurrencySymbol(currencyCode: string = DEFAULT_CURRENCY): string {
  const currency = CURRENCIES.find(c => c.code === currencyCode);
  return currency?.symbol || '$';
}

export function formatCurrency(amount: number, currencyCode: string = DEFAULT_CURRENCY): string {
  const symbol = getCurrencySymbol(currencyCode);
  // For currencies like JPY that don't use decimals
  const decimals = ['JPY', 'KRW'].includes(currencyCode) ? 0 : 2;
  return `${symbol}${Math.abs(amount).toFixed(decimals)}`;
}
