import { assertEquals } from "jsr:@std/assert@1";
import {
  getLastEnteredTransactionCurrency,
  normalizeGroupCurrency,
  resolveGroupDefaultCurrency,
  type GroupCurrencyTransaction,
} from "./groupCurrency.ts";

const GROUP_A = "group-a";
const GROUP_B = "group-b";

function tx(
  overrides: Partial<GroupCurrencyTransaction> & Pick<GroupCurrencyTransaction, "id">
): GroupCurrencyTransaction {
  return {
    group_id: GROUP_A,
    currency: "USD",
    created_at: "2026-08-01T12:00:00.000Z",
    ...overrides,
  };
}

Deno.test("normalizeGroupCurrency uppercases valid codes and drops invalid ones", () => {
  assertEquals(normalizeGroupCurrency("eur"), "EUR");
  assertEquals(normalizeGroupCurrency(" INR "), "INR");
  assertEquals(normalizeGroupCurrency("us"), undefined);
  assertEquals(normalizeGroupCurrency(""), undefined);
  assertEquals(normalizeGroupCurrency(null), undefined);
});

Deno.test("empty group has no last entered currency", () => {
  assertEquals(getLastEnteredTransactionCurrency([], GROUP_A), undefined);
});

Deno.test("a single group transaction supplies its currency", () => {
  assertEquals(
    getLastEnteredTransactionCurrency([tx({ id: 1, currency: "eur" })], GROUP_A),
    "EUR",
  );
});

Deno.test("latest created_at wins even when the expense date would rank differently", () => {
  const transactions = [
    tx({
      id: 10,
      currency: "USD",
      created_at: "2026-08-01T10:00:00.000Z",
    }),
    tx({
      id: 11,
      currency: "EUR",
      created_at: "2026-08-31T09:00:00.000Z",
    }),
    tx({
      id: 12,
      currency: "GBP",
      created_at: "2026-08-15T18:00:00.000Z",
    }),
  ];

  assertEquals(getLastEnteredTransactionCurrency(transactions, GROUP_A), "EUR");
});

Deno.test("higher id wins when created_at timestamps match", () => {
  const createdAt = "2026-08-31T12:00:00.000Z";
  const transactions = [
    tx({ id: 21, currency: "USD", created_at: createdAt }),
    tx({ id: 24, currency: "JPY", created_at: createdAt }),
    tx({ id: 22, currency: "EUR", created_at: createdAt }),
  ];

  assertEquals(getLastEnteredTransactionCurrency(transactions, GROUP_A), "JPY");
});

Deno.test("last entered currency is specific to the requested group", () => {
  const transactions = [
    tx({
      id: 1,
      group_id: GROUP_A,
      currency: "INR",
      created_at: "2026-08-01T10:00:00.000Z",
    }),
    tx({
      id: 99,
      group_id: GROUP_B,
      currency: "EUR",
      created_at: "2026-08-31T10:00:00.000Z",
    }),
    tx({
      id: 2,
      group_id: GROUP_A,
      currency: "USD",
      created_at: "2026-08-20T10:00:00.000Z",
    }),
  ];

  assertEquals(getLastEnteredTransactionCurrency(transactions, GROUP_A), "USD");
  assertEquals(getLastEnteredTransactionCurrency(transactions, GROUP_B), "EUR");
});

Deno.test("rows without group_id still count for a group-scoped feed", () => {
  const transactions = [
    tx({
      id: 5,
      group_id: undefined,
      currency: "CAD",
      created_at: "2026-08-31T10:00:00.000Z",
    }),
  ];

  assertEquals(getLastEnteredTransactionCurrency(transactions, GROUP_A), "CAD");
});

Deno.test("invalid currencies are skipped in favor of the next latest valid row", () => {
  const transactions = [
    tx({
      id: 8,
      currency: "USD",
      created_at: "2026-08-01T10:00:00.000Z",
    }),
    tx({
      id: 9,
      currency: "nope",
      created_at: "2026-08-31T10:00:00.000Z",
    }),
  ];

  assertEquals(getLastEnteredTransactionCurrency(transactions, GROUP_A), "USD");
});

Deno.test("resolveGroupDefaultCurrency prefers the dedicated latest currency over the feed", () => {
  assertEquals(
    resolveGroupDefaultCurrency({
      groupId: GROUP_A,
      latestCurrency: "eur",
      feedTransactions: [tx({ id: 1, currency: "USD" })],
      fallbackCurrency: "INR",
    }),
    "EUR",
  );
});

Deno.test("resolveGroupDefaultCurrency falls back to the group feed then the app default", () => {
  assertEquals(
    resolveGroupDefaultCurrency({
      groupId: GROUP_A,
      latestCurrency: null,
      feedTransactions: [tx({ id: 1, currency: "GBP" })],
      fallbackCurrency: "INR",
    }),
    "GBP",
  );

  assertEquals(
    resolveGroupDefaultCurrency({
      groupId: GROUP_A,
      latestCurrency: null,
      feedTransactions: [tx({ id: 1, group_id: GROUP_B, currency: "EUR" })],
      fallbackCurrency: "INR",
    }),
    "INR",
  );
});
