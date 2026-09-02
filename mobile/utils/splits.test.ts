import { assertEquals } from "jsr:@std/assert@1";
import {
  areSplitAmountsEqual,
  calculateEqualSplits,
  distributeRemaining,
  equalSplitAmountMap,
  formatAmountInput,
  isUnequalSplit,
  parseAmountInput,
  remainingSplitAmount,
  sanitizeAmountInput,
  scaleSplitsToTotal,
  amountsFromShares,
  calculateShareSplits,
  sharesAreUnequal,
  splitsFromAmountMap,
  sumSelectedAmounts,
} from "./splits.ts";

Deno.test("equal splits spread leftover cents with largest remainder", () => {
  assertEquals(calculateEqualSplits(100, ["a", "b", "c"]), [
    { participant_id: "a", amount: 33.34 },
    { participant_id: "b", amount: 33.33 },
    { participant_id: "c", amount: 33.33 },
  ]);
  assertEquals(calculateEqualSplits(10.01, ["a", "b", "c"]), [
    { participant_id: "a", amount: 3.34 },
    { participant_id: "b", amount: 3.34 },
    { participant_id: "c", amount: 3.33 },
  ]);
});

Deno.test("equal splits keep a whole amount exact", () => {
  assertEquals(calculateEqualSplits(90, ["a", "b", "c"]), [
    { participant_id: "a", amount: 30 },
    { participant_id: "b", amount: 30 },
    { participant_id: "c", amount: 30 },
  ]);
});

Deno.test("amount input sanitizing rejects extra decimals", () => {
  assertEquals(sanitizeAmountInput("12.3"), "12.3");
  assertEquals(sanitizeAmountInput("12.34"), "12.34");
  assertEquals(sanitizeAmountInput("12.345"), null);
  assertEquals(sanitizeAmountInput("12.3.4"), null);
  assertEquals(sanitizeAmountInput("$12"), "12");
});

Deno.test("amount parsing accepts money-shaped values", () => {
  assertEquals(parseAmountInput(""), null);
  assertEquals(parseAmountInput("10.50"), 10.5);
  assertEquals(parseAmountInput("10.5.0"), null);
  assertEquals(parseAmountInput("-1"), null);
});

Deno.test("remaining amount and leftover split keep the total exact", () => {
  const selected = ["a", "b", "c"];
  const assigned = sumSelectedAmounts({ a: "20", b: "10", c: "" }, selected);
  assertEquals(assigned, 30);
  assertEquals(remainingSplitAmount(100, assigned), 70);

  const next = distributeRemaining({ a: "20", b: "10", c: "" }, selected, 100);
  assertEquals(next, {
    a: "43.34",
    b: "33.33",
    c: "23.33",
  });
  assertEquals(sumSelectedAmounts(next, selected), 100);
});

Deno.test("unequal detection treats leftover-cent equal splits as equal", () => {
  assertEquals(areSplitAmountsEqual([33.34, 33.33, 33.33]), true);
  assertEquals(areSplitAmountsEqual([3.34, 3.34, 3.33]), true);
  assertEquals(areSplitAmountsEqual([3.35, 3.33, 3.33]), true);
  assertEquals(isUnequalSplit([
    { amount: 50 },
    { amount: 30 },
    { amount: 20 },
  ]), true);
  assertEquals(isUnequalSplit([
    { amount: 25 },
    { amount: 25 },
  ]), false);
  assertEquals(isUnequalSplit([
    { amount: 3.35 },
    { amount: 3.33 },
    { amount: 3.33 },
  ]), false);
});

Deno.test("scaling preserves ratios and the new total", () => {
  const scaled = scaleSplitsToTotal(
    [
      { participant_id: "a", amount: 60 },
      { participant_id: "b", amount: 40 },
    ],
    50,
  );
  assertEquals(scaled, [
    { participant_id: "a", amount: 30 },
    { participant_id: "b", amount: 20 },
  ]);
});

Deno.test("custom split maps omit invalid or zero amounts", () => {
  assertEquals(
    splitsFromAmountMap({ a: "10.00", b: "0", c: "5" }, ["a", "b"]),
    null,
  );
  assertEquals(
    splitsFromAmountMap({ a: "10.00", b: "15.50" }, ["a", "b"]),
    [
      { participant_id: "a", amount: 10 },
      { participant_id: "b", amount: 15.5 },
    ],
  );
  assertEquals(formatAmountInput(10), "10.00");
  assertEquals(equalSplitAmountMap(30, ["a", "b"]), {
    a: "15.00",
    b: "15.00",
  });
});

Deno.test("share splits weight a 2:1 couple and keep the total exact", () => {
  const splits = calculateShareSplits(90, ["a", "b", "c"], { a: 2, b: 1, c: 1 });
  assertEquals(splits, [
    { participant_id: "a", amount: 45 },
    { participant_id: "b", amount: 22.5 },
    { participant_id: "c", amount: 22.5 },
  ]);
  assertEquals(amountsFromShares(90, ["a", "b"], { a: 2, b: 1 }), {
    a: "60.00",
    b: "30.00",
  });
  assertEquals(sharesAreUnequal(["a", "b"], { a: 2, b: 1 }), true);
  assertEquals(sharesAreUnequal(["a", "b"], { a: 1, b: 1 }), false);
  assertEquals(calculateShareSplits(10.01, ["a", "b", "c"], { a: 1, b: 1, c: 1 }), [
    { participant_id: "a", amount: 3.34 },
    { participant_id: "b", amount: 3.34 },
    { participant_id: "c", amount: 3.33 },
  ]);
});
