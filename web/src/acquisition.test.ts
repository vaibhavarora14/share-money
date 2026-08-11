import { describe, expect, it } from "vitest";
import {
  acquisitionContextFromUrl,
  acquisitionContextToProperties,
  buildMigrationHandoffUrl,
  selectFirstTouchAcquisition,
} from "./acquisition";

describe("acquisitionContextFromUrl", () => {
  it("keeps the approved Splitwise migration attribution fields", () => {
    const context = acquisitionContextFromUrl(
      new URL(
        "https://sharedmoney.app/in/splitwise-alternative?intent=splitwise-import&utm_source=google&utm_medium=organic&utm_campaign=india_splitwise&utm_content=hero",
      ),
      "https://www.google.co.in/search?q=splitwise+alternative",
      "2026-08-11T00:00:00.000Z",
    );

    expect(context).toEqual({
      source: "google",
      medium: "organic",
      campaign: "india_splitwise",
      content: "hero",
      landingPath: "/in/splitwise-alternative",
      referrerHost: "www.google.co.in",
      intent: "splitwise-import",
      capturedAt: "2026-08-11T00:00:00.000Z",
    });
  });

  it("uses safe defaults and drops unapproved query values", () => {
    const context = acquisitionContextFromUrl(
      new URL(
        "https://sharedmoney.app/?intent=admin&utm_source=bad%20value&utm_campaign=a%40b&utm_content=" + "x".repeat(121),
      ),
      "",
      "2026-08-11T00:00:00.000Z",
    );

    expect(context).toEqual({
      source: "direct",
      medium: "direct",
      landingPath: "/",
      intent: "standard",
      capturedAt: "2026-08-11T00:00:00.000Z",
    });
  });

  it("uses the shared property contract and preserves it in the app handoff", () => {
    const firstTouch = acquisitionContextFromUrl(
      new URL("https://sharedmoney.app/in/splitwise-alternative?utm_source=google&utm_medium=organic"),
      "https://www.google.co.in/search?q=splitwise",
      "2026-08-10T18:30:00.000Z",
    );

    expect(acquisitionContextToProperties(firstTouch)).toEqual({
      source: "google",
      medium: "organic",
      campaign: "",
      content: "",
      landing_path: "/in/splitwise-alternative",
      referrer_host: "www.google.co.in",
      intent: "standard",
    });
    expect(buildMigrationHandoffUrl("/app?intent=splitwise-import", firstTouch, "journey-123")).toBe(
      "/app?intent=splitwise-import&acq_source=google&acq_medium=organic&acq_landing_path=%2Fin%2Fsplitwise-alternative&acq_referrer_host=www.google.co.in&acq_captured_at=2026-08-10T18%3A30%3A00.000Z&journey_id=journey-123",
    );
  });

  it("does not overwrite a fresh first-touch context", () => {
    const first = acquisitionContextFromUrl(
      new URL("https://sharedmoney.app/?utm_source=community&utm_medium=referral"),
      "",
      "2026-08-10T00:00:00.000Z",
    );
    const later = acquisitionContextFromUrl(
      new URL("https://sharedmoney.app/?utm_source=google&utm_medium=organic"),
      "",
      "2026-08-11T00:00:00.000Z",
    );

    expect(selectFirstTouchAcquisition(first, later, Date.parse("2026-08-11T00:00:00.000Z"))).toBe(first);
  });
});
