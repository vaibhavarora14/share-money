import { useQuery, useQueryClient } from "@tanstack/react-query";
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


