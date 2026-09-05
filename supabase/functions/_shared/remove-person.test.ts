import {
  isMissingTargetMembershipError,
  planPersonRemoval,
} from "./remove-person.ts";

function assertEquals(actual: unknown, expected: unknown, message?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${message ?? "values differ"}\nexpected: ${JSON.stringify(expected)}\nactual: ${JSON.stringify(actual)}`,
    );
  }
}

Deno.test("rejects invited and former people", () => {
  assertEquals(
    planPersonRemoval({ type: "invited", user_id: null }, false),
    { action: "reject", reason: "not_active" },
  );
  assertEquals(
    planPersonRemoval({ type: "former", user_id: "u-1" }, true),
    { action: "reject", reason: "not_active" },
  );
});

Deno.test("hard-deletes an unlinked person with no history", () => {
  assertEquals(
    planPersonRemoval({ type: "member", user_id: null }, false),
    { action: "hard_delete" },
  );
});

Deno.test("marks an unlinked person with expense history as former", () => {
  assertEquals(
    planPersonRemoval({ type: "member", user_id: null }, true),
    { action: "mark_former", leaveMembership: false },
  );
});

Deno.test("linked people leave membership and become former even without history", () => {
  assertEquals(
    planPersonRemoval({ type: "member", user_id: "u-anuj" }, false),
    { action: "mark_former", leaveMembership: true },
  );
  assertEquals(
    planPersonRemoval({ type: "member", user_id: "u-anuj" }, true),
    { action: "mark_former", leaveMembership: true },
  );
});

Deno.test("detects a missing target membership without swallowing caller errors", () => {
  if (
    !isMissingTargetMembershipError("User is not a member of this group")
  ) {
    throw new Error("expected the target-membership error to match");
  }
  if (
    isMissingTargetMembershipError(
      "You must be an active member of the group to manage members",
    )
  ) {
    throw new Error("caller permission errors must not be treated as missing target");
  }
});
