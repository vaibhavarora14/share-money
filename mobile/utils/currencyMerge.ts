import { Balance } from "../types";
import { DebtEdge } from "./debt";
import { formatCurrency, getDefaultCurrency } from "./currency";

export type RateSource = "market" | "group" | "expense";

export type RateQuote = {
  from: string;
  to: string;
  /** How many `to` units one `from` unit is worth. */
  rate: number;
  source: RateSource;
  asOf?: string;
};

export type RateOverride = {
  rate: number;
  source: Exclude<RateSource, "market">;
};

export type RateBook = {
  /** Units of each currency per 1 USD. */
  usdRates: Record<string, number>;
  /** Pair overrides keyed as `FROM:TO`, e.g. `EUR:INR`. */
  overrides: Record<string, RateOverride>;
  asOf?: string;
};

export type ConvertedPart = {
  currency: string;
  original: number;
  converted: number;
  quote: RateQuote;
};

export type UnifiedTotal = {
  amount: number;
  currency: string;
  parts: ConvertedPart[];
  missing: string[];
};

const PAIR_SEPARATOR = ":";

export function pairKey(from: string, to: string): string {
  return `${from.toUpperCase()}${PAIR_SEPARATOR}${to.toUpperCase()}`;
}

export function parsePairKey(key: string): { from: string; to: string } | null {
  const [from, to] = key.split(PAIR_SEPARATOR);
  if (!from || !to) return null;
  return { from: from.toUpperCase(), to: to.toUpperCase() };
}

export function emptyRateBook(usdRates: Record<string, number> = {}): RateBook {
  return { usdRates: { USD: 1, ...usdRates }, overrides: {} };
}

export function withOverrides(
  book: RateBook,
  overrides: Record<string, number>,
  source: Exclude<RateSource, "market"> = "group"
): RateBook {
  const next = { ...book, overrides: { ...book.overrides } };
  for (const [key, rate] of Object.entries(overrides)) {
    if (!Number.isFinite(rate) || rate <= 0) continue;
    next.overrides[key.toUpperCase()] = { rate, source };
  }
  return next;
}

export function resolveRate(
  from: string,
  to: string,
  book: RateBook
): RateQuote | null {
  const source = from.toUpperCase();
  const target = to.toUpperCase();
  if (source === target) {
    return { from: source, to: target, rate: 1, source: "market", asOf: book.asOf };
  }

  const direct = book.overrides[pairKey(source, target)];
  if (direct) {
    return {
      from: source,
      to: target,
      rate: direct.rate,
      source: direct.source,
      asOf: book.asOf,
    };
  }

  const inverse = book.overrides[pairKey(target, source)];
  if (inverse) {
    return {
      from: source,
      to: target,
      rate: 1 / inverse.rate,
      source: inverse.source,
      asOf: book.asOf,
    };
  }

  const fromUsd = book.usdRates[source];
  const toUsd = book.usdRates[target];
  if (!fromUsd || !toUsd) return null;

  return {
    from: source,
    to: target,
    rate: toUsd / fromUsd,
    source: "market",
    asOf: book.asOf,
  };
}

export function convertAmount(
  amount: number,
  from: string,
  to: string,
  book: RateBook
): number | null {
  const quote = resolveRate(from, to, book);
  if (!quote) return null;
  return amount * quote.rate;
}

export function roundMoney(amount: number, currency: string = "USD"): number {
  const decimals = currency.toUpperCase() === "JPY" || currency.toUpperCase() === "KRW"
    ? 0
    : 2;
  const factor = 10 ** decimals;
  return Math.round(amount * factor) / factor;
}

