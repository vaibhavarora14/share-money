import { assertEquals, assertThrows } from "jsr:@std/assert";
import {
  autoMatchPeopleToParticipants,
  MAX_SPLITWISE_IMPORT_ITEMS,
  parseSplitwiseExport,
} from "../mobile/utils/splitwise.ts";

const header = "Date,Description,Category,Cost,Currency,Alice,Bob";

Deno.test("parses a valid expense and two-person payment from a Splitwise export", () => {
  const result = parseSplitwiseExport([
    header,
    "2026-08-01,Groceries,Groceries,120.00,INR,60.00,-60.00",
    "2026-08-02,Bob paid Alice,Payment,20.00,INR,-20.00,20.00",
    ",Total balance,,,INR,40.00,-40.00",
  ].join("\n"));

  assertEquals(result.people, ["Alice", "Bob"]);
  assertEquals(result.expenses.length, 1);
  assertEquals(result.expenses[0].shares, [
    { personIndex: 1, amount: 60 },
    { personIndex: 0, amount: 60 },
  ]);
  assertEquals(result.payments, [{
    line: 3,
    description: "Bob paid Alice",
    date: "2026-08-02",
    currency: "INR",
    amount: 20,
    fromIndex: 1,
    toIndex: 0,
  }]);
});

Deno.test("preserves separate currencies and leaves duplicate names for manual mapping", () => {
  const result = parseSplitwiseExport([
    "Date,Description,Category,Cost,Currency,Alex,Alex,Sam",
    "2026-08-01,Train,Travel,90.00,INR,60.00,0.00,-60.00",
    "2026-08-02,Hotel,Travel,30.00,USD,15.00,0.00,-15.00",
  ].join("\n"));
  const matches = autoMatchPeopleToParticipants(result.people, [
    { id: "alex-1", group_id: "group", type: "member", full_name: "Alex" },
    { id: "alex-2", group_id: "group", type: "member", full_name: "Alex" },
    { id: "sam", group_id: "group", type: "member", full_name: "Sam" },
  ]);

  assertEquals(result.people, ["Alex", "Alex", "Sam"]);
  assertEquals(result.expenses.map((expense) => expense.currency), ["INR", "USD"]);
  assertEquals(matches, [null, null, "sam"]);
});

Deno.test("skips malformed and unsupported multi-payer rows without failing valid rows", () => {
  const result = parseSplitwiseExport([
    "Date,Description,Category,Cost,Currency,Alice,Bob,Chris",
    "not-a-date,Broken,Food,30.00,INR,15.00,-15.00,0.00",
    "2026-08-02,Multi payer,Food,100.00,INR,50.00,50.00,-100.00",
    "2026-08-03,Taxi,Travel,60.00,INR,30.00,-30.00,0.00",
  ].join("\n"));

  assertEquals(result.expenses.length, 1);
  assertEquals(result.skipped.map((row) => row.reason), [
    "has a date we couldn't read",
    "was paid by multiple people, which isn't supported",
  ]);
});

Deno.test("rejects empty files and files over the import item limit", () => {
  assertThrows(() => parseSplitwiseExport(""), Error, "file is empty");

  const rows = Array.from(
    { length: MAX_SPLITWISE_IMPORT_ITEMS + 1 },
    (_, index) => `2026-08-${String((index % 28) + 1).padStart(2, "0")},Expense ${index},Food,1.00,INR,1.00,-1.00`,
  );
  assertThrows(
    () => parseSplitwiseExport([header, ...rows].join("\n")),
    Error,
    "Imports support up to",
  );
});
