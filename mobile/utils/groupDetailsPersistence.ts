/**
 * Group details is a custom-routed screen, not a React Navigation stack entry.
 * Opening a transaction used to swap the whole tree, which remounted the group
 * and jumped the list back to the top. Keep the group mounted under the form
 * so the same transaction row stays in view on back.
 */
export function shouldKeepGroupDetailsMounted(route: string): boolean {
  return route === "group-details" || route === "transaction-form";
}

export function isTransactionFormCoveringGroupDetails(route: string): boolean {
  return route === "transaction-form";
}
