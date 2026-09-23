export const TRANSACTION_NOTIFICATIONS_FLAG_KEY = 'transaction-notifications';

const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com';
const FLAG_TIMEOUT_MS = 2_000;

export interface FeatureFlagProvider {
  isEnabled(key: string, distinctId: string, properties?: Record<string, string>): Promise<boolean>;
}

export class LocalFlagProvider implements FeatureFlagProvider {
  private enabledFlags: Set<string> | null;

  constructor(envFlags?: string | null) {
    const raw = envFlags !== undefined ? envFlags : Deno.env.get('LOCAL_FEATURE_FLAGS');
    if (raw !== undefined && raw !== null && raw !== '') {
      this.enabledFlags = raw === 'none'
        ? new Set()
        : new Set(raw.split(',').map((f) => f.trim().toLowerCase()).filter(Boolean));
    } else {
      // Default in self-hosted/local mode: enable flags
      this.enabledFlags = null;
    }
  }

  isEnabled(key: string): Promise<boolean> {
    if (this.enabledFlags === null) return Promise.resolve(true);
    return Promise.resolve(this.enabledFlags.has(key.toLowerCase()));
  }
}

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

export class PostHogFlagProvider implements FeatureFlagProvider {
  private projectToken: string;
  private host: string;
  private fetchImpl: typeof fetch;

  constructor(
    projectToken = Deno.env.get('POSTHOG_PROJECT_TOKEN')?.trim() ?? '',
    host = Deno.env.get('POSTHOG_HOST')?.trim() || DEFAULT_POSTHOG_HOST,
    fetchImpl = fetch,
  ) {
    this.projectToken = projectToken;
    this.host = host;
    this.fetchImpl = fetchImpl;
  }

  isEnabled(key: string, distinctId: string, properties: Record<string, string> = {}): Promise<boolean> {
    return evaluatePostHogBooleanFlag({
      key,
      distinctId,
      personProperties: properties,
      projectToken: this.projectToken,
      host: this.host,
      fetchImpl: this.fetchImpl,
    });
  }
}

export function getFeatureFlagProvider(): FeatureFlagProvider {
  const provider = Deno.env.get('FEATURE_FLAGS_PROVIDER')?.toLowerCase();
  const token = Deno.env.get('POSTHOG_PROJECT_TOKEN')?.trim();

  if (provider === 'local') {
    return new LocalFlagProvider();
  }
  if (provider === 'posthog' || token) {
    return new PostHogFlagProvider(token);
  }
  return new LocalFlagProvider();
}

export function transactionNotificationsEnabled(
  distinctId: string,
  email: string | null | undefined,
  provider: FeatureFlagProvider = getFeatureFlagProvider(),
): Promise<boolean> {
  if (!email) return Promise.resolve(false);
  return provider.isEnabled(
    TRANSACTION_NOTIFICATIONS_FLAG_KEY,
    distinctId,
    { email: email.trim().toLowerCase() },
  );
}
