import { describe, expect, it } from "vitest";
import { acquisitionContextFromUrl } from "./acquisition";

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
});
