import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { Transaction } from "../types";
import { fetchWithAuth } from "../utils/api";

export function useTransactions(groupId?: string | null) {
  const { session } = useAuth();

  return useQuery<Transaction[]>({
    queryKey: groupId ? ["transactions", "group", groupId] : ["transactions"],
    queryFn: async () => {
      if (!session) {
        throw new Error("Not authenticated");
      }

      const endpoint = groupId
        ? `/transactions?group_id=${groupId}`
        : "/transactions";
      const response = await fetchWithAuth(endpoint);
      const data: Transaction[] = await response.json();

      // If filtering by group, ensure we only return transactions for that group
      if (groupId) {
        return data.filter((t) => t.group_id === groupId);
      }

      return data;
    },
    enabled: !!session,
  });
}
