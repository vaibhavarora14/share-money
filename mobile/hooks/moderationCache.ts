type ActivityWithAuthor = {
  changed_by: { id: string };
};

type ActivityFeedCache<TActivity extends ActivityWithAuthor = ActivityWithAuthor> = {
  activities: TActivity[];
  total: number;
};

export type ActivityQueryCacheEntry<
  TFeed extends ActivityFeedCache = ActivityFeedCache,
> = readonly [
  readonly unknown[],
  TFeed | undefined,
];

export function filterActivityFeedForBlockedUser<TFeed extends ActivityFeedCache>(
  current: TFeed | undefined,
  blockedUserId: string
): TFeed | undefined {
  if (!current) return current;

  const activities = current.activities.filter(
    (activity) => activity.changed_by.id !== blockedUserId
  );
  const removedCount = current.activities.length - activities.length;

  return {
    ...current,
    activities,
    total: Math.max(0, current.total - removedCount),
  } as TFeed;
}

export function filterActivityQueriesForBlockedUser<TFeed extends ActivityFeedCache>(
  entries: readonly ActivityQueryCacheEntry<TFeed>[],
  blockedUserId: string
): ActivityQueryCacheEntry<TFeed>[] {
  return entries.map(([queryKey, current]) => [
    queryKey,
    filterActivityFeedForBlockedUser(current, blockedUserId),
  ]);
}
