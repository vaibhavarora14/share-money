import { assertEquals } from "jsr:@std/assert@1";
import {
  isTransactionFormCoveringGroupDetails,
  shouldKeepGroupDetailsMounted,
} from "./groupDetailsPersistence.ts";

Deno.test("group details stays mounted while a transaction is open", () => {
  assertEquals(shouldKeepGroupDetailsMounted("group-details"), true);
  assertEquals(shouldKeepGroupDetailsMounted("transaction-form"), true);
  assertEquals(shouldKeepGroupDetailsMounted("group-stats"), false);
  assertEquals(shouldKeepGroupDetailsMounted("groups"), false);
});

Deno.test("the transaction form covers group details without unmounting them", () => {
  assertEquals(isTransactionFormCoveringGroupDetails("transaction-form"), true);
  assertEquals(isTransactionFormCoveringGroupDetails("group-details"), false);
  assertEquals(isTransactionFormCoveringGroupDetails("groups"), false);
});
