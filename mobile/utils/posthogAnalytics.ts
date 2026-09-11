import AsyncStorage from "@react-native-async-storage/async-storage";
import PostHog from "posthog-react-native";
import { Platform } from "react-native";
import { resolvePostHogEnvConfig } from "./posthogConfig";

type AnalyticsProperties = Record<
  string,
  string | number | boolean | null | undefined
>;

let client: PostHog | null = null;
let identifiedUserId: string | null = null;
let appOpenCaptured = false;

function sanitizeProperties(
  properties?: AnalyticsProperties,
): Record<string, string | number | boolean | null> | undefined {
  if (!properties) return undefined;

  const cleaned: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (value !== undefined) {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

/**
 * Initialize PostHog once at startup when EXPO_PUBLIC_POSTHOG_KEY is set.
 * No-ops safely when the key is missing (mirrors Sentry DSN gating).
 */
export function initializePostHog(): boolean {
  const config = resolvePostHogEnvConfig({
    EXPO_PUBLIC_POSTHOG_KEY: process.env.EXPO_PUBLIC_POSTHOG_KEY,
    EXPO_PUBLIC_POSTHOG_HOST: process.env.EXPO_PUBLIC_POSTHOG_HOST,
  });

  if (!config.enabled || !config.key) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn(
        "[PostHog] EXPO_PUBLIC_POSTHOG_KEY is not set; PostHog will not be initialized.",
      );
    }
    return false;
  }

  if (client) {
    return true;
  }

  client = new PostHog(config.key, {
    host: config.host,
    // Lifecycle Application Opened / Backgrounded; we also emit mobile_app_opened.
    captureAppLifecycleEvents: true,
    enableSessionReplay: false,
    // Avoid expo-file-system legacy write deprecations on Expo SDK 54.
    customStorage: AsyncStorage,
  });

  if (!appOpenCaptured) {
    client.capture("mobile_app_opened", {
      platform: Platform.OS,
    });
    appOpenCaptured = true;
  }

  return true;
}

export function isPostHogInitialized(): boolean {
  return client !== null;
}

export function captureAnalyticsEvent(
  event: string,
  properties?: AnalyticsProperties,
): void {
  if (!client) return;
  client.capture(event, sanitizeProperties(properties));
}

export function captureScreenView(screen: string): void {
  if (!client || !screen) return;
  captureAnalyticsEvent("mobile_screen_viewed", {
    screen,
    platform: Platform.OS,
  });
}

/**
 * Identify with the product user id only — do not attach email as a person prop.
 */
export function identifyAnalyticsUser(userId: string): void {
  if (!client || !userId) return;
  if (identifiedUserId === userId) return;
  client.identify(userId);
  identifiedUserId = userId;
}

export function resetAnalyticsUser(): void {
  if (!client) return;
  client.reset();
  identifiedUserId = null;
}

/**
 * Keep PostHog identity aligned with auth. Fires auth_succeeded only when the
 * distinct user id changes (not on token refresh).
 */
export function syncAnalyticsAuth(
  userId: string | null,
  properties?: { auth_provider?: string },
): void {
  if (!client) return;

  if (userId) {
    const isNewIdentity = identifiedUserId !== userId;
    identifyAnalyticsUser(userId);
    if (isNewIdentity) {
      captureAnalyticsEvent("auth_succeeded", {
        auth_provider: properties?.auth_provider || "unknown",
        platform: Platform.OS,
      });
    }
    return;
  }

  if (identifiedUserId) {
    resetAnalyticsUser();
  }
}
