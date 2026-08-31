import { Transaction } from "../types";

export type GroupCurrencyTransaction = Pick<
  Transaction,
  "id" | "group_id" | "currency" | "created_at"
>;

const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;

export function normalizeGroupCurrency(
  currency?: string | null
): string | undefined {
  const normalized = currency?.trim().toUpperCase();
  return normalized && CURRENCY_CODE_PATTERN.test(normalized)
    ? normalized
    : undefined;
}

function belongsToGroup(
  transaction: GroupCurrencyTransaction,
  groupId: string
): boolean {
  // Group-scoped feeds may omit group_id; still accept those rows.
  if (!transaction.group_id) return true;
  return transaction.group_id === groupId;
}

function enteredAtMs(transaction: GroupCurrencyTransaction): number {
  if (!transaction.created_at) return 0;
  const parsed = Date.parse(transaction.created_at);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Returns the currency of the most recently entered transaction in a group.
 * "Entered" uses created_at, then id as a tiebreaker, so backdated expenses
 * still count as the latest if they were added last.
 */
export function getLastEnteredTransactionCurrency(
  transactions: GroupCurrencyTransaction[],
  groupId: string
): string | undefined {
  let latest: GroupCurrencyTransaction | undefined;

  for (const transaction of transactions) {
    if (!belongsToGroup(transaction, groupId)) continue;
    const currency = normalizeGroupCurrency(transaction.currency);
    if (!currency) continue;

    if (!latest) {
      latest = transaction;
      continue;
    }

    const timeDelta = enteredAtMs(transaction) - enteredAtMs(latest);
    if (timeDelta > 0 || (timeDelta === 0 && transaction.id > latest.id)) {
      latest = transaction;
    }
  }

  return normalizeGroupCurrency(latest?.currency);
}

export function resolveGroupDefaultCurrency({
  groupId,
  latestCurrency,
  feedTransactions,
  fallbackCurrency,
}: {
  groupId: string;
  latestCurrency?: string | null;
  feedTransactions: GroupCurrencyTransaction[];
  fallbackCurrency: string;
}): string {
  return (
    normalizeGroupCurrency(latestCurrency) ||
    getLastEnteredTransactionCurrency(feedTransactions, groupId) ||
    fallbackCurrency
  );
}
