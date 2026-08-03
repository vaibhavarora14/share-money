import type { QueryClient } from "@tanstack/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { Participant } from "../types";
import { fetchWithAuth } from "../utils/api";
import { queryKeys } from "./queryKeys";

export async function fetchParticipants(
  groupId: string
): Promise<Participant[]> {
  const response = await fetchWithAuth(`/participants?group_id=${groupId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch participants: ${response.status}`);
  }
  return response.json();
}

export function useParticipants(groupId: string | null) {
  const { user } = useAuth();

  const query = useQuery<Participant[], Error>({
    queryKey: groupId ? queryKeys.participants(groupId) : queryKeys.participants(""),
    queryFn: () => fetchParticipants(groupId as string),
    enabled: !!user?.id && !!groupId,
    placeholderData: [],
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

function invalidateParticipantAdjacents(queryClient: QueryClient, groupId: string) {
  queryClient.invalidateQueries({ queryKey: queryKeys.participants(groupId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.group(groupId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.invitations(groupId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.transactionsFeed(groupId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.balances(groupId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.groupStats(groupId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.activity(groupId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.settlements(groupId) });
}

export function useInviteParticipant(onSuccess?: () => void) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (variables: { groupId: string; participantId: string; email?: string | null }) => {
      const response = await fetchWithAuth(`/participants/${variables.participantId}/invite`, {
        method: "POST",
        body: JSON.stringify({
          email: variables.email || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to invite person");
      }

      return response.json();
    },
    onSuccess: (_data, variables) => {
      invalidateParticipantAdjacents(queryClient, variables.groupId);
      onSuccess?.();
    },
  });

  return {
    mutate: mutation.mutateAsync,
    isLoading: mutation.isPending,
    error: (mutation.error as Error | null) ?? null,
  };
}

export function useConnectParticipant(onSuccess?: () => void) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (variables: { groupId: string; participantId: string; email?: string | null }) => {
      const response = await fetchWithAuth(`/participants/${variables.participantId}/connect`, {
        method: "POST",
        body: JSON.stringify({
          email: variables.email || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to connect account");
      }

      return response.json();
    },
    onSuccess: (_data, variables) => {
      invalidateParticipantAdjacents(queryClient, variables.groupId);
      onSuccess?.();
    },
  });

  return {
    mutate: mutation.mutateAsync,
    isLoading: mutation.isPending,
    error: (mutation.error as Error | null) ?? null,
  };
}
