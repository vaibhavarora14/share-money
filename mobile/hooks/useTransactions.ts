import type { QueryClient } from "@tanstack/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { Transaction } from "../types";
import { fetchWithAuth } from "../utils/api";
import { queryKeys } from "./queryKeys";

export async function fetchTransactions(groupId?: string | null): Promise<Transaction[]> {
  const endpoint = groupId ? `/transactions?group_id=${groupId}` : "/transactions";
  const response = await fetchWithAuth(endpoint);
  if (!response.ok) {
    throw new Error(`Failed to fetch transactions: ${response.status}`);
  }
  const transactions: Transaction[] = await response.json();

  return transactions.sort((a, b) => {
    const dateA = a.created_at
      ? new Date(a.created_at).getTime()
      : new Date(a.date).getTime();
    const dateB = b.created_at
      ? new Date(b.created_at).getTime()
      : new Date(b.date).getTime();
    return dateB - dateA;
  });
}

function invalidateTransactionAdjacents(queryClient: QueryClient, groupId?: string | null) {
  if (!groupId) return;
  queryClient.invalidateQueries({ queryKey: queryKeys.transactions(groupId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.balances(groupId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.activity(groupId) });
}

export function useTransactions(groupId?: string | null) {
  const { user } = useAuth();

  const query = useQuery<Transaction[], Error>({
    // Guarded by `enabled`, so groupId is always defined inside queryFn
    queryKey: groupId ? queryKeys.transactions(groupId) : queryKeys.transactions(""),
    queryFn: () => fetchTransactions(groupId),
    enabled: !!user?.id && (!!groupId || groupId === null || groupId === undefined),
    // Use placeholderData so initial load still reports isLoading=true
    placeholderData: [],
    staleTime: 30_000,
  });

  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
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

  const mutation = useMutation<Transaction | null, Error, CreateTransactionInput>({
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

      await queryClient.cancelQueries({ queryKey: queryKeys.transactions(groupId) });
      const previous = queryClient.getQueryData<Transaction[]>(
        queryKeys.transactions(groupId)
      );

      const optimisticEntry: Transaction = {
        ...(variables as Transaction),
        id: Date.now(),
        created_at: new Date().toISOString(),
      };

      queryClient.setQueryData<Transaction[]>(
        queryKeys.transactions(groupId),
        (old) => {
          const current = old ?? [];
          return [optimisticEntry, ...current];
        }
      );

      return { previous, groupId };
    },
    onError: (_error, _variables, context) => {
      if (context?.groupId && context.previous) {
        queryClient.setQueryData(
          queryKeys.transactions(context.groupId),
          context.previous
        );
      }
    },
    onSuccess: (_data, variables, context) => {
      const groupId = variables.group_id;
      invalidateTransactionAdjacents(queryClient, groupId);
      if (context?.groupId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.transactions(context.groupId),
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

  const mutation = useMutation<Transaction | null, Error, UpdateTransactionInput>({
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

      await queryClient.cancelQueries({ queryKey: queryKeys.transactions(groupId) });
      const previous = queryClient.getQueryData<Transaction[]>(
        queryKeys.transactions(groupId)
      );

      queryClient.setQueryData<Transaction[]>(queryKeys.transactions(groupId), (old) => {
          const current = old ?? [];
          return current.map((tx) =>
            tx.id === variables.id ? { ...tx, ...variables } : tx
          );
        }
      );

      return { previous, groupId };
    },
    onError: (_error, _variables, context) => {
      if (context?.groupId && context.previous) {
        queryClient.setQueryData(
          queryKeys.transactions(context.groupId),
          context.previous
        );
      }
    },
    onSuccess: (_data, variables, context) => {
      const groupId = variables.group_id;
      invalidateTransactionAdjacents(queryClient, groupId);
      if (context?.groupId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.transactions(context.groupId),
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
    { id: number; group_id?: string }
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

      await queryClient.cancelQueries({ queryKey: queryKeys.transactions(groupId) });
      const previous = queryClient.getQueryData<Transaction[]>(
        queryKeys.transactions(groupId)
      );

      queryClient.setQueryData<Transaction[]>(
        queryKeys.transactions(groupId),
        (old) => (old ?? []).filter((tx) => tx.id !== variables.id)
      );

      return { previous, groupId };
    },
    onError: (_error, _variables, context) => {
      if (context?.groupId && context.previous) {
        queryClient.setQueryData(
          queryKeys.transactions(context.groupId),
          context.previous
        );
      }
    },
    onSuccess: (_data, variables, context) => {
      const groupId = variables.group_id;
      invalidateTransactionAdjacents(queryClient, groupId);
      if (context?.groupId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.transactions(context.groupId),
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
