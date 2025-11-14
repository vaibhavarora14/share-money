import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { GroupInvitation } from "../types";
import { fetchWithAuth } from "../utils/api";
import { queryKeys } from "../utils/queryKeys";

export function useCreateInvitation() {
  const queryClient = useQueryClient();
  const { session } = useAuth();

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
    onMutate: async (variables) => {
      // Cancel outgoing queries
      await queryClient.cancelQueries({
        queryKey: queryKeys.invitationsByGroup(variables.groupId),
      });

      // Snapshot previous value
      const previousInvites = queryClient.getQueryData<GroupInvitation[]>(
        queryKeys.invitationsByGroup(variables.groupId)
      );

      // Create temporary invitation for optimistic update
      const tempId = `tmp-${Date.now()}`;
      const tempInvitation: GroupInvitation = {
        id: tempId,
        group_id: variables.groupId,
        email: variables.email,
        invited_by: session?.user?.id || '',
        status: 'pending',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days default
        created_at: new Date().toISOString(),
      };

      // Optimistically update cache
      if (previousInvites) {
        queryClient.setQueryData(
          queryKeys.invitationsByGroup(variables.groupId),
          [...previousInvites, tempInvitation]
        );
      }

      return { previousInvites, tempId };
    },
    onError: (_err, variables, context) => {
      // Rollback optimistic updates
      if (context?.previousInvites) {
        queryClient.setQueryData(
          queryKeys.invitationsByGroup(variables.groupId),
          context.previousInvites
        );
      }
    },
    onSuccess: (data, variables, context) => {
      // Replace temporary invitation with real one from server
      // API returns the full invitation object (see invitations.ts:190)
      if (data && typeof data === 'object' && 'id' in data && context?.tempId) {
        try {
          const invitation = data as GroupInvitation;
          const previousInvites = queryClient.getQueryData<GroupInvitation[]>(
            queryKeys.invitationsByGroup(variables.groupId)
          );
          if (previousInvites) {
            // Replace temp invitation with real one
            const updated = previousInvites.map(inv =>
              inv.id === context.tempId ? invitation : inv
            );
            queryClient.setQueryData(
              queryKeys.invitationsByGroup(variables.groupId),
              updated
            );
          }
        } catch (error) {
          console.error('Failed to replace temp invitation:', error);
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
