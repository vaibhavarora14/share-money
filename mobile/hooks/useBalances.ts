import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { BalancesResponse } from "../types";
import { fetchWithAuth } from "../utils/api";
import { queryKeys } from "./queryKeys";

export async function fetchBalances(
  groupId?: string | null
): Promise<BalancesResponse> {
  const endpoint = groupId ? `/balances?group_id=${groupId}` : "/balances";
  const response = await fetchWithAuth(endpoint);
  if (!response.ok) {
    throw new Error(`Failed to fetch balances: ${response.status}`);
  }
  return response.json();
}

export function useBalances(groupId?: string | null) {
  const { user } = useAuth();

  const query = useQuery<BalancesResponse, Error>({
    // Guarded by `enabled`, so groupId is always defined inside queryFn
    queryKey: groupId ? queryKeys.balances(groupId) : queryKeys.balances(""),
    queryFn: () => fetchBalances(groupId),
    enabled: !!user?.id && (!!groupId || groupId === null || groupId === undefined),
    staleTime: 30_000,
  });

  return {
    data: query.data ?? { group_balances: [], overall_balances: [] },
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error ?? null,
    refetch: query.refetch,
  };
}
