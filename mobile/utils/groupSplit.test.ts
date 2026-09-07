import { assertEquals } from "jsr:@std/assert@1";
import {
  extractSplitAmongParticipantIds,
  getLastEnteredExpenseSplitAmong,
  intersectSplitAmongWithAvailable,
  resolveGroupDefaultSplitAmong,
  type GroupSplitTransaction,
} from "./groupSplit.ts";

const GROUP_A = "group-a";
const GROUP_B = "group-b";

function tx(
  overrides: Partial<GroupSplitTransaction> & Pick<GroupSplitTransaction, "id">
): GroupSplitTransaction {
  return {
    group_id: GROUP_A,
    type: "expense",
    created_at: "2026-08-01T12:00:00.000Z",
    split_among_participant_ids: ["p1", "p2"],
    ...overrides,
  };
}

Deno.test("extractSplitAmongParticipantIds prefers split rows and drops duplicates", () => {
  assertEquals(
    extractSplitAmongParticipantIds(tx({
      id: 1,
      splits: [
        { participant_id: "a", amount: 10 },
        { participant_id: "b", amount: 10 },
        { participant_id: "a", amount: 5 },
      ],
      split_among_participant_ids: ["ignored"],
    })),
    ["a", "b"],
  );
});

Deno.test("extractSplitAmongParticipantIds falls back to split_among_participant_ids", () => {
  assertEquals(
    extractSplitAmongParticipantIds(tx({
      id: 1,
      splits: [],
      split_among_participant_ids: ["p2", "p1", "p2"],
    })),
    ["p2", "p1"],
  );
});

Deno.test("extractSplitAmongParticipantIds ignores income", () => {
  assertEquals(
    extractSplitAmongParticipantIds(tx({
      id: 1,
      type: "income",
      split_among_participant_ids: ["p1"],
    })),
    [],
  );
});

Deno.test("empty group has no last expense split", () => {
  assertEquals(getLastEnteredExpenseSplitAmong([], GROUP_A), undefined);
});

Deno.test("a single group expense supplies its split among", () => {
  assertEquals(
    getLastEnteredExpenseSplitAmong(
      [tx({ id: 1, split_among_participant_ids: ["alice", "bob"] })],
      GROUP_A,
    ),
    ["alice", "bob"],
  );
});

Deno.test("latest created_at expense wins even when an older expense date would rank differently", () => {
  const transactions = [
    tx({
      id: 10,
      split_among_participant_ids: ["all-1", "all-2"],
      created_at: "2026-08-01T10:00:00.000Z",
    }),
    tx({
      id: 11,
      split_among_participant_ids: ["subset-a"],
      created_at: "2026-08-31T09:00:00.000Z",
    }),
    tx({
      id: 12,
      split_among_participant_ids: ["subset-b", "subset-c"],
      created_at: "2026-08-15T18:00:00.000Z",
    }),
  ];

  assertEquals(
    getLastEnteredExpenseSplitAmong(transactions, GROUP_A),
    ["subset-a"],
  );
});

Deno.test("higher id wins when created_at timestamps match", () => {
  const createdAt = "2026-08-31T12:00:00.000Z";
  const transactions = [
    tx({ id: 21, split_among_participant_ids: ["old"], created_at: createdAt }),
    tx({ id: 24, split_among_participant_ids: ["newer-a", "newer-b"], created_at: createdAt }),
    tx({ id: 22, split_among_participant_ids: ["mid"], created_at: createdAt }),
  ];

  assertEquals(
    getLastEnteredExpenseSplitAmong(transactions, GROUP_A),
    ["newer-a", "newer-b"],
  );
});

Deno.test("last entered split is specific to the requested group", () => {
  const transactions = [
    tx({
      id: 1,
      group_id: GROUP_A,
      split_among_participant_ids: ["a1"],
      created_at: "2026-08-01T10:00:00.000Z",
    }),
    tx({
      id: 99,
      group_id: GROUP_B,
      split_among_participant_ids: ["b1", "b2"],
      created_at: "2026-08-31T10:00:00.000Z",
    }),
    tx({
      id: 2,
      group_id: GROUP_A,
      split_among_participant_ids: ["a2", "a3"],
      created_at: "2026-08-20T10:00:00.000Z",
    }),
  ];

  assertEquals(getLastEnteredExpenseSplitAmong(transactions, GROUP_A), ["a2", "a3"]);
  assertEquals(getLastEnteredExpenseSplitAmong(transactions, GROUP_B), ["b1", "b2"]);
});

Deno.test("newer income is skipped so the previous expense split is reused", () => {
  const transactions = [
    tx({
      id: 1,
      split_among_participant_ids: ["roommates"],
      created_at: "2026-08-01T10:00:00.000Z",
    }),
    tx({
      id: 2,
      type: "income",
      split_among_participant_ids: ["should-ignore"],
      created_at: "2026-08-31T10:00:00.000Z",
    }),
  ];

  assertEquals(
    getLastEnteredExpenseSplitAmong(transactions, GROUP_A),
    ["roommates"],
  );
});

Deno.test("rows without group_id still count for a group-scoped feed", () => {
  const transactions = [
    tx({
      id: 5,
      group_id: undefined,
      split_among_participant_ids: ["cad-1"],
      created_at: "2026-08-31T10:00:00.000Z",
    }),
  ];

  assertEquals(getLastEnteredExpenseSplitAmong(transactions, GROUP_A), ["cad-1"]);
});

Deno.test("expenses without split people are skipped", () => {
  const transactions = [
    tx({
      id: 8,
      split_among_participant_ids: ["keep"],
      created_at: "2026-08-01T10:00:00.000Z",
    }),
    tx({
      id: 9,
      split_among_participant_ids: [],
      splits: [],
      created_at: "2026-08-31T10:00:00.000Z",
    }),
  ];

  assertEquals(getLastEnteredExpenseSplitAmong(transactions, GROUP_A), ["keep"]);
});

Deno.test("resolveGroupDefaultSplitAmong prefers the dedicated latest split over the feed", () => {
  assertEquals(
    resolveGroupDefaultSplitAmong({
      groupId: GROUP_A,
      latestSplitAmong: ["cached-a", "cached-b"],
      feedTransactions: [tx({ id: 1, split_among_participant_ids: ["feed"] })],
    }),
    ["cached-a", "cached-b"],
  );
});

Deno.test("resolveGroupDefaultSplitAmong falls back to the group feed", () => {
  assertEquals(
    resolveGroupDefaultSplitAmong({
      groupId: GROUP_A,
      latestSplitAmong: null,
      feedTransactions: [tx({ id: 1, split_among_participant_ids: ["feed-1"] })],
    }),
    ["feed-1"],
  );

  assertEquals(
    resolveGroupDefaultSplitAmong({
      groupId: GROUP_A,
      latestSplitAmong: [],
      feedTransactions: [tx({ id: 1, group_id: GROUP_B, split_among_participant_ids: ["other"] })],
    }),
    undefined,
  );
});

Deno.test("intersectSplitAmongWithAvailable drops people who left the group", () => {
  assertEquals(
    intersectSplitAmongWithAvailable(["a", "gone", "b", "a"], ["b", "a", "c"]),
    ["a", "b"],
  );
  assertEquals(
    intersectSplitAmongWithAvailable(["gone"], ["a", "b"]),
    [],
  );
  assertEquals(
    intersectSplitAmongWithAvailable(undefined, ["a"]),
    [],
  );
});
