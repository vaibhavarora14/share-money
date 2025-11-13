import { useQuery, keepPreviousData as keepPreviousValue } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { BalancesResponse } from "../types";
import { fetchWithAuth } from "../utils/api";
import { queryKeys } from "../utils/queryKeys";

export function useBalances(groupId?: string | null) {
  const { session } = useAuth();

  return useQuery<BalancesResponse>({
    queryKey: queryKeys.balances(groupId || undefined),
    queryFn: async () => {
      if (!session) {
        throw new Error("Not authenticated");
      }

      const endpoint = groupId
        ? `/balances?group_id=${groupId}`
        : "/balances";
      const response = await fetchWithAuth(endpoint);
      return response.json();
    },
    enabled: !!session,
    placeholderData: keepPreviousValue,
  });
}
