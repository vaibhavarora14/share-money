import { assertEquals } from "jsr:@std/assert@1";
import { shouldShowNotificationPrimer } from "./notificationPermission.ts";

const preference = {
  push_enabled: false,
  permission_status: "not_requested" as const,
  permission_prompted_at: null,
  nudge_dismissed_at: null,
};

Deno.test("primer appears only for eligible native users with an active group", () => {
  assertEquals(shouldShowNotificationPrimer({ platform: "ios", activeGroupCount: 1, preference }), true);
  assertEquals(shouldShowNotificationPrimer({ platform: "web", activeGroupCount: 1, preference }), false);
  assertEquals(shouldShowNotificationPrimer({ platform: "android", activeGroupCount: 0, preference }), false);
});

Deno.test("dismissal or denial prevents repeat prompting", () => {
  assertEquals(shouldShowNotificationPrimer({
    platform: "android",
    activeGroupCount: 1,
    preference: { ...preference, nudge_dismissed_at: "2026-08-18T10:00:00.000Z" },
  }), false);
  assertEquals(shouldShowNotificationPrimer({
    platform: "ios",
    activeGroupCount: 1,
    preference: { ...preference, permission_status: "denied" },
  }), false);
});
