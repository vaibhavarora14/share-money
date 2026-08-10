import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { Transaction } from "../types";
import { fetchWithAuth } from "../utils/api";
import { trackGrowthEvent } from "../utils/analytics";
import { queryKeys } from "./queryKeys";

export interface TransactionsCursor {
  date: string;
  id: number;
}

export interface TransactionsPageResponse {
  items: Transaction[];
  has_more: boolean;
  next_cursor: TransactionsCursor | null;
}

interface FetchTransactionsPageArgs {
  groupId?: string | null;
  cursor?: TransactionsCursor | null;
  limit?: number;
}

const TRANSACTIONS_PAGE_SIZE = 30;

export async function fetchTransactionsPage({
  groupId,
  cursor,
  limit = TRANSACTIONS_PAGE_SIZE,
}: FetchTransactionsPageArgs): Promise<TransactionsPageResponse> {
  const params = new URLSearchParams();
  if (groupId) {
    params.set("group_id", groupId);
  }
  params.set("limit", String(limit));
  if (cursor) {
    params.set("cursor_date", cursor.date);
    params.set("cursor_id", String(cursor.id));
  }

  const endpoint = `/transactions?${params.toString()}`;
  const response = await fetchWithAuth(endpoint);
  if (!response.ok) {
    throw new Error(`Failed to fetch transactions: ${response.status}`);
  }
  const payload = await response.json();
  return {
    items: Array.isArray(payload?.items) ? payload.items : [],
    has_more: payload?.has_more === true,
    next_cursor:
      payload?.next_cursor &&
      typeof payload.next_cursor.date === "string" &&
      typeof payload.next_cursor.id === "number"
        ? payload.next_cursor
        : null,
  };
}

export async function fetchTransactions(groupId?: string | null): Promise<Transaction[]> {
  const firstPage = await fetchTransactionsPage({ groupId });
  return firstPage.items;
}

