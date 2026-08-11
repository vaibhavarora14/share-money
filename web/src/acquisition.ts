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
const ACQUISITION_CONTEXT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

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
    source: context.source,
    medium: context.medium,
    campaign: context.campaign ?? "",
    content: context.content ?? "",
    landing_path: context.landingPath,
    referrer_host: context.referrerHost ?? "",
    intent: context.intent,
  };
}

export function selectFirstTouchAcquisition(
  existing: AcquisitionContext | null,
  incoming: AcquisitionContext,
  now = Date.now(),
): AcquisitionContext {
  const capturedAt = existing ? Date.parse(existing.capturedAt) : Number.NaN;
  const existingIsFresh = Number.isFinite(capturedAt) && now >= capturedAt &&
    now - capturedAt <= ACQUISITION_CONTEXT_MAX_AGE_MS;
  return existingIsFresh ? existing! : incoming;
}

export function buildMigrationHandoffUrl(
  href: string,
  context: AcquisitionContext,
  journeyId?: string,
): string {
  const url = new URL(href, "https://sharedmoney.app");
  url.searchParams.set("intent", "splitwise-import");
  url.searchParams.set("acq_source", context.source);
  url.searchParams.set("acq_medium", context.medium);
  if (context.campaign) url.searchParams.set("acq_campaign", context.campaign);
  if (context.content) url.searchParams.set("acq_content", context.content);
  url.searchParams.set("acq_landing_path", context.landingPath);
  if (context.referrerHost) url.searchParams.set("acq_referrer_host", context.referrerHost);
  url.searchParams.set("acq_captured_at", context.capturedAt);
  if (journeyId && readAttributionValue(journeyId)) {
    url.searchParams.set("journey_id", journeyId);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
