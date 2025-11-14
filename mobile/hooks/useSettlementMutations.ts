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
    onMutate: async (variables) => {
      // Cancel outgoing queries
      await queryClient.cancelQueries({
        queryKey: queryKeys.settlements(variables.group_id),
      });

      // Snapshot previous value
      const previousResponse = queryClient.getQueryData<SettlementsResponse>(
        queryKeys.settlements(variables.group_id)
      );

      // Create temporary settlement for optimistic update
      const tempId = `tmp-${Date.now()}`;
      const tempSettlement: Settlement = {
        id: tempId,
        group_id: variables.group_id,
        from_user_id: variables.from_user_id,
        to_user_id: variables.to_user_id,
        amount: variables.amount,
        currency: variables.currency || 'USD',
        notes: variables.notes,
        created_by: '', // Will be populated from server
        created_at: new Date().toISOString(),
      };

      // Optimistically update cache
      if (previousResponse?.settlements) {
        queryClient.setQueryData(
          queryKeys.settlements(variables.group_id),
          {
            settlements: [tempSettlement, ...previousResponse.settlements]
          }
        );
      }

      return { previousResponse, tempId };
    },
    onError: (_err, variables, context) => {
      // Rollback optimistic updates
      if (context?.previousResponse) {
        queryClient.setQueryData(
          queryKeys.settlements(variables.group_id),
          context.previousResponse
        );
      }
    },
    onSuccess: (data, variables, context) => {
      // Replace temporary settlement with real one from server
      if (data?.settlement && context?.tempId) {
        try {
          const previousResponse = queryClient.getQueryData<SettlementsResponse>(
            queryKeys.settlements(variables.group_id)
          );
          if (previousResponse?.settlements) {
            const updated = previousResponse.settlements.map(s =>
              s.id === context.tempId ? data.settlement : s
            );
            queryClient.setQueryData(
              queryKeys.settlements(variables.group_id),
              { settlements: updated }
            );
          }
        } catch (error) {
          console.error('Failed to replace temp settlement:', error);
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
    onMutate: async (variables) => {
      // We need to fetch the settlement to get group_id for cache key
      // Since we don't have it, we'll need to invalidate all or handle differently
      // For now, we'll do optimistic update after getting the response
      await queryClient.cancelQueries({ queryKey: queryKeys.settlements() });
    },
    onSuccess: (data) => {
      // Update settlements cache with server response
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
        }
      }
      
      // Invalidate settlements queries
      queryClient.invalidateQueries({ queryKey: queryKeys.settlements() });
      if (data?.settlement) {
        queryClient.invalidateQueries({ queryKey: queryKeys.settlements(data.settlement.group_id) });
      }
      
      // Invalidate balances when settlements change
      queryClient.invalidateQueries({ queryKey: queryKeys.balances() });
      if (data?.settlement) {
        queryClient.invalidateQueries({ queryKey: queryKeys.balances(data.settlement.group_id) });
      }
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
    onMutate: async (variables) => {
      if (!variables.groupId) return { previousResponse: undefined };

      // Cancel outgoing queries
      await queryClient.cancelQueries({
        queryKey: queryKeys.settlements(variables.groupId),
      });

      // Snapshot previous value
      const previousResponse = queryClient.getQueryData<SettlementsResponse>(
        queryKeys.settlements(variables.groupId)
      );

      // Optimistically remove settlement
      if (previousResponse?.settlements) {
        queryClient.setQueryData(
          queryKeys.settlements(variables.groupId),
          {
            settlements: previousResponse.settlements.filter((s) => s.id !== variables.id)
          }
        );
      }

      return { previousResponse };
    },
    onError: (_err, variables, context) => {
      // Rollback optimistic updates
      if (context?.previousResponse && variables.groupId) {
        queryClient.setQueryData(
          queryKeys.settlements(variables.groupId),
          context.previousResponse
        );
      }
    },
    onSuccess: (_, variables) => {
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
