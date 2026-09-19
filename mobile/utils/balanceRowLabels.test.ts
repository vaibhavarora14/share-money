import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  balancePolarityLabel,
  shouldHideBalanceChrome,
} from "./balanceRowLabels.ts";

Deno.test("balance polarity labels for person rows", () => {
  assertEquals(balancePolarityLabel(12), "owed");
  assertEquals(balancePolarityLabel(-8), "you owe");
  assertEquals(balancePolarityLabel(0), "settled");
});

Deno.test("hide balance chrome for solo or all-zero", () => {
  assertEquals(shouldHideBalanceChrome([{ amount: 10 }], 1), true);
  assertEquals(shouldHideBalanceChrome([{ amount: 0 }, { amount: 0 }], 3), true);
  assertEquals(shouldHideBalanceChrome([{ amount: 5 }, { amount: -2 }], 3), false);
});

// The no-settle-actions product lock is exercised at the component boundary in
// mobile/components/Balances.test.cjs, with settlement callbacks supplied.
