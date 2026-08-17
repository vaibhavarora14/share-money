import { isValidUUID } from "./validation.ts";

export interface NotificationCursor {
  created_at: string;
  id: string;
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
