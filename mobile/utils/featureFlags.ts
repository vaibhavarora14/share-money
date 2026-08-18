export function isTransactionNotificationsEnabled(
  response: { feature_enabled?: boolean } | undefined,
): boolean {
  return response?.feature_enabled === true;
}
