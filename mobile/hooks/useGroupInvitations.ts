import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { GroupInvitation } from "../types";
import { fetchWithAuth } from "../utils/api";
import { queryKeys } from "../utils/queryKeys";

export function useGroupInvitations(groupId: string | null) {
  const { session } = useAuth();

  return useQuery<GroupInvitation[]>({
    queryKey: groupId ? queryKeys.invitationsByGroup(groupId) : ["group-invitations", groupId],
    queryFn: async () => {
      if (!session || !groupId) {
        throw new Error("Not authenticated or invalid group ID");
      }

      const response = await fetchWithAuth(`/invitations?group_id=${groupId}`);
      const data: GroupInvitation[] = await response.json();
      // Filter to only show pending invitations
      return data.filter((inv) => inv.status === "pending");
    },
    enabled: !!session && !!groupId,
  });
}
