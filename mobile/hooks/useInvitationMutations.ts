import { useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchWithAuth } from "../utils/api";

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
        queryKey: ["group-invitations", variables.groupId],
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
        queryKey: ["group-invitations", groupId],
      });
      const previousInvites = queryClient.getQueryData([
        "group-invitations",
        groupId,
      ]) as any[] | undefined;
      if (previousInvites) {
        queryClient.setQueryData(
          ["group-invitations", groupId],
          previousInvites.filter((inv) => inv.id !== invitationId)
        );
      }
      return { previousInvites };
    },
    onError: (_err, { groupId }, context) => {
      if (context?.previousInvites) {
        queryClient.setQueryData(
          ["group-invitations", groupId],
          context.previousInvites
        );
      }
    },
    onSettled: (_data, _error, { groupId }) => {
      queryClient.invalidateQueries({
        queryKey: ["group-invitations", groupId],
      });
    },
  });
}
