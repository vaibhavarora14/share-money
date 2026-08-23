const SENTRY_DIAGNOSTIC_URL = "sharedmoney://diagnostics/sentry";

export type SentryRuntimeTagInput = {
  isDevice: boolean;
  buildProfile?: string;
  release?: string;
  buildNumber?: string;
  platform: string;
};

export function isSentryDiagnosticUrl(
  url: string | null,
  enabled: boolean,
): boolean {
  return enabled && url === SENTRY_DIAGNOSTIC_URL;
}

export function getSentryRuntimeTags(input: SentryRuntimeTagInput) {
  return {
    device_type: input.isDevice ? "physical" : "simulator",
    build_profile: input.buildProfile || "development",
    release: input.release || "unknown",
    build_number: input.buildNumber || "unknown",
    platform: input.platform,
  };
}
