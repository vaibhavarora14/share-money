import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import type { Settlement, Transaction } from "../types";
import {
  buildTransactionsLedger,
  settlementLedgerDate,
} from "./transactionsLedger.ts";

function expense(partial: Partial<Transaction> & Pick<Transaction, "id" | "date" | "amount">): Transaction {
  return {
    description: partial.description ?? `Expense ${partial.id}`,
    type: "expense",
    ...partial,
  };
}

function payment(
  partial: Partial<Settlement> & Pick<Settlement, "id" | "created_at" | "amount">,
): Settlement {
  return {
    group_id: "g1",
    from_user_id: "u1",
    to_user_id: "u2",
    from_participant_id: "p1",
    to_participant_id: "p2",
    currency: "USD",
    created_by: "u1",
    notes: partial.notes,
    ...partial,
  };
}

Deno.test("buildTransactionsLedger merges expenses and payments newest-first", () => {
  const items = buildTransactionsLedger(
    [
      expense({ id: 1, date: "2026-09-10", amount: 40 }),
      expense({ id: 2, date: "2026-09-12", amount: 20 }),
    ],
    [
      payment({ id: "s-older", created_at: "2026-09-11T12:00:00.000Z", amount: 15 }),
      payment({ id: "s-newest", created_at: "2026-09-13T09:00:00.000Z", amount: 25 }),
    ],
    "all",
  );

  assertEquals(items.map((item) => item.key), [
    "payment-s-newest",
    "expense-2",
    "payment-s-older",
    "expense-1",
  ]);
  assertEquals(items[0].kind, "payment");
  assertEquals(items[1].kind, "expense");
});

Deno.test("buildTransactionsLedger filter expenses excludes payments", () => {
  const items = buildTransactionsLedger(
    [expense({ id: 1, date: "2026-09-10", amount: 40 })],
    [payment({ id: "s1", created_at: "2026-09-11T12:00:00.000Z", amount: 15 })],
    "expenses",
  );
  assertEquals(items.length, 1);
  assertEquals(items[0].kind, "expense");
});

Deno.test("buildTransactionsLedger filter payments excludes expenses", () => {
  const items = buildTransactionsLedger(
    [expense({ id: 1, date: "2026-09-10", amount: 40 })],
    [payment({ id: "s1", created_at: "2026-09-11T12:00:00.000Z", amount: 15 })],
    "payments",
  );
  assertEquals(items.length, 1);
  assertEquals(items[0].kind, "payment");
});

Deno.test("settlementLedgerDate uses YYYY-MM-DD from created_at", () => {
  assertEquals(
    settlementLedgerDate(
      payment({ id: "s1", created_at: "2026-09-11T18:22:00.000Z", amount: 1 }),
    ),
    "2026-09-11",
  );
});

Deno.test("buildTransactionsLedger does not invent spending totals from payments", () => {
  // Guardrail: ledger helpers only shape list rows. Spending cards must keep
  // using spendingTotalsFromGroupStats (expenses-only backend stats).
  const items = buildTransactionsLedger(
    [expense({ id: 1, date: "2026-09-10", amount: 100 })],
    [payment({ id: "s1", created_at: "2026-09-11T12:00:00.000Z", amount: 999 })],
    "all",
  );
  const paymentRow = items.find((item) => item.kind === "payment");
  assertEquals(paymentRow?.kind, "payment");
  if (paymentRow?.kind === "payment") {
    assertEquals(paymentRow.settlement.amount, 999);
  }
  // No aggregate amount API on the ledger — callers must not sum these for spend.
  assertEquals(
    Object.prototype.hasOwnProperty.call(items, "total"),
    false,
  );
});
