import PostHog from "posthog-react-native";
import {
  sanitizeGrowthProperties,
  sanitizePostHogEventProperties,
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
let pendingJourneyId: string | null = null;
let identifiedUserId: string | null = null;

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
    persistence: "file",
    before_send: (event) => event
      ? {
          ...event,
          properties: sanitizePostHogEventProperties(event.properties),
          $set: undefined,
          $set_once: undefined,
        }
      : null,
  });
  return client;
}

export function trackGrowthEvent(event: GrowthEvent, properties: GrowthProperties = {}): void {
  getClient()?.capture(event, sanitizeGrowthProperties(properties));
}

export function identifyGrowthUser(userId: string): void {
  const posthog = getClient();
  posthog?.identify(userId);
  identifiedUserId = userId;
  if (pendingJourneyId) posthog?.alias(pendingJourneyId);
}

export function registerGrowthJourney(journeyId: string | undefined): void {
  if (!journeyId) return;
  pendingJourneyId = journeyId;
  const posthog = getClient();
  void posthog?.register({ journey_id: journeyId });
  if (identifiedUserId) posthog?.alias(journeyId);
}

export function resetGrowthAnalytics(): void {
  const posthog = getClient();
  posthog?.reset();
  identifiedUserId = null;
  if (pendingJourneyId) void posthog?.register({ journey_id: pendingJourneyId });
}

export function clearGrowthJourney(): void {
  pendingJourneyId = null;
  void getClient()?.unregister("journey_id");
}
