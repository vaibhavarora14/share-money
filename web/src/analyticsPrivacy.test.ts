import { describe, expect, it } from "vitest";
import { sanitizePostHogProperties } from "./analyticsPrivacy";

describe("sanitizePostHogProperties", () => {
  it("removes URLs, referrers, and financial or personal fields from the final payload", () => {
    expect(sanitizePostHogProperties({
      token: "project-key",
      $distinct_id: "anonymous-id",
      $current_url: "https://sharedmoney.app/app?email=person@example.com",
      $referrer: "https://google.com/search?q=private",
      source: "google",
      landing_path: "/in/splitwise-alternative",
      amount: 1200,
      description: "Dinner",
      email: "person@example.com",
    })).toEqual({
      token: "project-key",
      $distinct_id: "anonymous-id",
      source: "google",
      landing_path: "/in/splitwise-alternative",
    });
  });
});
