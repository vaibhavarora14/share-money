import { assertEquals } from "jsr:@std/assert@1";
import type { Balance, Group, GroupBalance } from "../types.ts";
import { createPreviewRateBook } from "./previewRates.ts";
import {
  buildGroupSettlementLines,
  clubPersonSettlements,
  crossGroupIdentityTokens,
  groupContextsFromBalances,
  personSettlementHeadline,
  settlementSummary,
  type GroupSettlementContext,
} from "./peopleSettlements.ts";

const YOU = "you";
const MAYA = "maya";
const RAJ = "raj";
const book = createPreviewRateBook();

function balance(
  userId: string,
  amount: number,
  extras: Partial<Balance> = {}
): Balance {
  return {
    user_id: userId,
    amount,
    currency: "INR",
    ...extras,
  };
}

function group(
  id: string,
  name: string,
  balances: Balance[],
  unifyEnabled = true
): GroupSettlementContext {
  return {
    groupId: id,
    groupName: name,
    balances,
    unifyEnabled,
    settlementCurrency: "INR",
    rateBook: book,
    defaultCurrency: "INR",
  };
}

Deno.test("crossGroupIdentityTokens prefers the linked account, then email", () => {
  assertEquals(
    crossGroupIdentityTokens({
      user_id: "u-maya",
      email: "maya@example.com",
      participant_id: "p-trip",
    }),
    ["user:u-maya", "email:maya@example.com"],
  );
  assertEquals(
    crossGroupIdentityTokens({
      email: "Maya@example.com",
      participant_id: "p-roommates",
    }),
    ["email:maya@example.com"],
  );
  assertEquals(
    crossGroupIdentityTokens({ full_name: "Maya", participant_id: "p-1" }),
    ["name:maya"],
  );
});

Deno.test("buildGroupSettlementLines keeps only the current user's simplified edges", () => {
  const lines = buildGroupSettlementLines(
    group("trip", "Phuket", [
      balance(YOU, -800, { participant_id: "p-you-trip", full_name: "You" }),
      balance(MAYA, 500, {
        participant_id: "p-maya-trip",
        full_name: "Maya",
        email: "maya@example.com",
      }),
      balance(RAJ, 300, { participant_id: "p-raj-trip", full_name: "Raj" }),
    ]),
    YOU,
  );

  assertEquals(lines.length, 2);
  assertEquals(lines.every((line) => line.direction === "pay"), true);
  assertEquals(
    lines.map((line) => line.other.full_name).sort(),
    ["Maya", "Raj"],
  );
});

Deno.test("clubPersonSettlements groups the same linked account across groups", () => {
  const people = clubPersonSettlements([
    group("trip", "Phuket", [
      balance(YOU, -500, { participant_id: "p-you-trip" }),
      balance(MAYA, 500, {
        participant_id: "p-maya-trip",
        user_id: "u-maya",
        full_name: "Maya",
        email: "maya@example.com",
      }),
    ]),
    group("home", "Roommates", [
      balance(YOU, 200, { participant_id: "p-you-home" }),
      balance(MAYA, -200, {
        participant_id: "p-maya-home",
        user_id: "u-maya",
        full_name: "Maya Kapoor",
        email: "maya@example.com",
      }),
    ]),
  ], YOU);

  assertEquals(people.length, 1);
  assertEquals(people[0].displayName, "Maya Kapoor");
  assertEquals(people[0].lines.length, 2);
  assertEquals(people[0].lines.map((line) => line.groupName).sort(), [
    "Phuket",
    "Roommates",
  ]);
  assertEquals(people[0].netsByCurrency.INR, -300);
});

