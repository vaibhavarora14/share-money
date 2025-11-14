import { useQuery, keepPreviousData as keepPreviousValue } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { SettlementsResponse } from "../types";
import { fetchWithAuth } from "../utils/api";
import { queryKeys } from "../utils/queryKeys";

export function useSettlements(groupId?: string | null) {
  const { session } = useAuth();

  return useQuery<SettlementsResponse>({
    queryKey: queryKeys.settlements(groupId || undefined),
    queryFn: async () => {
      if (!session) {
        throw new Error("Not authenticated");
      }

      const endpoint = groupId
        ? `/settlements?group_id=${groupId}`
        : "/settlements";
      const response = await fetchWithAuth(endpoint);
      return response.json();
    },
    enabled: !!session,
    placeholderData: keepPreviousValue,
  });
}
