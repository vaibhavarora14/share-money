import { assertEquals } from "jsr:@std/assert";
import {
  sanitizeGrowthProperties,
  sanitizePostHogEventProperties,
} from "../mobile/utils/growthProperties.ts";

Deno.test("analytics properties retain only bounded acquisition dimensions and aggregate counts", () => {
  assertEquals(
    sanitizeGrowthProperties({
      source: "google",
      medium: "organic",
      campaign: "india-splitwise-alternative",
      landing_path: "/in/splitwise-alternative",
      referrer_host: "WWW.Google.COM",
      expense_count: 3,
      duplicate: false,
      description: "Dinner at Cafe",
      amount: 1245,
      currency: "INR",
      email: "person@example.com",
      csv_contents: "private raw csv",
      participant_name: "Asha",
    }),
    {
      source: "google",
      medium: "organic",
      campaign: "india-splitwise-alternative",
      landing_path: "/in/splitwise-alternative",
      referrer_host: "www.google.com",
      expense_count: 3,
      duplicate: false,
    },
  );
});

Deno.test("the final PostHog payload strips SDK-added location and personal properties", () => {
  assertEquals(
    sanitizePostHogEventProperties({
      token: "project-key",
      $distinct_id: "anonymous-id",
      $device_name: "Vaibhav's iPhone",
      $locale: "en-IN",
      $timezone: "Asia/Kolkata",
      journey_id: "a-safe-journey",
      email: "person@example.com",
      amount: 1200,
      description: "Dinner",
    }),
    {
      token: "project-key",
      $distinct_id: "anonymous-id",
      journey_id: "a-safe-journey",
    },
  );
});

Deno.test("analytics properties reject unbounded strings and invalid aggregate values", () => {
  assertEquals(
    sanitizeGrowthProperties({
      landing_path: "/bad path",
      source: "x".repeat(121),
      expense_count: 2_001,
      skipped_count: -1,
      method: "splitwise import",
    }),
    {},
  );
});
