const SAFE_POSTHOG_PROPERTY_KEYS = new Set([
  "token",
  "distinct_id",
  "$distinct_id",
  "$anon_distinct_id",
  "$device_id",
  "$session_id",
  "$window_id",
  "$lib",
  "$lib_version",
  "$os",
  "$browser",
  "$browser_version",
  "$device_type",
  "$process_person_profile",
  "alias",
  "$alias",
  "source",
  "medium",
  "campaign",
  "content",
  "landing_path",
  "referrer_host",
  "intent",
  "journey_id",
  "page_path",
  "page_type",
  "region",
  "platform",
  "placement",
  "device",
  "tool",
  "from_path",
  "to_path",
]);

/** Final privacy boundary applied after PostHog has added automatic properties. */
export function sanitizePostHogProperties(
  properties: Record<string, unknown> | undefined,
): Record<string, string | number | boolean | null> {
  const safe: Record<string, string | number | boolean | null> = {};
  Object.entries(properties ?? {}).forEach(([key, value]) => {
    if (!SAFE_POSTHOG_PROPERTY_KEYS.has(key)) return;
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      safe[key] = value;
    }
  });
  return safe;
}
