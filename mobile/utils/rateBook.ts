import { Group } from "../types";
import {
  emptyRateBook,
  pairKey,
  type RateBook,
  type RateSource,
  withOverrides,
} from "./currencyMerge";
import { createPreviewRateBook } from "./previewRates";

export type RatesResponse = {
  as_of?: string | null;
  usd_rates?: Record<string, number>;
  overrides?: Array<{
    from: string;
    to: string;
    rate: number;
    source?: Exclude<RateSource, "market">;
    updated_at?: string;
  }>;
  stale?: boolean;
  providers?: string[];
};

export function rateBookFromResponse(response: RatesResponse | null | undefined): RateBook | null {
  if (!response || !response.usd_rates || Object.keys(response.usd_rates).length === 0) {
    return null;
  }

  const book = emptyRateBook(response.usd_rates);
  book.asOf = response.as_of || undefined;
  for (const override of response.overrides || []) {
    if (!override?.from || !override?.to || !Number.isFinite(override.rate) || override.rate <= 0) {
      continue;
    }
    book.overrides[pairKey(override.from, override.to)] = {
      rate: override.rate,
      source: override.source === "expense" ? "expense" : "group",
    };
  }
  return book;
}

export function overrideMapFromResponse(
  response: RatesResponse | null | undefined
): Record<string, number> {
  const overrides: Record<string, number> = {};
  for (const override of response?.overrides || []) {
    if (!override?.from || !override?.to || !Number.isFinite(override.rate) || override.rate <= 0) {
      continue;
    }
    overrides[pairKey(override.from, override.to)] = override.rate;
  }
  return overrides;
}

export function groupSettingsFromGroup(
  group: Pick<Group, "settlement_currency" | "unify_balances"> | null | undefined,
  fallbackCurrency: string,
  customRates: Record<string, number> = {}
) {
  return {
    enabled: group?.unify_balances === true,
    settlementCurrency: (group?.settlement_currency || fallbackCurrency).toUpperCase(),
    customRates,
  };
}

export function resolveRateBook(
  serverBook: RateBook | null | undefined,
  customRates: Record<string, number> = {}
): RateBook {
  if (serverBook) {
    return withOverrides(serverBook, customRates, "group");
  }
  return createPreviewRateBook(customRates);
}
