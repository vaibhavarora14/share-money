import { assertEquals, assertAlmostEquals } from "jsr:@std/assert@1";
import {
  convertAmount,
  formatBreakdown,
  formatRateLabel,
  pairKey,
  resolveRate,
  simplifyUnifiedDebts,
  unifyDebtEdges,
  unifyPeopleNets,
  unifyTotals,
  withOverrides,
} from "./currencyMerge.ts";
import { createPreviewRateBook } from "./previewRates.ts";
import type { DebtEdge } from "./debt.ts";

Deno.test("market conversion uses the USD pivot", () => {
  const book = createPreviewRateBook();
  const usdToInr = convertAmount(10, "USD", "INR", book);
  assertEquals(usdToInr, 885);

  const eurToUsd = convertAmount(10, "EUR", "USD", book);
  assertAlmostEquals(eurToUsd ?? 0, 10 / 0.86, 0.0001);
});

Deno.test("a group override beats the market cross rate", () => {
  const book = createPreviewRateBook({ "EUR:INR": 91.2 });
  const quote = resolveRate("EUR", "INR", book);
  assertEquals(quote?.source, "group");
  assertEquals(quote?.rate, 91.2);
  assertEquals(convertAmount(32, "EUR", "INR", book), 2918.4);
});

Deno.test("inverse override is used when the stored pair is flipped", () => {
  const book = withOverrides(createPreviewRateBook(), { "INR:EUR": 0.011 }, "group");
  const quote = resolveRate("EUR", "INR", book);
  assertEquals(quote?.source, "group");
  assertAlmostEquals(quote?.rate ?? 0, 1 / 0.011, 0.0001);
});

Deno.test("unifyTotals keeps originals and reports missing currencies", () => {
  const book = createPreviewRateBook({ "EUR:INR": 91.2 });
  const unified = unifyTotals({ EUR: -32, USD: -12, XYZ: 5 }, "INR", book);
  assertEquals(unified.currency, "INR");
  assertEquals(unified.missing, ["XYZ"]);
  assertAlmostEquals(unified.amount, -(32 * 91.2 + 12 * 88.5), 0.01);
  assertEquals(formatBreakdown(unified.parts), "€32.00 + $12.00");
});

Deno.test("unifyDebtEdges merges the same people across currencies", () => {
  const book = createPreviewRateBook({ "EUR:INR": 91.2 });
  const maya = {
    user_id: "maya",
    amount: 32,
    currency: "EUR",
    full_name: "Maya",
  };
  const you = {
    user_id: "you",
    amount: -32,
    currency: "EUR",
    full_name: "You",
  };
  const edges: DebtEdge[] = [
    { fromUser: you, toUser: maya, amount: 32, currency: "EUR" },
    {
      fromUser: { ...you, amount: -12, currency: "USD" },
      toUser: { ...maya, amount: 12, currency: "USD" },
      amount: 12,
      currency: "USD",
    },
  ];

  const unified = unifyDebtEdges(edges, "INR", book, "you");
  assertEquals(unified.length, 1);
  assertEquals(unified[0].currency, "INR");
  assertAlmostEquals(unified[0].amount, 32 * 91.2 + 12 * 88.5, 0.01);
  assertEquals(unified[0].originalParts.length, 2);
});

Deno.test("unifyDebtEdges nets opposite leftovers between the same people", () => {
  const book = createPreviewRateBook({ "EUR:INR": 91.2 });
  const maya = {
    user_id: "maya",
    amount: 32,
    currency: "EUR",
    full_name: "Maya",
  };
  const you = {
    user_id: "you",
    amount: -32,
    currency: "EUR",
    full_name: "You",
  };
  const edges: DebtEdge[] = [
    { fromUser: you, toUser: maya, amount: 32, currency: "EUR" },
    {
      fromUser: { ...maya, amount: -12, currency: "USD" },
      toUser: { ...you, amount: 12, currency: "USD" },
      amount: 12,
      currency: "USD",
    },
  ];

  const unified = unifyDebtEdges(edges, "INR", book, "you");
  assertEquals(unified.length, 1);
  assertEquals(unified[0].fromUser.user_id, "you");
  assertEquals(unified[0].toUser.user_id, "maya");
  assertAlmostEquals(unified[0].amount, 32 * 91.2 - 12 * 88.5, 0.01);
});

