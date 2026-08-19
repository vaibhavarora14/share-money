export type NotificationRoute =
  | { screen: "notifications" }
  | { screen: "notification-detail"; notificationId: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function resolveNotificationRoute(data: Record<string, unknown>): NotificationRoute | null {
  if (
    data.schema_version === 1 &&
    data.route === "notification-detail" &&
    typeof data.notification_id === "string" &&
    UUID.test(data.notification_id)
  ) {
    return { screen: "notification-detail", notificationId: data.notification_id };
  }
  if (data.schema_version === 1 && data.route === "notifications") {
    return { screen: "notifications" };
  }
  return null;
}
