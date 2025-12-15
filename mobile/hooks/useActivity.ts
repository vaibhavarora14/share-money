import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { ActivityFeedResponse } from "../types";
import { fetchWithAuth } from "../utils/api";
import { queryKeys } from "./queryKeys";

export async function fetchActivity(
  groupId: string
): Promise<ActivityFeedResponse> {
  const response = await fetchWithAuth(`/activity?group_id=${groupId}&limit=50`);
  if (!response.ok) {
    throw new Error(`Failed to fetch activity: ${response.status}`);
  }
  return response.json();
}

export function useActivity(groupId?: string | null) {
  const { user } = useAuth();

  const query = useQuery<ActivityFeedResponse, Error>({
    queryKey: groupId ? queryKeys.activity(groupId) : ["activity", null],
    queryFn: () => fetchActivity(groupId as string),
    enabled: !!user?.id && !!groupId,
    initialData: { activities: [], total: 0, has_more: false },
    staleTime: 60_000,
  });

  const data = query.data ?? { activities: [], total: 0, has_more: false };

  return {
    data: { activities: data.activities || [] },
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error ?? null,
    total: data.total || 0,
    hasMore: data.has_more || false,
    refetch: query.refetch,
  };
}
