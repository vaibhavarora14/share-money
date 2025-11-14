import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Transaction } from "../types";
import { fetchWithAuth } from "../utils/api";
import { queryKeys } from "../utils/queryKeys";

export function useCreateTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      transactionData: Omit<Transaction, "id" | "created_at" | "user_id">
    ) => {
      const response = await fetchWithAuth("/transactions", {
        method: "POST",
        body: JSON.stringify(transactionData),
      });
      if (response.status === 204) return null;
      return response.json();
    },
    onMutate: async (variables) => {
      // Cancel outgoing queries
      await Promise.all([
        queryClient.cancelQueries({ queryKey: queryKeys.transactions() }),
        variables.group_id
          ? queryClient.cancelQueries({
              queryKey: queryKeys.transactionsByGroup(variables.group_id),
            })
          : Promise.resolve(),
      ]);

      // Snapshot previous values
      const previousAll = queryClient.getQueryData<Transaction[]>(
        queryKeys.transactions()
      );
      const previousGroup = variables.group_id
        ? queryClient.getQueryData<Transaction[]>(
            queryKeys.transactionsByGroup(variables.group_id)
          )
        : undefined;

      // Create temporary transaction for optimistic update
      const tempId = `tmp-${Date.now()}`;
      const tempTransaction: Transaction = {
        ...variables,
        id: tempId as any, // Temporary ID
        created_at: new Date().toISOString(),
        user_id: '', // Will be populated from server
      } as Transaction;

      // Optimistically update cache
      if (previousAll) {
        queryClient.setQueryData(queryKeys.transactions(), [tempTransaction, ...previousAll]);
      }
      if (previousGroup && variables.group_id) {
        queryClient.setQueryData(
          queryKeys.transactionsByGroup(variables.group_id),
          [tempTransaction, ...previousGroup]
        );
      }

      return { previousAll, previousGroup, tempId };
    },
    onError: (_err, variables, context) => {
      // Rollback optimistic updates
      if (context?.previousAll) {
        queryClient.setQueryData(queryKeys.transactions(), context.previousAll);
      }
      if (context?.previousGroup && variables.group_id) {
        queryClient.setQueryData(
          queryKeys.transactionsByGroup(variables.group_id),
          context.previousGroup
        );
      }
    },
    onSuccess: (data, variables, context) => {
      // Replace temporary transaction with real one from server
      if (data && typeof data === 'object' && 'id' in data && context?.tempId) {
        try {
          const transaction = data as Transaction;
          
          // Update all transactions cache - replace temp with real
          const previousAll = queryClient.getQueryData<Transaction[]>(
            queryKeys.transactions()
          );
          if (previousAll) {
            const updated = previousAll.map(t => 
              (t.id as any) === context.tempId ? transaction : t
            );
            queryClient.setQueryData(queryKeys.transactions(), updated);
          }
          
          // Update group-specific transactions cache
          if (variables.group_id) {
            const previousGroup = queryClient.getQueryData<Transaction[]>(
              queryKeys.transactionsByGroup(variables.group_id)
            );
            if (previousGroup) {
              const updated = previousGroup.map(t => 
                (t.id as any) === context.tempId ? transaction : t
              );
              queryClient.setQueryData(
                queryKeys.transactionsByGroup(variables.group_id),
                updated
              );
            }
          }
        } catch (error) {
          console.error('Failed to replace temp transaction:', error);
        }
      }
      
      // Invalidate queries to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions() });
      if (variables.group_id) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.transactionsByGroup(variables.group_id),
        });
        // Invalidate balances when transactions change
        queryClient.invalidateQueries({
          queryKey: queryKeys.balances(variables.group_id),
        });
      }
      // Also invalidate overall balances
      queryClient.invalidateQueries({ queryKey: queryKeys.balances() });
    },
  });
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...transactionData
    }: Omit<Transaction, "created_at" | "user_id">) => {
      const response = await fetchWithAuth("/transactions", {
        method: "PUT",
        body: JSON.stringify({
          ...transactionData,
          id,
        }),
      });
      if (response.status === 204) return null;
      return response.json();
    },
    onMutate: async (variables) => {
      // Cancel outgoing queries
      await Promise.all([
        queryClient.cancelQueries({ queryKey: queryKeys.transactions() }),
        variables.group_id
          ? queryClient.cancelQueries({
              queryKey: queryKeys.transactionsByGroup(variables.group_id),
            })
          : Promise.resolve(),
      ]);

      // Snapshot previous values
      const previousAll = queryClient.getQueryData<Transaction[]>(
        queryKeys.transactions()
      );
      const previousGroup = variables.group_id
        ? queryClient.getQueryData<Transaction[]>(
            queryKeys.transactionsByGroup(variables.group_id)
          )
        : undefined;

      // Optimistically update with new data
      if (previousAll) {
        const index = previousAll.findIndex(t => t.id === variables.id);
        if (index >= 0) {
          const updated = [...previousAll];
          updated[index] = { ...updated[index], ...variables } as Transaction;
          queryClient.setQueryData(queryKeys.transactions(), updated);
        }
      }
      if (previousGroup && variables.group_id) {
        const index = previousGroup.findIndex(t => t.id === variables.id);
        if (index >= 0) {
          const updated = [...previousGroup];
          updated[index] = { ...updated[index], ...variables } as Transaction;
          queryClient.setQueryData(
            queryKeys.transactionsByGroup(variables.group_id),
            updated
          );
        }
      }

      return { previousAll, previousGroup };
    },
    onError: (_err, variables, context) => {
      // Rollback optimistic updates
      if (context?.previousAll) {
        queryClient.setQueryData(queryKeys.transactions(), context.previousAll);
      }
      if (context?.previousGroup && variables.group_id) {
        queryClient.setQueryData(
          queryKeys.transactionsByGroup(variables.group_id),
          context.previousGroup
        );
      }
    },
    onSuccess: (data, variables) => {
      // Replace optimistic update with server response
      if (data && typeof data === 'object' && 'id' in data) {
        try {
          const updatedTransaction = data as Transaction;
          
          // Update all transactions cache
          const previousAll = queryClient.getQueryData<Transaction[]>(
            queryKeys.transactions()
          );
          if (previousAll) {
            const index = previousAll.findIndex(t => t.id === updatedTransaction.id);
            if (index >= 0) {
              const updated = [...previousAll];
              updated[index] = updatedTransaction;
              queryClient.setQueryData(queryKeys.transactions(), updated);
            }
          }
          
          // Update group-specific transactions cache
          if (variables.group_id) {
            const previousGroup = queryClient.getQueryData<Transaction[]>(
              queryKeys.transactionsByGroup(variables.group_id)
            );
            if (previousGroup) {
              const index = previousGroup.findIndex(t => t.id === updatedTransaction.id);
              if (index >= 0) {
                const updated = [...previousGroup];
                updated[index] = updatedTransaction;
                queryClient.setQueryData(
                  queryKeys.transactionsByGroup(variables.group_id),
                  updated
                );
              }
            }
          }
        } catch (error) {
          console.error('Failed to update transaction cache:', error);
        }
      }
      
      // Invalidate queries to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions() });
      if (variables.group_id) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.transactionsByGroup(variables.group_id),
        });
        // Invalidate balances when transactions change
        queryClient.invalidateQueries({
          queryKey: queryKeys.balances(variables.group_id),
        });
      }
      // Also invalidate overall balances
      queryClient.invalidateQueries({ queryKey: queryKeys.balances() });
    },
  });
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      variables: {
        id: number;
        group_id?: string;
      }
    ) => {
      const response = await fetchWithAuth(`/transactions?id=${variables.id}`, {
        method: "DELETE",
      });
      if (response.status === 204) return null;
      return response.json();
    },
    onMutate: async (variables) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: queryKeys.transactions() }),
        variables.group_id
          ? queryClient.cancelQueries({
              queryKey: queryKeys.transactionsByGroup(variables.group_id),
            })
          : Promise.resolve(),
      ]);
      const prevAll = queryClient.getQueryData<Transaction[]>(
        queryKeys.transactions()
      );
      const prevGroup = variables.group_id
        ? queryClient.getQueryData<Transaction[]>(
            queryKeys.transactionsByGroup(variables.group_id)
          )
        : undefined;
      if (prevAll) {
        queryClient.setQueryData(
          queryKeys.transactions(),
          prevAll.filter((t) => t.id !== variables.id)
        );
      }
      if (prevGroup && variables.group_id) {
        queryClient.setQueryData(
          queryKeys.transactionsByGroup(variables.group_id),
          prevGroup.filter((t) => t.id !== variables.id)
        );
      }
      return { prevAll, prevGroup };
    },
    onError: (_err, variables, context) => {
      if (context?.prevAll) {
        queryClient.setQueryData(queryKeys.transactions(), context.prevAll);
      }
      if (context?.prevGroup && variables.group_id) {
        queryClient.setQueryData(
          queryKeys.transactionsByGroup(variables.group_id),
          context.prevGroup
        );
      }
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions() });
      if (variables.group_id) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.transactionsByGroup(variables.group_id),
        });
        // Invalidate balances when transactions change
        queryClient.invalidateQueries({
          queryKey: queryKeys.balances(variables.group_id),
        });
      }
      // Also invalidate overall balances
      queryClient.invalidateQueries({ queryKey: queryKeys.balances() });
    },
  });
}
