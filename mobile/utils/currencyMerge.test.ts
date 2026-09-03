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

Deno.test("simplifyUnifiedDebts collapses a cross-currency A→B→C chain", () => {
  const book = createPreviewRateBook({ "EUR:INR": 91.2 });
  const balances = [
    { user_id: "you", amount: -32, currency: "EUR", full_name: "You" },
    { user_id: "maya", amount: 32, currency: "EUR", full_name: "Maya" },
    { user_id: "maya", amount: -12, currency: "USD", full_name: "Maya" },
    { user_id: "raj", amount: 12, currency: "USD", full_name: "Raj" },
  ];

  const nets = unifyPeopleNets(balances, "INR", book);
  const you = nets.find((net) => net.user_id === "you");
  const maya = nets.find((net) => net.user_id === "maya");
  const raj = nets.find((net) => net.user_id === "raj");
  assertAlmostEquals(you?.amount ?? 0, -(32 * 91.2), 0.01);
  assertAlmostEquals(maya?.amount ?? 0, 32 * 91.2 - 12 * 88.5, 0.01);
  assertAlmostEquals(raj?.amount ?? 0, 12 * 88.5, 0.01);

  const edges = simplifyUnifiedDebts(balances, "INR", book, "you");
  assertEquals(edges.length, 2);
  assertEquals(edges.every((edge) => edge.fromUser.user_id === "you"), true);
  assertEquals(edges.some((edge) => edge.toUser.user_id === "maya"), true);
  assertEquals(edges.some((edge) => edge.toUser.user_id === "raj"), true);
  assertEquals(edges.some((edge) =>
    edge.fromUser.user_id === "maya" && edge.toUser.user_id === "raj"
  ), false);
});

Deno.test("simplifyUnifiedDebts collapses a same-currency A→B→C round-robin to A→C", () => {
  const book = createPreviewRateBook();
  const balances = [
    { user_id: "a", amount: -10, currency: "INR", full_name: "A" },
    { user_id: "b", amount: 10, currency: "INR", full_name: "B" },
    { user_id: "b", amount: -10, currency: "INR", full_name: "B" },
    { user_id: "c", amount: 10, currency: "INR", full_name: "C" },
  ];

  const nets = unifyPeopleNets(balances, "INR", book);
  assertEquals(nets.filter((net) => net.user_id === "b").length, 0);

  const edges = simplifyUnifiedDebts(balances, "INR", book, "a");
  assertEquals(edges.length, 1);
  assertEquals(edges[0].fromUser.user_id, "a");
  assertEquals(edges[0].toUser.user_id, "c");
  assertAlmostEquals(edges[0].amount, 10, 0.01);
});

Deno.test("simplifyUnifiedDebts collapses an equal cycle toward zero", () => {
  const book = createPreviewRateBook({ "EUR:INR": 91.2 });
  const balances = [
    { user_id: "a", amount: -10, currency: "EUR", full_name: "A" },
    { user_id: "b", amount: 10, currency: "EUR", full_name: "B" },
    { user_id: "b", amount: -10, currency: "EUR", full_name: "B" },
    { user_id: "c", amount: 10, currency: "EUR", full_name: "C" },
    { user_id: "c", amount: -10, currency: "EUR", full_name: "C" },
    { user_id: "a", amount: 10, currency: "EUR", full_name: "A" },
  ];

  const nets = unifyPeopleNets(balances, "INR", book);
  assertEquals(nets.length, 0);
  const edges = simplifyUnifiedDebts(balances, "INR", book, "a");
  assertEquals(edges.length, 0);
});

Deno.test("simplifyUnifiedDebts nets You→Maya EUR, Maya→Raj USD, Raj→You INR", () => {
  const book = createPreviewRateBook({ "EUR:INR": 91.2 });
  const balances = [
    { user_id: "you", amount: -32, currency: "EUR", full_name: "You" },
    { user_id: "maya", amount: 32, currency: "EUR", full_name: "Maya" },
    { user_id: "maya", amount: -12, currency: "USD", full_name: "Maya" },
    { user_id: "raj", amount: 12, currency: "USD", full_name: "Raj" },
    { user_id: "raj", amount: -1000, currency: "INR", full_name: "Raj" },
    { user_id: "you", amount: 1000, currency: "INR", full_name: "You" },
  ];

  const edges = simplifyUnifiedDebts(balances, "INR", book, "you");
  assertEquals(edges.length, 2);
  assertEquals(edges.every((edge) => edge.fromUser.user_id === "you"), true);
  const toMaya = edges.find((edge) => edge.toUser.user_id === "maya");
  const toRaj = edges.find((edge) => edge.toUser.user_id === "raj");
  assertAlmostEquals(toMaya?.amount ?? 0, 32 * 91.2 - 12 * 88.5, 0.01);
  assertAlmostEquals(toRaj?.amount ?? 0, 12 * 88.5 - 1000, 0.01);
});

Deno.test("simplifyUnifiedDebts still chains when identity is split across participant_id and user_id", () => {
  const book = createPreviewRateBook({ "EUR:INR": 91.2 });
  const balances = [
    { participant_id: "p-you", user_id: "you", amount: -32, currency: "EUR", full_name: "You" },
    { participant_id: "p-maya", user_id: "maya", amount: 32, currency: "EUR", full_name: "Maya" },
    { user_id: "maya", amount: -12, currency: "USD", full_name: "Maya" },
    { participant_id: "p-raj", user_id: "raj", amount: 12, currency: "USD", full_name: "Raj" },
  ];

  const edges = simplifyUnifiedDebts(balances, "INR", book, "you");
  assertEquals(edges.some((edge) =>
    edge.fromUser.user_id === "maya" && edge.toUser.user_id === "raj"
  ), false);
  assertEquals(edges.every((edge) => edge.fromUser.user_id === "you"), true);
});
