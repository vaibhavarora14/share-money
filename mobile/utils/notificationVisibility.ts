import type { TransactionNotification } from "../types/notifications";

interface NotificationViewToken {
  isViewable: boolean;
  item: unknown;
}

export const NOTIFICATION_VIEWABILITY_CONFIG = {
  itemVisiblePercentThreshold: 60,
  minimumViewTime: 500,
  waitForInteraction: false,
} as const;

function isTransactionNotification(
  value: unknown,
): value is TransactionNotification {
  return !!value &&
    typeof value === "object" &&
    typeof (value as { id?: unknown }).id === "string" &&
    "read_at" in value;
}

export function unreadNotificationIdsFromViewTokens(
  tokens: NotificationViewToken[],
): string[] {
  const ids = new Set<string>();
  for (const token of tokens) {
    if (
      !token.isViewable || !isTransactionNotification(token.item) ||
      token.item.read_at
    ) continue;
    ids.add(token.item.id);
  }
  return Array.from(ids);
}
