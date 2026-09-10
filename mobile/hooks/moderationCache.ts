type ActivityWithAuthor = {
  changed_by: { id: string };
};

type ActivityFeedCache<TActivity extends ActivityWithAuthor = ActivityWithAuthor> = {
  activities?: TActivity[];
  total?: number;
  pages?: Array<{
    activities?: TActivity[];
    total?: number;
    has_more?: boolean;
  }>;
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

  if (Array.isArray(current.pages)) {
    let totalRemoved = 0;
    const updatedPages = current.pages.map((page) => {
      if (!page || !Array.isArray(page.activities)) return page;
      const filtered = page.activities.filter(
        (activity) => activity.changed_by.id !== blockedUserId
      );
      totalRemoved += page.activities.length - filtered.length;
      return {
        ...page,
        activities: filtered,
        total: Math.max(0, (page.total ?? filtered.length) - totalRemoved),
      };
    });

    return {
      ...current,
      pages: updatedPages,
    } as TFeed;
  }

  if (Array.isArray(current.activities)) {
    const activities = current.activities.filter(
      (activity) => activity.changed_by.id !== blockedUserId
    );
    const removedCount = current.activities.length - activities.length;

    return {
      ...current,
      activities,
      total: Math.max(0, (current.total ?? activities.length) - removedCount),
    } as TFeed;
  }

  return current;
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