Deno.test("clubPersonSettlements merges an email-only copy with a linked account", () => {
  const people = clubPersonSettlements([
    group("trip", "Phuket", [
      balance(YOU, -120, { participant_id: "p-you-trip" }),
      balance("", 120, {
        participant_id: "p-maya-trip",
        email: "maya@example.com",
        full_name: "Maya",
      }),
    ]),
    group("dinner", "Dinner", [
      balance(YOU, -80, { participant_id: "p-you-dinner" }),
      balance(MAYA, 80, {
        participant_id: "p-maya-dinner",
        user_id: "u-maya",
        email: "maya@example.com",
        full_name: "Maya",
      }),
    ]),
  ], YOU);

  assertEquals(people.length, 1);
  assertEquals(people[0].userId, "u-maya");
  assertEquals(people[0].lines.length, 2);
  assertEquals(people[0].netsByCurrency.INR, -200);
});

Deno.test("clubPersonSettlements keeps different emails with the same name apart", () => {
  const people = clubPersonSettlements([
    group("a", "Trip A", [
      balance(YOU, -50, { participant_id: "p-you-a" }),
      balance("", 50, {
        participant_id: "p-alex-a",
        full_name: "Alex",
        email: "alex.a@example.com",
      }),
    ]),
    group("b", "Trip B", [
      balance(YOU, -40, { participant_id: "p-you-b" }),
      balance("", 40, {
        participant_id: "p-alex-b",
        full_name: "Alex",
        email: "alex.b@example.com",
      }),
    ]),
  ], YOU);

  assertEquals(people.length, 2);
  assertEquals(people.map((person) => person.email).sort(), [
    "alex.a@example.com",
    "alex.b@example.com",
  ]);
});

Deno.test("personSettlementHeadline nets opposite group leftovers in one currency", () => {
  const [maya] = clubPersonSettlements([
    group("trip", "Phuket", [
      balance(YOU, -500, { participant_id: "p-you-trip" }),
      balance(MAYA, 500, { participant_id: "p-maya-trip", full_name: "Maya" }),
    ]),
    group("home", "Roommates", [
      balance(YOU, 200, { participant_id: "p-you-home" }),
      balance(MAYA, -200, { participant_id: "p-maya-home", full_name: "Maya" }),
    ]),
  ], YOU);

  const headline = personSettlementHeadline(maya, "INR", book);
  assertEquals(headline.verb, "pay");
  assertEquals(headline.headline, "₹300.00");
});

Deno.test("settlementSummary counts people and group lines", () => {
  const people = clubPersonSettlements([
    group("trip", "Phuket", [
      balance(YOU, -500, { participant_id: "p-you-trip" }),
      balance(MAYA, 300, { participant_id: "p-maya-trip", full_name: "Maya" }),
      balance(RAJ, 200, { participant_id: "p-raj-trip", full_name: "Raj" }),
    ]),
    group("home", "Roommates", [
      balance(YOU, 200, { participant_id: "p-you-home" }),
      balance(MAYA, -200, { participant_id: "p-maya-home", full_name: "Maya" }),
    ]),
  ], YOU);

  assertEquals(settlementSummary(people), {
    personCount: 2,
    lineCount: 3,
    payCount: 2,
    receiveCount: 1,
  });
});

Deno.test("groupContextsFromBalances uses each group's own unify setting", () => {
  const groupBalances: GroupBalance[] = [
    {
      group_id: "trip",
      group_name: "Phuket",
      balances: [
        balance(YOU, -10, { currency: "EUR", participant_id: "p-you" }),
        balance(MAYA, 10, { currency: "EUR", participant_id: "p-maya", full_name: "Maya" }),
      ],
    },
  ];
  const groups: Group[] = [{
    id: "trip",
    name: "Phuket",
    created_by: YOU,
    created_at: "",
    updated_at: "",
    unify_balances: true,
    settlement_currency: "INR",
  }];

  const contexts = groupContextsFromBalances({
    groupBalances,
    groups,
    prefsGroups: {},
    marketBook: book,
    preferredCurrency: "INR",
  });

  assertEquals(contexts[0].unifyEnabled, true);
  assertEquals(contexts[0].settlementCurrency, "INR");
  const lines = buildGroupSettlementLines(contexts[0], YOU);
  assertEquals(lines[0].currency, "INR");
});