function mapInfiniteTransactions(
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

function invalidateTransactionAdjacents(queryClient: QueryClient, groupId?: string | null) {
  if (!groupId) return;
  queryClient.invalidateQueries({ queryKey: queryKeys.transactionsFeed(groupId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.transactions(groupId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.groupStats(groupId) });
  queryClient.invalidateQueries({ queryKey: ["balances"] }); // Invalidate all balances (including global)
  queryClient.invalidateQueries({ queryKey: queryKeys.balances(groupId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.activity(groupId) });
}

export function useTransactions(groupId?: string | null) {
  const { user } = useAuth();

  const query = useInfiniteQuery({
    queryKey: groupId ? queryKeys.transactionsFeed(groupId) : queryKeys.transactionsFeed(""),
    queryFn: ({ pageParam }: { pageParam: TransactionsCursor | null }) =>
      fetchTransactionsPage({ groupId, cursor: pageParam }),
    initialPageParam: null as TransactionsCursor | null,
    getNextPageParam: (lastPage) => (
      lastPage?.has_more && lastPage?.next_cursor ? lastPage.next_cursor : null
    ),
    enabled: !!user?.id && (!!groupId || groupId === null || groupId === undefined),
    staleTime: 30_000,
  });

  const pages = Array.isArray(query.data?.pages) ? query.data.pages : [];
  const flattenedData = pages.flatMap((page) =>
    Array.isArray(page?.items) ? page.items : []
  );

  return {
    data: flattenedData,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    error: query.error ?? null,
    refetch: query.refetch,
  };
}

// Types for mutation inputs to improve type safety
interface BaseTransactionInput extends Omit<Transaction, "created_at" | "user_id"> {
  group_id: string;
}

type CreateTransactionInput = Omit<BaseTransactionInput, "id">;
type UpdateTransactionInput = BaseTransactionInput;

// Mutation hooks
export function useCreateTransaction(onSuccess?: () => void) {
  const queryClient = useQueryClient();

  const mutation = useMutation<
    Transaction | null,
    Error,
    CreateTransactionInput,
    { previous?: InfiniteData<TransactionsPageResponse>; groupId: string }
  >({
    mutationFn: async (transactionData) => {
      const response = await fetchWithAuth("/transactions", {
        method: "POST",
        body: JSON.stringify(transactionData),
      });

      if (!response.ok) {
        throw new Error("Failed to create transaction");
      }

      return response.status === 204 ? null : await response.json();
    },
    onMutate: async (variables) => {
      const groupId = variables.group_id;
      if (!groupId) return { groupId, previous: undefined };

      await queryClient.cancelQueries({ queryKey: queryKeys.transactionsFeed(groupId) });
      const previous = queryClient.getQueryData<InfiniteData<TransactionsPageResponse>>(
        queryKeys.transactionsFeed(groupId)
      );

      const optimisticEntry: Transaction = {
        ...(variables as Transaction),
        id: Date.now(),
        created_at: new Date().toISOString(),
      };

      queryClient.setQueryData<InfiniteData<TransactionsPageResponse>>(
        queryKeys.transactionsFeed(groupId),
        (old) => {
          if (!old || old.pages.length === 0) {
            return {
              pages: [{ items: [optimisticEntry], has_more: false, next_cursor: null }],
              pageParams: [null],
            };
          }

          return {
            ...old,
            pages: old.pages.map((page, index) => (
              index === 0
                ? { ...page, items: [optimisticEntry, ...page.items] }
                : page
            )),
          };
        }
      );

      return { previous, groupId };
    },
    onError: (_error, _variables, context) => {
      if (context?.groupId && context.previous) {
        queryClient.setQueryData(
          queryKeys.transactionsFeed(context.groupId),
          context.previous
        );
      }
    },
    onSuccess: (data, variables, context) => {
      const groupId = variables.group_id;
      if (data?.activated) {
        trackGrowthEvent("group activated", { method: "manual_expense" });
      }
      invalidateTransactionAdjacents(queryClient, groupId);
      if (context?.groupId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.transactionsFeed(context.groupId),
        });
      }
      onSuccess?.();
    },
  });

  return {
    mutate: mutation.mutateAsync,
    isLoading: mutation.isPending,
    error: (mutation.error as Error | null) ?? null,
  };
}

export function useUpdateTransaction(onSuccess?: () => void) {
  const queryClient = useQueryClient();

  const mutation = useMutation<
    Transaction | null,
    Error,
    UpdateTransactionInput,
    { previous?: InfiniteData<TransactionsPageResponse>; groupId: string }
  >({
    mutationFn: async (transactionData) => {
      const response = await fetchWithAuth("/transactions", {
        method: "PUT",
        body: JSON.stringify(transactionData),
      });

      if (!response.ok) {
        throw new Error("Failed to update transaction");
      }

      return response.status === 204 ? null : await response.json();
    },
    onMutate: async (variables) => {
      const groupId = variables.group_id;
      if (!groupId) return { groupId, previous: undefined };

      await queryClient.cancelQueries({ queryKey: queryKeys.transactionsFeed(groupId) });
      const previous = queryClient.getQueryData<InfiniteData<TransactionsPageResponse>>(
        queryKeys.transactionsFeed(groupId)
      );

      queryClient.setQueryData<InfiniteData<TransactionsPageResponse>>(
        queryKeys.transactionsFeed(groupId),
        (old) => mapInfiniteTransactions(
          old,
          (tx) => tx.id === variables.id ? { ...tx, ...variables } : tx
        )
      );

      return { previous, groupId };
    },
    onError: (_error, _variables, context) => {
      if (context?.groupId && context.previous) {
        queryClient.setQueryData(
          queryKeys.transactionsFeed(context.groupId),
          context.previous
        );
      }
    },
    onSuccess: (_data, variables, context) => {
      const groupId = variables.group_id;
      invalidateTransactionAdjacents(queryClient, groupId);
      if (context?.groupId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.transactionsFeed(context.groupId),
        });
      }
      onSuccess?.();
    },
  });

  return {
    mutate: mutation.mutateAsync,
    isLoading: mutation.isPending,
    error: (mutation.error as Error | null) ?? null,
  };
}

export function useDeleteTransaction(onSuccess?: () => void) {
  const queryClient = useQueryClient();

  const mutation = useMutation<
    { id: number; group_id?: string },
    Error,
    { id: number; group_id?: string },
    { previous?: InfiniteData<TransactionsPageResponse>; groupId?: string }
  >({
    mutationFn: async (variables) => {
      const response = await fetchWithAuth(`/transactions?id=${variables.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete transaction");
      }

      return variables;
    },
    onMutate: async (variables) => {
      const groupId = variables.group_id;
      if (!groupId) return { groupId, previous: undefined };

      await queryClient.cancelQueries({ queryKey: queryKeys.transactionsFeed(groupId) });
      const previous = queryClient.getQueryData<InfiniteData<TransactionsPageResponse>>(
        queryKeys.transactionsFeed(groupId)
      );

      queryClient.setQueryData<InfiniteData<TransactionsPageResponse>>(
        queryKeys.transactionsFeed(groupId),
        (old) => mapInfiniteTransactions(old, (tx) => (
          tx.id === variables.id ? null : tx
        ))
      );

      return { previous, groupId };
    },
    onError: (_error, _variables, context) => {
      if (context?.groupId && context.previous) {
        queryClient.setQueryData(
          queryKeys.transactionsFeed(context.groupId),
          context.previous
        );
      }
    },
    onSuccess: (_data, variables, context) => {
      const groupId = variables.group_id;
      invalidateTransactionAdjacents(queryClient, groupId);
      if (context?.groupId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.transactionsFeed(context.groupId),
        });
      }
      onSuccess?.();
    },
  });

  return {
    mutate: mutation.mutateAsync,
    isLoading: mutation.isPending,
    error: (mutation.error as Error | null) ?? null,
  };
}
