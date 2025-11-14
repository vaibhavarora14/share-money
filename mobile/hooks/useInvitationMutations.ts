import { useMutation, useQueryClient } from "@tanstack/react-query";
import { GroupInvitation } from "../types";
import { fetchWithAuth } from "../utils/api";
import { queryKeys } from "../utils/queryKeys";

export function useCreateInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      groupId,
      email,
    }: {
      groupId: string;
      email: string;
    }) => {
      const response = await fetchWithAuth("/invitations", {
        method: "POST",
        body: JSON.stringify({
          group_id: groupId,
          email: email,
        }),
      });
      if (response.status === 204) return null;
      return response.json();
    },
    onSuccess: (data, variables) => {
      // Optimistically add invitation to cache if we have the data
      if (data && typeof data === 'object' && 'invitation_id' in data) {
        const previousInvites = queryClient.getQueryData<GroupInvitation[]>(
          queryKeys.invitationsByGroup(variables.groupId)
        );
        if (previousInvites) {
          const newInvitation: GroupInvitation = {
            id: (data as any).invitation_id || `tmp-${Date.now()}`,
            group_id: variables.groupId,
            email: variables.email,
            invited_by: '', // Will be populated on refetch
            status: 'pending',
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
            created_at: new Date().toISOString(),
          };
          queryClient.setQueryData(
            queryKeys.invitationsByGroup(variables.groupId),
            [...previousInvites, newInvitation]
          );
        }
      }
      
      // Invalidate queries to ensure consistency
      queryClient.invalidateQueries({
        queryKey: queryKeys.invitationsByGroup(variables.groupId),
      });
      // Also invalidate group query in case it includes invitation info
      queryClient.invalidateQueries({
        queryKey: queryKeys.group(variables.groupId),
      });
    },
  });
}

export function useCancelInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      invitationId,
      groupId,
    }: {
      invitationId: string;
      groupId: string;
    }) => {
      const response = await fetchWithAuth(`/invitations/${invitationId}`, {
        method: "DELETE",
      });
      if (response.status === 204) return null;
      return response.json();
    },
    onMutate: async ({ invitationId, groupId }) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.invitationsByGroup(groupId),
      });
      const previousInvites = queryClient.getQueryData<GroupInvitation[]>(
        queryKeys.invitationsByGroup(groupId)
      );
      if (previousInvites) {
        queryClient.setQueryData(
          queryKeys.invitationsByGroup(groupId),
          previousInvites.filter((inv) => inv.id !== invitationId)
        );
      }
      return { previousInvites };
    },
    onError: (_err, { groupId }, context) => {
      if (context?.previousInvites) {
        queryClient.setQueryData(
          queryKeys.invitationsByGroup(groupId),
          context.previousInvites
        );
      }
    },
    onSettled: (_data, _error, { groupId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.invitationsByGroup(groupId),
      });
      // Also invalidate group query in case it includes invitation info
      queryClient.invalidateQueries({
        queryKey: queryKeys.group(groupId),
      });
    },
  });
}
