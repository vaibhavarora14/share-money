import { useQuery, keepPreviousData as keepPreviousValue } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { GroupWithMembers } from "../types";
import { fetchWithAuth } from "../utils/api";
import { queryKeys } from "../utils/queryKeys";

export function useGroupDetails(groupId: string | null) {
  const { session } = useAuth();

  return useQuery<GroupWithMembers>({
    queryKey: queryKeys.group(groupId),
    queryFn: async () => {
      if (!session || !groupId) {
        throw new Error("Not authenticated or invalid group ID");
      }

      const response = await fetchWithAuth(`/groups/${groupId}`);
      return response.json();
    },
    enabled: !!session && !!groupId,
    placeholderData: keepPreviousValue,
  });
}
