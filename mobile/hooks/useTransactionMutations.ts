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
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions() });
      if (variables.group_id) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.transactionsByGroup(variables.group_id),
        });
      }
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
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions() });
      if (variables.group_id) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.transactionsByGroup(variables.group_id),
        });
      }
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
      }
    },
  });
}
