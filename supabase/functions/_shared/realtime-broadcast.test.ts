import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildGroupBroadcastBody } from "./realtime-broadcast.ts";

Deno.test("buildGroupBroadcastBody is private and id-only safe", () => {
  const body = buildGroupBroadcastBody(
    "group-abc",
    "DATA_MUTATED",
    { entity: "transactions", action: "create", transactionId: 42 },
    "2026-09-25T00:00:00.000Z",
  );

  assertEquals(body.messages.length, 1);
  const message = body.messages[0];
  assertEquals(message.topic, "group-sync:group-abc");
  assertEquals(message.event, "DATA_MUTATED");
  assertEquals(message.private, true);
  assertEquals(message.payload.groupId, "group-abc");
  assertEquals(message.payload.transactionId, 42);
  assertEquals(message.payload.transaction, undefined);
  assertEquals(message.payload.timestamp, "2026-09-25T00:00:00.000Z");
});

Deno.test("buildGroupBroadcastBody keeps delete signals id-only", () => {
  const body = buildGroupBroadcastBody(
    "g1",
    "TRANSACTION_PUSHED",
    { action: "delete", transactionId: 9 },
    "2026-09-25T00:00:00.000Z",
  );

  assertEquals(body.messages[0].private, true);
  assertEquals(body.messages[0].payload.action, "delete");
  assertEquals(body.messages[0].payload.transactionId, 9);
  assertEquals(
    Object.prototype.hasOwnProperty.call(body.messages[0].payload, "transaction"),
    false,
  );
});
