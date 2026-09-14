import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import type { GroupStatsResponse } from "../types";
import {
  currenciesFromGroupStats,
  spendingTotalsFromGroupStats,
} from "./groupDashboardStats.ts";

const fullStats: GroupStatsResponse = {
  member_breakdown: [],
  my_transactions: [],
  totals: {
    my_share: { INR: 39375, USD: 40 },
    group_total: { INR: 157500, USD: 120 },
    i_owe: {},
    im_owed: {},
  },
  settlement_plan: [],
};

Deno.test("spendingTotalsFromGroupStats uses backend totals, not a client transaction list", () => {
  const { myCostTotal, groupCostTotal } = spendingTotalsFromGroupStats(fullStats);

  assertEquals(myCostTotal.get("INR"), 39375);
  assertEquals(myCostTotal.get("USD"), 40);
  assertEquals(groupCostTotal.get("INR"), 157500);
  assertEquals(groupCostTotal.get("USD"), 120);
});

Deno.test("spendingTotalsFromGroupStats stays stable when groupStats is unchanged", () => {
  const first = spendingTotalsFromGroupStats(fullStats);
  const second = spendingTotalsFromGroupStats(fullStats);

  assertEquals(Object.fromEntries(first.myCostTotal), Object.fromEntries(second.myCostTotal));
  assertEquals(
    Object.fromEntries(first.groupCostTotal),
    Object.fromEntries(second.groupCostTotal)
  );
});

Deno.test("spendingTotalsFromGroupStats returns empty maps when stats are missing", () => {
  const { myCostTotal, groupCostTotal } = spendingTotalsFromGroupStats(null);
  assertEquals(myCostTotal.size, 0);
  assertEquals(groupCostTotal.size, 0);
});

Deno.test("currenciesFromGroupStats collects currencies from backend totals only", () => {
  const currencies = currenciesFromGroupStats(fullStats)
    .map((entry) => entry.currency)
    .sort();
  assertEquals(currencies, ["INR", "USD"]);
});
