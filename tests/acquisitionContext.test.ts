import { assertEquals } from "jsr:@std/assert@1";
import { acquisitionContextFromUrl } from "../mobile/utils/acquisitionContext.ts";

Deno.test("acquisitionContextFromUrl preserves a valid migration campaign", () => {
  assertEquals(
    acquisitionContextFromUrl(
      "https://sharedmoney.app/app?intent=splitwise-import&utm_source=google&utm_medium=organic&utm_campaign=india_splitwise&utm_content=hero",
      "2026-08-11T00:00:00.000Z",
    ),
    {
      source: "google",
      medium: "organic",
      campaign: "india_splitwise",
      content: "hero",
      landingPath: "/app",
      intent: "splitwise-import",
      capturedAt: "2026-08-11T00:00:00.000Z",
    },
  );
});

Deno.test("acquisitionContextFromUrl ignores URLs without a campaign handoff", () => {
  assertEquals(
    acquisitionContextFromUrl("https://sharedmoney.app/app", "2026-08-11T00:00:00.000Z"),
    null,
  );
});
