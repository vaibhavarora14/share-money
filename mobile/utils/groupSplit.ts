import { Transaction, TransactionSplit } from "../types";

export type GroupSplitTransaction = Pick<
  Transaction,
  | "id"
  | "group_id"
  | "type"
  | "created_at"
  | "split_among_participant_ids"
  | "splits"
>;

export type SplitAmongSource = Pick<
  Transaction,
  "type" | "split_among_participant_ids" | "splits"
>;

function uniqueIds(ids: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

function belongsToGroup(
  transaction: GroupSplitTransaction,
  groupId: string
): boolean {
  // Group-scoped feeds may omit group_id; still accept those rows.
  if (!transaction.group_id) return true;
  return transaction.group_id === groupId;
}

function enteredAtMs(transaction: GroupSplitTransaction): number {
  if (!transaction.created_at) return 0;
  const parsed = Date.parse(transaction.created_at);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function isExpense(transaction: SplitAmongSource): boolean {
  return !transaction.type || transaction.type === "expense";
}

/**
 * Participant IDs this expense was split among, preferring split rows
 * and falling back to split_among_participant_ids.
 */
export function extractSplitAmongParticipantIds(
  transaction: SplitAmongSource
): string[] {
  if (!isExpense(transaction)) return [];

  const fromSplits = (transaction.splits || [])
    .map((split: Pick<TransactionSplit, "participant_id">) => split.participant_id);
  const splitIds = uniqueIds(fromSplits);
  if (splitIds.length > 0) return splitIds;

  return uniqueIds(transaction.split_among_participant_ids || []);
}

/**
 * Keep last-transaction people who are still available in the current group.
 */
export function intersectSplitAmongWithAvailable(
  selectedIds: string[] | null | undefined,
  availableIds: string[]
): string[] {
  if (!selectedIds || selectedIds.length === 0 || availableIds.length === 0) {
    return [];
  }
  const available = new Set(availableIds);
  return uniqueIds(selectedIds).filter((id) => available.has(id));
}

/**
 * Returns the split-among participant IDs of the most recently entered
 * expense in a group. "Entered" uses created_at, then id as a tiebreaker,
 * so backdated expenses still count as the latest if they were added last.
 */
export function getLastEnteredExpenseSplitAmong(
  transactions: GroupSplitTransaction[],
  groupId: string
): string[] | undefined {
  let latest: GroupSplitTransaction | undefined;

  for (const transaction of transactions) {
    if (!belongsToGroup(transaction, groupId)) continue;
    if (extractSplitAmongParticipantIds(transaction).length === 0) continue;

    if (!latest) {
      latest = transaction;
      continue;
    }

    const timeDelta = enteredAtMs(transaction) - enteredAtMs(latest);
    if (timeDelta > 0 || (timeDelta === 0 && transaction.id > latest.id)) {
      latest = transaction;
    }
  }

  if (!latest) return undefined;
  const ids = extractSplitAmongParticipantIds(latest);
  return ids.length > 0 ? ids : undefined;
}

export function resolveGroupDefaultSplitAmong({
  groupId,
  latestSplitAmong,
  feedTransactions,
}: {
  groupId: string;
  latestSplitAmong?: string[] | null;
  feedTransactions: GroupSplitTransaction[];
}): string[] | undefined {
  const fromLatest = uniqueIds(latestSplitAmong || []);
  if (fromLatest.length > 0) return fromLatest;
  return getLastEnteredExpenseSplitAmong(feedTransactions, groupId);
}
