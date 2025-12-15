import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { GroupInvitation } from "../types";
import { fetchWithAuth } from "../utils/api";
import { queryKeys } from "./queryKeys";

export async function fetchGroupInvitations(
  groupId: string
): Promise<GroupInvitation[]> {
  const response = await fetchWithAuth(`/invitations?group_id=${groupId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch invitations: ${response.status}`);
  }
  return response.json();
}

export function useGroupInvitations(groupId: string | null) {
  const { user } = useAuth();

  const query = useQuery<GroupInvitation[], Error>({
    queryKey: groupId ? queryKeys.invitations(groupId) : ["invitations", null],
    queryFn: () => fetchGroupInvitations(groupId as string),
    enabled: !!user?.id && !!groupId,
    initialData: [],
    staleTime: 60_000,
  });

  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error ?? null,
    refetch: query.refetch,
  };
}

export function useCancelInvitation(onSuccess?: () => void) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (variables: { invitationId: string; groupId: string }) => {
      const response = await fetchWithAuth(
        `/invitations/${variables.invitationId}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        throw new Error("Failed to cancel invitation");
      }

      return variables;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.invitations(data.groupId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.group(data.groupId) });
      onSuccess?.();
    },
  });

  return {
    mutate: mutation.mutateAsync,
    isLoading: mutation.isPending,
    error: (mutation.error as Error | null) ?? null,
  };
}
