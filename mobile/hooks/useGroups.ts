import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { Group, GroupWithMembers } from "../types";
import { fetchWithAuth } from "../utils/api";
import { queryKeys } from "./queryKeys";

export async function fetchGroups(): Promise<Group[]> {
  const response = await fetchWithAuth("/groups");
  if (!response.ok) {
    throw new Error(`Failed to fetch groups: ${response.status}`);
  }
  return response.json();
}

export async function fetchGroupDetails(groupId: string): Promise<GroupWithMembers> {
  const response = await fetchWithAuth(`/groups/${groupId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch group details: ${response.status}`);
  }
  return response.json();
}

export function useGroups() {
  const { user } = useAuth();
  const query = useQuery<Group[], Error>({
    queryKey: queryKeys.groups,
    queryFn: fetchGroups,
    enabled: !!user?.id,
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

export function useGroupDetails(groupId: string | null) {
  const { user } = useAuth();

  const query = useQuery<GroupWithMembers | null, Error>({
    queryKey: groupId ? queryKeys.group(groupId) : ["group", null],
    queryFn: () => fetchGroupDetails(groupId as string),
    enabled: !!user?.id && !!groupId,
    staleTime: 60_000,
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error ?? null,
    refetch: query.refetch,
  };
}
