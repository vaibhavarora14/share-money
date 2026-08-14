import { retryModerationRequest } from "../../mobile/utils/moderationRetry.ts";

function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected, null, 2)}, got ${JSON.stringify(actual, null, 2)}`
    );
  }
}

Deno.test("retryModerationRequest retries one lost connection with the same request", async () => {
  const request = {
    action: "report",
    request_id: "55555555-5555-4555-8555-555555555555",
  };
  const receivedRequests: unknown[] = [];

  const result = await retryModerationRequest(
    request,
    async (body) => {
      receivedRequests.push(body);
      if (receivedRequests.length === 1) {
        throw new Error("Network request failed");
      }
      return { report: { status: "pending" } };
    },
    { delayMs: 0 }
  );

  assertEquals(result, { report: { status: "pending" } });
  assertEquals(receivedRequests, [request, request]);
});

Deno.test("retryModerationRequest does not retry non-network failures", async () => {
  let attempts = 0;

  try {
    await retryModerationRequest(
      { action: "report", request_id: "55555555-5555-4555-8555-555555555555" },
      async () => {
        attempts += 1;
        throw new Error("Invalid input");
      },
      { delayMs: 0 }
    );
    throw new Error("Expected retryModerationRequest to reject");
  } catch (error) {
    assertEquals((error as Error).message, "Invalid input");
  }

  assertEquals(attempts, 1);
});

Deno.test("retryModerationRequest stops after the bounded retry", async () => {
  let attempts = 0;

  try {
    await retryModerationRequest(
      { action: "block", request_id: "55555555-5555-4555-8555-555555555555" },
      async () => {
        attempts += 1;
        throw new Error("The network connection was lost");
      },
      { delayMs: 0 }
    );
    throw new Error("Expected retryModerationRequest to reject");
  } catch (error) {
    assertEquals((error as Error).message, "The network connection was lost");
  }

  assertEquals(attempts, 2);
});
