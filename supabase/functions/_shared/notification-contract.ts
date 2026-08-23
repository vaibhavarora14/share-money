import { isValidUUID } from "./validation.ts";

export type NotificationPermissionStatus =
  | "not_requested"
  | "granted"
  | "denied"
  | "unavailable";

const EXPO_PUSH_TOKEN = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/;
const PERMISSION_STATUSES = new Set<NotificationPermissionStatus>([
  "not_requested",
  "granted",
  "denied",
  "unavailable",
]);

export interface NotificationCursor {
  created_at: string;
  id: string;
}

const MAX_NOTIFICATION_READ_IDS = 100;

export function parseNotificationReadIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_NOTIFICATION_READ_IDS) {
    throw new Error(`Notification ids must contain between 1 and ${MAX_NOTIFICATION_READ_IDS} items`);
  }

  const ids: string[] = [];
  const seen = new Set<string>();
  for (const id of value) {
    if (typeof id !== "string" || !isValidUUID(id)) {
      throw new Error("Invalid notification id");
    }
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

export function parseNotificationCursor(
  createdAt: string | null,
  id: string | null,
): NotificationCursor | null {
  if (!createdAt && !id) return null;
  if (!createdAt || !id) {
    throw new Error(
      "Both cursor_created_at and cursor_id are required when paginating",
    );
  }
  if (Number.isNaN(Date.parse(createdAt))) {
    throw new Error("Invalid cursor_created_at");
  }
  if (!isValidUUID(id)) {
    throw new Error("Invalid cursor_id");
  }
  return { created_at: new Date(createdAt).toISOString(), id };
}

export function buildNotificationCursorFilter(
  cursor: NotificationCursor,
): string {
  return `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`;
}

export function resolveReadAt(
  existingReadAt: string | null,
  requestedReadAt: string,
): string {
  return existingReadAt ?? requestedReadAt;
}

export function isValidExpoPushToken(value: unknown): value is string {
  return typeof value === "string" && EXPO_PUSH_TOKEN.test(value);
}

export function isNotificationPermissionStatus(
  value: unknown,
): value is NotificationPermissionStatus {
  return typeof value === "string" &&
    PERMISSION_STATUSES.has(value as NotificationPermissionStatus);
}
