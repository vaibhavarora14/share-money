import { useInfiniteQuery } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { ActivityFeedResponse } from "../types";
import { fetchWithAuth } from "../utils/api";
import { queryKeys } from "./queryKeys";

const ACTIVITY_PAGE_SIZE = 50;

export async function fetchActivityPage(
  groupId: string,
  offset: number = 0,
  limit: number = ACTIVITY_PAGE_SIZE
): Promise<ActivityFeedResponse> {
  const response = await fetchWithAuth(
    `/activity?group_id=${groupId}&limit=${limit}&offset=${offset}`
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch activity: ${response.status}`);
  }
  return response.json();
}

export async function fetchActivity(
  groupId: string
): Promise<ActivityFeedResponse> {
  return fetchActivityPage(groupId, 0, ACTIVITY_PAGE_SIZE);
}

export function useActivity(groupId?: string | null) {
  const { user } = useAuth();

  const query = useInfiniteQuery<ActivityFeedResponse, Error>({
    // Guarded by `enabled`, so groupId is always non-null inside queryFn
    queryKey: groupId ? queryKeys.activity(groupId) : queryKeys.activity(""),
    queryFn: ({ pageParam = 0 }) =>
      fetchActivityPage(groupId as string, pageParam as number, ACTIVITY_PAGE_SIZE),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage?.has_more) return undefined;
      const loadedCount = allPages.reduce(
        (acc, page) => acc + (page?.activities?.length || 0),
        0
      );
      return loadedCount;
    },
    enabled: !!user?.id && !!groupId,
    staleTime: 60_000,
  });

  const pages = query.data?.pages || [];
  const flattenedActivities = pages.flatMap((page) => page?.activities || []);
  const total = pages[0]?.total ?? flattenedActivities.length;
  const hasMore = query.hasNextPage;

  return {
    data: { activities: flattenedActivities },
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    error: query.error ?? null,
    total,
    hasMore,
    refetch: query.refetch,
  };
}
