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
  journeyId?: string;
};

const MAX_ATTRIBUTION_VALUE_LENGTH = 120;
const SAFE_ATTRIBUTION_VALUE = /^[a-z0-9][a-z0-9_-]*$/i;
const SAFE_REFERRER_HOST = /^[a-z0-9.-]+$/i;
export const ACQUISITION_CONTEXT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function safeValue(value: string | null): string | undefined {
  if (!value || value.length > MAX_ATTRIBUTION_VALUE_LENGTH) return undefined;
  return SAFE_ATTRIBUTION_VALUE.test(value) ? value : undefined;
}

function safeLandingPath(value: string | null): string | undefined {
  if (!value || value.length > 300 || !value.startsWith("/") || value.startsWith("//")) {
    return undefined;
  }
  return value;
}

function safeReferrerHost(value: string | null): string | undefined {
  if (!value || value.length > 253 || !SAFE_REFERRER_HOST.test(value)) return undefined;
  return value.toLowerCase();
}

function safeCapturedAt(value: string | null, fallback: string): string {
  if (!value || !Number.isFinite(Date.parse(value))) return fallback;
  return value;
}

export function isFreshAcquisitionContext(
  context: AcquisitionContext | null,
  now = Date.now(),
): context is AcquisitionContext {
  if (!context) return false;
  const capturedAt = Date.parse(context.capturedAt);
  return Number.isFinite(capturedAt) && now >= capturedAt && now - capturedAt <= ACQUISITION_CONTEXT_MAX_AGE_MS;
}

export function selectFirstTouchAcquisition(
  existing: AcquisitionContext | null,
  incoming: AcquisitionContext | null,
  now = Date.now(),
): AcquisitionContext | null {
  return isFreshAcquisitionContext(existing, now) ? existing : incoming;
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

  const source = safeValue(url.searchParams.get("acq_source")) ??
    safeValue(url.searchParams.get("utm_source"));
  const medium = safeValue(url.searchParams.get("acq_medium")) ??
    safeValue(url.searchParams.get("utm_medium"));
  const campaign = safeValue(url.searchParams.get("acq_campaign")) ??
    safeValue(url.searchParams.get("utm_campaign"));
  const content = safeValue(url.searchParams.get("acq_content")) ??
    safeValue(url.searchParams.get("utm_content"));
  const landingPath = safeLandingPath(url.searchParams.get("acq_landing_path"));
  const referrerHost = safeReferrerHost(url.searchParams.get("acq_referrer_host"));
  const journeyId = safeValue(url.searchParams.get("journey_id"));
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
    landingPath: landingPath ?? (url.pathname || "/"),
    ...(referrerHost ? { referrerHost } : {}),
    intent,
    capturedAt: safeCapturedAt(url.searchParams.get("acq_captured_at"), capturedAt),
    ...(journeyId ? { journeyId } : {}),
  };
}
