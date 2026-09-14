import type { Settlement, Transaction } from "../types";

export type LedgerFilter = "all" | "expenses" | "payments";

export type LedgerExpenseItem = {
  kind: "expense";
  key: string;
  sortAt: number;
  sortTiebreaker: string;
  transaction: Transaction;
};

export type LedgerPaymentItem = {
  kind: "payment";
  key: string;
  sortAt: number;
  sortTiebreaker: string;
  settlement: Settlement;
};

export type LedgerItem = LedgerExpenseItem | LedgerPaymentItem;

function toSortAt(value?: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Settlement display/sort date: prefer date portion of created_at. */
export function settlementLedgerDate(settlement: Settlement): string {
  const raw = settlement.created_at || "";
  if (raw.length >= 10) return raw.slice(0, 10);
  return raw;
}

export function transactionToLedgerItem(transaction: Transaction): LedgerExpenseItem {
  return {
    kind: "expense",
    key: `expense-${transaction.id}`,
    sortAt: toSortAt(transaction.date),
    sortTiebreaker: `e-${String(transaction.id).padStart(12, "0")}`,
    transaction,
  };
}

export function settlementToLedgerItem(settlement: Settlement): LedgerPaymentItem {
  return {
    kind: "payment",
    key: `payment-${settlement.id}`,
    sortAt: toSortAt(settlement.created_at || settlementLedgerDate(settlement)),
    sortTiebreaker: `p-${settlement.id}`,
    settlement,
  };
}

function compareLedgerItems(a: LedgerItem, b: LedgerItem): number {
  if (a.sortAt !== b.sortAt) return b.sortAt - a.sortAt;
  return b.sortTiebreaker.localeCompare(a.sortTiebreaker);
}

/**
 * Build the Transactions tab ledger: expenses + settlements (payments),
 * chronologically sorted. Payments never feed My Spending / group spend totals —
 * those stay on backend group_stats over expenses only.
 */
export function buildTransactionsLedger(
  transactions: Transaction[],
  settlements: Settlement[],
  filter: LedgerFilter = "all",
): LedgerItem[] {
  const expenses = (transactions || []).map(transactionToLedgerItem);
  const payments = (settlements || []).map(settlementToLedgerItem);

  let items: LedgerItem[];
  if (filter === "expenses") {
    items = expenses;
  } else if (filter === "payments") {
    items = payments;
  } else {
    items = [...expenses, ...payments];
  }

  return items.sort(compareLedgerItems);
}
