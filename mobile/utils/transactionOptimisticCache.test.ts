import type { InfiniteData } from "@tanstack/react-query";
import type { Transaction } from "../types.ts";
import {
  replaceOptimisticTransactionInFeed,
  resolveCreatedTransaction,
  type TransactionsPageResponse,
} from "../utils/transactionOptimisticCache.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function feedWith(
  items: Transaction[]
): InfiniteData<TransactionsPageResponse> {
  return {
    pages: [{ items, has_more: false, next_cursor: null }],
    pageParams: [null],
  };
}

Deno.test("resolveCreatedTransaction accepts flat and wrapped create payloads", () => {
  const flat = resolveCreatedTransaction({ id: 42, description: "Lunch", amount: 10 });
  assert(flat?.id === 42, "flat payload should resolve numeric id");

  const wrapped = resolveCreatedTransaction({
    transaction: { id: "99", description: "Taxi", amount: 20 },
  });
  assert(wrapped?.id === 99, "wrapped string id should coerce to number");

  assert(
    resolveCreatedTransaction({ description: "Nope" }) === null,
    "missing id should return null"
  );
});

Deno.test("replaceOptimisticTransactionInFeed swaps Date.now id for server id", () => {
  const optimisticId = 1_700_000_000_000;
  const before = feedWith([
    {
      id: optimisticId,
      description: "Temp",
      amount: 5,
      date: "2026-09-14",
      type: "expense",
      currency: "USD",
      group_id: "g1",
    } as Transaction,
    {
      id: 7,
      description: "Existing",
      amount: 1,
      date: "2026-09-13",
      type: "expense",
      currency: "USD",
      group_id: "g1",
    } as Transaction,
  ]);

  const after = replaceOptimisticTransactionInFeed(before, optimisticId, {
    id: 123,
    description: "Temp",
    amount: 5,
    date: "2026-09-14",
    type: "expense",
    currency: "USD",
    group_id: "g1",
  } as Transaction);

  assert(after?.pages[0].items[0].id === 123, "optimistic id must become server id");
  assert(after?.pages[0].items[1].id === 7, "other rows must stay intact");
  assert(
    !after?.pages[0].items.some((tx) => tx.id === optimisticId),
    "temp id must not remain editable"
  );
});

Deno.test("replaceOptimisticTransactionInFeed drops temp row when create payload has no id", () => {
  const optimisticId = 1_700_000_000_001;
  const before = feedWith([
    {
      id: optimisticId,
      description: "Temp",
      amount: 5,
      date: "2026-09-14",
      type: "expense",
      currency: "USD",
      group_id: "g1",
    } as Transaction,
  ]);

  const after = replaceOptimisticTransactionInFeed(before, optimisticId, null);
  assert(after?.pages[0].items.length === 0, "temp row should be removed without server id");
});
