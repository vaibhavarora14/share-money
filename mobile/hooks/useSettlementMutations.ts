import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Settlement } from "../types";
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
    onSuccess: (_, variables) => {
      // Invalidate settlements queries
      queryClient.invalidateQueries({ queryKey: queryKeys.settlements() });
      queryClient.invalidateQueries({ queryKey: queryKeys.settlements(variables.group_id) });
      
      // Invalidate balances when settlements change
      queryClient.invalidateQueries({ queryKey: queryKeys.balances() });
      queryClient.invalidateQueries({ queryKey: queryKeys.balances(variables.group_id) });
    },
  });
}
