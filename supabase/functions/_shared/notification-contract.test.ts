import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  buildNotificationCursorFilter,
  isNotificationPermissionStatus,
  isValidExpoPushToken,
  parseNotificationCursor,
  resolveReadAt,
} from "./notification-contract.ts";

const ID = "a6db6310-193f-49c8-bb2f-3a54016fc02a";

Deno.test("notification cursor is absent only when both fields are absent", () => {
  assertEquals(parseNotificationCursor(null, null), null);
  assertThrows(
    () => parseNotificationCursor("2026-08-18T10:00:00.000Z", null),
    Error,
    "Both cursor_created_at and cursor_id are required",
  );
  assertThrows(
    () => parseNotificationCursor(null, ID),
    Error,
    "Both cursor_created_at and cursor_id are required",
  );
});

Deno.test("notification cursor rejects invalid dates and ids", () => {
  assertThrows(
    () => parseNotificationCursor("not-a-date", ID),
    Error,
    "Invalid cursor_created_at",
  );
  assertThrows(
    () => parseNotificationCursor("2026-08-18T10:00:00.000Z", "not-a-uuid"),
    Error,
    "Invalid cursor_id",
  );
});

Deno.test("notification cursor preserves the stable timestamp and id pair", () => {
  assertEquals(
    parseNotificationCursor("2026-08-18T10:00:00.000Z", ID),
    { created_at: "2026-08-18T10:00:00.000Z", id: ID },
  );
});

Deno.test("notification cursor filter uses id as the timestamp tie breaker", () => {
  assertEquals(
    buildNotificationCursorFilter({
      created_at: "2026-08-18T10:00:00.000Z",
      id: ID,
    }),
    `created_at.lt.2026-08-18T10:00:00.000Z,and(created_at.eq.2026-08-18T10:00:00.000Z,id.lt.${ID})`,
  );
});

Deno.test("read timestamps are monotonic and preserve the first read", () => {
  const firstRead = "2026-08-18T10:00:00.000Z";
  assertEquals(resolveReadAt(firstRead, "2026-08-18T11:00:00.000Z"), firstRead);
  assertEquals(
    resolveReadAt(null, "2026-08-18T11:00:00.000Z"),
    "2026-08-18T11:00:00.000Z",
  );
});

Deno.test("push tokens and permission enums reject unsafe input", () => {
  assertEquals(isValidExpoPushToken("ExponentPushToken[abc_123-XYZ]"), true);
  assertEquals(isValidExpoPushToken("https://attacker.example/token"), false);
  assertEquals(isValidExpoPushToken(123), false);
  assertEquals(isNotificationPermissionStatus("granted"), true);
  assertEquals(isNotificationPermissionStatus("prompt_again"), false);
});
