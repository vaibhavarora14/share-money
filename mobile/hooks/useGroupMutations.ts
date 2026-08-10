import type { QueryClient } from "@tanstack/react-query";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchWithAuth } from "../utils/api";
import type { AcquisitionContext } from "../utils/acquisition";
import { queryKeys } from "./queryKeys";
import type { Group } from "../types";

function invalidateGroupAdjacents(queryClient: QueryClient, groupId?: string) {
  queryClient.invalidateQueries({ queryKey: queryKeys.groups });
  if (!groupId) return;
  queryClient.invalidateQueries({ queryKey: queryKeys.group(groupId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.transactionsFeed(groupId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.groupStats(groupId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.balances(groupId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.activity(groupId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.invitations(groupId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.settlements(groupId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.participants(groupId) });
}

export function useCreateGroup(onSuccess?: () => void) {
  const queryClient = useQueryClient();

  const mutation = useMutation<Group, Error, {
    name: string;
    description?: string;
    acquisition_context?: AcquisitionContext;
  }>({
    mutationFn: async (groupData) => {
      const response = await fetchWithAuth("/groups", {
        method: "POST",
        body: JSON.stringify(groupData),
      });

      if (!response.ok) {
        throw new Error("Failed to create group");
      }

      return response.json() as Promise<Group>;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.groups });
      if (result?.id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.group(result.id) });
      }
      onSuccess?.();
    },
  });

  return {
    mutate: mutation.mutateAsync,
    isLoading: mutation.isPending,
    error: (mutation.error as Error | null) ?? null,
  };
}

export function useDeleteGroup(onSuccess?: () => void) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (groupId: string) => {
      const response = await fetchWithAuth(`/groups/${groupId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete group");
      }

      return { groupId };
    },
    onSuccess: (data) => {
      invalidateGroupAdjacents(queryClient, data.groupId);
      onSuccess?.();
    },
  });

  return {
    mutate: mutation.mutateAsync,
    isLoading: mutation.isPending,
    error: (mutation.error as Error | null) ?? null,
  };
}

export function useAddMember(onSuccess?: () => void) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (variables: {
      groupId: string;
      fullName?: string;
      email?: string | null;
      sourceParticipantId?: string;
    }) => {
      const response = await fetchWithAuth("/participants", {
        method: "POST",
        body: JSON.stringify({
          group_id: variables.groupId,
          ...(variables.sourceParticipantId
            ? { source_participant_id: variables.sourceParticipantId }
            : {
              full_name: variables.fullName,
              email: variables.email || null,
            }),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to add person");
      }

      return response.status === 204 ? null : await response.json();
    },
    onSuccess: (_data, variables) => {
      invalidateGroupAdjacents(queryClient, variables.groupId);
      queryClient.invalidateQueries({ queryKey: ["existing-people"] });
      onSuccess?.();
    },
  });

  return {
    mutate: mutation.mutateAsync,
    isLoading: mutation.isPending,
    error: (mutation.error as Error | null) ?? null,
  };
}

export function useRemoveMember(onSuccess?: () => void) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (variables: { groupId: string; userId: string }) => {
      const response = await fetchWithAuth(
        `/group-members?group_id=${variables.groupId}&user_id=${variables.userId}`,
        { method: "DELETE" }
      );

      if (!response.ok && response.status !== 204) {
        throw new Error("Failed to remove member");
      }

      return variables;
    },
    onSuccess: (_data, variables) => {
      invalidateGroupAdjacents(queryClient, variables.groupId);
      onSuccess?.();
    },
  });

  return {
    mutate: mutation.mutateAsync,
    isLoading: mutation.isPending,
    error: (mutation.error as Error | null) ?? null,
  };
}