Deno.test("simplifyUnifiedDebts nets opposite leftovers into one settlement", () => {
  const book = createPreviewRateBook({ "EUR:INR": 91.2 });
  const balances = [
    { user_id: "you", amount: -32, currency: "EUR", full_name: "You" },
    { user_id: "you", amount: 12, currency: "USD", full_name: "You" },
    { user_id: "maya", amount: 32, currency: "EUR", full_name: "Maya" },
    { user_id: "maya", amount: -12, currency: "USD", full_name: "Maya" },
  ];

  const nets = unifyPeopleNets(balances, "INR", book);
  assertEquals(nets.length, 2);
  assertEquals(nets.every((net) => net.currency === "INR"), true);

  const edges = simplifyUnifiedDebts(balances, "INR", book, "you");
  assertEquals(edges.length, 1);
  assertEquals(edges[0].currency, "INR");
  assertEquals(edges[0].fromUser.user_id, "you");
  assertEquals(edges[0].toUser.user_id, "maya");
  assertAlmostEquals(edges[0].amount, 32 * 91.2 - 12 * 88.5, 0.01);
  assertEquals(edges[0].originalParts.length, 2);
});

Deno.test("simplifyUnifiedDebts still merges same-direction leftovers", () => {
  const book = createPreviewRateBook({ "EUR:INR": 91.2 });
  const balances = [
    { user_id: "you", amount: -32, currency: "EUR", full_name: "You" },
    { user_id: "you", amount: -12, currency: "USD", full_name: "You" },
    { user_id: "maya", amount: 32, currency: "EUR", full_name: "Maya" },
    { user_id: "maya", amount: 12, currency: "USD", full_name: "Maya" },
  ];

  const edges = simplifyUnifiedDebts(balances, "INR", book, "you");
  assertEquals(edges.length, 1);
  assertAlmostEquals(edges[0].amount, 32 * 91.2 + 12 * 88.5, 0.01);
});

Deno.test("simplifyUnifiedDebts keeps unconvertible leftovers as their own rows", () => {
  const book = createPreviewRateBook({ "EUR:INR": 91.2 });
  const balances = [
    { user_id: "you", amount: -32, currency: "EUR", full_name: "You" },
    { user_id: "you", amount: -5, currency: "XYZ", full_name: "You" },
    { user_id: "maya", amount: 32, currency: "EUR", full_name: "Maya" },
    { user_id: "maya", amount: 5, currency: "XYZ", full_name: "Maya" },
  ];

  const nets = unifyPeopleNets(balances, "INR", book);
  assertEquals(nets.filter((net) => net.currency === "INR").length, 2);
  assertEquals(nets.filter((net) => net.currency === "XYZ").length, 2);

  const edges = simplifyUnifiedDebts(balances, "INR", book, "you");
  assertEquals(edges.length, 2);
  const inr = edges.find((edge) => edge.currency === "INR");
  const xyz = edges.find((edge) => edge.currency === "XYZ");
  assertEquals(inr?.fromUser.user_id, "you");
  assertAlmostEquals(inr?.amount ?? 0, 32 * 91.2, 0.01);
  assertEquals(xyz?.amount, 5);
});

Deno.test("formatRateLabel keeps short market quotes readable", () => {
  assertEquals(
    formatRateLabel({ from: "EUR", to: "INR", rate: 91.2, source: "group" }),
    "1 EUR = 91.20 INR"
  );
  assertEquals(pairKey("eur", "inr"), "EUR:INR");
});
