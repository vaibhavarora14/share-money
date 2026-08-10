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

function readAttributionValue(value: string | null): string | undefined {
  if (!value || value.length > MAX_ATTRIBUTION_VALUE_LENGTH) return undefined;
  return SAFE_ATTRIBUTION_VALUE.test(value) ? value : undefined;
}

function referrerHost(referrer: string): string | undefined {
  if (!referrer) return undefined;

  try {
    return new URL(referrer).hostname.toLowerCase() || undefined;
  } catch {
    return undefined;
  }
}

function sourceDefaults(host: string | undefined): Pick<AcquisitionContext, "source" | "medium"> {
  if (!host) return { source: "direct", medium: "direct" };
  if (/(^|\.)google\.[a-z.]+$/i.test(host)) {
    return { source: "google", medium: "organic" };
  }
  return { source: "referral", medium: "referral" };
}

export function acquisitionContextFromUrl(
  url: URL,
  referrer: string,
  capturedAt = new Date().toISOString(),
): AcquisitionContext {
  const host = referrerHost(referrer);
  const defaults = sourceDefaults(host);
  const source = readAttributionValue(url.searchParams.get("utm_source")) ?? defaults.source;
  const medium = readAttributionValue(url.searchParams.get("utm_medium")) ?? defaults.medium;
  const campaign = readAttributionValue(url.searchParams.get("utm_campaign"));
  const content = readAttributionValue(url.searchParams.get("utm_content"));

  return {
    source,
    medium,
    ...(campaign ? { campaign } : {}),
    ...(content ? { content } : {}),
    landingPath: url.pathname || "/",
    ...(host ? { referrerHost: host } : {}),
    intent: url.searchParams.get("intent") === "splitwise-import"
      ? "splitwise-import"
      : "standard",
    capturedAt,
  };
}

export function acquisitionContextToProperties(
  context: AcquisitionContext,
): Record<string, string> {
  return {
    acquisition_source: context.source,
    acquisition_medium: context.medium,
    acquisition_campaign: context.campaign ?? "",
    acquisition_content: context.content ?? "",
    acquisition_landing_path: context.landingPath,
    acquisition_referrer_host: context.referrerHost ?? "",
    acquisition_intent: context.intent,
  };
}
