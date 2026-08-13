import {
  filterActivityQueriesForBlockedUser,
  type ActivityQueryCacheEntry,
} from "../../mobile/hooks/moderationCache.ts";

function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected, null, 2)}, got ${JSON.stringify(actual, null, 2)}`
    );
  }
}

type TestActivityFeed = {
  activities: Array<{ id: string; changed_by: { id: string } }>;
  total: number;
  has_more: boolean;
};

Deno.test("filterActivityQueriesForBlockedUser removes the user from every cached group", () => {
  const cachedQueries: ActivityQueryCacheEntry<TestActivityFeed>[] = [
    [
      ["activity", "group-a"],
      {
        activities: [
          { id: "a1", changed_by: { id: "blocked-user" } },
          { id: "a2", changed_by: { id: "visible-user" } },
        ],
        total: 2,
        has_more: false,
      },
    ],
    [
      ["activity", "group-b"],
      {
        activities: [
          { id: "b1", changed_by: { id: "blocked-user" } },
          { id: "b2", changed_by: { id: "blocked-user" } },
        ],
        total: 3,
        has_more: true,
      },
    ],
  ];

  assertEquals(
    filterActivityQueriesForBlockedUser(cachedQueries, "blocked-user"),
    [
      [
        ["activity", "group-a"],
        {
          activities: [{ id: "a2", changed_by: { id: "visible-user" } }],
          total: 1,
          has_more: false,
        },
      ],
      [
        ["activity", "group-b"],
        {
          activities: [],
          total: 1,
          has_more: true,
        },
      ],
    ]
  );
});

Deno.test("filterActivityQueriesForBlockedUser preserves empty cache entries", () => {
  assertEquals(
    filterActivityQueriesForBlockedUser<TestActivityFeed>(
      [[["activity", "group-a"], undefined]],
      "blocked-user"
    ),
    [[["activity", "group-a"], undefined]]
  );
});
