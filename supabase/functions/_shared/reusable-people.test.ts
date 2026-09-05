import {
  buildReusablePeopleDirectory,
} from "./reusable-people.ts";

function assertEquals(actual: unknown, expected: unknown, message?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${message ?? "values differ"}\nexpected: ${JSON.stringify(expected)}\nactual: ${JSON.stringify(actual)}`,
    );
  }
}

Deno.test("includes every unique person from the user's groups", () => {
  const result = buildReusablePeopleDirectory([
    {
      id: "p-added",
      full_name: "Ayaan",
      email: "ayaan@example.com",
    },
    {
      id: "p-other-member",
      user_id: "u-priya",
      full_name: "Priya",
      email: "priya@example.com",
    },
  ]);

  assertEquals(
    result.map((person) => `${person.full_name}:${person.email}`),
    ["Ayaan:ayaan@example.com", "Priya:priya@example.com"],
  );
});

Deno.test("collapses the same linked account across groups", () => {
  const result = buildReusablePeopleDirectory([
    {
      id: "p-1",
      user_id: "u-anuj",
      full_name: "Anuj",
      email: "anuj@example.com",
    },
    {
      id: "p-2",
      user_id: "u-anuj",
      full_name: "Anuj",
      email: "anuj@example.com",
    },
  ]);

  assertEquals(result, [{
    id: "p-1",
    full_name: "Anuj",
    email: "anuj@example.com",
  }]);
});

Deno.test("collapses the same email across groups even without a user id", () => {
  const result = buildReusablePeopleDirectory([
    {
      id: "p-1",
      full_name: "Arya",
      email: "arya@example.com",
    },
    {
      id: "p-2",
      full_name: "Arya Sharma",
      email: "ARYA@example.com",
    },
  ]);

  assertEquals(result.length, 1);
  assertEquals(result[0].email, "arya@example.com");
});

Deno.test("collapses name-only people with no other identifier", () => {
  const result = buildReusablePeopleDirectory([
    { id: "p-1", full_name: "Sam" },
    { id: "p-2", full_name: "sam" },
  ]);

  assertEquals(result, [{ id: "p-1", full_name: "Sam", email: null }]);
});

Deno.test("keeps different emails with the same name", () => {
  const result = buildReusablePeopleDirectory([
    { id: "p-1", full_name: "Alex", email: "alex.a@example.com" },
    { id: "p-2", full_name: "Alex", email: "alex.b@example.com" },
  ]);

  assertEquals(result.map((person) => person.email), [
    "alex.a@example.com",
    "alex.b@example.com",
  ]);
});

Deno.test("excludes the current user and people already in the target group", () => {
  const result = buildReusablePeopleDirectory(
    [
      {
        id: "p-me",
        user_id: "u-me",
        full_name: "Me",
        email: "me@example.com",
      },
      {
        id: "p-already",
        full_name: "Jordan",
        email: "jordan@example.com",
      },
      {
        id: "p-new",
        full_name: "Kai",
        email: "kai@example.com",
      },
    ],
    {
      excludeUserId: "u-me",
      excludePeople: [{
        id: "p-target-jordan",
        full_name: "Jordan",
        email: "jordan@example.com",
      }],
    },
  );

  assertEquals(result, [{
    id: "p-new",
    full_name: "Kai",
    email: "kai@example.com",
  }]);
});

Deno.test("prefers the richer row when merging a linked user and an email-only copy", () => {
  const result = buildReusablePeopleDirectory([
    {
      id: "p-email",
      full_name: "Priya",
      email: "priya@example.com",
    },
    {
      id: "p-linked",
      user_id: "u-priya",
      full_name: "Priya",
      email: "priya@example.com",
    },
  ]);

  assertEquals(result, [{
    id: "p-linked",
    full_name: "Priya",
    email: "priya@example.com",
  }]);
});
