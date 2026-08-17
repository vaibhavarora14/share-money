import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { NotificationPreference } from "../types/notifications";
import { fetchWithAuth } from "../utils/api";

const TOKEN_STORAGE_KEY = "registered-expo-push-token";

if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

async function updatePreference(
  pushEnabled: boolean,
  permissionStatus: NotificationPreference["permission_status"]
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

async function registerGrantedPushToken(): Promise<void> {
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) throw new Error("Expo project ID is unavailable");

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
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
  if (Platform.OS === "web" || !Device.isDevice) {
    return updatePreference(false, "unavailable");
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("transactions", {
      name: "Transaction activity",
      description: "Expenses that affect your share",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 180, 250],
      lightColor: "#1F5EFF",
    });
  }

  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) return updatePreference(false, "denied");

  await registerGrantedPushToken();
  return updatePreference(true, "granted");
}

export async function unregisterCurrentPushToken(): Promise<void> {
  const token = await AsyncStorage.getItem(TOKEN_STORAGE_KEY);
  if (token) {
    await fetchWithAuth("/notifications", {
      method: "DELETE",
      body: JSON.stringify({ token }),
    }).catch(() => null);
    await AsyncStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

export async function disablePushNotifications(): Promise<NotificationPreference> {
  await unregisterCurrentPushToken();
  const status = Platform.OS === "web" ? "unavailable" : "granted";
  return updatePreference(false, status);
}

export async function syncEnabledPushRegistration(): Promise<void> {
  if (Platform.OS === "web" || !Device.isDevice) return;
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) {
    await updatePreference(false, "denied");
    return;
  }
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("transactions", {
      name: "Transaction activity",
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  await registerGrantedPushToken();
}

export function subscribeToNotificationResponses(
  onResponse: (data: Record<string, unknown>) => void
): () => void {
  if (Platform.OS === "web") return () => {};
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data;
    onResponse(data as Record<string, unknown>);
  });
  return () => subscription.remove();
}

export async function getLastNotificationResponseData(): Promise<Record<string, unknown> | null> {
  if (Platform.OS === "web") return null;
  const response = await Notifications.getLastNotificationResponseAsync();
  const data = (response?.notification.request.content.data as Record<string, unknown> | undefined) ?? null;
  if (response) Notifications.clearLastNotificationResponse();
  return data;
}