export function unifyTotals(
  totals: Map<string, number> | Record<string, number>,
  targetCurrency: string,
  book: RateBook
): UnifiedTotal {
  const target = targetCurrency.toUpperCase();
  const entries = totals instanceof Map
    ? Array.from(totals.entries())
    : Object.entries(totals);

  const parts: ConvertedPart[] = [];
  const missing: string[] = [];
  let amount = 0;

  for (const [currency, original] of entries) {
    if (!Number.isFinite(original) || original === 0) continue;
    const quote = resolveRate(currency, target, book);
    if (!quote) {
      missing.push(currency.toUpperCase());
      continue;
    }
    const converted = original * quote.rate;
    amount += converted;
    parts.push({
      currency: currency.toUpperCase(),
      original,
      converted,
      quote,
    });
  }

  return {
    amount: roundMoney(amount, target),
    currency: target,
    parts,
    missing,
  };
}

export function collectCurrencies(
  balances: Array<{ currency?: string | null }>
): string[] {
  const seen = new Set<string>();
  for (const balance of balances) {
    const currency = balance.currency?.trim().toUpperCase();
    if (currency) seen.add(currency);
  }
  return Array.from(seen);
}

export function unifyBalances(
  balances: Balance[],
  targetCurrency: string,
  book: RateBook
): UnifiedTotal {
  const totals = new Map<string, number>();
  for (const balance of balances) {
    const currency = (balance.currency || getDefaultCurrency()).toUpperCase();
    totals.set(currency, (totals.get(currency) || 0) + balance.amount);
  }
  return unifyTotals(totals, targetCurrency, book);
}

export function formatBreakdown(parts: ConvertedPart[]): string {
  const visible = parts.filter((part) => Math.abs(part.original) >= 0.01);
  if (visible.length === 0) return "";
  return visible
    .map((part) => formatCurrency(Math.abs(part.original), part.currency))
    .join(" + ");
}

export function formatRateLabel(quote: RateQuote): string {
  const rateText = quote.rate >= 10
    ? quote.rate.toFixed(2)
    : quote.rate.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  return `1 ${quote.from} = ${rateText} ${quote.to}`;
}

export function rateSourceLabel(source: RateSource): string {
  if (source === "group") return "group";
  if (source === "expense") return "expense";
  return "market";
}

export function dominantRateSource(parts: ConvertedPart[]): RateSource {
  if (parts.some((part) => part.quote.source === "expense")) return "expense";
  if (parts.some((part) => part.quote.source === "group")) return "group";
  return "market";
}

export type UnifiedDebtEdge = DebtEdge & {
  originalParts: ConvertedPart[];
};

export function unifyDebtEdges(
  edges: DebtEdge[],
  targetCurrency: string,
  book: RateBook,
  currentUserId?: string
): UnifiedDebtEdge[] {
  const target = targetCurrency.toUpperCase();
  const grouped = new Map<string, UnifiedDebtEdge>();

  for (const edge of edges) {
    const quote = resolveRate(edge.currency, target, book);
    if (!quote) continue;

    const converted = edge.amount * quote.rate;
    const fromId = edge.fromUser.user_id || edge.fromUser.participant_id || "from";
    const toId = edge.toUser.user_id || edge.toUser.participant_id || "to";
    const key = `${fromId}->${toId}`;
    const existing = grouped.get(key);

    const part: ConvertedPart = {
      currency: edge.currency.toUpperCase(),
      original: edge.amount,
      converted,
      quote,
    };

    if (existing) {
      existing.amount = roundMoney(existing.amount + converted, target);
      existing.originalParts.push(part);
      continue;
    }

    grouped.set(key, {
      ...edge,
      amount: roundMoney(converted, target),
      currency: target,
      originalParts: [part],
    });
  }

  const merged = Array.from(grouped.values()).filter((edge) => Math.abs(edge.amount) >= 0.01);
  if (!currentUserId) return merged;

  return merged.sort((a, b) => {
    if (b.amount !== a.amount) return b.amount - a.amount;
    const aOther = a.fromUser.user_id === currentUserId ? a.toUser.user_id : a.fromUser.user_id;
    const bOther = b.fromUser.user_id === currentUserId ? b.toUser.user_id : b.fromUser.user_id;
    return (aOther || "").localeCompare(bOther || "");
  });
}

export function isMultiCurrency(currencies: string[]): boolean {
  return new Set(currencies.map((code) => code.toUpperCase())).size > 1;
}
