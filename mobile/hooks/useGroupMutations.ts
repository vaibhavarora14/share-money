import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { Group, GroupInvitation, GroupWithMembers } from "../types";
import { fetchWithAuth } from "../utils/api";
import { queryKeys } from "../utils/queryKeys";

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
      queryClient.invalidateQueries({ queryKey: queryKeys.groups });
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
        queryClient.cancelQueries({ queryKey: queryKeys.group(variables.groupId) }),
        queryClient.cancelQueries({
          queryKey: queryKeys.invitationsByGroup(variables.groupId),
        }),
        queryClient.cancelQueries({ queryKey: queryKeys.groups }),
      ]);
      const previousGroup = queryClient.getQueryData<GroupWithMembers>(
        queryKeys.group(variables.groupId)
      );
      const previousInvitations = queryClient.getQueryData<GroupInvitation[]>(
        queryKeys.invitationsByGroup(variables.groupId)
      );
      // Optimistically add a pending invitation entry
      if (previousInvitations) {
        queryClient.setQueryData(
          queryKeys.invitationsByGroup(variables.groupId),
          [...previousInvitations, { id: `tmp-${Date.now()}`, group_id: variables.groupId, email: variables.email, status: "pending" }]
        );
      }
      return { previousGroup, previousInvitations };
    },
    onError: (_err, variables, context) => {
      if (context?.previousGroup) {
        queryClient.setQueryData(queryKeys.group(variables.groupId), context.previousGroup);
      }
      if (context?.previousInvitations) {
        queryClient.setQueryData(
          queryKeys.invitationsByGroup(variables.groupId),
          context.previousInvitations
        );
      }
    },
    onSuccess: (data, variables) => {
      // If member was actually added (not just invitation), update cache optimistically
      if (data && typeof data === 'object' && 'user_id' in data) {
        const previousGroup = queryClient.getQueryData<GroupWithMembers>(
          queryKeys.group(variables.groupId)
        );
        if (previousGroup) {
          // Check if member already exists in cache
          const memberExists = previousGroup.members?.some(
            (m) => m.user_id === data.user_id
          );
          if (!memberExists) {
            queryClient.setQueryData(queryKeys.group(variables.groupId), {
              ...previousGroup,
              members: [
                ...(previousGroup.members || []),
                {
                  id: data.id || `tmp-${Date.now()}`,
                  group_id: variables.groupId,
                  user_id: data.user_id,
                  role: data.role || 'member',
                  email: variables.email,
                },
              ],
            });
          }
        }
      }
    },
    onSettled: (_data, _error, variables) => {
      // Invalidate all related queries to ensure fresh data
      queryClient.invalidateQueries({ queryKey: queryKeys.group(variables.groupId) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.invitationsByGroup(variables.groupId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.groups });
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
        queryClient.cancelQueries({ queryKey: queryKeys.group(variables.groupId) }),
        queryClient.cancelQueries({ queryKey: queryKeys.groups }),
      ]);
      const previousGroup = queryClient.getQueryData<GroupWithMembers>(
        queryKeys.group(variables.groupId)
      );
      if (previousGroup?.members) {
        queryClient.setQueryData(queryKeys.group(variables.groupId), {
          ...previousGroup,
          members: previousGroup.members.filter((m) => m.user_id !== variables.userId),
        });
      }
      return { previousGroup };
    },
    onError: (_err, variables, context) => {
      if (context?.previousGroup) {
        queryClient.setQueryData(queryKeys.group(variables.groupId), context.previousGroup);
      }
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.group(variables.groupId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.groups });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.groups });
    },
  });
}
