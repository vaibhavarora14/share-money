import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  countActiveMembers,
  getTransactionsEmptyCopy,
  shouldPreferAddPeopleFab,
} from "./transactionsEmptyCopy.ts";

Deno.test("countActiveMembers counts only active (and missing status)", () => {
  assertEquals(countActiveMembers(undefined), 0);
  assertEquals(countActiveMembers([]), 0);
  assertEquals(
    countActiveMembers([
      { status: "active" },
      { status: "left" },
      { status: "invited" },
      { status: undefined },
      null,
    ]),
    2,
  );
});

Deno.test("solo empty all: Just you so far + people-first CTAs", () => {
  const copy = getTransactionsEmptyCopy("all", 1);
  assertEquals(copy.title, "Just you so far");
  assertEquals(copy.body, "Add people to start sharing expenses together.");
  assertEquals(copy.infoFooter, "No one else yet. Expenses will be in your name.");
  assertEquals(copy.primaryAction, "add_people");
  assertEquals(copy.primaryLabel, "Add people");
  assertEquals(copy.secondaryAction, "add_expense");
  assertEquals(copy.secondaryLabel, "Add expense anyway");
  assertEquals(copy.secondaryBody, "You can add expenses by yourself.");
});

Deno.test("solo with zero active still people-first", () => {
  const copy = getTransactionsEmptyCopy("all", 0);
  assertEquals(copy.primaryAction, "add_people");
  assertEquals(copy.title, "Just you so far");
});

Deno.test("two+ empty all: expense-first CTA", () => {
  const copy = getTransactionsEmptyCopy("all", 2);
  assertEquals(copy.title, "No transactions yet");
  assertEquals(copy.primaryAction, "add_expense");
  assertEquals(copy.primaryLabel, "Add first expense");
  assertEquals(copy.secondaryLabel, undefined);
});

Deno.test("solo expenses filter: people-first", () => {
  const copy = getTransactionsEmptyCopy("expenses", 1);
  assertEquals(copy.primaryAction, "add_people");
  assertEquals(copy.secondaryAction, "add_expense");
  assertEquals(copy.title, "Just you so far");
});

Deno.test("two+ expenses filter: add first expense", () => {
  const copy = getTransactionsEmptyCopy("expenses", 3);
  assertEquals(copy.primaryAction, "add_expense");
  assertEquals(copy.primaryLabel, "Add first expense");
});

Deno.test("payments filter has no people/expense CTAs", () => {
  const copy = getTransactionsEmptyCopy("payments", 1);
  assertEquals(copy.primaryAction, undefined);
  assertEquals(copy.secondaryAction, undefined);
});

Deno.test("FAB prefers add people only for solo empty ledger", () => {
  assertEquals(shouldPreferAddPeopleFab(1, true), true);
  assertEquals(shouldPreferAddPeopleFab(1, false), false);
  assertEquals(shouldPreferAddPeopleFab(2, true), false);
});
