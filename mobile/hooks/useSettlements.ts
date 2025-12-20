import type { QueryClient } from "@tanstack/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { SettlementsResponse } from "../types";
import { fetchWithAuth } from "../utils/api";
import { queryKeys } from "./queryKeys";

export async function fetchSettlements(groupId: string): Promise<SettlementsResponse> {
  const response = await fetchWithAuth(`/settlements?group_id=${groupId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch settlements: ${response.status}`);
  }
  return response.json();
}

function invalidateSettlementAdjacents(queryClient: QueryClient, groupId?: string) {
  if (!groupId) return;
  queryClient.invalidateQueries({ queryKey: queryKeys.settlements(groupId) });
  queryClient.invalidateQueries({ queryKey: ["balances"] }); // Invalidate all balances (including global)
  queryClient.invalidateQueries({ queryKey: queryKeys.balances(groupId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.activity(groupId) });
}

export function useSettlements(groupId?: string | null) {
  const { user } = useAuth();

  const query = useQuery<SettlementsResponse, Error>({
    // Guarded by `enabled`, so groupId is always non-null inside queryFn
    queryKey: groupId ? queryKeys.settlements(groupId) : queryKeys.settlements(""),
    queryFn: () => fetchSettlements(groupId as string),
    enabled: !!user?.id && !!groupId,
    // Use placeholderData so initial load still reports isLoading=true
    placeholderData: { settlements: [] },
    staleTime: 30_000,
  });

  return {
    data: { settlements: query.data?.settlements ?? [] },
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error ?? null,
    refetch: query.refetch,
  };
}

export function useCreateSettlement(onSuccess?: () => void) {
  const queryClient = useQueryClient();

  interface CreateSettlementInput {
    group_id: string;
    from_participant_id: string;
    to_participant_id: string;
    amount: number;
    currency: string;
    notes?: string;
  }

  const mutation = useMutation<SettlementsResponse, Error, CreateSettlementInput>({
    mutationFn: async (settlementData) => {
      const response = await fetchWithAuth("/settlements", {
        method: "POST",
        body: JSON.stringify(settlementData),
      });

      if (!response.ok) {
        throw new Error("Failed to create settlement");
      }

      return response.json();
    },
    onSuccess: (_data, variables) => {
      invalidateSettlementAdjacents(queryClient, variables.group_id);
      onSuccess?.();
    },
  });

  return {
    mutate: mutation.mutateAsync,
    isLoading: mutation.isPending,
    error: (mutation.error as Error | null) ?? null,
  };
}

export function useUpdateSettlement(onSuccess?: () => void) {
  const queryClient = useQueryClient();

  interface UpdateSettlementInput {
    id: string;
    amount?: number;
    currency?: string;
    notes?: string;
    group_id?: string;
    from_participant_id?: string;
    to_participant_id?: string;
  }

  const mutation = useMutation<SettlementsResponse, Error, UpdateSettlementInput>({
    mutationFn: async (settlementData) => {
      const response = await fetchWithAuth("/settlements", {
        method: "PUT",
        body: JSON.stringify(settlementData),
      });

      if (!response.ok) {
        throw new Error("Failed to update settlement");
      }

      return response.json();
    },
    onSuccess: (_data, variables) => {
      const groupId = variables.group_id;
      invalidateSettlementAdjacents(queryClient, groupId);
      onSuccess?.();
    },
  });

  return {
    mutate: mutation.mutateAsync,
    isLoading: mutation.isPending,
    error: (mutation.error as Error | null) ?? null,
  };
}

export function useDeleteSettlement(onSuccess?: () => void) {
  const queryClient = useQueryClient();

  interface DeleteSettlementInput {
    id: string;
    groupId?: string;
  }

  const mutation = useMutation<DeleteSettlementInput, Error, DeleteSettlementInput, { groupId?: string, previous?: SettlementsResponse }>({
    mutationFn: async (variables) => {
      const response = await fetchWithAuth(`/settlements?id=${variables.id}`, {
        method: "DELETE",
      });

      if (!response.ok && response.status !== 204) {
        throw new Error("Failed to delete settlement");
      }

      return variables;
    },
    onMutate: async (variables: DeleteSettlementInput) => {
      const groupId = variables.groupId;
      if (!groupId) return { groupId, previous: undefined };

      await queryClient.cancelQueries({ queryKey: queryKeys.settlements(groupId) });
      const previous = queryClient.getQueryData<SettlementsResponse>(
        queryKeys.settlements(groupId)
      );

      queryClient.setQueryData<SettlementsResponse>(
        queryKeys.settlements(groupId),
        (old) => {
          const current = old?.settlements ?? [];
          return {
            settlements: current.filter((s) => s.id !== variables.id),
          };
        }
      );

      return { groupId, previous };
    },
    onError: (_error, _variables, context: any) => {
      if (context?.groupId && context.previous) {
        queryClient.setQueryData(
          queryKeys.settlements(context.groupId),
          context.previous
        );
      }
    },
    onSuccess: (_data, variables, context: any) => {
      invalidateSettlementAdjacents(queryClient, variables.groupId);
      if (context?.groupId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.settlements(context.groupId),
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
