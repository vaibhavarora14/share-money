import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { BalancesResponse, GroupStatsResponse } from "../types";
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
    // Use "all" for global fetch to differentiate from specific group fetches
    queryKey: groupId ? queryKeys.balances(groupId) : ["balances", "all"],
    queryFn: () => fetchBalances(groupId),
    enabled: !!user?.id && (!!groupId || groupId === null || groupId === undefined),
    staleTime: 5_000, // Reduced for testing responsiveness
  });

  return {
    data: query.data ?? { group_balances: [], overall_balances: [] },
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error ?? null,
    refetch: query.refetch,
  };
}

export async function fetchGroupStats(groupId: string): Promise<GroupStatsResponse> {
  const response = await fetchWithAuth(`/balances?group_id=${groupId}&include_stats=true`);
  if (!response.ok) {
    throw new Error(`Failed to fetch group stats: ${response.status}`);
  }
  const data: BalancesResponse = await response.json();
  if (!data.group_stats) {
    throw new Error("Group stats payload is missing");
  }
  return data.group_stats;
}

export function useGroupStats(groupId?: string | null) {
  const { user } = useAuth();

  const query = useQuery<GroupStatsResponse, Error>({
    queryKey: groupId ? queryKeys.groupStats(groupId) : queryKeys.groupStats(""),
    queryFn: () => fetchGroupStats(groupId as string),
    enabled: !!user?.id && !!groupId,
    staleTime: 30_000,
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error ?? null,
    refetch: query.refetch,
  };
}
