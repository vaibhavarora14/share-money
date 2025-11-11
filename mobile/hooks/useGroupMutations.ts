import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { Group } from "../types";
import { fetchWithAuth } from "../utils/api";

export function useCreateGroup() {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  return useMutation({
    mutationFn: async (groupData: { name: string; description?: string }) => {
      if (!session) {
        throw new Error("Not authenticated");
      }

      const response = await fetchWithAuth("/groups", {
        method: "POST",
        body: JSON.stringify(groupData),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
    },
  });
}

export function useAddMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      groupId,
      email,
    }: {
      groupId: string;
      email: string;
    }) => {
      const response = await fetchWithAuth("/group-members", {
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
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ["group", variables.groupId] }),
        queryClient.cancelQueries({
          queryKey: ["group-invitations", variables.groupId],
        }),
      ]);
      const previousGroup = queryClient.getQueryData(["group", variables.groupId]);
      const previousInvitations = queryClient.getQueryData([
        "group-invitations",
        variables.groupId,
      ]) as any[] | undefined;
      // Optimistically add a pending invitation entry
      if (previousInvitations) {
        queryClient.setQueryData([
          "group-invitations",
          variables.groupId,
        ], [...previousInvitations, { id: `tmp-${Date.now()}`, group_id: variables.groupId, email: variables.email, status: "pending" }]);
      }
      return { previousGroup, previousInvitations };
    },
    onError: (_err, variables, context) => {
      if (context?.previousGroup) {
        queryClient.setQueryData(["group", variables.groupId], context.previousGroup);
      }
      if (context?.previousInvitations) {
        queryClient.setQueryData([
          "group-invitations",
          variables.groupId,
        ], context.previousInvitations);
      }
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: ["group", variables.groupId] });
      queryClient.invalidateQueries({
        queryKey: ["group-invitations", variables.groupId],
      });
    },
  });
}

export function useRemoveMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      groupId,
      userId,
    }: {
      groupId: string;
      userId: string;
    }) => {
      const response = await fetchWithAuth(
        `/group-members?group_id=${groupId}&user_id=${userId}`,
        {
          method: "DELETE",
        }
      );
      if (response.status === 204) return null;
      return response.json();
    },
    onMutate: async (variables) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ["group", variables.groupId] }),
        queryClient.cancelQueries({ queryKey: ["groups"] }),
      ]);
      const previousGroup = queryClient.getQueryData(["group", variables.groupId]) as any;
      if (previousGroup?.members) {
        queryClient.setQueryData(["group", variables.groupId], {
          ...previousGroup,
          members: previousGroup.members.filter((m: any) => m.user_id !== variables.userId),
        });
      }
      return { previousGroup };
    },
    onError: (_err, variables, context) => {
      if (context?.previousGroup) {
        queryClient.setQueryData(["group", variables.groupId], context.previousGroup);
      }
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: ["group", variables.groupId] });
      queryClient.invalidateQueries({ queryKey: ["groups"] });
    },
  });
}

export function useDeleteGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (groupId: string) => {
      const response = await fetchWithAuth(`/groups/${groupId}`, {
        method: "DELETE",
      });
      if (response.status === 204) return null;
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
    },
  });
}
