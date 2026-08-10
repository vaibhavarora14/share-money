import { assertEquals } from "jsr:@std/assert@1";
import { sanitizeAcquisitionContext } from "./growth.ts";

Deno.test("sanitizeAcquisitionContext keeps the bounded marketing fields only", () => {
  assertEquals(
    sanitizeAcquisitionContext({
      source: "google",
      medium: "organic",
      campaign: "india_splitwise",
      content: "hero",
      landingPath: "/in/splitwise-alternative",
      referrerHost: "www.google.co.in",
      intent: "splitwise-import",
      capturedAt: "2026-08-11T00:00:00.000Z",
      amount: "1000",
      participantName: "Asha",
    }),
    {
      source: "google",
      medium: "organic",
      campaign: "india_splitwise",
      content: "hero",
      landing_path: "/in/splitwise-alternative",
      referrer_host: "www.google.co.in",
      intent: "splitwise-import",
      captured_at: "2026-08-11T00:00:00.000Z",
    },
  );
});

Deno.test("sanitizeAcquisitionContext rejects malformed and oversized values", () => {
  assertEquals(
    sanitizeAcquisitionContext({
      source: "bad source",
      medium: "organic",
      landingPath: "not-a-path",
      intent: "admin",
      capturedAt: "not-a-date",
      campaign: "x".repeat(121),
    }),
    null,
  );
});
