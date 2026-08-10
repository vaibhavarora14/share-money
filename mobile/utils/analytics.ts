import PostHog from "posthog-react-native";
import {
  sanitizeGrowthProperties,
  type GrowthPropertyValue,
} from "./growthProperties";

type GrowthEvent =
  | "acquisition landing viewed"
  | "acquisition cta clicked"
  | "signup started"
  | "signup completed"
  | "migration started"
  | "splitwise csv parsed"
  | "migration mapping completed"
  | "migration completed"
  | "group activated"
  | "invite link created"
  | "member joined"
  | "group day 7 active";

type GrowthProperties = Record<string, GrowthPropertyValue>;

let client: PostHog | null | undefined;

function getClient(): PostHog | null {
  if (client !== undefined) return client;

  const apiKey = process.env.EXPO_PUBLIC_POSTHOG_KEY?.trim();
  if (!apiKey) {
    client = null;
    return client;
  }

  client = new PostHog(apiKey, {
    host: process.env.EXPO_PUBLIC_POSTHOG_HOST?.trim() || "https://us.i.posthog.com",
    captureAppLifecycleEvents: false,
    disableGeoip: true,
    disableRemoteFeatureFlags: true,
    persistence: "memory",
  });
  return client;
}

export function trackGrowthEvent(event: GrowthEvent, properties: GrowthProperties = {}): void {
  getClient()?.capture(event, sanitizeGrowthProperties(properties));
}

export function identifyGrowthUser(userId: string): void {
  getClient()?.identify(userId);
}

export function resetGrowthAnalytics(): void {
  getClient()?.reset();
}
