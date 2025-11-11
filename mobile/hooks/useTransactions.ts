import { useQuery, keepPreviousData as keepPreviousValue } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { Transaction } from "../types";
import { fetchWithAuth } from "../utils/api";
import { queryKeys } from "../utils/queryKeys";

export function useTransactions(groupId?: string | null) {
  const { session } = useAuth();

  return useQuery<Transaction[]>({
    queryKey: groupId ? queryKeys.transactionsByGroup(groupId) : queryKeys.transactions(),
    queryFn: async () => {
      if (!session) {
        throw new Error("Not authenticated");
      }

      const endpoint = groupId
        ? `/transactions?group_id=${groupId}`
        : "/transactions";
      const response = await fetchWithAuth(endpoint);
      const data: Transaction[] = await response.json();

      // API already filters by group_id when query param is provided
      return data;
    },
    enabled: !!session,
    placeholderData: keepPreviousValue,
  });
}
