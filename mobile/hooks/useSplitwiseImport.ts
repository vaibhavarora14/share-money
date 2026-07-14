import type { QueryClient } from "@tanstack/react-query";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchWithAuth } from "../utils/api";
import { queryKeys } from "./queryKeys";

export interface SplitwiseImportSplit {
  participant_id: string;
  amount: number;
}

export interface SplitwiseImportExpense {
  description: string;
  date: string; // YYYY-MM-DD
  category?: string | null;
  currency: string;
  amount: number;
  paid_by_participant_id: string;
  splits: SplitwiseImportSplit[];
}

export interface SplitwiseImportSettlement {
  from_participant_id: string;
  to_participant_id: string;
  amount: number;
  currency: string;
  notes?: string | null;
}

export interface SplitwiseImportInput {
  group_id: string;
  expenses: SplitwiseImportExpense[];
  settlements: SplitwiseImportSettlement[];
}

export interface SplitwiseImportResult {
  imported_expenses: number;
  imported_settlements: number;
}

function invalidateImportAdjacents(queryClient: QueryClient, groupId: string) {
  queryClient.invalidateQueries({ queryKey: queryKeys.transactionsFeed(groupId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.transactions(groupId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.groupStats(groupId) });
  queryClient.invalidateQueries({ queryKey: ["balances"] }); // includes global balances
  queryClient.invalidateQueries({ queryKey: queryKeys.balances(groupId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.activity(groupId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.settlements(groupId) });
}

export function useSplitwiseImport(onSuccess?: (result: SplitwiseImportResult) => void) {
  const queryClient = useQueryClient();

  const mutation = useMutation<SplitwiseImportResult, Error, SplitwiseImportInput>({
    mutationFn: async (importData) => {
      const response = await fetchWithAuth("/import-splitwise", {
        method: "POST",
        body: JSON.stringify(importData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to import from Splitwise");
      }

      return response.json();
    },
    onSuccess: (result, variables) => {
      invalidateImportAdjacents(queryClient, variables.group_id);
      onSuccess?.(result);
    },
  });

  return {
    mutate: mutation.mutateAsync,
    isLoading: mutation.isPending,
    error: (mutation.error as Error | null) ?? null,
  };
}
