import { assertEquals } from "jsr:@std/assert@1";
import {
  evaluatePostHogBooleanFlag,
  TRANSACTION_NOTIFICATIONS_FLAG_KEY,
} from "./posthog-feature-flags.ts";

Deno.test("PostHog flag evaluation sends authenticated targeting properties and returns true", async () => {
  let requestBody: Record<string, unknown> | null = null;
  const enabled = await evaluatePostHogBooleanFlag({
    key: TRANSACTION_NOTIFICATIONS_FLAG_KEY,
    distinctId: "user-123",
    personProperties: { email: "enabled@example.com" },
    projectToken: "public-project-token",
    fetchImpl: async (_input, init) => {
      requestBody = JSON.parse(String((init as { body?: BodyInit } | undefined)?.body));
      return Response.json({
        flags: {
          [TRANSACTION_NOTIFICATIONS_FLAG_KEY]: { enabled: true },
        },
        errorsWhileComputingFlags: false,
      });
    },
  });

  assertEquals(enabled, true);
  assertEquals(requestBody, {
    api_key: "public-project-token",
    distinct_id: "user-123",
    person_properties: { email: "enabled@example.com" },
    evaluation_contexts: ["production", "notifications"],
  });
});

Deno.test("PostHog flag evaluation fails closed without configuration", async () => {
  let called = false;
  const enabled = await evaluatePostHogBooleanFlag({
    key: TRANSACTION_NOTIFICATIONS_FLAG_KEY,
    distinctId: "user-123",
    personProperties: { email: "enabled@example.com" },
    projectToken: "",
    fetchImpl: async () => {
      called = true;
      return Response.json({});
    },
  });

  assertEquals(enabled, false);
  assertEquals(called, false);
});

Deno.test("PostHog flag evaluation fails closed on remote errors and malformed responses", async () => {
  const cases: Array<() => Promise<Response>> = [
    async () => new Response("unavailable", { status: 503 }),
    async () => Response.json({ errorsWhileComputingFlags: true, flags: {} }),
    async () => Response.json({ flags: { [TRANSACTION_NOTIFICATIONS_FLAG_KEY]: { enabled: "yes" } } }),
    async () => { throw new Error("offline"); },
  ];

  for (const fetchImpl of cases) {
    assertEquals(await evaluatePostHogBooleanFlag({
      key: TRANSACTION_NOTIFICATIONS_FLAG_KEY,
      distinctId: "user-123",
      personProperties: { email: "enabled@example.com" },
      projectToken: "public-project-token",
      fetchImpl,
    }), false);
  }
});
