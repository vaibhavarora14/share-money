/**
 * Labels for balance person rows — informational only (no settle CTA).
 * Positive = they owe you; negative = you owe them.
 */
export function balancePolarityLabel(amount: number): "owed" | "you owe" | "settled" {
  if (amount > 0) return "owed";
  if (amount < 0) return "you owe";
  return "settled";
}

/** True when balance rows should hide owe/settled chrome (solo / zero net). */
export function shouldHideBalanceChrome(
  balances: Array<{ amount: number }>,
  activeMemberCount: number,
): boolean {
  if (activeMemberCount <= 1) return true;
  return balances.every((b) => Math.abs(b.amount) < 0.005);
}
