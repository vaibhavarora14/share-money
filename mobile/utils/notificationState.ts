import type {
  NotificationCursor,
  NotificationPreference,
  NotificationsResponse,
} from "../types/notifications";

export interface NotificationInfiniteData {
  pages: NotificationsResponse[];
  pageParams: Array<NotificationCursor | null>;
}

export type NotificationReadOperation =
  | {
    kind: "read";
    id: string;
    created_at: string;
    queued_at: string;
  }
  | {
    kind: "read_all";
    through: string;
    queued_at: string;
  };

export function flattenNotificationPages(
  data: NotificationInfiniteData | undefined,
): NotificationsResponse | undefined {
  if (!data?.pages.length) return undefined;
  const first = data.pages[0];
  const last = data.pages[data.pages.length - 1];
  const seen = new Set<string>();
  const items = data.pages.flatMap((page) => page.items).filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });

  return {
    ...first,
    items,
    has_more: last.has_more,
    next_cursor: last.next_cursor,
    is_offline_cache: data.pages.some((page) => page.is_offline_cache),
  };
}

export function restoreOfflineNotificationCache(
  cached: NotificationsResponse,
): NotificationsResponse {
  return {
    ...cached,
    has_more: false,
    next_cursor: null,
    is_offline_cache: true,
  };
}

function updateEveryPage(
  data: NotificationInfiniteData | undefined,
  update: (page: NotificationsResponse) => NotificationsResponse,
): NotificationInfiniteData | undefined {
  if (!data) return data;
  return { ...data, pages: data.pages.map(update) };
}

export function markNotificationReadInCache(
  data: NotificationInfiniteData | undefined,
  id: string,
  readAt: string,
): NotificationInfiniteData | undefined {
  const flattened = flattenNotificationPages(data);
  const target = flattened?.items.find((item) => item.id === id);
  if (!target || target.read_at) return data;
  const groupId = target.group_id;
  const unreadByGroup = { ...(flattened?.unread_by_group ?? {}) };
  if (groupId) {
    const next = Math.max(0, (unreadByGroup[groupId] ?? 1) - 1);
    if (next === 0) delete unreadByGroup[groupId];
    else unreadByGroup[groupId] = next;
  }

  return updateEveryPage(data, (page) => ({
    ...page,
    unread_count: Math.max(0, page.unread_count - 1),
    unread_by_group: unreadByGroup,
    items: page.items.map((item) =>
      item.id === id ? { ...item, read_at: item.read_at ?? readAt } : item
    ),
  }));
}

export function markAllNotificationsReadInCache(
  data: NotificationInfiniteData | undefined,
  through: string,
  readAt: string,
): NotificationInfiniteData | undefined {
  const cutoff = Date.parse(through);
  return updateEveryPage(data, (page) => ({
    ...page,
    unread_count: 0,
    unread_by_group: {},
    items: page.items.map((item) =>
      !item.read_at && Date.parse(item.created_at) <= cutoff
        ? { ...item, read_at: readAt }
        : item
    ),
  }));
}

export function setNotificationPreferenceInData(
  data: NotificationInfiniteData | undefined,
  preference: NotificationPreference,
): NotificationInfiniteData | undefined {
  return updateEveryPage(data, (page) => ({ ...page, preference }));
}

export function compactNotificationReadQueue(
  queue: NotificationReadOperation[],
  next: NotificationReadOperation,
): NotificationReadOperation[] {
  const readAllCutoff = queue
    .filter((operation): operation is Extract<NotificationReadOperation, { kind: "read_all" }> =>
      operation.kind === "read_all"
    )
    .reduce((latest, operation) =>
      Date.parse(operation.through) > Date.parse(latest) ? operation.through : latest
    , next.kind === "read_all" ? next.through : "1970-01-01T00:00:00.000Z");

  if (next.kind === "read") {
    if (Date.parse(next.created_at) <= Date.parse(readAllCutoff)) return queue;
    return [...queue.filter((operation) => operation.kind !== "read" || operation.id !== next.id), next];
  }

  const latestReadAll = queue
    .filter((operation) => operation.kind === "read_all")
    .reduce<NotificationReadOperation>((latest, operation) =>
      operation.kind === "read_all" && latest.kind === "read_all" &&
          Date.parse(operation.through) > Date.parse(latest.through)
        ? operation
        : latest
    , next);
  const cutoff = latestReadAll.kind === "read_all" ? Date.parse(latestReadAll.through) : Date.parse(next.through);
  return [
    latestReadAll,
    ...queue.filter((operation) =>
      operation.kind === "read" && Date.parse(operation.created_at) > cutoff
    ),
  ];
}
