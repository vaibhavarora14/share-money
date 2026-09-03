import { Balance } from "../types";
import { DebtEdge, simplifyDebts } from "./debt";
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

export function personKey(person: {
  participant_id?: string | null;
  user_id?: string | null;
  email?: string | null;
}): string {
  return person.participant_id || person.user_id || person.email || "unknown";
}

export type UnifiedPersonNet = Balance & {
  originalParts: ConvertedPart[];
  missing: string[];
};

/**
 * Collapse each person's per-currency leftovers into one net in `targetCurrency`.
 * Currencies without a rate stay as their own leftover so they are not silently dropped.
 */
export function unifyPeopleNets(
  balances: Balance[],
  targetCurrency: string,
  book: RateBook
): UnifiedPersonNet[] {
  const target = targetCurrency.toUpperCase();
  const grouped = new Map<string, Balance[]>();
  for (const balance of balances) {
    const key = personKey(balance);
    const list = grouped.get(key) || [];
    list.push(balance);
    grouped.set(key, list);
  }

  const nets: UnifiedPersonNet[] = [];
  for (const rows of grouped.values()) {
    const template = rows.find((row) => row.full_name) || rows[0];
    const convertible: Balance[] = [];
    const leftover: Balance[] = [];
    for (const row of rows) {
      const currency = (row.currency || getDefaultCurrency()).toUpperCase();
      if (currency === target || resolveRate(currency, target, book)) {
        convertible.push(row);
      } else {
        leftover.push(row);
      }
    }

    if (convertible.length > 0) {
      const unified = unifyBalances(convertible, target, book);
      if (Math.abs(unified.amount) >= 0.01) {
        nets.push({
          ...template,
          amount: unified.amount,
          currency: unified.currency,
          originalParts: unified.parts,
          missing: unified.missing,
        });
      }
    }

    for (const row of leftover) {
      if (Math.abs(row.amount) < 0.01) continue;
      nets.push({
        ...row,
        originalParts: [],
        missing: [(row.currency || getDefaultCurrency()).toUpperCase()],
      });
    }
  }

  return nets;
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
    const key = `${personKey(edge.fromUser)}->${personKey(edge.toUser)}`;
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
  const netted = netOppositeDebtEdges(merged, target);
  if (!currentUserId) return netted;

  return netted.sort((a, b) => {
    if (b.amount !== a.amount) return b.amount - a.amount;
    const aOther = a.fromUser.user_id === currentUserId ? a.toUser.user_id : a.fromUser.user_id;
    const bOther = b.fromUser.user_id === currentUserId ? b.toUser.user_id : b.fromUser.user_id;
    return (aOther || "").localeCompare(bOther || "");
  });
}

function netOppositeDebtEdges(
  edges: UnifiedDebtEdge[],
  targetCurrency: string
): UnifiedDebtEdge[] {
  const unused = new Set(edges);
  const result: UnifiedDebtEdge[] = [];

  for (const edge of edges) {
    if (!unused.has(edge)) continue;
    unused.delete(edge);
    const reverse = [...unused].find((candidate) =>
      personKey(candidate.fromUser) === personKey(edge.toUser)
      && personKey(candidate.toUser) === personKey(edge.fromUser)
    );
    if (!reverse) {
      result.push(edge);
      continue;
    }
    unused.delete(reverse);
    const net = roundMoney(edge.amount - reverse.amount, targetCurrency);
    if (Math.abs(net) < 0.01) continue;
    if (net > 0) {
      result.push({
        ...edge,
        amount: net,
        originalParts: [...edge.originalParts, ...reverse.originalParts],
      });
    } else {
      result.push({
        ...reverse,
        amount: roundMoney(-net, targetCurrency),
        originalParts: [...reverse.originalParts, ...edge.originalParts],
      });
    }
  }

  return result;
}

/**
 * Convert every member to the settlement currency, then simplify the group
 * as a single ledger. Opposite leftovers between the same people cancel.
 */
export function simplifyUnifiedDebts(
  balances: Balance[],
  targetCurrency: string,
  book: RateBook,
  currentUserId?: string,
  currentParticipantId?: string
): UnifiedDebtEdge[] {
  const nets = unifyPeopleNets(balances, targetCurrency, book);
  const edges = simplifyDebts(
    nets,
    currentUserId,
    targetCurrency,
    currentParticipantId
  );
  const netByPerson = new Map(nets.map((net) => [personKey(net), net]));

  return edges.map((edge) => ({
    ...edge,
    originalParts: originalPartsForEdge(edge, netByPerson),
  }));
}

function originalPartsForEdge(
  edge: DebtEdge,
  netByPerson: Map<string, UnifiedPersonNet>
): ConvertedPart[] {
  // Only attach originals when this payment fully settles that person's unified net.
  // Partial greedy matches in 3+ person groups should not show someone else's whole leftover mix.
  const candidates = [edge.fromUser, edge.toUser];
  for (const person of candidates) {
    const net = netByPerson.get(personKey(person));
    if (
      net
      && net.originalParts.length > 0
      && Math.abs(Math.abs(net.amount) - edge.amount) < 0.01
    ) {
      return net.originalParts;
    }
  }
  return [];
}

export function isMultiCurrency(currencies: string[]): boolean {
  return new Set(currencies.map((code) => code.toUpperCase())).size > 1;
}
