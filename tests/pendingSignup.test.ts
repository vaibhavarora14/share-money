import { assertEquals } from "jsr:@std/assert@1";
import { matchesNewUser } from "../mobile/utils/pendingSignupCore.ts";

Deno.test("signup completion matches a newly created OAuth user", () => {
  assertEquals(matchesNewUser(
    { method: "google", startedAt: "2026-08-11T00:00:00.000Z" },
    "2026-08-11T00:00:03.000Z",
    Date.parse("2026-08-11T00:05:00.000Z"),
  ), true);
});

Deno.test("signup completion does not count an existing account login", () => {
  assertEquals(matchesNewUser(
    { method: "google", startedAt: "2026-08-11T00:00:00.000Z" },
    "2025-01-01T00:00:00.000Z",
    Date.parse("2026-08-11T00:05:00.000Z"),
  ), false);
});
