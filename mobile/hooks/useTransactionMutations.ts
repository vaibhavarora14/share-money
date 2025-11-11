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
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      if (variables.group_id) {
        queryClient.invalidateQueries({
          queryKey: ["transactions", "group", variables.group_id],
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
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      if (variables.group_id) {
        queryClient.invalidateQueries({
          queryKey: ["transactions", "group", variables.group_id],
        });
      }
    },
  });
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      variables:
        | number
        | {
            id: number;
            group_id?: string;
          }
    ) => {
      const id = typeof variables === "number" ? variables : variables.id;
      const response = await fetchWithAuth(`/transactions?id=${id}`, {
        method: "DELETE",
      });
      if (response.status === 204) return null;
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      const groupId = typeof variables === "number" ? undefined : variables.group_id;
      if (groupId) {
        queryClient.invalidateQueries({
          queryKey: ["transactions", "group", groupId],
        });
      }
    },
  });
}
