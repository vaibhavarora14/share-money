import { assertEquals } from "jsr:@std/assert@1";
import type { TransactionNotification } from "../types/notifications.ts";
import {
  NOTIFICATION_VIEWABILITY_CONFIG,
  unreadNotificationIdsFromViewTokens,
} from "./notificationVisibility.ts";

function notification(
  id: string,
  readAt: string | null = null,
): TransactionNotification {
  return { id, read_at: readAt } as TransactionNotification;
}

Deno.test("visible notification rows exclude headers, read rows, and duplicate ids", () => {
  const unread = notification("unread");
  const read = notification("read", "2026-08-21T10:00:00.000Z");

  assertEquals(
    unreadNotificationIdsFromViewTokens([
      { isViewable: true, item: unread },
      { isViewable: true, item: { title: "Group header" } },
      { isViewable: true, item: read },
      { isViewable: false, item: notification("offscreen") },
      { isViewable: true, item: unread },
    ]),
    ["unread"],
  );
});

Deno.test("notifications require sixty-percent visibility for half a second", () => {
  assertEquals(NOTIFICATION_VIEWABILITY_CONFIG, {
    itemVisiblePercentThreshold: 60,
    minimumViewTime: 500,
    waitForInteraction: false,
  });
});
