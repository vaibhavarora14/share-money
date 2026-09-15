import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  ARCHIVE_GROUP_CONFIRM_MESSAGE,
  REMOVE_FROM_LISTS_CONFIRM_MESSAGE,
  buildLeaveGroupConfirmMessage,
} from "./leaveBalanceCopy.ts";

Deno.test("leave copy without balances omits balance line", () => {
  const message = buildLeaveGroupConfirmMessage("Trip", undefined, "u1");
  assertEquals(
    message,
    "You'll become a former member. Expenses stay for everyone."
  );
});

Deno.test("leave copy includes settled when user balance is zero", () => {
  const message = buildLeaveGroupConfirmMessage(
    "Trip",
    [{ user_id: "u1", amount: 0, currency: "USD" }],
    "u1"
  );
  assertEquals(
    message.includes("Your current balance: Settled"),
    true
  );
});

Deno.test("leave copy includes open balance when available", () => {
  const message = buildLeaveGroupConfirmMessage(
    "Trip",
    [{ user_id: "u1", amount: 12.5, currency: "USD" }],
    "u1"
  );
  assertEquals(message.includes("Your current balance:"), true);
  assertEquals(message.includes("12.50") || message.includes("12.5"), true);
});

Deno.test("locked archive and remove copy", () => {
  assertEquals(
    ARCHIVE_GROUP_CONFIRM_MESSAGE,
    "Hide from your active groups. Find it under Archived."
  );
  assertEquals(
    REMOVE_FROM_LISTS_CONFIRM_MESSAGE,
    "Won't show under Active, Archived, or Former. Others are unaffected."
  );
});
