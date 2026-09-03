/**
 * Compare per-currency simplify-then-merge (old path) vs unify-then-simplify
 * (new path) on an anonymized group snapshot.
 *
 * Usage: deno run --allow-read scripts/compare-unified-settlement.ts phuket-snapshot.json
 */
import {
  emptyRateBook,
  personKey,
  resolveRate,
  roundMoney,
  simplifyUnifiedDebts,
  unifyPeopleNets,
  type ConvertedPart,
  type RateBook,
  type UnifiedDebtEdge,
} from "../mobile/utils/currencyMerge.ts";
import { simplifyDebts, type DebtEdge } from "../mobile/utils/debt.ts";
import { createPreviewRateBook } from "../mobile/utils/previewRates.ts";

type SnapshotBalance = {
  label: string;
  user_id: string;
  participant_id: string;
  amount: number;
  currency: string;
};

type Snapshot = {
  group: {
    name: string;
    settlement_currency?: string | null;
    unify_balances?: boolean;
    member_count?: number;
    expense_count?: number;
    settlement_count?: number;
    match_count?: number;
  };
  rate_book: {
    as_of?: string | null;
    usd_rates?: Record<string, number>;
    overrides?: Array<{ from: string; to: string; rate: number; source?: string }>;
  };
  balances: SnapshotBalance[];
};

function rateBookFromSnapshot(snapshot: Snapshot): RateBook {
  const usdRates = snapshot.rate_book?.usd_rates || {};
  const overrides: Record<string, number> = {};
  for (const row of snapshot.rate_book?.overrides || []) {
    if (!row?.from || !row?.to || !Number.isFinite(row.rate) || row.rate <= 0) continue;
    overrides[`${row.from.toUpperCase()}:${row.to.toUpperCase()}`] = row.rate;
  }
  if (Object.keys(usdRates).length === 0) {
    return createPreviewRateBook(overrides);
  }
  const book = emptyRateBook(usdRates);
  book.asOf = snapshot.rate_book?.as_of || undefined;
  for (const [key, rate] of Object.entries(overrides)) {
    book.overrides[key] = { rate, source: "group" };
  }
  return book;
}

function toBalances(rows: SnapshotBalance[]) {
  return rows.map((row) => ({
    user_id: row.user_id,
    participant_id: row.participant_id,
    amount: row.amount,
    currency: row.currency,
    full_name: row.label,
  }));
}

/** Old path: simplify per currency, then convert same-direction edges only. */
function unifySameDirection(
  edges: DebtEdge[],
  targetCurrency: string,
  book: RateBook,
): UnifiedDebtEdge[] {
  const target = targetCurrency.toUpperCase();
  const grouped = new Map<string, UnifiedDebtEdge>();

  for (const edge of edges) {
    const quote = resolveRate(edge.currency, target, book);
    if (!quote) continue;
    const converted = edge.amount * quote.rate;
    const key = `${personKey(edge.fromUser)}->${personKey(edge.toUser)}`;
    const part: ConvertedPart = {
      currency: edge.currency.toUpperCase(),
      original: edge.amount,
      converted,
      quote,
    };
    const existing = grouped.get(key);
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

  return Array.from(grouped.values()).filter((edge) => Math.abs(edge.amount) >= 0.01);
}

function summarizeEdge(edge: UnifiedDebtEdge | DebtEdge) {
  const originalParts = "originalParts" in edge ? edge.originalParts : [];
  return {
    from: edge.fromUser.full_name || edge.fromUser.user_id,
    to: edge.toUser.full_name || edge.toUser.user_id,
    amount: edge.amount,
    currency: edge.currency,
    originals: originalParts.map((part) => ({
      currency: part.currency,
      original: part.original,
      converted: roundMoney(part.converted, edge.currency),
      source: part.quote.source,
      rate: part.quote.rate,
    })),
  };
}

function leftoverRows(rows: SnapshotBalance[]) {
  return rows.map((row) => ({
    person: row.label,
    amount: row.amount,
    currency: row.currency,
  }));
}

const path = Deno.args[0];
if (!path) {
  console.error("Usage: deno run --allow-read scripts/compare-unified-settlement.ts <snapshot.json>");
  Deno.exit(1);
}

const snapshot = JSON.parse(await Deno.readTextFile(path)) as Snapshot;
const balances = toBalances(snapshot.balances);
const book = rateBookFromSnapshot(snapshot);
const settlement = (
  snapshot.group.settlement_currency
  || balances[0]?.currency
  || "INR"
).toUpperCase();
const currentUserId = balances[0]?.user_id;

const perCurrency = simplifyDebts(balances, currentUserId, settlement);
const before = unifySameDirection(perCurrency, settlement, book);
const after = simplifyUnifiedDebts(balances, settlement, book, currentUserId);
const nets = unifyPeopleNets(balances, settlement, book);

const report = {
  group: snapshot.group.name,
  settlementCurrency: settlement,
  unifyEnabled: snapshot.group.unify_balances === true,
  rateAsOf: book.asOf || null,
  overrides: snapshot.rate_book.overrides || [],
  leftoverRows: leftoverRows(snapshot.balances),
  unifiedNets: nets.map((net) => ({
    person: net.full_name,
    amount: net.amount,
    currency: net.currency,
    originals: net.originalParts.map((part) => ({
      currency: part.currency,
      original: part.original,
      converted: roundMoney(part.converted, net.currency),
    })),
    missing: net.missing,
  })),
  beforePayments: before.map(summarizeEdge),
  afterPayments: after.map(summarizeEdge),
  beforeCount: before.length,
  afterCount: after.length,
  perCurrencyPayments: perCurrency.map((edge) => ({
    from: edge.fromUser.full_name,
    to: edge.toUser.full_name,
    amount: edge.amount,
    currency: edge.currency,
  })),
};

console.log(JSON.stringify(report, null, 2));
