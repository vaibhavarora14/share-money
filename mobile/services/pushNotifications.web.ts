import type { NotificationPreference } from "../types/notifications";
import { fetchWithAuth } from "../utils/api";

async function setUnavailablePreference(): Promise<NotificationPreference> {
  const response = await fetchWithAuth("/notifications", {
    method: "PUT",
    body: JSON.stringify({
      action: "preference",
      push_enabled: false,
      permission_status: "unavailable",
    }),
  });
  if (!response.ok) throw new Error("Unable to update notification preference");
  return response.json();
}

export const enablePushNotifications = setUnavailablePreference;
export const disablePushNotifications = setUnavailablePreference;
export async function unregisterCurrentPushToken(): Promise<void> {}
export async function syncEnabledPushRegistration(): Promise<void> {}
export function subscribeToNotificationResponses(
  _onResponse: (data: Record<string, unknown>) => void,
): () => void {
  return () => {};
}
export function subscribeToReceivedNotifications(_onReceived: () => void): () => void {
  return () => {};
}
export function subscribeToPushTokenChanges(
  _onRegistered: () => void,
  _onError: (error: unknown) => void,
): () => void {
  return () => {};
}
export async function getLastNotificationResponseData(): Promise<null> {
  return null;
}
