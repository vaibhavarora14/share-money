export const TRANSACTION_NOTIFICATIONS_FLAG_KEY = 'transaction-notifications';

const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com';
const FLAG_TIMEOUT_MS = 2_000;

interface EvaluatePostHogBooleanFlagInput {
  key: string;
  distinctId: string;
  personProperties?: Record<string, string>;
  projectToken?: string;
  host?: string;
  fetchImpl?: typeof fetch;
}

interface PostHogFlagResponse {
  errorsWhileComputingFlags?: boolean;
  flags?: Record<string, { enabled?: unknown }>;
}

/**
 * Remotely evaluates one PostHog boolean flag and fails closed whenever the
 * project token, network, or response is unavailable.
 */
export async function evaluatePostHogBooleanFlag({
  key,
  distinctId,
  personProperties = {},
  projectToken = Deno.env.get('POSTHOG_PROJECT_TOKEN')?.trim() ?? '',
  host = Deno.env.get('POSTHOG_HOST')?.trim() || DEFAULT_POSTHOG_HOST,
  fetchImpl = fetch,
}: EvaluatePostHogBooleanFlagInput): Promise<boolean> {
  if (!key || !distinctId || !projectToken) return false;

  try {
    const response = await fetchImpl(`${host.replace(/\/$/, '')}/flags?v=2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: projectToken,
        distinct_id: distinctId,
        person_properties: personProperties,
        evaluation_contexts: ['production', 'notifications'],
      }),
      signal: AbortSignal.timeout(FLAG_TIMEOUT_MS),
    });
    if (!response.ok) return false;

    const payload = await response.json() as PostHogFlagResponse;
    if (payload.errorsWhileComputingFlags) return false;
    return payload.flags?.[key]?.enabled === true;
  } catch {
    return false;
  }
}

export function transactionNotificationsEnabled(
  distinctId: string,
  email: string | null | undefined,
): Promise<boolean> {
  if (!email) return Promise.resolve(false);
  return evaluatePostHogBooleanFlag({
    key: TRANSACTION_NOTIFICATIONS_FLAG_KEY,
    distinctId,
    personProperties: { email: email.trim().toLowerCase() },
  });
}
