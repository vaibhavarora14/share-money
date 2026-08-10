export type GrowthPropertyValue = string | number | boolean | undefined;

const SAFE_PROPERTY_KEYS = new Set([
  "source",
  "medium",
  "campaign",
  "content",
  "landing_path",
  "referrer_host",
  "intent",
  "method",
  "entry",
  "member_count",
  "expense_count",
  "settlement_count",
  "skipped_count",
  "duplicate",
  "kind",
]);

const SAFE_LABEL = /^[a-z0-9][a-z0-9_-]*$/i;
const SAFE_PATH = /^\/[a-z0-9/_-]*$/i;
const SAFE_HOST = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

/**
 * Limits analytics to bounded campaign dimensions and aggregate counts. This
 * deliberately strips free-form text and any financial or participant data.
 */
export function sanitizeGrowthProperties(
  properties: Record<string, GrowthPropertyValue>,
): Record<string, string | number | boolean> {
  const safe: Record<string, string | number | boolean> = {};

  Object.entries(properties).forEach(([key, value]) => {
    if (!SAFE_PROPERTY_KEYS.has(key) || value === undefined) return;

    if (typeof value === "boolean") {
      if (key === "duplicate") safe[key] = value;
      return;
    }

    if (typeof value === "number") {
      if (
        ["member_count", "expense_count", "settlement_count", "skipped_count"].includes(key)
        && Number.isInteger(value)
        && value >= 0
        && value <= 2_000
      ) {
        safe[key] = value;
      }
      return;
    }

    if (value.length > 120) return;
    if (key === "landing_path") {
      if (SAFE_PATH.test(value)) safe[key] = value;
      return;
    }
    if (key === "referrer_host") {
      if (SAFE_HOST.test(value)) safe[key] = value.toLowerCase();
      return;
    }
    if (SAFE_LABEL.test(value)) safe[key] = value;
  });

  return safe;
}
