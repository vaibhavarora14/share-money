export type AcquisitionContext = {
  source: string;
  medium: string;
  campaign?: string;
  content?: string;
  landingPath: string;
  referrerHost?: string;
  intent: "splitwise-import" | "standard";
  capturedAt: string;
};

export type StoredAcquisitionContext = {
  source: string;
  medium: string;
  campaign?: string;
  content?: string;
  landing_path: string;
  referrer_host?: string;
  intent: "splitwise-import" | "standard";
  captured_at: string;
};

const MAX_VALUE_LENGTH = 120;
const MAX_PATH_LENGTH = 200;
const SAFE_VALUE = /^[a-z0-9][a-z0-9_-]*$/i;
const SAFE_PATH = /^\/[a-z0-9/_-]*$/i;
const SAFE_HOST = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

function readValue(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_VALUE_LENGTH) {
    return undefined;
  }

  return SAFE_VALUE.test(value) ? value : undefined;
}

function readPath(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_PATH_LENGTH) {
    return undefined;
  }

  return SAFE_PATH.test(value) ? value : undefined;
}

function readHost(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0 || value.length > 253) {
    return undefined;
  }

  const normalized = value.toLowerCase();
  return SAFE_HOST.test(normalized) ? normalized : undefined;
}

function readTimestamp(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return undefined;
  }

  return Number.isFinite(Date.parse(value)) ? value : undefined;
}

/**
 * Keeps the bounded campaign fields used for aggregate acquisition reporting.
 * This deliberately excludes any free-form, group, CSV, person, or financial data.
 */
export function sanitizeAcquisitionContext(value: unknown): StoredAcquisitionContext | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const input = value as Record<string, unknown>;
  const source = readValue(input.source);
  const medium = readValue(input.medium);
  const landingPath = readPath(input.landingPath);
  const capturedAt = readTimestamp(input.capturedAt);
  const intent = input.intent === "splitwise-import" || input.intent === "standard"
    ? input.intent
    : undefined;

  if (!source || !medium || !landingPath || !capturedAt || !intent) {
    return null;
  }

  const campaign = readValue(input.campaign);
  const content = readValue(input.content);
  const referrerHost = readHost(input.referrerHost);

  return {
    source,
    medium,
    ...(campaign ? { campaign } : {}),
    ...(content ? { content } : {}),
    landing_path: landingPath,
    ...(referrerHost ? { referrer_host: referrerHost } : {}),
    intent,
    captured_at: capturedAt,
  };
}
