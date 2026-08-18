import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { NotificationPreference } from "../types/notifications";
import { fetchWithAuth } from "../utils/api";

const TOKEN_STORAGE_KEY = "registered-expo-push-token";
const CHANNEL_ID = "expense_activity";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

async function updatePreference(
  pushEnabled: boolean,
  permissionStatus: NotificationPreference["permission_status"],
): Promise<NotificationPreference> {
  const response = await fetchWithAuth("/notifications", {
    method: "PUT",
    body: JSON.stringify({
      action: "preference",
      push_enabled: pushEnabled,
      permission_status: permissionStatus,
    }),
  });
  if (!response.ok) throw new Error("Unable to update notification preference");
  return response.json();
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Expense activity",
    description: "Expenses that affect your share",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 180, 250],
    lightColor: "#1F5EFF",
  });
}

async function registerGrantedPushToken(
  devicePushToken?: Notifications.DevicePushToken,
): Promise<void> {
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) throw new Error("Expo project ID is unavailable");

  const token = (await Notifications.getExpoPushTokenAsync({ projectId, devicePushToken })).data;
  const response = await fetchWithAuth("/notifications", {
    method: "PUT",
    body: JSON.stringify({
      action: "push_token",
      token,
      platform: Platform.OS,
    }),
  });
  if (!response.ok) throw new Error("Unable to register this device for notifications");
  await AsyncStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export async function enablePushNotifications(): Promise<NotificationPreference> {
  if (!Device.isDevice) return updatePreference(false, "unavailable");
  await ensureAndroidChannel();

  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) return updatePreference(false, "denied");

  await registerGrantedPushToken();
  return updatePreference(true, "granted");
}

export async function unregisterCurrentPushToken(): Promise<void> {
  const token = await AsyncStorage.getItem(TOKEN_STORAGE_KEY);
  if (!token) return;
  const response = await fetchWithAuth("/notifications", {
    method: "DELETE",
    body: JSON.stringify({ token }),
  });
  if (!response.ok) throw new Error("Unable to unregister this device from notifications");
  await AsyncStorage.removeItem(TOKEN_STORAGE_KEY);
}

export async function disablePushNotifications(): Promise<NotificationPreference> {
  await unregisterCurrentPushToken();
  const permission = await Notifications.getPermissionsAsync();
  return updatePreference(false, permission.granted ? "granted" : "denied");
}

export async function syncEnabledPushRegistration(): Promise<void> {
  if (!Device.isDevice) return;
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) {
    await updatePreference(false, "denied");
    return;
  }
  await ensureAndroidChannel();
  await registerGrantedPushToken();
}

export function subscribeToNotificationResponses(
  onResponse: (data: Record<string, unknown>) => void,
): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    onResponse(response.notification.request.content.data as Record<string, unknown>);
  });
  return () => subscription.remove();
}

export function subscribeToReceivedNotifications(onReceived: () => void): () => void {
  const subscription = Notifications.addNotificationReceivedListener(onReceived);
  return () => subscription.remove();
}

export function subscribeToPushTokenChanges(
  onRegistered: () => void,
  onError: (error: unknown) => void,
): () => void {
  const subscription = Notifications.addPushTokenListener((devicePushToken) => {
    registerGrantedPushToken(devicePushToken).then(onRegistered).catch(onError);
  });
  return () => subscription.remove();
}

export async function getLastNotificationResponseData(): Promise<Record<string, unknown> | null> {
  const response = await Notifications.getLastNotificationResponseAsync();
  const data = (response?.notification.request.content.data as Record<string, unknown> | undefined) ?? null;
  if (response) Notifications.clearLastNotificationResponse();
  return data;
}
