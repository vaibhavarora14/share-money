import { assertEquals } from "jsr:@std/assert@1";
import {
  acquisitionContextFromUrl,
  selectFirstTouchAcquisition,
} from "../mobile/utils/acquisitionContext.ts";

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

Deno.test("acquisitionContextFromUrl preserves the original landing through the app handoff", () => {
  assertEquals(
    acquisitionContextFromUrl(
      "https://sharedmoney.app/app?intent=splitwise-import&acq_source=google&acq_medium=organic&acq_landing_path=%2Fin%2Fsplitwise-alternative&acq_referrer_host=google.co.in&acq_captured_at=2026-08-10T18%3A30%3A00.000Z",
      "2026-08-11T00:00:00.000Z",
    ),
    {
      source: "google",
      medium: "organic",
      landingPath: "/in/splitwise-alternative",
      referrerHost: "google.co.in",
      intent: "splitwise-import",
      capturedAt: "2026-08-10T18:30:00.000Z",
    },
  );
});

Deno.test("selectFirstTouchAcquisition keeps a fresh original campaign", () => {
  const original = acquisitionContextFromUrl(
    "https://sharedmoney.app/app?utm_source=community&utm_medium=referral",
    "2026-08-10T00:00:00.000Z",
  );
  const later = acquisitionContextFromUrl(
    "https://sharedmoney.app/app?utm_source=google&utm_medium=organic",
    "2026-08-11T00:00:00.000Z",
  );

  assertEquals(
    selectFirstTouchAcquisition(original, later, Date.parse("2026-08-11T00:00:00.000Z")),
    original,
  );
});

Deno.test("selectFirstTouchAcquisition replaces an expired campaign", () => {
  const expired = acquisitionContextFromUrl(
    "https://sharedmoney.app/app?utm_source=community&utm_medium=referral",
    "2026-06-01T00:00:00.000Z",
  );
  const current = acquisitionContextFromUrl(
    "https://sharedmoney.app/app?utm_source=google&utm_medium=organic",
    "2026-08-11T00:00:00.000Z",
  );

  assertEquals(
    selectFirstTouchAcquisition(expired, current, Date.parse("2026-08-11T00:00:00.000Z")),
    current,
  );
});
