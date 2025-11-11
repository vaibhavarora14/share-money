import { useMutation, useQueryClient } from "@tanstack/react-query";
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
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.invitationsByGroup(variables.groupId),
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
      const previousInvites = queryClient.getQueryData(
        queryKeys.invitationsByGroup(groupId)
      ) as any[] | undefined;
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
    },
  });
}
