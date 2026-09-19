/**
 * First-expense form defaults (create mode).
 * Kept pure for unit tests — TransactionFormScreen applies the same rules.
 */
export type FirstExpenseDefaults = {
  paidBy: "current_user";
  splitMode: "equal";
  splitAmong: "all_active_members";
};

export function getFirstExpenseDefaults(): FirstExpenseDefaults {
  return {
    paidBy: "current_user",
    splitMode: "equal",
    splitAmong: "all_active_members",
  };
}

/** Resolve paid-by participant id for a new expense (you paid). */
export function defaultPaidByParticipantId(
  currentUserId: string | null | undefined,
  participants: Array<{ id: string; user_id?: string | null }>,
): string | null {
  if (!currentUserId) return null;
  const mine = participants.find((p) => p.user_id === currentUserId);
  return mine?.id ?? null;
}
