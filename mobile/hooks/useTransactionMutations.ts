import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Transaction } from "../types";
import { fetchWithAuth } from "../utils/api";

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
    // No optimistic updates - always fetch fresh data from server
    onSuccess: async (_data, variables) => {
      // Use resetQueries which clears cache AND refetches active queries
      await queryClient.resetQueries({ 
        predicate: (query) => query.queryKey[0] === 'transactions'
      });
      
      await queryClient.resetQueries({ 
        predicate: (query) => query.queryKey[0] === 'balances'
      });
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
    // No optimistic updates - always fetch fresh data from server
    onSuccess: async (_data, variables) => {
      // Use resetQueries which clears cache AND refetches active queries
      await queryClient.resetQueries({ 
        predicate: (query) => query.queryKey[0] === 'transactions'
      });
      
      await queryClient.resetQueries({ 
        predicate: (query) => query.queryKey[0] === 'balances'
      });
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
      console.log('[DeleteTransaction] Starting deletion', { id: variables.id, group_id: variables.group_id });
      const response = await fetchWithAuth(`/transactions?id=${variables.id}`, {
        method: "DELETE",
      });
      console.log('[DeleteTransaction] Delete response status', response.status);
      if (response.status === 204) return null;
      return response.json();
    },
    onSuccess: (_data, variables) => {
      console.log('[DeleteTransaction] onSuccess - manually updating cache', { id: variables.id });
      
      // Get all queries and manually update the cache data
      const allQueries = queryClient.getQueryCache().getAll();
      const transactionQueries = allQueries.filter(q => q.queryKey[0] === 'transactions');
      
      console.log('[DeleteTransaction] Updating', transactionQueries.length, 'transaction queries');
      
      // Manually update each transaction query's data
      for (const query of transactionQueries) {
        const currentData = queryClient.getQueryData<Transaction[]>(query.queryKey);
        if (currentData) {
          const updatedData = currentData.filter(tx => tx.id !== variables.id);
          console.log('[DeleteTransaction] Query', query.queryKey, '- before:', currentData.length, 'after:', updatedData.length);
          queryClient.setQueryData(query.queryKey, updatedData);
        }
      }
      
      // Refetch balances (they need server calculation)
      const balanceQueries = allQueries.filter(q => q.queryKey[0] === 'balances');
      console.log('[DeleteTransaction] Refetching', balanceQueries.length, 'balance queries');
      for (const query of balanceQueries) {
        query.fetch();
      }
      
      console.log('[DeleteTransaction] Done');
    },
  });
}
