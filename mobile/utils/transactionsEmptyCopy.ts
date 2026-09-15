import type { LedgerFilter } from "./transactionsLedger";

export type TransactionsEmptyCopy = {
  title: string;
  body: string;
  /** Primary button label; omit when no empty-state CTA. */
  primaryLabel?: string;
  primaryAction?: "add_people" | "add_expense";
  /** Secondary text-button label (solo empty "all" filter). */
  secondaryLabel?: string;
  secondaryAction?: "add_expense";
};

/**
 * Count active group members only (excludes left / invited / former).
 * Missing status is treated as active for backwards compatibility.
 */
export function countActiveMembers(
  members: Array<{ status?: string | null } | null | undefined> | null | undefined,
): number {
  if (!members?.length) return 0;
  return members.filter((m) => m != null && (m.status ?? "active") === "active")
    .length;
}

/**
 * Empty-state copy + CTAs for the Transactions ledger.
 * Solo groups (1 active member) prioritize inviting people before expenses.
 */
export function getTransactionsEmptyCopy(
  filter: LedgerFilter,
  activeMemberCount: number,
): TransactionsEmptyCopy {
  if (filter === "payments") {
    return {
      title: "No payments yet",
      body: "Record a settlement from Settle Up and it will show up here.",
    };
  }

  const isSolo = activeMemberCount <= 1;

  if (filter === "expenses") {
    if (isSolo) {
      return {
        title: "Add people first",
        body: "Invite someone to share with before logging expenses.",
        primaryLabel: "Add people",
        primaryAction: "add_people",
        secondaryLabel: "Add expense anyway",
        secondaryAction: "add_expense",
      };
    }
    return {
      title: "No expenses yet",
      body: "Add your first expense to start tracking shared spending.",
      primaryLabel: "Add first expense",
      primaryAction: "add_expense",
    };
  }

  // filter === "all"
  if (isSolo) {
    return {
      title: "Add people first",
      body: "Shared expenses work best with someone to split with. Invite people to this group.",
      primaryLabel: "Add people",
      primaryAction: "add_people",
      secondaryLabel: "Add expense anyway",
      secondaryAction: "add_expense",
    };
  }

  return {
    title: "No transactions yet",
    body: "Add an expense or record a payment to get started.",
    primaryLabel: "Add first expense",
    primaryAction: "add_expense",
  };
}

/** FAB should prefer people-first when the group is solo and the ledger is empty. */
export function shouldPreferAddPeopleFab(
  activeMemberCount: number,
  ledgerIsEmpty: boolean,
): boolean {
  return ledgerIsEmpty && activeMemberCount <= 1;
}
