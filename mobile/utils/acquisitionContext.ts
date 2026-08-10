export type MigrationIntent = "splitwise-import" | "standard";

export type AcquisitionContext = {
  source: string;
  medium: string;
  campaign?: string;
  content?: string;
  landingPath: string;
  referrerHost?: string;
  intent: MigrationIntent;
  capturedAt: string;
};

const MAX_ATTRIBUTION_VALUE_LENGTH = 120;
const SAFE_ATTRIBUTION_VALUE = /^[a-z0-9][a-z0-9_-]*$/i;

function safeValue(value: string | null): string | undefined {
  if (!value || value.length > MAX_ATTRIBUTION_VALUE_LENGTH) return undefined;
  return SAFE_ATTRIBUTION_VALUE.test(value) ? value : undefined;
}

/**
 * Parses only explicit acquisition handoffs. Generic deep links must not
 * overwrite a previously captured campaign.
 */
export function acquisitionContextFromUrl(
  rawUrl: string,
  capturedAt = new Date().toISOString(),
): AcquisitionContext | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  const source = safeValue(url.searchParams.get("utm_source"));
  const medium = safeValue(url.searchParams.get("utm_medium"));
  const campaign = safeValue(url.searchParams.get("utm_campaign"));
  const content = safeValue(url.searchParams.get("utm_content"));
  const intent = url.searchParams.get("intent") === "splitwise-import"
    ? "splitwise-import"
    : "standard";

  if (!source && !medium && !campaign && !content && intent === "standard") {
    return null;
  }

  return {
    source: source ?? "direct",
    medium: medium ?? (source ? "referral" : "direct"),
    ...(campaign ? { campaign } : {}),
    ...(content ? { content } : {}),
    landingPath: url.pathname || "/",
    intent,
    capturedAt,
  };
}
