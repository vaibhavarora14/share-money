import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Settlement, SettlementsResponse } from "../types";
import { fetchWithAuth } from "../utils/api";
import { queryKeys } from "../utils/queryKeys";

export interface CreateSettlementData {
  group_id: string;
  from_user_id: string;
  to_user_id: string;
  amount: number;
  currency?: string;
  notes?: string;
}

export interface UpdateSettlementData {
  id: string;
  amount?: number;
  currency?: string;
  notes?: string;
}

export function useCreateSettlement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (settlementData: CreateSettlementData) => {
      const response = await fetchWithAuth("/settlements", {
        method: "POST",
        body: JSON.stringify(settlementData),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Failed to create settlement" }));
        throw new Error(error.error || error.message || "Failed to create settlement");
      }
      return response.json() as Promise<{ settlement: Settlement }>;
    },
    onSuccess: (data, variables) => {
      // Optimistically update settlements cache if we have the data
      if (data?.settlement) {
        try {
          const previousResponse = queryClient.getQueryData<SettlementsResponse>(
            queryKeys.settlements(variables.group_id)
          );
          if (previousResponse?.settlements) {
            // Check if settlement already exists to avoid duplicates
            const exists = previousResponse.settlements.some(s => s.id === data.settlement.id);
            if (!exists) {
              queryClient.setQueryData(
                queryKeys.settlements(variables.group_id),
                {
                  settlements: [data.settlement, ...previousResponse.settlements]
                }
              );
            }
          }
        } catch (error) {
          console.error('Failed to update settlement cache:', error);
          // Fallback to invalidation
        }
      }
      
      // Invalidate settlements queries
      queryClient.invalidateQueries({ queryKey: queryKeys.settlements() });
      queryClient.invalidateQueries({ queryKey: queryKeys.settlements(variables.group_id) });
      
      // Invalidate balances when settlements change
      queryClient.invalidateQueries({ queryKey: queryKeys.balances() });
      queryClient.invalidateQueries({ queryKey: queryKeys.balances(variables.group_id) });
    },
  });
}

export function useUpdateSettlement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (settlementData: UpdateSettlementData) => {
      const response = await fetchWithAuth("/settlements", {
        method: "PUT",
        body: JSON.stringify(settlementData),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Failed to update settlement" }));
        throw new Error(error.error || error.message || "Failed to update settlement");
      }
      return response.json() as Promise<{ settlement: Settlement }>;
    },
    onSuccess: (data) => {
      // Optimistically update settlements cache if we have the data
      if (data?.settlement) {
        try {
          const previousResponse = queryClient.getQueryData<SettlementsResponse>(
            queryKeys.settlements(data.settlement.group_id)
          );
          if (previousResponse?.settlements) {
            const index = previousResponse.settlements.findIndex(s => s.id === data.settlement.id);
            if (index >= 0) {
              const updated = [...previousResponse.settlements];
              updated[index] = data.settlement;
              queryClient.setQueryData(
                queryKeys.settlements(data.settlement.group_id),
                { settlements: updated }
              );
            }
          }
        } catch (error) {
          console.error('Failed to update settlement cache:', error);
          // Fallback to invalidation
        }
      }
      
      // Invalidate settlements queries
      queryClient.invalidateQueries({ queryKey: queryKeys.settlements() });
      queryClient.invalidateQueries({ queryKey: queryKeys.settlements(data.settlement.group_id) });
      
      // Invalidate balances when settlements change
      queryClient.invalidateQueries({ queryKey: queryKeys.balances() });
      queryClient.invalidateQueries({ queryKey: queryKeys.balances(data.settlement.group_id) });
    },
  });
}

export function useDeleteSettlement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: { id: string; groupId?: string }) => {
      const response = await fetchWithAuth(`/settlements?id=${variables.id}`, {
        method: "DELETE",
      });
      if (!response.ok && response.status !== 204) {
        const error = await response.json().catch(() => ({ error: "Failed to delete settlement" }));
        throw new Error(error.error || error.message || "Failed to delete settlement");
      }
      return { id: variables.id, groupId: variables.groupId };
    },
    onSuccess: (_, variables) => {
      // Optimistically remove settlement from cache
      if (variables.groupId) {
        try {
          const previousResponse = queryClient.getQueryData<SettlementsResponse>(
            queryKeys.settlements(variables.groupId)
          );
          if (previousResponse?.settlements) {
            queryClient.setQueryData(
              queryKeys.settlements(variables.groupId),
              {
                settlements: previousResponse.settlements.filter((s) => s.id !== variables.id)
              }
            );
          }
        } catch (error) {
          console.error('Failed to update settlement cache:', error);
          // Fallback to invalidation
        }
      }
      
      // Invalidate settlements queries
      queryClient.invalidateQueries({ queryKey: queryKeys.settlements() });
      if (variables.groupId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.settlements(variables.groupId) });
      }
      
      // Invalidate balances when settlements change
      queryClient.invalidateQueries({ queryKey: queryKeys.balances() });
      if (variables.groupId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.balances(variables.groupId) });
      }
    },
  });
}
