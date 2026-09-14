import type { InfiniteData } from "@tanstack/react-query";
import type { Transaction } from "../types";

export interface TransactionsPageResponse {
  items: Transaction[];
  has_more: boolean;
  next_cursor: { date: string; id: number } | null;
}

export function mapInfiniteTransactions(
  data: InfiniteData<TransactionsPageResponse> | undefined,
  mapper: (tx: Transaction) => Transaction | null
): InfiniteData<TransactionsPageResponse> | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items
        .map((tx) => mapper(tx))
        .filter((tx): tx is Transaction => tx !== null),
    })),
  };
}

/** Normalize create-transaction API payloads (flat or wrapped). */
export function resolveCreatedTransaction(
  data: unknown,
  fallbackFields?: Partial<Transaction>
): Transaction | null {
  if (!data || typeof data !== "object") return null;

  const root = data as Record<string, unknown>;
  const candidate =
    root.transaction && typeof root.transaction === "object"
      ? (root.transaction as Record<string, unknown>)
      : root;

  const rawId = candidate.id;
  const id =
    typeof rawId === "number"
      ? rawId
      : typeof rawId === "string" && /^\d+$/.test(rawId)
      ? Number(rawId)
      : null;

  if (id == null || !Number.isFinite(id)) return null;

  return {
    ...(fallbackFields as Transaction),
    ...(candidate as Partial<Transaction>),
    id,
  };
}

/**
 * Swap a temporary optimistic list id for the real server id so create →
 * immediate edit/delete cannot 404.
 */
export function replaceOptimisticTransactionInFeed(
  data: InfiniteData<TransactionsPageResponse> | undefined,
  optimisticId: number,
  created: Transaction | null
): InfiniteData<TransactionsPageResponse> | undefined {
  if (created?.id != null) {
    return mapInfiniteTransactions(data, (tx) =>
      tx.id === optimisticId ? { ...tx, ...created, id: created.id } : tx
    );
  }
  // Drop the temp row if the server payload had no usable id.
  return mapInfiniteTransactions(data, (tx) =>
    tx.id === optimisticId ? null : tx
  );
}
