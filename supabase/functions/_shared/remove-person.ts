/**
 * Decide how to remove an active group person.
 *
 * Linked accounts always leave membership and stay on the roster as former so
 * expense history keeps a stable participant id. Unlinked people with history
 * do the same. Unlinked people with no history can be deleted outright.
 */

export type RemovablePersonType = "member" | "invited" | "former";

export interface RemovablePerson {
  type: RemovablePersonType | string;
  user_id?: string | null;
}

export type PersonRemovalPlan =
  | { action: "reject"; reason: "not_active" }
  | { action: "hard_delete" }
  | { action: "mark_former"; leaveMembership: boolean };

export function planPersonRemoval(
  person: RemovablePerson,
  hasHistory: boolean,
): PersonRemovalPlan {
  if (person.type !== "member") {
    return { action: "reject", reason: "not_active" };
  }

  if (person.user_id) {
    return { action: "mark_former", leaveMembership: true };
  }

  if (hasHistory) {
    return { action: "mark_former", leaveMembership: false };
  }

  return { action: "hard_delete" };
}

export function isMissingTargetMembershipError(
  message: string | null | undefined,
): boolean {
  return (message ?? "").includes("User is not a member of this group");
}
