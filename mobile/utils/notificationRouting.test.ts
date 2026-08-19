import { assertEquals } from "jsr:@std/assert@1";
import { resolveNotificationRoute } from "./notificationRouting.ts";

Deno.test("versioned detailed push opens the referenced inbox detail", () => {
  assertEquals(resolveNotificationRoute({
    schema_version: 1,
    route: "notification-detail",
    notification_id: "12345678-1234-4123-8123-123456789abc",
  }), {
    screen: "notification-detail",
    notificationId: "12345678-1234-4123-8123-123456789abc",
  });
});

Deno.test("digest payloads open the inbox", () => {
  assertEquals(resolveNotificationRoute({ schema_version: 1, route: "notifications" }), {
    screen: "notifications",
  });
});

Deno.test("Android relaunch placeholders and invalid payloads are ignored", () => {
  assertEquals(resolveNotificationRoute({ anim_not_finish: false }), null);
  assertEquals(resolveNotificationRoute({
    route: "notification-detail",
    notification_id: "not-an-id",
  }), null);
});
