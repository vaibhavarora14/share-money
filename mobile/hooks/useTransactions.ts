import type { QueryClient } from "@tanstack/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { Transaction } from "../types";
import { fetchWithAuth } from "../utils/api";
import { queryKeys } from "./queryKeys";

export async function fetchTransactions(
  groupId?: string | null
): Promise<Transaction[]> {
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
    queryKey: groupId ? queryKeys.transactions(groupId) : ["transactions", null],
    queryFn: () => fetchTransactions(groupId),
    enabled: !!user?.id && (!!groupId || groupId === null || groupId === undefined),
    initialData: [],
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

// Mutation hooks
export function useCreateTransaction(onSuccess?: () => void) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (
      transactionData: Omit<Transaction, "id" | "created_at" | "user_id">
    ) => {
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
      const groupId = (variables as any).group_id as string | undefined;
      if (!groupId) return { groupId, previous: undefined };

      await queryClient.cancelQueries({ queryKey: queryKeys.transactions(groupId) });
      const previous = queryClient.getQueryData<Transaction[]>(
        queryKeys.transactions(groupId)
      );

      const optimisticEntry: Transaction = {
        ...(variables as any),
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
    onError: (_error, variables, context) => {
      if (context?.groupId && context.previous) {
        queryClient.setQueryData(
          queryKeys.transactions(context.groupId),
          context.previous
        );
      }
    },
    onSuccess: (_data, variables, context) => {
      const groupId = (variables as any).group_id as string | undefined;
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

  const mutation = useMutation({
    mutationFn: async (transactionData: Omit<Transaction, "created_at" | "user_id">) => {
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
      const groupId = (variables as any).group_id as string | undefined;
      if (!groupId) return { groupId, previous: undefined };

      await queryClient.cancelQueries({ queryKey: queryKeys.transactions(groupId) });
      const previous = queryClient.getQueryData<Transaction[]>(
        queryKeys.transactions(groupId)
      );

      queryClient.setQueryData<Transaction[]>(
        queryKeys.transactions(groupId),
        (old) => {
          const current = old ?? [];
          return current.map((tx) =>
            tx.id === (variables as any).id ? { ...tx, ...(variables as any) } : tx
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
      const groupId = (variables as any).group_id as string | undefined;
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

  const mutation = useMutation({
    mutationFn: async (variables: { id: number; group_id?: string }) => {
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
