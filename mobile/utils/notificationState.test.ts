import { assertEquals } from "jsr:@std/assert@1";
import type { NotificationsResponse, TransactionNotification } from "../types/notifications.ts";
import {
  compactNotificationReadQueue,
  flattenNotificationPages,
  markNotificationReadInCache,
  type NotificationInfiniteData,
} from "./notificationState.ts";

const preference = {
  push_enabled: false,
  permission_status: "not_requested" as const,
  permission_prompted_at: null,
  nudge_dismissed_at: null,
};

function item(id: string, groupId: string, createdAt: string): TransactionNotification {
  return {
    id,
    recipient_user_id: "user",
    actor_user_id: "actor",
    group_id: groupId,
    transaction_id: 1,
    source_history_id: id,
    event_type: "transaction_created",
    title: "Dinner added",
    body: "Your share changed",
    read_at: null,
    created_at: createdAt,
    snapshot: {
      version: 1,
      action: "created",
      actor: { id: "actor", name: "Alex", avatar_url: null },
      group: { id: groupId, name: "Trip" },
      transaction: { id: 1, description: "Dinner", type: "expense", amount: 20, currency: "USD", deleted: false },
      impact: { before: null, after: null, before_share: null, after_share: 10, share_delta: 10 },
    },
  };
}

function page(items: TransactionNotification[], hasMore: boolean): NotificationsResponse {
  return {
    items,
    unread_count: 2,
    unread_by_group: { group: 2 },
    has_more: hasMore,
    next_cursor: hasMore ? { created_at: items.at(-1)!.created_at, id: items.at(-1)!.id } : null,
    preference,
  };
}

Deno.test("notification pages flatten in order without duplicate boundary rows", () => {
  const one = item("00000000-0000-4000-8000-000000000001", "group", "2026-08-18T10:00:00.000Z");
  const two = item("00000000-0000-4000-8000-000000000002", "group", "2026-08-18T09:00:00.000Z");
  const data: NotificationInfiniteData = {
    pages: [page([one, two], true), page([two], false)],
    pageParams: [null, { created_at: two.created_at, id: two.id }],
  };
  const flattened = flattenNotificationPages(data)!;
  assertEquals(flattened.items.map(({ id }) => id), [one.id, two.id]);
  assertEquals(flattened.has_more, false);
});

Deno.test("optimistic read updates every page summary exactly once", () => {
  const one = item("00000000-0000-4000-8000-000000000001", "group", "2026-08-18T10:00:00.000Z");
  const data: NotificationInfiniteData = { pages: [page([one], false)], pageParams: [null] };
  const updated = markNotificationReadInCache(data, one.id, "2026-08-18T11:00:00.000Z")!;
  assertEquals(updated.pages[0].unread_count, 1);
  assertEquals(updated.pages[0].unread_by_group.group, 1);
  assertEquals(updated.pages[0].items[0].read_at, "2026-08-18T11:00:00.000Z");
  assertEquals(markNotificationReadInCache(updated, one.id, "2026-08-18T12:00:00.000Z"), updated);
});

Deno.test("later mark-all compacts prior covered reads but preserves later work", () => {
  const queue = compactNotificationReadQueue([
    { kind: "read", id: "old", created_at: "2026-08-18T09:00:00.000Z", queued_at: "2026-08-18T10:01:00.000Z" },
    { kind: "read", id: "future", created_at: "2026-08-18T12:00:00.000Z", queued_at: "2026-08-18T12:01:00.000Z" },
  ], {
    kind: "read_all",
    through: "2026-08-18T11:00:00.000Z",
    queued_at: "2026-08-18T11:00:00.000Z",
  });
  assertEquals(queue.map((operation) => operation.kind === "read" ? operation.id : operation.through), [
    "2026-08-18T11:00:00.000Z",
    "future",
  ]);
});
