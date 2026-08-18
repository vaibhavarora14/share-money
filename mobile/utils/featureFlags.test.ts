import { assertEquals } from "jsr:@std/assert@1";
import { isTransactionNotificationsEnabled } from "./featureFlags.ts";

Deno.test("transaction notifications stay disabled until the server confirms the PostHog flag", () => {
  assertEquals(isTransactionNotificationsEnabled(undefined), false);
  assertEquals(isTransactionNotificationsEnabled({ feature_enabled: false }), false);
  assertEquals(isTransactionNotificationsEnabled({ feature_enabled: true }), true);
});
